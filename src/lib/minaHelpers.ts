// src/lib/minaHelpers.ts
// ============================================================================
// Pure utility / helper functions (no React, no side effects)
// ============================================================================

import type { AspectOption, CustomStylePreset } from "./minaTypes";
import { CUSTOM_STYLES_LS_KEY } from "./minaConstants";

export function classNames(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function padEditorialNumber(value: number | string) {
  const clean = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(clean)) return clean.toString().padStart(2, "0");
  return String(value).trim() || "00";
}

export function hasSignedQuery(searchParams: URLSearchParams) {
  return (
    searchParams.has("X-Amz-Signature") ||
    searchParams.has("X-Amz-Credential") ||
    searchParams.has("X-Amz-Algorithm") ||
    searchParams.has("X-Amz-Date") ||
    searchParams.has("X-Amz-Expires") ||
    searchParams.has("Signature") ||
    searchParams.has("Expires") ||
    searchParams.has("Key-Pair-Id") ||
    searchParams.has("Policy") ||
    Array.from(searchParams.keys()).some((k) => k.toLowerCase().includes("signature"))
  );
}

export function stripSignedQuery(url: string) {
  try {
    const parsed = new URL(url);
    if (!hasSignedQuery(parsed.searchParams)) return url;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

export function isReplicateUrl(url: string) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.includes("replicate.delivery") || h.includes("replicate.com");
  } catch {
    return false;
  }
}

export function safeIsHttpUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

export function isHttpUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

export function extractFirstHttpUrl(text: string) {
  const m = text.match(/https?:\/\/[^\s)]+/i);
  return m ? m[0] : null;
}

export function aspectRatioToNumber(ratio: string) {
  const [w, h] = ratio.split(":").map((n) => Number(n) || 0);
  if (!h || !w) return 1;
  return w / h;
}

export function pickNearestAspectOption(ratio: number, options: AspectOption[]): AspectOption {
  if (!Number.isFinite(ratio) || ratio <= 0) return options[0];
  const normalizedRatio = ratio > 1 ? 1 / ratio : ratio;
  return options.reduce((closest, option) => {
    const candidate = aspectRatioToNumber(option.ratio);
    return Math.abs(candidate - normalizedRatio) < Math.abs(aspectRatioToNumber(closest.ratio) - normalizedRatio)
      ? option
      : closest;
  }, options[0]);
}

export async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

export function loadCustomStyles(): CustomStylePreset[] {
  try {
    const raw = window.localStorage.getItem(CUSTOM_STYLES_LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CustomStylePreset[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x) =>
        x &&
        typeof x.key === "string" &&
        typeof x.label === "string" &&
        typeof x.thumbDataUrl === "string"
    );
  } catch {
    return [];
  }
}

export function saveCustomStyles(styles: CustomStylePreset[]) {
  try {
    window.localStorage.setItem(CUSTOM_STYLES_LS_KEY, JSON.stringify(styles));
  } catch {
    // ignore
  }
}

// Background preload (makes style selection feel instant)
const __preloadCache = new Set<string>();

export function preloadImage(url: string) {
  const u = String(url || "").trim();
  if (!u || !isHttpUrl(u)) return;
  if (__preloadCache.has(u)) return;
  __preloadCache.add(u);

  const img = new Image();
  (img as any).decoding = "async";
  img.src = u;
}

export function scheduleIdle(cb: () => void, timeoutMs = 800) {
  if (typeof window === "undefined") return -1 as any;

  const ric = (window as any).requestIdleCallback;
  if (typeof ric === "function") return ric(cb, { timeout: timeoutMs });

  return window.setTimeout(cb, Math.min(800, timeoutMs));
}

export function cancelIdle(handle: any) {
  if (typeof window === "undefined") return;

  const cic = (window as any).cancelIdleCallback;
  if (typeof cic === "function") {
    try { cic(handle); } catch {}
    return;
  }
  try { window.clearTimeout(handle); } catch {}
}

export function swapAspectRatio(raw: string) {
  const s = String(raw || "").trim();
  if (!s) return s;

  const m = s.match(/^(\d+(?:\.\d+)?)\s*[:\/xX-]\s*(\d+(?:\.\d+)?)$/);
  if (!m) return s;

  const a = m[1];
  const b = m[2];
  if (a === b) return `${a}:${b}`;
  return `${b}:${a}`;
}

export function getFileExt(name: string) {
  const m = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/i);
  return m ? m[1] : "";
}

export function normalizeCompareUrl(u: any): string {
  if (typeof u !== "string") return "";
  return stripSignedQuery(u).trim();
}

export function normalizeNonExpiringUrl(url: string): string {
  return stripSignedQuery(url);
}

export function roundUpTo5(n: number): number {
  return Math.ceil(n / 5) * 5;
}
