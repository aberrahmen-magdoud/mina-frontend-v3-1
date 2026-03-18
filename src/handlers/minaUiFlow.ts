// src/handlers/minaUiFlow.ts
// UI helpers: aspect cycling, animate toggle, brief, recreate, set-scene, download, sign-out.
// Extracted from MinaApp.tsx for module size.

import type {
  UploadPanelKey, UploadItem, StillItem, MotionItem,
  AspectOption, AspectKey,
} from "../lib/minaTypes";
import {
  isHttpUrl, stripSignedQuery, extractFirstHttpUrl,
  swapAspectRatio,
} from "../lib/minaHelpers";
import { inferMediaTypeFromFile, inferMediaTypeFromUrl } from "../lib/mediaHelpers";
import { downloadMinaAsset } from "../lib/minaDownload";
import { supabase } from "../lib/supabaseClient";
import { ASPECT_OPTIONS, MAX_BRIEF_CHARS, TYPING_HIDE_DELAY_MS, RECREATE_DRAFT_KEY } from "../lib/minaConstants";

// Local type aliases
type SetState<T> = (value: T | ((prev: T) => T)) => void;
type MutableRef<T> = { current: T };

// ────────────────────────────────────────────────────────────────────
// Aspect cycling
// ────────────────────────────────────────────────────────────────────
export function handleCycleAspect(
  setAspectIndex: SetState<number>,
  setPlatform: SetState<string>,
) {
  setAspectIndex((prev) => {
    const next = (prev + 1) % ASPECT_OPTIONS.length;
    setPlatform(ASPECT_OPTIONS[next].platformKey);
    return next;
  });
}

// ────────────────────────────────────────────────────────────────────
// Animate mode toggle
// ────────────────────────────────────────────────────────────────────
export function handleToggleAnimateMode(
  setAnimateMode: SetState<boolean>,
  setUploads: SetState<Record<UploadPanelKey, UploadItem[]>>,
  latestStill: StillItem | null,
) {
  setAnimateMode((prev) => {
    const next = !prev;
    if (next && latestStill?.url) {
      setUploads((curr) => ({
        ...curr,
        product: [{ id: `product_auto_${Date.now()}`, kind: "url", url: latestStill.url, remoteUrl: latestStill.url, uploading: false, mediaType: "image" }],
      }));
    }
    if (!next) setUploads((curr) => ({ ...curr, product: (curr.product || []).slice(0, 1) }));
    return next;
  });
}

// ────────────────────────────────────────────────────────────────────
// Brief change handler
// ────────────────────────────────────────────────────────────────────
export interface BriefChangeDeps {
  setBrief: SetState<string>;
  setMotionFinalPrompt: SetState<string>;
  setMotionDescription: SetState<string>;
  setStillBrief: SetState<string>;
  setShowDescribeMore: SetState<boolean>;
  setIsTyping: SetState<boolean>;
  setTypingUiHidden: SetState<boolean>;
  setHasEverTyped: SetState<boolean>;
  animateMode: boolean;
  hasEverTyped: boolean;
  hasFrame2Video: boolean;
  hasFrame2Audio: boolean;
  describeMoreTimeoutRef: MutableRef<number | null>;
  typingCalmTimeoutRef: MutableRef<number | null>;
  typingHideTimeoutRef: MutableRef<number | null>;
  typingRevealTimeoutRef: MutableRef<number | null>;
  typingUiHidden: boolean;
}

export function handleBriefChange(deps: BriefChangeDeps, value: string) {
  const trimmedToMax = (value || "").slice(0, MAX_BRIEF_CHARS);
  deps.setBrief(trimmedToMax);
  deps.setMotionFinalPrompt("");
  if (deps.animateMode) deps.setMotionDescription(trimmedToMax);
  else deps.setStillBrief(trimmedToMax);

  if (deps.describeMoreTimeoutRef.current !== null) { window.clearTimeout(deps.describeMoreTimeoutRef.current); deps.describeMoreTimeoutRef.current = null; }
  if (deps.typingCalmTimeoutRef.current !== null) window.clearTimeout(deps.typingCalmTimeoutRef.current);
  deps.setIsTyping(true);
  deps.typingCalmTimeoutRef.current = window.setTimeout(() => deps.setIsTyping(false), 900);

  if (deps.typingHideTimeoutRef.current === null && !deps.typingUiHidden) {
    deps.typingHideTimeoutRef.current = window.setTimeout(() => { deps.setTypingUiHidden(true); deps.typingHideTimeoutRef.current = null; }, TYPING_HIDE_DELAY_MS);
  }
  if (deps.typingRevealTimeoutRef.current !== null) { window.clearTimeout(deps.typingRevealTimeoutRef.current); deps.typingRevealTimeoutRef.current = null; }
  deps.setShowDescribeMore(false);

  const trimmedLength = trimmedToMax.trim().length;
  if (!deps.hasEverTyped && trimmedLength > 0) deps.setHasEverTyped(true);
  if (!deps.hasFrame2Video && !deps.hasFrame2Audio && trimmedLength > 0 && trimmedLength < 20) {
    deps.describeMoreTimeoutRef.current = window.setTimeout(() => deps.setShowDescribeMore(true), 1200);
  }
}

// ────────────────────────────────────────────────────────────────────
// Download current media
// ────────────────────────────────────────────────────────────────────
export async function handleDownloadCurrent(
  activeMediaKind: "still" | "motion" | null,
  currentStill: StillItem | null,
  currentMotion: MotionItem | null,
  motionFinalPrompt: string,
  motionTextTrimmed: string,
  motionDescription: string,
  lastStillPrompt: string,
  stillBrief: string,
  brief: string,
  setStillError: SetState<string | null>,
  setMotionError: SetState<string | null>,
) {
  const target = activeMediaKind === "motion" ? currentMotion?.url : currentStill?.url;
  if (!target) return;
  const kind = activeMediaKind === "motion" ? "motion" : "still";
  const prompt = kind === "motion"
    ? (motionFinalPrompt || motionTextTrimmed || motionDescription || brief || "")
    : (lastStillPrompt || stillBrief || brief || "");
  try { await downloadMinaAsset({ url: target, kind, prompt }); }
  catch (err: any) { const msg = err?.message || "Download failed."; if (activeMediaKind === "motion") setMotionError(msg); else setStillError(msg); }
}

// ────────────────────────────────────────────────────────────────────
// Set scene from viewer
// ────────────────────────────────────────────────────────────────────
export function handleSetSceneFromViewer(
  args: { url: string; clearInspiration?: boolean },
  animateMode: boolean,
  hasEverTyped: boolean,
  setHasEverTyped: SetState<boolean>,
  setActivePanel: SetState<any>,
  setUiStage: SetState<any>,
  setUploads: SetState<Record<UploadPanelKey, UploadItem[]>>,
  patchUploadItem: (panel: UploadPanelKey, id: string, patch: Partial<UploadItem>) => void,
  ensureOptimizedInputUrl: (url: string, kind: UploadPanelKey) => Promise<string>,
) {
  const baseUrl = stripSignedQuery(String(args?.url || "").trim());
  if (!baseUrl || !isHttpUrl(baseUrl)) return;

  const id0 = `product_scene_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const mk = (panel: UploadPanelKey, u: string, id?: string): UploadItem => ({
    id: id || `${panel}_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    kind: "url", url: u, remoteUrl: u, uploading: true, error: undefined,
    mediaType: inferMediaTypeFromUrl(u) || "image",
  });

  setUploads((prev) => {
    const frame1 = animateMode ? (prev.product?.[1]?.remoteUrl || prev.product?.[1]?.url || "") : "";
    const keepFrame1 = animateMode && isHttpUrl(frame1) ? { ...mk("product", frame1), uploading: false } : null;
    return {
      ...prev,
      product: animateMode ? [mk("product", baseUrl, id0), ...(keepFrame1 ? [keepFrame1] : [])].slice(0, 2) : [mk("product", baseUrl, id0)],
      inspiration: args?.clearInspiration ? [] : prev.inspiration,
    };
  });

  if (!hasEverTyped) setHasEverTyped(true);
  setActivePanel("product");
  setUiStage((s: number) => (s < 3 ? 3 : s));

  void (async () => {
    try { const optimized = await ensureOptimizedInputUrl(baseUrl, "product"); patchUploadItem("product", id0, { url: optimized, remoteUrl: optimized, uploading: false, error: undefined }); }
    catch { patchUploadItem("product", id0, { uploading: false }); }
  })();
}

// ────────────────────────────────────────────────────────────────────
// Re-create draft
// ────────────────────────────────────────────────────────────────────
export function applyRecreateDraft(
  draft: any,
  setAnimateMode: SetState<boolean>,
  setMotionDescription: SetState<string>,
  setStillBrief: SetState<string>,
  setBrief: SetState<string>,
  setAspectIndex: SetState<number>,
  setStylePresetKeys: SetState<string[]>,
  setMinaVisionEnabled: SetState<boolean>,
  setUploads: SetState<Record<UploadPanelKey, UploadItem[]>>,
  setActivePanel: SetState<any>,
  setUiStage: SetState<any>,
  applyingRecreateDraftRef: MutableRef<boolean>,
) {
  if (!draft || typeof draft !== "object") return;
  const mode = String(draft.mode || "").toLowerCase();
  const briefText = String(draft.brief || "").trim();
  if (!briefText) return;

  const ratioRaw = String(draft?.settings?.aspect_ratio || draft?.settings?.aspectRatio || draft?.aspect_ratio || "").trim().replace("/", ":");
  const idx = ASPECT_OPTIONS.findIndex((o) => o.ratio === ratioRaw);
  if (idx >= 0) setAspectIndex(idx);

  const nextStyleKeys = (draft?.settings?.stylePresetKeys || draft?.inputs?.stylePresetKeys || []) as any;
  if (Array.isArray(nextStyleKeys) && nextStyleKeys.length) setStylePresetKeys(nextStyleKeys.map(String));
  const vision = draft?.settings?.minaVisionEnabled ?? draft?.inputs?.minaVisionEnabled;
  if (typeof vision === "boolean") setMinaVisionEnabled(vision);

  const assets = (draft.assets || {}) as any;
  const pickStr = (...keys: string[]) => { for (const k of keys) { const v = assets?.[k]; if (typeof v === "string" && v.trim()) return v.trim(); } return ""; };
  const pickArr = (...keys: string[]) => { for (const k of keys) { const v = assets?.[k]; if (Array.isArray(v)) return v.filter((x: any) => typeof x === "string" && x.startsWith("http")); } return []; };

  const productUrl = pickStr("productImageUrl", "product_image_url");
  const logoUrl = pickStr("logoImageUrl", "logo_image_url");
  const inspUrls = pickArr("styleImageUrls", "style_image_urls", "inspiration_image_urls");
  const startUrl = pickStr("kling_start_image_url", "start_image_url", "startImageUrl");
  const endUrl = pickStr("kling_end_image_url", "end_image_url", "endImageUrl");

  const mkUrlItem = (panel: UploadPanelKey, url: string): UploadItem => ({
    id: `${panel}_recreate_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    kind: "url", url, remoteUrl: url, uploading: false,
    mediaType: inferMediaTypeFromUrl(url) || "image",
  });

  applyingRecreateDraftRef.current = true;
  const wantMotion = mode === "motion" || mode === "video";
  setAnimateMode(wantMotion);
  if (wantMotion) setMotionDescription(briefText); else setStillBrief(briefText);
  setBrief(briefText);

  setUploads((prev) => ({
    ...prev,
    product: wantMotion
      ? [startUrl || productUrl].filter(Boolean).slice(0, 1).map((u) => mkUrlItem("product", u)).concat(endUrl ? [mkUrlItem("product", endUrl)] : [])
      : (productUrl ? [mkUrlItem("product", productUrl)] : []),
    logo: logoUrl ? [mkUrlItem("logo", logoUrl)] : [],
    inspiration: inspUrls.slice(0, 4).map((u: string) => mkUrlItem("inspiration", u)),
  }));

  setActivePanel("product");
  setUiStage((s: number) => (s < 3 ? 3 : s));
  window.setTimeout(() => { applyingRecreateDraftRef.current = false; }, 0);
}

// ────────────────────────────────────────────────────────────────────
// Build re-create draft from current UI state
// ────────────────────────────────────────────────────────────────────
export function buildRecreateDraftFromUi(
  kind: "still" | "motion",
  uploads: Record<UploadPanelKey, UploadItem[]>,
  motionReferenceImageUrl: string,
  motionFinalPrompt: string,
  motionTextTrimmed: string,
  motionDescription: string,
  brief: string,
  lastStillPrompt: string,
  stillBrief: string,
  effectiveAspectRatio: string,
  animateEffectiveAspectRatio: string,
  stylePresetKeys: string[],
  minaVisionEnabled: boolean,
) {
  const insp = (uploads.inspiration || []).map((u) => u.remoteUrl || u.url).filter((u) => isHttpUrl(u)).slice(0, 4);

  if (kind === "motion") {
    const f0 = uploads.product[0]?.remoteUrl || uploads.product[0]?.url || "";
    const f1 = uploads.product[1]?.remoteUrl || uploads.product[1]?.url || "";
    const startFrame = isHttpUrl(f0) ? f0 : motionReferenceImageUrl;
    return {
      mode: "motion",
      brief: (motionFinalPrompt || motionTextTrimmed || motionDescription || brief || "").trim(),
      assets: { start_image_url: startFrame, end_image_url: isHttpUrl(f1) ? f1 : "", product_image_url: startFrame, inspiration_image_urls: insp },
      settings: { aspect_ratio: animateEffectiveAspectRatio, stylePresetKeys, minaVisionEnabled },
    };
  }

  const productUrl = uploads.product[0]?.remoteUrl || uploads.product[0]?.url || "";
  const logoUrl = uploads.logo[0]?.remoteUrl || uploads.logo[0]?.url || "";
  return {
    mode: "still",
    brief: (lastStillPrompt || stillBrief || brief || "").trim(),
    assets: { product_image_url: isHttpUrl(productUrl) ? productUrl : "", logo_image_url: isHttpUrl(logoUrl) ? logoUrl : "", inspiration_image_urls: insp },
    settings: { aspect_ratio: effectiveAspectRatio, stylePresetKeys, minaVisionEnabled },
  };
}

// ────────────────────────────────────────────────────────────────────
// Sign out
// ────────────────────────────────────────────────────────────────────
export async function handleSignOut() {
  try { await supabase.auth.signOut(); } finally {
    try { window.localStorage.removeItem("minaProfileNumberMap"); } catch {}
    if (typeof window !== "undefined") window.location.reload();
  }
}

// ────────────────────────────────────────────────────────────────────
// Drag / drop / paste global handler setup
// ────────────────────────────────────────────────────────────────────
export function setupGlobalDragDrop(opts: {
  getTargetPanel: () => UploadPanelKey;
  addFilesToPanel: (panel: UploadPanelKey, files: FileList) => void;
  addUrlToPanel: (panel: UploadPanelKey, url: string) => void;
  dragDepthRef: MutableRef<number>;
  setGlobalDragging: (b: boolean) => void;
}) {
  const { getTargetPanel, addFilesToPanel, addUrlToPanel, dragDepthRef, setGlobalDragging } = opts;

  const onDragEnter = (e: DragEvent) => {
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes("Files")) return;
    e.preventDefault(); dragDepthRef.current += 1; setGlobalDragging(true);
  };
  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes("Files")) return;
    e.preventDefault();
  };
  const onDragLeave = (_e: DragEvent) => {
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setGlobalDragging(false);
  };
  const onDrop = (e: DragEvent) => {
    if (!e.dataTransfer) return;
    const files = e.dataTransfer.files;
    const uri = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain") || "";
    const droppedUrl = extractFirstHttpUrl(uri);
    if ((!files || !files.length) && !droppedUrl) return;
    e.preventDefault(); dragDepthRef.current = 0; setGlobalDragging(false);
    const tp = getTargetPanel();
    if (files && files.length) { addFilesToPanel(tp, files); return; }
    if (droppedUrl) addUrlToPanel(tp, droppedUrl);
  };
  const onPaste = (e: ClipboardEvent) => {
    if (!e.clipboardData) return;
    const targetEl = e.target as HTMLElement | null;
    const isTypingField = !!targetEl?.closest("textarea, input, [contenteditable='true']");
    const items = Array.from(e.clipboardData.items || []);
    const fileItem = items.find((it) => {
      const t = String(it.type || "").toLowerCase();
      if (t.startsWith("image/") || t.startsWith("video/") || t.startsWith("audio/")) return true;
      if (it.kind !== "file") return false;
      const f = it.getAsFile();
      return !!f && !!inferMediaTypeFromFile(f);
    });
    if (fileItem) {
      const file = fileItem.getAsFile();
      if (file) {
        if (!isTypingField) e.preventDefault();
        const list = { 0: file, length: 1, item: (i: number) => (i === 0 ? file : null) } as unknown as FileList;
        addFilesToPanel(getTargetPanel(), list);
        return;
      }
    }
    const text = e.clipboardData.getData("text/plain") || "";
    const url = extractFirstHttpUrl(text);
    if (url) { if (!isTypingField) e.preventDefault(); addUrlToPanel(getTargetPanel(), url); }
  };

  window.addEventListener("dragenter", onDragEnter);
  window.addEventListener("dragover", onDragOver);
  window.addEventListener("dragleave", onDragLeave);
  window.addEventListener("drop", onDrop);
  window.addEventListener("paste", onPaste);

  return () => {
    window.removeEventListener("dragenter", onDragEnter);
    window.removeEventListener("dragover", onDragOver);
    window.removeEventListener("dragleave", onDragLeave);
    window.removeEventListener("drop", onDrop);
    window.removeEventListener("paste", onPaste);
  };
}
