// src/lib/profileHelpers.ts
// Helpers for the Profile component

import { isVideoUrl, isAudioUrl } from "./mediaHelpers";
import { cfInput1080 } from "./cfInput1080";
import { downloadMinaAsset } from "./minaDownload";
import type { AspectKey } from "./minaTypes";
export type Row = Record<string, any>;

export function safeString(v: any, fallback = ""): string {
  if (v === null || v === undefined) return fallback;
  const s = String(v);
  return s === "undefined" || s === "null" ? fallback : s;
}

export function asStrOrNull(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

export function pick(row: any, keys: string[], fallback = ""): string {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return fallback;
}

export function cfThumb(url: string, width = 1200, quality = 75) {
  if (!url) return url;
  if (!url.includes("assets.faltastudio.com/")) return url;
  if (url.includes("/cdn-cgi/image/")) return url; // already transformed
  return `https://assets.faltastudio.com/cdn-cgi/image/width=${width},quality=${quality},format=auto/${url.replace(
    "https://assets.faltastudio.com/",
    ""
  )}`;
}

export function cfInput2048(url: string, kind: "product" | "logo" | "style" = "product") {
  const u = String(url || "").trim();
  if (!u) return "";
  if (!u.includes("assets.faltastudio.com/")) return u;
  if (u.includes("/cdn-cgi/image/")) return u;

  // logo may need alpha => keep png, others => jpeg
  const format = kind === "logo" ? "png" : "jpeg";
  const opts = `width=2048,fit=scale-down,quality=88,format=${format}`;

  return `https://assets.faltastudio.com/cdn-cgi/image/${opts}/${u.replace("https://assets.faltastudio.com/", "")}`;
}

export function tryParseJson<T = any>(v: any): T | null {
  if (!v) return null;
  if (typeof v === "object") return v as T;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  if (!(s.startsWith("{") || s.startsWith("["))) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

export function isImageUrl(url: string) {
  const u = (url || "").split("?")[0].split("#")[0].toLowerCase();
  return u.endsWith(".jpg") || u.endsWith(".jpeg") || u.endsWith(".png") || u.endsWith(".gif") || u.endsWith(".webp");
}

export function normalizeMediaUrl(url: string) {
  if (!url) return "";
  const base = url.split(/[?#]/)[0];
  return base || url;
}

export const AUDIO_THUMB_URL = "https://assets.faltastudio.com/Website%20Assets/audio-mina-icon.gif";

// Make likes match even if one URL is Cloudflare transformed and the other is raw.
export function canonicalAssetUrl(url: string) {
  const s = normalizeMediaUrl(url);
  if (!s) return "";

  // https://assets.faltastudio.com/cdn-cgi/image/width=...,quality=...,format=auto/<path>
  const m = s.match(/^https?:\/\/assets\.faltastudio\.com\/cdn-cgi\/image\/[^/]+\/(.+)$/);
  if (m?.[1]) return `https://assets.faltastudio.com/${m[1]}`;

  return s;
}

export function getScrollParent(node: HTMLElement | null): HTMLElement | null {
  let el: HTMLElement | null = node?.parentElement || null;
  while (el) {
    const style = window.getComputedStyle(el);
    const oy = style.overflowY;
    const isScrollable = oy === "auto" || oy === "scroll" || oy === "overlay";
    if (isScrollable && el.scrollHeight > el.clientHeight + 10) return el;
    el = el.parentElement;
  }
  return null;
}

export function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

export function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" }) +
    " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

const _downloadingUrls = new Set<string>();

export async function downloadMedia(url: string, prompt: string, isMotion: boolean) {
  if (!url) return;
  if (_downloadingUrls.has(url)) return;        // prevent double-clicks
  _downloadingUrls.add(url);
  try {
    await downloadMinaAsset({
      url,
      kind: isMotion ? "motion" : "still",
      prompt: prompt || "",
    });
  } catch (err: any) {
    const msg = err?.message || "Download failed";
    console.warn("Download failed:", err);
    alert(msg);
  } finally {
    _downloadingUrls.delete(url);
  }
}

export const ASPECT_OPTIONS: { key: AspectKey; ratio: string; label: string }[] = [
  { key: "2-3", ratio: "2:3", label: "2:3" },
  { key: "1-1", ratio: "1:1", label: "1:1" },
  { key: "9-16", ratio: "9:16", label: "9:16" },
  { key: "3-4", ratio: "3:4", label: "3:4" },
];

export function normalizeAspectRatio(raw: string | null | undefined) {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";

  // ✅ Accept keys like "9-16", "2-3"
  const asKey = trimmed.replace("/", "-").replace(":", "-");
  const byKey = ASPECT_OPTIONS.find((opt) => opt.key === asKey);
  if (byKey) return byKey.ratio;

  // direct ratio form
  const direct = trimmed.replace("/", ":");
  if (direct.includes(":")) {
    const [a, b] = direct.split(":").map((p) => p.trim());
    if (a && b) {
      const candidate = `${a}:${b}`;
      const match = ASPECT_OPTIONS.find((opt) => opt.ratio === candidate);
      if (match) return match.ratio;
    }
  }

  // parse "9 x 16" etc and pick closest
  const re = /([0-9.]+)\s*[xX:\/ ]\s*([0-9.]+)/;
  const m = trimmed.match(re);
  if (m) {
    const w = parseFloat(m[1]);
    const h = parseFloat(m[2]);
    if (Number.isFinite(w) && Number.isFinite(h) && h > 0) {
      const val = w / h;
      let best: { opt: (typeof ASPECT_OPTIONS)[number] | null; diff: number } = { opt: null, diff: Infinity };
      for (const opt of ASPECT_OPTIONS) {
        const [aw, ah] = opt.ratio.split(":").map((p) => parseFloat(p));
        if (!Number.isFinite(aw) || !Number.isFinite(ah) || ah === 0) continue;
        const ratio = aw / ah;
        const diff = Math.abs(ratio - val);
        if (diff < best.diff) best = { opt, diff };
      }
      if (best.opt) return best.opt.ratio;
    }
  }

  return "";
}

export function looksLikeSystemPrompt(s: string) {
  const t = (s || "").trim();
  if (!t) return false;

  const low = t.toLowerCase();
  if (low.includes("you are") && (low.includes("assistant") || low.includes("system"))) return true;
  if (low.includes("return strict json")) return true;
  if (low.includes("output format")) return true;
  if (low.includes("safety:")) return true;

  return false;
}

export function sanitizeUserBrief(s: string) {
  let t = (s || "").trim();

  // Fix stored typo like "chttps://..."
  if (t.startsWith("chttp://") || t.startsWith("chttps://")) t = t.slice(1);

  // Treat placeholder dashes as empty
  const withoutDashes = t.replace(/[-–—]/g, "").trim();
  if (!withoutDashes) return "";

  return t.trim();
}

// ---------- LIKES (MMA + legacy safe) ----------

export function isLikeEventRow(row: Row) {
  const metaRaw = (row as any)?.mg_meta ?? (row as any)?.meta ?? null;
  const metaObj = tryParseJson<any>(metaRaw) ?? metaRaw ?? {};
  const eventType = String(metaObj?.event_type ?? metaObj?.eventType ?? (row as any)?.event_type ?? "").toLowerCase();
  if (eventType === "like") return true;

  // legacy: payload.liked true
  const payloadRaw = (row as any)?.mg_payload ?? (row as any)?.payload ?? null;
  const payload = tryParseJson<any>(payloadRaw) ?? payloadRaw ?? {};
  const rawLiked = payload?.liked ?? payload?.isLiked ?? payload?.like ?? (row as any)?.liked;
  if (rawLiked === true || rawLiked === 1 || rawLiked === "true") return true;

  // legacy: "likes are feedback rows where comment is empty"
  const payloadComment = typeof payload?.comment === "string" ? payload.comment.trim() : null;
  const commentFieldPresent =
    Object.prototype.hasOwnProperty.call(row, "mg_comment") || Object.prototype.hasOwnProperty.call(row, "comment");
  const commentValue = commentFieldPresent ? pick(row, ["mg_comment", "comment"], "") : null;
  const commentTrim = typeof commentValue === "string" ? commentValue.trim() : null;
  if ((payloadComment !== null && payloadComment === "") || (commentTrim !== null && commentTrim === "")) return true;

  return false;
}

export function findLikeUrl(row: Row) {
  if (!isLikeEventRow(row)) return "";

  const metaRaw = (row as any)?.mg_meta ?? (row as any)?.meta ?? null;
  const metaObj = tryParseJson<any>(metaRaw) ?? metaRaw ?? {};
  const metaPayloadRaw = metaObj?.payload ?? null;
  const metaPayload = tryParseJson<any>(metaPayloadRaw) ?? metaPayloadRaw ?? {};

  const payloadRaw = (row as any)?.mg_payload ?? (row as any)?.payload ?? null;
  const payload = tryParseJson<any>(payloadRaw) ?? payloadRaw ?? {};

  const out =
    pick(metaPayload, ["output_url", "outputUrl", "url", "media_url", "mediaUrl"], "").trim() ||
    pick(payload, ["output_url", "outputUrl", "url", "media_url", "mediaUrl"], "").trim() ||
    pick(payload, ["image_url", "imageUrl", "video_url", "videoUrl"], "").trim() ||
    pick(row, ["mg_output_url", "outputUrl", "output_url"], "").trim() ||
    pick(row, ["mg_image_url", "imageUrl", "image_url"], "").trim() ||
    pick(row, ["mg_video_url", "videoUrl", "video_url"], "").trim();

  return out;
}

export function findLikedGenerationId(row: Row) {
  if (!isLikeEventRow(row)) return "";

  const metaRaw = (row as any)?.mg_meta ?? (row as any)?.meta ?? null;
  const metaObj = tryParseJson<any>(metaRaw) ?? metaRaw ?? {};
  const metaPayloadRaw = metaObj?.payload ?? null;
  const metaPayload = tryParseJson<any>(metaPayloadRaw) ?? metaPayloadRaw ?? {};

  const payloadRaw = (row as any)?.mg_payload ?? (row as any)?.payload ?? null;
  const payload = tryParseJson<any>(payloadRaw) ?? payloadRaw ?? {};

  const gid =
    safeString((row as any)?.mg_generation_id, "").trim() ||
    safeString(metaPayload?.generation_id ?? metaPayload?.generationId ?? metaPayload?.generationID, "").trim() ||
    safeString(payload?.generation_id ?? payload?.generationId ?? payload?.generationID, "").trim();

  return gid;
}

// ---------- INPUT EXTRACTION (USER BRIEF) ----------

export function extractInputsForDisplay(row: Row, isMotionHint?: boolean) {
  const payloadRaw = (row as any)?.mg_payload ?? (row as any)?.payload ?? null;
  const metaRaw = (row as any)?.mg_meta ?? (row as any)?.meta ?? null;
  const varsRaw =
    (row as any)?.mg_mma_vars ??
    (row as any)?.mg_vars ??
    (row as any)?.vars ??
    (row as any)?.mma_vars ??
    null;

  const payload = tryParseJson<any>(payloadRaw) ?? payloadRaw ?? null;
  const meta = tryParseJson<any>(metaRaw) ?? metaRaw ?? null;
  const vars = tryParseJson<any>(varsRaw) ?? varsRaw ?? null;

  const varsAssets = vars && typeof vars === "object" ? (vars as any).assets : null;
  const varsInputs = vars && typeof vars === "object" ? (vars as any).inputs : null;
  const varsHistory = vars && typeof vars === "object" ? (vars as any).history : null;
  const varsMeta = vars && typeof vars === "object" ? (vars as any).meta : null;
  const varsFeedback = vars && typeof vars === "object" ? (vars as any).feedback : null;
  const inputs = varsInputs || {};

  const flow = String(varsMeta?.flow || meta?.flow || "").toLowerCase();
  const mmaMode = String((row as any)?.mg_mma_mode || vars?.mode || "").toLowerCase();

  const isTweak =
    flow.includes("tweak") ||
    flow.includes("edit") ||
    flow.includes("revise") ||
    flow.includes("variant") ||
    flow.includes("iterate");

  const isMotion =
    typeof isMotionHint === "boolean"
      ? isMotionHint
      : mmaMode === "video" ||
        mmaMode === "motion" ||
        flow.includes("video") ||
        flow.includes("animate") ||
        flow.includes("motion");

  // ----------------------------
  // ✅ USER BRIEF ONLY (no AI prompt)
  // ----------------------------

  const commonUser = pick(varsInputs, ["brief", "user_brief", "userBrief", "prompt", "user_prompt", "userPrompt"], "");
  const commonUserMeta = pick(varsMeta, ["brief", "user_brief", "userBrief", "prompt", "user_prompt", "userPrompt"], "");

  // Still
  const stillCreate = commonUser || commonUserMeta;
  const stillTweak = pick(varsInputs, ["tweak_brief", "tweak_user_brief", "tweakBrief"], "");
  const fbStill = pick(varsFeedback, ["still_feedback", "stillFeedback", "feedback_still"], "");

  // Motion / Video
  const motionCreate =
    pick(varsInputs, ["motion_user_brief", "motionUserBrief", "motion_brief", "motionBrief"], "") ||
    commonUser ||
    commonUserMeta;

  const motionOverride = pick(varsInputs, ["prompt_override", "motion_prompt_override", "motionPromptOverride"], "");

  const motionTweak = pick(varsInputs, ["tweak_motion_user_brief", "tweakMotionUserBrief"], "");
  const fbMotion = pick(varsFeedback, ["motion_feedback", "motionFeedback", "feedback_motion"], "");

  // Last resort user-entered legacy fields (still user-typed)
  const legacyUser =
    pick(row, ["mg_user_prompt", "mg_user_message", "mg_brief"], "") ||
    pick(payload?.inputs, ["brief", "user_brief", "userBrief", "motion_user_brief", "prompt", "userPrompt"], "") ||
    pick(payload, ["brief", "user_brief", "userBrief", "motion_user_brief", "prompt", "userPrompt"], "") ||
    pick(meta, ["brief", "user_brief", "userBrief", "userPrompt", "user_prompt", "prompt"], "");

  const candidates: string[] = isMotion
    ? isTweak
      ? [motionTweak, fbMotion, motionOverride, motionCreate, fbStill, stillCreate, legacyUser]
      : [motionCreate, motionOverride, fbMotion, motionTweak, fbStill, stillCreate, legacyUser]
    : isTweak
    ? [stillTweak, fbStill, stillCreate, fbMotion, motionCreate, legacyUser]
    : [stillCreate, fbStill, stillTweak, legacyUser];

  const brief =
    candidates
      .map((s) => sanitizeUserBrief(String(s || "")))
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !looksLikeSystemPrompt(s))[0] || "";

  // ----------------------------
  // extractions for recreate + details
  // ----------------------------

  const aspect =
    normalizeAspectRatio(
      pick(row, ["mg_aspect_ratio", "aspect_ratio", "aspectRatio"], "") ||
        pick(meta, ["aspectRatio", "aspect_ratio"], "") ||
        pick(payload, ["aspect_ratio", "aspectRatio"], "") ||
        pick(payload?.inputs, ["aspect_ratio", "aspectRatio"], "") ||
        pick(varsInputs, ["aspect_ratio", "aspectRatio", "ratio"], "") ||
        pick(varsMeta, ["aspectRatio", "aspect_ratio", "ratio"], "")
    ) || "";

  const stylePresetKeysRaw =
    meta?.stylePresetKeys ??
    meta?.style_preset_keys ??
    payload?.settings?.stylePresetKeys ??
    payload?.settings?.style_preset_keys ??
    payload?.inputs?.stylePresetKeys ??
    payload?.inputs?.style_preset_keys ??
    varsMeta?.stylePresetKeys ??
    varsMeta?.style_preset_keys ??
    varsInputs?.stylePresetKeys ??
    varsInputs?.style_preset_keys ??
    vars?.stylePresetKeys ??
    vars?.style_preset_keys ??
    null;

  const stylePresetKeyRaw =
    meta?.stylePresetKey ??
    meta?.style_preset_key ??
    payload?.settings?.stylePresetKey ??
    payload?.settings?.style_preset_key ??
    payload?.inputs?.stylePresetKey ??
    payload?.inputs?.style_preset_key ??
    varsMeta?.stylePresetKey ??
    varsMeta?.style_preset_key ??
    varsInputs?.stylePresetKey ??
    varsInputs?.style_preset_key ??
    vars?.stylePresetKey ??
    vars?.style_preset_key ??
    null;

  const stylePresetKeys: string[] = Array.isArray(stylePresetKeysRaw)
    ? stylePresetKeysRaw.map(String).filter(Boolean)
    : stylePresetKeyRaw
    ? [String(stylePresetKeyRaw)]
    : [];

  const minaVisionEnabled =
    typeof meta?.minaVisionEnabled === "boolean"
      ? meta.minaVisionEnabled
      : typeof payload?.settings?.minaVisionEnabled === "boolean"
      ? payload.settings.minaVisionEnabled
      : typeof payload?.inputs?.minaVisionEnabled === "boolean"
      ? payload.inputs.minaVisionEnabled
      : typeof varsHistory?.vision_intelligence === "boolean"
      ? varsHistory.vision_intelligence
      : typeof varsHistory?.visionIntelligence === "boolean"
      ? varsHistory.visionIntelligence
      : undefined;

  const productImageUrl =
    varsAssets?.product_image_url ||
    varsAssets?.productImageUrl ||
    varsInputs?.product_image_url ||
    varsInputs?.productImageUrl ||
    meta?.productImageUrl ||
    payload?.assets?.productImageUrl ||
    payload?.assets?.product_image_url ||
    payload?.assets?.product_image ||
    vars?.productImageUrl ||
    vars?.product_image_url ||
    "";

  const logoImageUrl =
    varsAssets?.logo_image_url ||
    varsAssets?.logoImageUrl ||
    varsInputs?.logo_image_url ||
    varsInputs?.logoImageUrl ||
    meta?.logoImageUrl ||
    payload?.assets?.logoImageUrl ||
    payload?.assets?.logo_image_url ||
    payload?.assets?.logo_image ||
    vars?.logoImageUrl ||
    vars?.logo_image_url ||
    "";

  const styleImageUrls =
    varsAssets?.style_image_urls ||
    varsAssets?.styleImageUrls ||
    varsAssets?.inspiration_image_urls ||
    varsAssets?.inspirationImageUrls ||
    varsInputs?.style_image_urls ||
    varsInputs?.styleImageUrls ||
    meta?.styleImageUrls ||
    payload?.assets?.styleImageUrls ||
    payload?.assets?.style_image_urls ||
    payload?.assets?.inspiration_image_urls ||
    vars?.styleImageUrls ||
    vars?.style_image_urls ||
    [];

  const styleImages: string[] = Array.isArray(styleImageUrls)
    ? styleImageUrls.map(String).filter((u) => String(u).startsWith("http"))
    : [];

  const startImageUrl =
    String(
      varsAssets?.start_image_url ||
        varsAssets?.startImageUrl ||
        varsInputs?.start_image_url ||
        varsInputs?.startImageUrl ||
        varsInputs?.kling_start_image_url ||
        varsInputs?.klingStartImageUrl ||
        ""
    ).trim() || "";

  const endImageUrl =
    String(
      varsAssets?.end_image_url ||
        varsAssets?.endImageUrl ||
        varsInputs?.end_image_url ||
        varsInputs?.endImageUrl ||
        varsInputs?.kling_end_image_url ||
        varsInputs?.klingEndImageUrl ||
        ""
    ).trim() || "";

  const klingFramesRaw =
    varsAssets?.kling_image_urls ||
    varsAssets?.klingImageUrls ||
    varsInputs?.kling_image_urls ||
    varsInputs?.klingImageUrls ||
    vars?.kling_image_urls ||
    vars?.klingImageUrls ||
    [];

  const klingFrameUrls: string[] = Array.isArray(klingFramesRaw)
    ? klingFramesRaw.map(String).filter((u) => /^https?:\/\//i.test(String(u)))
    : [];

  // ✅ Reference video/audio (Frame 2 types) — NEW AI support (frame2_* + video/audio)
  const frame2VideoUrl =
    asStrOrNull(inputs.frame2_video_url || inputs.frame2VideoUrl) ||
    asStrOrNull(varsAssets?.frame2_video_url || varsAssets?.frame2VideoUrl) ||
    asStrOrNull((vars as any)?.frame2_video_url || (vars as any)?.frame2VideoUrl);

  const frame2AudioUrl =
    asStrOrNull(inputs.frame2_audio_url || inputs.frame2AudioUrl) ||
    asStrOrNull(varsAssets?.frame2_audio_url || varsAssets?.frame2AudioUrl) ||
    asStrOrNull((vars as any)?.frame2_audio_url || (vars as any)?.frame2AudioUrl);

  // ✅ Frame2 routing fields (controllers usually read from vars.inputs)
  const frame2Kind = safeString(
    inputs.frame2_kind ||
      inputs.frame2Kind ||
      (frame2VideoUrl ? "video" : frame2AudioUrl ? "audio" : ""),
    ""
  );

  const frame2Url =
    asStrOrNull(inputs.frame2_url || inputs.frame2Url) ||
    frame2VideoUrl ||
    frame2AudioUrl ||
    null;

  const frame2DurationSec = (() => {
    const raw =
      inputs.frame2_duration_sec ||
      inputs.frame2DurationSec ||
      inputs.duration_sec ||
      inputs.durationSec ||
      inputs.duration ||
      null;

    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.max(1, Math.min(30, Math.floor(n))); // clamp 1..30
  })();

  const frame2KindLower = frame2Kind.toLowerCase();

  const referenceVideoUrlRaw =
    // new keys
    varsAssets?.frame2_video_url ||
    varsAssets?.frame2VideoUrl ||
    varsAssets?.reference_video_url ||
    varsAssets?.referenceVideoUrl ||
    varsAssets?.ref_video_url ||
    varsAssets?.refVideoUrl ||
    varsAssets?.kling_reference_video_url ||
    varsAssets?.klingReferenceVideoUrl ||
    varsAssets?.video_url ||
    varsAssets?.videoUrl ||
    varsAssets?.video ||
    // inputs fallbacks
    varsInputs?.frame2_video_url ||
    varsInputs?.frame2VideoUrl ||
    varsInputs?.reference_video_url ||
    varsInputs?.referenceVideoUrl ||
    varsInputs?.ref_video_url ||
    varsInputs?.refVideoUrl ||
    varsInputs?.video_url ||
    varsInputs?.videoUrl ||
    varsInputs?.video ||
    // last resort
    (vars as any)?.frame2_video_url ||
    (vars as any)?.frame2VideoUrl ||
    (vars as any)?.reference_video_url ||
    (vars as any)?.referenceVideoUrl ||
    (vars as any)?.ref_video_url ||
    (vars as any)?.refVideoUrl ||
    (vars as any)?.video_url ||
    (vars as any)?.videoUrl ||
    (vars as any)?.video ||
    "";

  const referenceAudioUrlRaw =
    // new keys
    varsAssets?.frame2_audio_url ||
    varsAssets?.frame2AudioUrl ||
    varsAssets?.reference_audio_url ||
    varsAssets?.referenceAudioUrl ||
    varsAssets?.ref_audio_url ||
    varsAssets?.refAudioUrl ||
    varsAssets?.audio_url ||
    varsAssets?.audioUrl ||
    varsAssets?.audio ||
    // inputs fallbacks
    varsInputs?.frame2_audio_url ||
    varsInputs?.frame2AudioUrl ||
    varsInputs?.reference_audio_url ||
    varsInputs?.referenceAudioUrl ||
    varsInputs?.ref_audio_url ||
    varsInputs?.refAudioUrl ||
    varsInputs?.audio_url ||
    varsInputs?.audioUrl ||
    varsInputs?.audio ||
    // last resort
    (vars as any)?.frame2_audio_url ||
    (vars as any)?.frame2AudioUrl ||
    (vars as any)?.reference_audio_url ||
    (vars as any)?.referenceAudioUrl ||
    (vars as any)?.ref_audio_url ||
    (vars as any)?.refAudioUrl ||
    (vars as any)?.audio_url ||
    (vars as any)?.audioUrl ||
    (vars as any)?.audio ||
    "";

  const referenceVideoUrl = String(referenceVideoUrlRaw || "").trim();
  const referenceAudioUrl = String(referenceAudioUrlRaw || "").trim();

  // ✅ accept URLs even if they don't end with .mp4/.mp3 (some R2/public links won't)
  const refVideo =
    /^https?:\/\//i.test(referenceVideoUrl) &&
    (isVideoUrl(referenceVideoUrl) || frame2KindLower.includes("video"))
      ? referenceVideoUrl
      : "";

  const refAudio =
    /^https?:\/\//i.test(referenceAudioUrl) &&
    (isAudioUrl(referenceAudioUrl) || frame2KindLower.includes("audio") || !isVideoUrl(referenceAudioUrl))
      ? referenceAudioUrl
      : "";

  const stillLane = String(
    varsInputs?.still_lane ||
      varsInputs?.stillLane ||
      varsMeta?.still_lane ||
      varsMeta?.stillLane ||
      ""
  ).trim();

  const movementStyle = String(
    varsInputs?.selected_movement_style ||
      varsInputs?.selectedMovementStyle ||
      varsInputs?.movement_style ||
      varsInputs?.movementStyle ||
      ""
  ).trim();

  const motionDurationSec = (() => {
    const raw =
      varsInputs?.motion_duration_sec ||
      varsInputs?.motionDurationSec ||
      varsInputs?.duration_sec ||
      varsInputs?.durationSec ||
      varsInputs?.duration ||
      varsMeta?.motion_duration_sec ||
      varsMeta?.motionDurationSec ||
      varsMeta?.duration ||
      null;

    const n = Number(raw);
    if (n === 10) return 10 as const;
    if (n === 5) return 5 as const;
    return undefined;
  })();

  const generateAudio = (() => {
    const raw =
      varsInputs?.generate_audio ??
      varsInputs?.generateAudio ??
      varsMeta?.generate_audio ??
      varsMeta?.generateAudio ??
      null;

    if (typeof raw === "boolean") return raw;
    if (raw === 1 || raw === "1" || raw === "true") return true;
    if (raw === 0 || raw === "0" || raw === "false") return false;
    return undefined;
  })();

  const styleLabel = (movementStyle || stillLane || "").trim();

  const tone = String(
    meta?.tone || payload?.inputs?.tone || payload?.tone || varsInputs?.tone || varsMeta?.tone || vars?.tone || ""
  ).trim();

  const platform = String(
    meta?.platform ||
      payload?.inputs?.platform ||
      payload?.platform ||
      varsInputs?.platform ||
      varsMeta?.platform ||
      vars?.platform ||
      ""
  ).trim();

  return {
    brief,
    aspectRatio: aspect,
    stylePresetKeys,
    minaVisionEnabled,
    productImageUrl: String(productImageUrl || "").trim(),
    logoImageUrl: String(logoImageUrl || "").trim(),
    styleImageUrls: styleImages,
    startImageUrl,
    endImageUrl,
    klingFrameUrls,
    styleLabel,
    tone,
    platform,
    motionDurationSec,
    generateAudio,
    // ✅ NEW: frame2 routing (Fabric / Motion-Control)
    frame2_kind: frame2Kind,
    frame2_url: frame2Url,
    frame2_duration_sec: frame2DurationSec,

    // ✅ also expose direct urls (extra-safe)
    frame2_audio_url: frame2AudioUrl,
    frame2_video_url: frame2VideoUrl,
    referenceVideoUrl: refVideo,
    referenceAudioUrl: refAudio,
  };
}

