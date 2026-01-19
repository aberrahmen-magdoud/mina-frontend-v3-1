// src/lib/mmaErrors.ts
// Centralized MMA error extraction + user-friendly messages.
// Add new errors here (one place) instead of scattering logic everywhere.

export type MmaErrorLike = any;

export const UI_ERROR_MESSAGES = {
  missingApiBaseUrl: "Missing API base URL.",
  missingApiBaseUrlEnv: "Missing API base URL (VITE_MINA_API_BASE_URL).",
  missingPassId: "Missing Pass ID.",
  missingPassIdMega: "Missing Pass ID for MEGA session.",
  uploadFailed: "Upload failed. Please try again.",
  uploadUnsupported: "That file type isn’t supported. Please upload a JPG, PNG, or WebP.",
  uploadTooBig: "That image is too large. Please choose one under 25MB.",
  uploadBroken: "We couldn’t read that image. Please try a different file.",
  uploadLinkBroken: "That link didn’t load as an image. Please paste a direct image link.",
  tweakMissingText: "Type a tweak first.",
  tweakMissingMedia: "Create an image/video first, then tweak it.",
  mmaTweakFailed: "MMA tweak failed.",
  videoTooLong: "videos max 30s please",
  audioTooLong: "audios max 60s please",
  videoTooLongNotice: "Videos max 30s please.",
  audioTooLongNotice: "Audios max 60s please.",
} as const;

export type UploadErrorReason = "unsupported" | "too_big" | "broken" | "link_broken";

export function humanizeUploadError(reason: UploadErrorReason): string {
  switch (reason) {
    case "unsupported":
      return UI_ERROR_MESSAGES.uploadUnsupported;
    case "too_big":
      return UI_ERROR_MESSAGES.uploadTooBig;
    case "broken":
      return UI_ERROR_MESSAGES.uploadBroken;
    case "link_broken":
      return UI_ERROR_MESSAGES.uploadLinkBroken;
    default:
      return UI_ERROR_MESSAGES.uploadFailed;
  }
}

function safeStr(v: any, fallback = ""): string {
  if (v === null || v === undefined) return fallback;
  const s = String(v).trim();
  return s ? s : fallback;
}

function lower(v: any): string {
  return safeStr(v).toLowerCase();
}

/**
 * Extract the *best available* error text from an MMA result object.
 * Works with shapes like:
 * - { error: "..." }
 * - { error: { code, message } }
 * - { mg_error: ... }
 * - { mma_vars: { error: ... } }
 */
export function extractMmaErrorTextFromResult(result: any): string {
  if (!result) return "";

  const direct = result?.error ?? result?.mg_error ?? result?.mma_vars?.error ?? result?.mmaVars?.error;
  if (typeof direct === "string") return direct.trim();
  if (direct && typeof direct === "object") {
    const code = safeStr(direct.code || direct.error || direct.name, "");
    const msg = safeStr(direct.message || direct.detail || direct.reason, "");
    if (code && msg) return `${code}: ${msg}`;
    return code || msg || "";
  }

  // Sometimes status is error but error field is missing
  const st = lower(result?.status || result?.mg_status || result?.mg_mma_status);
  if (st.includes("error") || st.includes("failed")) return "PIPELINE_ERROR";

  return "";
}

export function isTimeoutLikeStatus(status: string): boolean {
  const s = (status || "").toLowerCase();
  return s.includes("timeout");
}

/**
 * Convert raw error into a single user-facing string.
 * Keep the “That was too complicated” message here so it’s consistent everywhere.
 */
export function humanizeMmaError(err: MmaErrorLike): string {
  // If caller passes a string, treat it as message
  const raw =
    typeof err === "string"
      ? err
      : safeStr(
          err?.message ||
            err?.error?.message ||
            err?.error ||
            err?.details?.message ||
            err?.details ||
            err,
          ""
        );

  if (!raw) return "I couldn't make it. Please try again.";

  const s = raw.toLowerCase();

  // Credits
  if (s.includes("insufficient_credits")) return "I need more matchas to do that.";

  // Networking / fetch
  if (s.includes("failed to fetch") || s.includes("networkerror") || s.includes("fetch")) {
    return "Connection issue. Please retry.";
  }

  // Timeouts / background-running
  if (s.includes("timeout") || s.includes("still generating") || s.includes("in background")) {
    return "It’s still generating in the background — open Profile and refresh in a minute.";
  }

  // Kling motion-control “upper body” hard requirement (your screenshot)
  if (
    s.includes("no complete upper body") ||
    (s.includes("upper body") && (s.includes("detected") || s.includes("ensure")))
  ) {
    return "This motion model needs a clear HUMAN upper-body photo (head + shoulders + torso). Try a different image or switch to a non-motion-control video engine for objects.";
  }

  if (s.includes("image recognition failed")) {
    return "That image can’t be used for this motion model. Try a clearer image (well-lit, centered), or use a human upper-body photo.";
  }

  // Generic “no URL” / pipeline failure → your preferred user-friendly text
  if (
    s.includes("video_no_url") ||
    s.includes("mma_no_url") ||
    s.includes("pipeline_error") ||
    s.includes("no_output_url") ||
    s.includes("no output url")
  ) {
    return "That was too complicated, try simpler task.";
  }

  // Fallback: keep it short and clean
  return raw;
}
