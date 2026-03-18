// src/lib/minaCdn.ts
// CDN image optimization — Cloudflare /cdn-cgi/image/ URL builders

import { isHttpUrl, stripSignedQuery } from "./minaHelpers";
import { isAssetsUrl, probeMediaUrl } from "./mediaHelpers";

export function buildCdnResizedUrl(
  rawUrl: string,
  kind: "product" | "logo" | "inspiration",
  animateMode: boolean
): string {
  const clean = stripSignedQuery(String(rawUrl || "").trim());
  if (!clean || !isHttpUrl(clean)) return "";
  if (!isAssetsUrl(clean)) return clean;

  try {
    const u = new URL(clean);
    if (u.pathname.startsWith("/cdn-cgi/image/")) return u.toString();

    const format = kind === "logo" ? "png" : "jpeg";
    const targetWidth = animateMode && kind === "product" ? 2160 : 1080;
    const opts = `width=${targetWidth},fit=scale-down,quality=90,format=${format}`;
    return `${u.origin}/cdn-cgi/image/${opts}${u.pathname}${u.search}`;
  } catch {
    return clean;
  }
}

const MOTION_FRAME1_SEND_WIDTH = 2048;

export function buildCdnMotionFrame1Url(rawUrl: string): string {
  const clean = stripSignedQuery(String(rawUrl || "").trim());
  if (!clean || !isHttpUrl(clean)) return "";
  if (!isAssetsUrl(clean)) return clean;

  try {
    const u = new URL(clean);
    if (u.pathname.startsWith("/cdn-cgi/image/")) return u.toString();
    const opts = `width=${MOTION_FRAME1_SEND_WIDTH},fit=scale-down,quality=90,format=jpeg`;
    return `${u.origin}/cdn-cgi/image/${opts}${u.pathname}${u.search}`;
  } catch {
    return clean;
  }
}

export function createCdnOptimizer(animateMode: boolean) {
  const cache = new Map<string, string>();
  let cdnResizeOk: boolean | null = null;

  async function ensureOptimizedInputUrl(
    rawUrl: string,
    kind: "product" | "logo" | "inspiration"
  ): Promise<string> {
    const clean = stripSignedQuery(String(rawUrl || "").trim());
    if (!clean || !isHttpUrl(clean)) return "";

    const cached = cache.get(clean);
    if (cached) return cached;

    if (!isAssetsUrl(clean)) {
      cache.set(clean, clean);
      return clean;
    }

    const optimized = buildCdnResizedUrl(clean, kind, animateMode);
    if (!optimized || optimized === clean) {
      cache.set(clean, clean);
      return clean;
    }

    if (cdnResizeOk === true) {
      cache.set(clean, optimized);
      return optimized;
    }
    if (cdnResizeOk === false) {
      cache.set(clean, clean);
      return clean;
    }

    const ok = await probeMediaUrl(optimized, "image", 3500);
    cdnResizeOk = ok;
    const finalUrl = ok ? optimized : clean;
    cache.set(clean, finalUrl);
    return finalUrl;
  }

  const motionFrame1Cache = new Map<string, string>();

  async function ensureMotionFrame1SpecUrl(rawUrl: string): Promise<string> {
    const clean = stripSignedQuery(String(rawUrl || "").trim());
    if (!clean || !isHttpUrl(clean)) return "";

    const cached = motionFrame1Cache.get(clean);
    if (cached) return cached;

    if (!isAssetsUrl(clean)) {
      motionFrame1Cache.set(clean, clean);
      return clean;
    }

    const optimized = buildCdnMotionFrame1Url(clean);
    if (!optimized || optimized === clean) {
      motionFrame1Cache.set(clean, clean);
      return clean;
    }

    const ok = await probeMediaUrl(optimized, "image", 3500);
    const finalUrl = ok ? optimized : clean;
    motionFrame1Cache.set(clean, finalUrl);
    return finalUrl;
  }

  return { ensureOptimizedInputUrl, ensureMotionFrame1SpecUrl };
}
