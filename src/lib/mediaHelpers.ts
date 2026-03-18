// src/lib/mediaHelpers.ts
// ============================================================================
// Media type detection, URL classification, and duration probing
// ============================================================================

import { isHttpUrl, stripSignedQuery } from "./minaHelpers";
import { ASSETS_HOST } from "./minaConstants";

export function isAssetsUrl(url: string) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === ASSETS_HOST || h.endsWith(`.${ASSETS_HOST}`);
  } catch {
    return false;
  }
}

export function isMinaGeneratedAssetsUrl(url: string) {
  try {
    const u = new URL(stripSignedQuery(String(url || "")));
    if (!isAssetsUrl(u.toString())) return false;
    if (u.pathname.includes("/mma/")) return true;
    return false;
  } catch {
    return false;
  }
}

export function isVideoUrl(url: string) {
  const base = (url || "").split("?")[0].split("#")[0].toLowerCase();
  return base.endsWith(".mp4") || base.endsWith(".webm") || base.endsWith(".mov") || base.endsWith(".m4v");
}

export function isAudioUrl(url: string) {
  const base = (url || "").split("?")[0].split("#")[0].toLowerCase();
  return (
    base.endsWith(".mp3") ||
    base.endsWith(".wav") ||
    base.endsWith(".m4a") ||
    base.endsWith(".aac") ||
    base.endsWith(".ogg")
  );
}

export function inferMediaTypeFromFile(file: File): "image" | "video" | "audio" | null {
  const t = String(file?.type || "").toLowerCase();
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("audio/")) return "audio";

  const name = String(file?.name || "").toLowerCase();
  const ext = (name.match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase();
  if (["png", "jpg", "jpeg", "webp", "gif", "avif", "heic", "heif"].includes(ext)) return "image";
  if (["mp4", "webm", "mov", "m4v"].includes(ext)) return "video";
  if (["mp3", "wav", "m4a", "aac", "ogg"].includes(ext)) return "audio";

  return null;
}

export function inferMediaTypeFromUrl(url: string): "image" | "video" | "audio" | null {
  const u = String(url || "").toLowerCase();
  if (!/^https?:\/\//i.test(u) && !u.startsWith("blob:")) return null;
  if (isVideoUrl(u)) return "video";
  if (isAudioUrl(u)) return "audio";
  return "image";
}

export function probeMediaUrl(url: string, kind: "image" | "video" | "audio", timeoutMs = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    if (!url || (!isHttpUrl(url) && !url.startsWith("blob:"))) return resolve(false);

    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      resolve(ok);
    };

    const t = window.setTimeout(() => finish(false), timeoutMs);

    if (kind === "image") {
      const img = new Image();
      (img as any).decoding = "async";
      img.onload = () => { window.clearTimeout(t); finish(true); };
      img.onerror = () => { window.clearTimeout(t); finish(false); };
      img.src = url;
      return;
    }

    const el = document.createElement(kind === "video" ? "video" : "audio");
    (el as any).preload = "metadata";
    (el as any).muted = true;

    const cleanup = () => {
      try { el.pause(); } catch {}
      try { el.removeAttribute("src"); el.load(); } catch {}
    };

    el.onloadedmetadata = () => { window.clearTimeout(t); cleanup(); finish(true); };
    el.onerror = () => { window.clearTimeout(t); cleanup(); finish(false); };
    el.src = url;
  });
}

export async function probeMediaUrlWithRetry(
  url: string,
  kind: "image" | "video" | "audio",
  timeoutMs = 8000,
  retries = 2,
  delayMs = 1500
): Promise<boolean> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ok = await probeMediaUrl(url, kind, timeoutMs);
    if (ok) return true;
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return false;
}

export function getMediaDurationSec(url: string, kind: "video" | "audio", timeoutMs = 8000): Promise<number | null> {
  return new Promise((resolve) => {
    if (!url || (!isHttpUrl(url) && !url.startsWith("blob:"))) return resolve(null);

    const el = document.createElement(kind === "video" ? "video" : "audio");
    (el as any).preload = "metadata";
    (el as any).muted = true;

    let done = false;
    const finish = (val: number | null) => {
      if (done) return;
      done = true;
      try { el.pause(); } catch {}
      try { el.removeAttribute("src"); el.load(); } catch {}
      resolve(val);
    };

    const t = window.setTimeout(() => finish(null), timeoutMs);

    el.onloadedmetadata = () => {
      window.clearTimeout(t);
      const d = Number((el as any).duration);
      finish(Number.isFinite(d) && d > 0 ? d : null);
    };
    el.onerror = () => { window.clearTimeout(t); finish(null); };
    el.src = url;
  });
}
