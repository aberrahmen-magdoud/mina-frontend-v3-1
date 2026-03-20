// src/handlers/minaUploadFlow.ts
// Upload validation, R2 upload/store, CDN optimization, and all panel CRUD.
// Extracted from MinaApp.tsx for module size.

import type { UploadPanelKey, UploadItem } from "../lib/minaTypes";
import {
  isHttpUrl, stripSignedQuery, normalizeNonExpiringUrl, getFileExt,
} from "../lib/minaHelpers";
import {
  isAssetsUrl, isMinaGeneratedAssetsUrl, inferMediaTypeFromFile, inferMediaTypeFromUrl,
  probeMediaUrl, probeMediaUrlWithRetry, getMediaDurationSec,
} from "../lib/mediaHelpers";
import { normalizeImageForUpload } from "../lib/uploadProcessing";
import { pickUrlFromR2Response } from "../lib/minaApi";
import { humanizeUploadError, UI_ERROR_MESSAGES } from "../lib/mmaErrors";
import {
  MAX_UPLOAD_BYTES, ALLOWED_EXTS, ALLOWED_MIMES,
  ALLOWED_VIDEO_EXTS, ALLOWED_VIDEO_MIMES,
  FABRIC_AUDIO_EXTS, FABRIC_AUDIO_MIMES,
  MOTION_FRAME1_MAX_BYTES, MOTION_FRAME1_MAX_DIM,
  MOTION_FRAME2_VIDEO_MAX_BYTES,
  MOTION_FRAME2_VIDEO_MIN_SEC, MOTION_FRAME2_VIDEO_MAX_SEC,
  FABRIC_AUDIO_MAX_BYTES, FABRIC_AUDIO_MAX_SEC, FABRIC_AUDIO_MIN_SEC,
  OPT_MAX_DIM, OPT_INITIAL_QUALITY,
} from "../lib/minaConstants";

// Local type aliases (avoid React import for standalone TS files)
type SetState<T> = (value: T | ((prev: T) => T)) => void;
type MutableRef<T> = { current: T };

// ────────────────────────────────────────────────────────────────────
// Deps type – everything the upload flow needs from the component
// ────────────────────────────────────────────────────────────────────
export interface UploadFlowDeps {
  animateMode: boolean;
  currentPassId: string;

  uploadsRef: MutableRef<Record<UploadPanelKey, UploadItem[]>>;
  setUploads: SetState<Record<UploadPanelKey, UploadItem[]>>;

  apiFetch: (path: string, init?: RequestInit) => Promise<Response>;

  showUploadNotice: (panel: UploadPanelKey, message: string) => void;
  showMinaError: (err: any) => void;
  setMinaOverrideText: (t: string | null) => void;
  setStillError: SetState<string | null>;
  setMotionError: SetState<string | null>;

  ensureOptimizedInputUrl: (url: string, kind: UploadPanelKey) => Promise<string>;

  undoRedoPush: (entry: { label: string; undo: () => void; redo: () => void }) => void;
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────
export function capForPanel(panel: UploadPanelKey, animateMode: boolean): number {
  if (panel === "inspiration") return 8;
  if (panel === "product") return animateMode ? 2 : 1;
  return 1;
}

// ────────────────────────────────────────────────────────────────────
// R2 upload (file → signed URL → PUT)
// ────────────────────────────────────────────────────────────────────
export async function uploadFileToR2(
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>,
  currentPassId: string,
  panel: UploadPanelKey,
  file: File,
): Promise<string> {
  const contentType = file.type || "application/octet-stream";
  const fileName = file.name || `upload_${Date.now()}`;

  const res = await apiFetch("/api/r2/upload-signed", {
    method: "POST",
    body: JSON.stringify({ contentType, fileName, folder: "user_uploads", kind: panel, passId: currentPassId }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) throw new Error(json?.message || json?.error || `Upload-signed failed (${res.status})`);

  const uploadUrl = json.uploadUrl || json.upload_url || json.signedUrl || json.signed_url || json.url || null;
  const publicUrl = json.publicUrl || json.public_url || json.public || json.result?.publicUrl || json.data?.publicUrl || null;
  if (!uploadUrl || !publicUrl) throw new Error("Upload-signed response missing uploadUrl/publicUrl");

  const putRes = await fetch(String(uploadUrl), { method: "PUT", headers: { "Content-Type": contentType }, body: file });
  if (!putRes.ok) throw new Error(`R2 PUT failed (${putRes.status})`);

  const stable = normalizeNonExpiringUrl(String(publicUrl));
  if (!stable.startsWith("http")) throw new Error("Upload returned invalid publicUrl");
  return stable;
}

// ────────────────────────────────────────────────────────────────────
// R2 store-remote (URL → R2 copy)
// ────────────────────────────────────────────────────────────────────
export async function storeRemoteToR2(
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>,
  currentPassId: string,
  url: string,
  kind: string,
): Promise<string> {
  const res = await apiFetch("/api/r2/store-remote-signed", {
    method: "POST",
    body: JSON.stringify({ sourceUrl: url, folder: "user_uploads", url, kind, passId: currentPassId }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) return url;
  const rawUrl = pickUrlFromR2Response(json);
  if (!rawUrl) return url;
  return normalizeNonExpiringUrl(rawUrl) || url;
}

// ────────────────────────────────────────────────────────────────────
// Patch a single upload item in state
// ────────────────────────────────────────────────────────────────────
export function patchUploadItem(
  setUploads: SetState<Record<UploadPanelKey, UploadItem[]>>,
  panel: UploadPanelKey,
  id: string,
  patch: Partial<UploadItem>,
) {
  setUploads((prev) => ({
    ...prev,
    [panel]: prev[panel].map((it) => (it.id === id ? { ...it, ...patch } : it)),
  }));
}

// ────────────────────────────────────────────────────────────────────
// Remove an upload item (with undo support)
// ────────────────────────────────────────────────────────────────────
export function removeUploadItem(
  setUploads: SetState<Record<UploadPanelKey, UploadItem[]>>,
  panel: UploadPanelKey,
  id: string,
  undoRedoPush?: (entry: { label: string; undo: () => void; redo: () => void }) => void,
) {
  let removedItem: UploadItem | null = null;
  setUploads((prev) => {
    const item = prev[panel].find((x) => x.id === id);
    removedItem = item ? { ...item } : null;
    if (item?.kind === "file" && item.url.startsWith("blob:")) {
      try { URL.revokeObjectURL(item.url); } catch {}
    }
    return { ...prev, [panel]: prev[panel].filter((x) => x.id !== id) };
  });

  if (undoRedoPush) {
    setTimeout(() => {
      if (!removedItem) return;
      const snap = removedItem;
      undoRedoPush({
        label: "Remove upload",
        undo: () => setUploads((prev) => ({ ...prev, [panel]: [...prev[panel], snap] })),
        redo: () => setUploads((prev) => ({ ...prev, [panel]: prev[panel].filter((x) => x.id !== id) })),
      });
    }, 0);
  }
}

// ────────────────────────────────────────────────────────────────────
// Move upload item (reorder within panel)
// ────────────────────────────────────────────────────────────────────
export function moveUploadItem(
  setUploads: SetState<Record<UploadPanelKey, UploadItem[]>>,
  panel: UploadPanelKey,
  from: number,
  to: number,
  animateMode: boolean,
) {
  setUploads((prev) => {
    const arr = [...prev[panel]];
    if (from < 0 || to < 0 || from >= arr.length || to >= arr.length) return prev;
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);

    if (panel === "product" && animateMode && arr.length >= 2) {
      const a0 = arr[0];
      const a1 = arr[1];
      const t0 = a0?.mediaType || inferMediaTypeFromUrl(a0?.remoteUrl || a0?.url || "") || "image";
      const t1 = a1?.mediaType || inferMediaTypeFromUrl(a1?.remoteUrl || a1?.url || "") || "image";
      const isVA = (t: string) => t === "video" || t === "audio";
      if (isVA(t0) && !isVA(t1)) return { ...prev, [panel]: [a1, a0, ...arr.slice(2)] };
      if (t0 !== "image" && t1 === "image") return { ...prev, [panel]: [a1, a0, ...arr.slice(2)] };
    }
    return { ...prev, [panel]: arr };
  });
}

// ────────────────────────────────────────────────────────────────────
// Start upload for a local file (validate → normalize → R2 → patch)
// ────────────────────────────────────────────────────────────────────
export async function startUploadForFileItem(
  deps: UploadFlowDeps,
  panel: UploadPanelKey,
  id: string,
  file: File,
  previewUrl: string,
  mediaType: "image" | "video" | "audio",
) {
  const { apiFetch, currentPassId, animateMode, uploadsRef, setUploads } = deps;
  const patch = (p: Partial<UploadItem>) => patchUploadItem(setUploads, panel, id, p);
  const remove = () => removeUploadItem(setUploads, panel, id);

  try {
    patch({ uploading: true, error: undefined });
    const curList = uploadsRef.current?.[panel] || [];
    const indexInPanel = curList.findIndex((x) => x.id === id);

    const isAnimateFrame1 = panel === "product" && animateMode && indexInPanel === 0 && mediaType === "image";
    const isAnimateFrame2Video = panel === "product" && animateMode && indexInPanel === 1 && mediaType === "video";

    // -- Animate frame 2 video validation --
    if (isAnimateFrame2Video) {
      const ext = getFileExt(file.name);
      const mime = String(file.type || "").toLowerCase();
      if (!ALLOWED_VIDEO_EXTS.has(ext) && !ALLOWED_VIDEO_MIMES.has(mime)) { deps.showUploadNotice("product", "Video must be MP4 or MOV."); patch({ uploading: false, error: "Unsupported video format" }); return; }
      if (file.size > MOTION_FRAME2_VIDEO_MAX_BYTES) { deps.showUploadNotice("product", "Video too large. Max 100MB."); patch({ uploading: false, error: "Video too large" }); return; }
      const d = await getMediaDurationSec(previewUrl, "video");
      if (typeof d === "number") {
        if (d < MOTION_FRAME2_VIDEO_MIN_SEC) { deps.showUploadNotice("product", "Video too short. Minimum 3 seconds."); patch({ uploading: false, error: "Video too short" }); return; }
        if (d > MOTION_FRAME2_VIDEO_MAX_SEC) { deps.showUploadNotice("product", "Video too long. Max 30 seconds."); patch({ uploading: false, error: "Video too long" }); return; }
      }
    }

    // -- Fabric audio validation --
    if (panel === "product" && animateMode && mediaType === "audio") {
      const ext = getFileExt(file.name);
      const mime = String(file.type || "").toLowerCase();
      if (!FABRIC_AUDIO_EXTS.has(ext) && !FABRIC_AUDIO_MIMES.has(mime)) { deps.showUploadNotice("product", "Audio must be mp3, wav, m4a, or aac."); patch({ uploading: false, error: "Unsupported audio format" }); return; }
      if (file.size > FABRIC_AUDIO_MAX_BYTES) { deps.showUploadNotice("product", "Audio too large. Max 10MB."); patch({ uploading: false, error: "Audio too large" }); return; }
      const d = await getMediaDurationSec(previewUrl, "audio");
      if (typeof d === "number" && d > FABRIC_AUDIO_MAX_SEC) { deps.showUploadNotice("product", "Audio too long. Max 60 seconds."); patch({ uploading: false, error: "Audio too long" }); return; }
    }

    // -- Animate: video/audio ONLY as product frame #2 --
    if (panel === "product" && animateMode && (mediaType === "video" || mediaType === "audio")) {
      const cur = uploadsRef.current?.product || [];
      const hasFrame0 = !!cur?.[0];
      const frame0Type = cur?.[0]?.mediaType || inferMediaTypeFromUrl(cur?.[0]?.remoteUrl || cur?.[0]?.url || "") || "image";
      if (!hasFrame0 || frame0Type !== "image") {
        deps.setMinaOverrideText("first frame must be an image");
        deps.showUploadNotice("product", "First frame must be an image. Add video/audio only as frame 2.");
        patch({ uploading: false, error: "First frame must be an image" }); return;
      }
      const maxSec = mediaType === "video" ? MOTION_FRAME2_VIDEO_MAX_SEC : FABRIC_AUDIO_MAX_SEC;
      const minSec = mediaType === "video" ? MOTION_FRAME2_VIDEO_MIN_SEC : FABRIC_AUDIO_MIN_SEC;
      const d = await getMediaDurationSec(previewUrl, mediaType === "video" ? "video" : "audio");
      if (typeof d === "number" && d > 0) patch({ durationSec: d, mediaType });
      if (typeof d === "number" && (d > maxSec || d < minSec)) {
        deps.setMinaOverrideText(mediaType === "video" ? UI_ERROR_MESSAGES.videoTooLong : UI_ERROR_MESSAGES.audioTooLong);
        deps.showUploadNotice("product", mediaType === "video" ? UI_ERROR_MESSAGES.videoTooLongNotice : UI_ERROR_MESSAGES.audioTooLongNotice);
        patch({ uploading: false, error: mediaType === "video" ? "Video duration invalid" : "Audio duration invalid" }); return;
      }
    }

    // -- Validate / normalize image --
    const ext = getFileExt(file.name);
    const mime = String(file.type || "").toLowerCase();
    const extAllowed = ext ? ALLOWED_EXTS.has(ext) : false;
    const mimeAllowed = mime ? ALLOWED_MIMES.has(mime) : false;
    const isAllowed = extAllowed || mimeAllowed;

    let normalized = file;
    let newPreviewUrl: string | undefined;

    if (mediaType === "image") {
      try {
        const norm = await normalizeImageForUpload(
          file, panel,
          isAnimateFrame1 ? { forceJpeg: true, maxDim: MOTION_FRAME1_MAX_DIM, maxBytes: MOTION_FRAME1_MAX_BYTES } : undefined,
        );
        normalized = norm.file;
        newPreviewUrl = norm.previewUrl;

        if (norm.changed && newPreviewUrl) {
          setUploads((prev) => {
            const item = prev[panel].find((x) => x.id === id);
            if (item?.kind === "file" && item.url?.startsWith("blob:")) { try { URL.revokeObjectURL(item.url); } catch {} }
            return { ...prev, [panel]: prev[panel].map((it) => it.id === id ? { ...it, file: normalized, url: newPreviewUrl } : it) };
          });
        }
      } catch (e: any) {
        const code = String(e?.message || "");
        if (code === "BROKEN" && isAllowed && file.size <= MAX_UPLOAD_BYTES) {
          normalized = file;
          newPreviewUrl = undefined;
        } else {
          const reason = code === "TOO_BIG" || file.size > MAX_UPLOAD_BYTES ? "too_big" : !isAllowed || code === "UNSUPPORTED" ? "unsupported" : "broken";
          deps.showUploadNotice(panel, humanizeUploadError(reason as any));
          patch({ uploading: false, error: humanizeUploadError(reason as any) }); return;
        }
      }
    }

    // -- Upload to R2 --
    const remoteUrl = await uploadFileToR2(apiFetch, currentPassId, panel, normalized);

    // -- Verify uploaded URL --
    const wasNormalized = normalized !== file;
    const ok = wasNormalized || await probeMediaUrlWithRetry(remoteUrl, mediaType, 12000, 4, 2000);
    if (!ok) { deps.showUploadNotice(panel, humanizeUploadError("broken")); patch({ uploading: false, error: "Upload verification failed" }); return; }

    let durationSec: number | undefined;
    if (panel === "product" && animateMode && (mediaType === "video" || mediaType === "audio")) {
      const d = await getMediaDurationSec(remoteUrl, mediaType === "video" ? "video" : "audio");
      if (typeof d === "number" && d > 0) durationSec = d;
      const maxSec = mediaType === "video" ? MOTION_FRAME2_VIDEO_MAX_SEC : FABRIC_AUDIO_MAX_SEC;
      const minSec = mediaType === "video" ? MOTION_FRAME2_VIDEO_MIN_SEC : FABRIC_AUDIO_MIN_SEC;
      if (typeof d === "number" && (d > maxSec || d < minSec)) {
        deps.setMinaOverrideText(mediaType === "video" ? UI_ERROR_MESSAGES.videoTooLong : UI_ERROR_MESSAGES.audioTooLong);
        deps.showUploadNotice(panel, mediaType === "video" ? UI_ERROR_MESSAGES.videoTooLongNotice : UI_ERROR_MESSAGES.audioTooLongNotice);
        patch({ uploading: false, error: mediaType === "video" ? "Video duration invalid" : "Audio duration invalid" }); return;
      }
    }

    const finalPatch: Partial<UploadItem> = { remoteUrl, uploading: false, error: undefined, mediaType };
    if (typeof durationSec === "number" && durationSec > 0) finalPatch.durationSec = durationSec;
    patch(finalPatch);
  } catch {
    deps.showUploadNotice(panel, UI_ERROR_MESSAGES.uploadFailed);
    patch({ uploading: false, error: "Upload failed" });
  }
}

// ────────────────────────────────────────────────────────────────────
// Start store for a remote URL item (probe → store → patch)
// ────────────────────────────────────────────────────────────────────
export async function startStoreForUrlItem(
  deps: UploadFlowDeps,
  panel: UploadPanelKey,
  id: string,
  url: string,
) {
  const { apiFetch, currentPassId, animateMode, setUploads } = deps;
  const patch = (p: Partial<UploadItem>) => patchUploadItem(setUploads, panel, id, p);
  const remove = () => removeUploadItem(setUploads, panel, id);

  try {
    patch({ uploading: true, error: undefined });
    const kind = inferMediaTypeFromUrl(url) || "image";

    const shouldKeepFull = animateMode && panel === "product" && kind === "image" && isMinaGeneratedAssetsUrl(url);
    const urlForStore = !shouldKeepFull && kind === "image" && isAssetsUrl(url)
      ? await deps.ensureOptimizedInputUrl(url, panel)
      : url;

    const ok = await probeMediaUrl(urlForStore, kind, 7000);
    if (!ok) { deps.showUploadNotice(panel, humanizeUploadError("link_broken")); patch({ uploading: false, error: "Link could not be loaded" }); return; }

    const remoteUrl = await storeRemoteToR2(apiFetch, currentPassId, urlForStore, panel);
    const kind2 = inferMediaTypeFromUrl(remoteUrl) || kind;
    const ok2 = await probeMediaUrlWithRetry(remoteUrl, kind2, 8000, 2, 1500);
    if (!ok2) { deps.showUploadNotice(panel, humanizeUploadError("broken")); patch({ uploading: false, error: "Upload verification failed" }); return; }

    let durationSec: number | undefined;
    if (panel === "product" && animateMode && (kind2 === "video" || kind2 === "audio")) {
      const maxSec = kind2 === "video" ? MOTION_FRAME2_VIDEO_MAX_SEC : FABRIC_AUDIO_MAX_SEC;
      const minSec = kind2 === "video" ? MOTION_FRAME2_VIDEO_MIN_SEC : FABRIC_AUDIO_MIN_SEC;
      const d = await getMediaDurationSec(remoteUrl, kind2 === "video" ? "video" : "audio");
      if (typeof d === "number" && d > 0) durationSec = d;
      if (typeof d === "number" && (d > maxSec || d < minSec)) {
        deps.setMinaOverrideText(kind2 === "video" ? UI_ERROR_MESSAGES.videoTooLong : UI_ERROR_MESSAGES.audioTooLong);
        deps.showUploadNotice(panel, kind2 === "video" ? UI_ERROR_MESSAGES.videoTooLongNotice : UI_ERROR_MESSAGES.audioTooLongNotice);
        patch({ uploading: false, error: kind2 === "video" ? "Video duration invalid" : "Audio duration invalid" }); return;
      }
    }

    patch({ remoteUrl, uploading: false, error: undefined, mediaType: kind2, durationSec });
  } catch {
    deps.showUploadNotice(panel, UI_ERROR_MESSAGES.uploadFailed);
    patch({ uploading: false, error: "Upload failed" });
  }
}

// ────────────────────────────────────────────────────────────────────
// Add files to a panel (create items → kick off uploads)
// ────────────────────────────────────────────────────────────────────
export function addFilesToPanel(
  deps: UploadFlowDeps,
  panel: UploadPanelKey,
  files: FileList,
) {
  const { animateMode, uploadsRef, setUploads } = deps;
  const max = capForPanel(panel, animateMode);
  const incoming = Array.from(files || []).filter((f) => {
    if (!f) return false;
    const mt = inferMediaTypeFromFile(f);
    if (panel !== "product") return mt === "image";
    if (!animateMode) return mt === "image";
    return mt === "image" || mt === "video" || mt === "audio";
  });
  if (!incoming.length) return;

  const replace = panel === "inspiration" ? false : !(panel === "product" && animateMode);
  const current = uploadsRef.current?.[panel] || [];
  const remaining = replace ? max : Math.max(0, max - current.length);
  const slice = incoming.slice(0, remaining);
  if (!slice.length) return;

  const now = Date.now();
  const created = slice.map((file, i) => {
    const id = `${panel}_${now}_${i}_${Math.random().toString(16).slice(2)}`;
    const previewUrl = URL.createObjectURL(file);
    const mediaType = inferMediaTypeFromFile(file) || "image";
    const item: UploadItem = { id, kind: "file", url: previewUrl, remoteUrl: undefined, file, uploading: true, error: undefined, mediaType };
    return { id, file, previewUrl, item };
  });

  setUploads((prev) => {
    if (replace) {
      prev[panel].forEach((it) => { if (it.kind === "file" && it.url?.startsWith("blob:")) { try { URL.revokeObjectURL(it.url); } catch {} } });
    }
    const base = replace ? [] : prev[panel];
    let next = [...base, ...created.map((c) => c.item)].slice(0, max);

    if (panel === "product" && animateMode && base.length === 1) {
      const baseType = base[0]?.mediaType || inferMediaTypeFromUrl(base[0]?.remoteUrl || base[0]?.url || "");
      if (baseType === "video" || baseType === "audio") {
        const newImages = created.map((c) => c.item).filter((it) => it.mediaType === "image" || !it.mediaType);
        if (newImages.length) next = [...newImages, ...base].slice(0, max);
      }
    }

    const accepted = new Set(next.map((x) => x.id));
    created.forEach((c) => { if (!accepted.has(c.id)) { try { URL.revokeObjectURL(c.previewUrl); } catch {} } });
    return { ...prev, [panel]: next };
  });

  created.forEach(({ id, file, previewUrl }) => {
    void startUploadForFileItem(deps, panel, id, file, previewUrl, inferMediaTypeFromFile(file) || "image");
  });
}

// ────────────────────────────────────────────────────────────────────
// Add a remote URL to a panel
// ────────────────────────────────────────────────────────────────────
export function addUrlToPanel(
  deps: UploadFlowDeps,
  panel: UploadPanelKey,
  url: string,
) {
  const { animateMode, setUploads } = deps;
  const max = capForPanel(panel, animateMode);
  const replace = panel === "inspiration" ? false : !(panel === "product" && animateMode);
  const id = `${panel}_url_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  setUploads((prev) => {
    const base = replace ? [] : prev[panel];
    const mediaType = inferMediaTypeFromUrl(url) || "image";
    const next: UploadItem = { id, kind: "url", url, remoteUrl: undefined, uploading: true, mediaType };

    if (panel === "product" && animateMode && base.length === 1
      && (base[0]?.mediaType === "video" || base[0]?.mediaType === "audio")
      && mediaType === "image") {
      return { ...prev, [panel]: [next, ...base].slice(0, max) };
    }
    return { ...prev, [panel]: [...base, next].slice(0, max) };
  });

  void startStoreForUrlItem(deps, panel, id, url);
}
