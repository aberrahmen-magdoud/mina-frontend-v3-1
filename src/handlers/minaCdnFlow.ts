// src/handlers/minaCdnFlow.ts
// CDN image optimization, R2 ensureAssetsUrl, MMA SSE infrastructure.
// Extracted from MinaApp.tsx for module size.

import { isHttpUrl, stripSignedQuery, normalizeNonExpiringUrl } from "../lib/minaHelpers";
import { isAssetsUrl, isVideoUrl, probeMediaUrl } from "../lib/mediaHelpers";
import { pickUrlFromR2Response, buildMmaActionKey, attachIdempotencyKey, makeIdempotencyKey } from "../lib/minaApi";
import { API_BASE_URL } from "../lib/minaConstants";

// Local type aliases
type SetState<T> = (value: T | ((prev: T) => T)) => void;
type MutableRef<T> = { current: T };
function isReplicateUrl(url: string): boolean { return /^https?:\/\/(replicate\.delivery|pbxt\.replicate\.com)\b/i.test(url); }
import type { UploadPanelKey, MmaStreamState, MmaCreateResponse } from "../lib/minaTypes";

type ApiFetchFn = (path: string, init?: RequestInit) => Promise<Response>;

// ────────────────────────────────────────────────────────────────────
// CDN resize URL builders
// ────────────────────────────────────────────────────────────────────
export function buildCdnResizedUrl(rawUrl: string, kind: UploadPanelKey, animateMode: boolean): string {
  const clean = stripSignedQuery(String(rawUrl || "").trim());
  if (!clean || !isHttpUrl(clean) || !isAssetsUrl(clean)) return clean || "";
  try {
    const u = new URL(clean);
    if (u.pathname.startsWith("/cdn-cgi/image/")) return u.toString();
    const format = kind === "logo" ? "png" : "jpeg";
    const targetWidth = animateMode && kind === "product" ? 2160 : 1080;
    const opts = `width=${targetWidth},fit=scale-down,quality=90,format=${format}`;
    return `${u.origin}/cdn-cgi/image/${opts}${u.pathname}${u.search}`;
  } catch { return clean; }
}

export function buildCdnMotionFrame1Url(rawUrl: string, sendWidth = 2048): string {
  const clean = stripSignedQuery(String(rawUrl || "").trim());
  if (!clean || !isHttpUrl(clean) || !isAssetsUrl(clean)) return clean || "";
  try {
    const u = new URL(clean);
    if (u.pathname.startsWith("/cdn-cgi/image/")) return u.toString();
    const opts = `width=${sendWidth},fit=scale-down,quality=90,format=jpeg`;
    return `${u.origin}/cdn-cgi/image/${opts}${u.pathname}${u.search}`;
  } catch { return clean; }
}

// ────────────────────────────────────────────────────────────────────
// CDN optimizer (stateful – uses caches + one-shot probe)
// ────────────────────────────────────────────────────────────────────
export function createCdnOptimizer(animateMode: boolean) {
  const inputOptCache = new Map<string, string>();
  const motionFrame1OptCache = new Map<string, string>();
  let cdnResizeOk: boolean | null = null;

  async function ensureOptimizedInputUrl(rawUrl: string, kind: UploadPanelKey): Promise<string> {
    const clean = stripSignedQuery(String(rawUrl || "").trim());
    if (!clean || !isHttpUrl(clean)) return "";
    const cached = inputOptCache.get(clean);
    if (cached) return cached;
    if (!isAssetsUrl(clean)) { inputOptCache.set(clean, clean); return clean; }
    const optimized = buildCdnResizedUrl(clean, kind, animateMode);
    if (!optimized || optimized === clean) { inputOptCache.set(clean, clean); return clean; }
    if (cdnResizeOk === true) { inputOptCache.set(clean, optimized); return optimized; }
    if (cdnResizeOk === false) { inputOptCache.set(clean, clean); return clean; }
    const ok = await probeMediaUrl(optimized, "image", 3500);
    cdnResizeOk = ok;
    const finalUrl = ok ? optimized : clean;
    inputOptCache.set(clean, finalUrl);
    return finalUrl;
  }

  async function ensureMotionFrame1SpecUrl(rawUrl: string): Promise<string> {
    const clean = stripSignedQuery(String(rawUrl || "").trim());
    if (!clean || !isHttpUrl(clean)) return "";
    const cached = motionFrame1OptCache.get(clean);
    if (cached) return cached;
    if (!isAssetsUrl(clean)) { motionFrame1OptCache.set(clean, clean); return clean; }
    const optimized = buildCdnMotionFrame1Url(clean);
    if (!optimized || optimized === clean) { motionFrame1OptCache.set(clean, clean); return clean; }
    const ok = await probeMediaUrl(optimized, "image", 3500);
    const finalUrl = ok ? optimized : clean;
    motionFrame1OptCache.set(clean, finalUrl);
    return finalUrl;
  }

  return { ensureOptimizedInputUrl, ensureMotionFrame1SpecUrl };
}

// ────────────────────────────────────────────────────────────────────
// R2 store-remote + ensureAssetsUrl (component-level, uses apiFetch)
// ────────────────────────────────────────────────────────────────────
export async function storeRemoteToR2(apiFetch: ApiFetchFn, currentPassId: string, url: string, kind: string): Promise<string> {
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

export async function ensureAssetsUrl(apiFetch: ApiFetchFn, currentPassId: string, url: string, kind: "generations" | "motions"): Promise<string> {
  const raw = String(url || "").trim();
  if (!raw) return "";
  const displayStable = stripSignedQuery(raw);
  if (displayStable && isAssetsUrl(displayStable)) return displayStable;
  const isRep = isReplicateUrl(raw) || isReplicateUrl(displayStable);
  try {
    const stored = await storeRemoteToR2(apiFetch, currentPassId, raw, kind);
    const storedStable = stripSignedQuery(stored);
    if (storedStable && isAssetsUrl(storedStable)) return storedStable;
    if (stored && isAssetsUrl(stored)) return stored;
  } catch {}
  if (isRep) return "";
  return displayStable || raw;
}

// ────────────────────────────────────────────────────────────────────
// MMA SSE create-and-wait
// ────────────────────────────────────────────────────────────────────
export function createMmaRunner(
  apiFetch: ApiFetchFn,
  apiBaseUrl: string,
  mmaInFlightRef: MutableRef<Map<string, Promise<{ generationId: string }>>>,
  mmaIdemKeyRef: MutableRef<Map<string, string>>,
  mmaStreamRef: MutableRef<EventSource | null>,
  mmaAbortAllRef: MutableRef<boolean>,
) {
  function getIdemForRun(actionKey: string) {
    const existing = mmaIdemKeyRef.current.get(actionKey);
    if (existing) return existing;
    const key = makeIdempotencyKey(actionKey.replace(/[^a-z0-9:_-]/gi, "").slice(0, 40) || "mma");
    mmaIdemKeyRef.current.set(actionKey, key);
    return key;
  }

  function mmaCreateAndWait(createPath: string, body: any, onProgress?: (s: MmaStreamState) => void): Promise<{ generationId: string }> {
    const actionKey = buildMmaActionKey(createPath, body);
    if (mmaAbortAllRef.current) return Promise.reject(new Error("Stopped."));
    const existing = mmaInFlightRef.current.get(actionKey);
    if (existing) return existing;

    const run = (async () => {
      if (mmaAbortAllRef.current) throw new Error("Stopped.");
      const idem = getIdemForRun(actionKey);
      const bodyWithIdem = attachIdempotencyKey(body || {}, idem);

      const res = await apiFetch(createPath, { method: "POST", body: JSON.stringify(bodyWithIdem) });
      if (!res.ok) { const errJson = await res.json().catch(() => null); throw new Error(errJson?.message || `MMA create failed (${res.status})`); }

      const created = (await res.json().catch(() => ({}))) as Partial<MmaCreateResponse> & any;
      const generationId = created.generation_id || created.generationId || created.id || null;
      if (!generationId) throw new Error("MMA create returned no generation id.");

      const relSse = created.sse_url || created.sseUrl || `/mma/stream/${encodeURIComponent(String(generationId))}`;
      const sseUrl = /^https?:\/\//i.test(String(relSse)) ? String(relSse) : `${apiBaseUrl}${String(relSse)}`;

      const scanLines: string[] = [];
      let status = created.status || "queued";
      try { onProgress?.({ status, scanLines: [...scanLines] }); } catch {}
      try { mmaStreamRef.current?.close(); } catch {}
      mmaStreamRef.current = null;

      const es = new EventSource(sseUrl);
      mmaStreamRef.current = es;

      await new Promise<void>((resolve) => {
        let finished = false;
        const isFinalStatus = (s: any) => ["done", "error", "failed", "succeeded", "success", "completed", "cancelled", "canceled", "suggested"].includes(String(s || "").toLowerCase().trim());
        const cleanup = () => { try { es.close(); } catch {} if (mmaStreamRef.current === es) mmaStreamRef.current = null; };
        const finish = () => { if (finished) return; finished = true; window.clearTimeout(hardTimeout); cleanup(); resolve(); };
        const hardTimeout = window.setTimeout(finish, 1_200_000);

        es.onmessage = (ev: MessageEvent) => {
          try {
            const raw = (ev as any)?.data;
            if (typeof raw === "string" && raw.trim() && raw.trim()[0] !== "{" && raw.trim()[0] !== "[") {
              status = raw.trim(); onProgress?.({ status, scanLines: [...scanLines] }); if (isFinalStatus(status)) finish(); return;
            }
            const data = JSON.parse(raw || "{}");
            const nextStatus = data.status || data.status_text || data.statusText || data.text || data.message || null;
            if (typeof nextStatus === "string" && nextStatus.trim()) status = nextStatus.trim();
            const incoming = (Array.isArray(data.scanLines) && data.scanLines) || (Array.isArray(data.scan_lines) && data.scan_lines) || [];
            if (incoming.length) { scanLines.length = 0; incoming.forEach((x: any) => { const t = typeof x === "string" ? x : x?.text; if (t) scanLines.push(String(t)); }); }
            onProgress?.({ status, scanLines: [...scanLines] }); if (isFinalStatus(status)) finish();
          } catch {}
        };
        es.addEventListener("status", (ev: any) => { try { const data = JSON.parse(ev.data || "{}"); const next = data.status || data.status_text || data.statusText || data.text || null; if (typeof next === "string" && next.trim()) status = next.trim(); onProgress?.({ status, scanLines: [...scanLines] }); if (isFinalStatus(status)) finish(); } catch {} });
        es.addEventListener("scan_line", (ev: any) => { try { const data = JSON.parse(ev.data || "{}"); const text = String(data.text || data.message || data.line || ""); if (text) scanLines.push(text); onProgress?.({ status, scanLines: [...scanLines] }); } catch {} });
        es.addEventListener("done", finish);
        es.onerror = () => { window.setTimeout(finish, 900); };
      });

      return { generationId: String(generationId) };
    })();

    mmaInFlightRef.current.set(actionKey, run);
    run.finally(() => { const cur = mmaInFlightRef.current.get(actionKey); if (cur === run) mmaInFlightRef.current.delete(actionKey); mmaIdemKeyRef.current.delete(actionKey); });
    return run;
  }

  return mmaCreateAndWait;
}

// ────────────────────────────────────────────────────────────────────
// stopAllMmaUiNow
// ────────────────────────────────────────────────────────────────────
export function createStopAllMma(
  mmaAbortAllRef: MutableRef<boolean>,
  mmaStreamRef: MutableRef<EventSource | null>,
  mmaInFlightRef: MutableRef<Map<string, any>>,
  mmaIdemKeyRef: MutableRef<Map<string, string>>,
  setStillGenerating: (b: boolean) => void,
  setMotionGenerating: (b: boolean) => void,
  setFeedbackSending: (b: boolean) => void,
) {
  return function stopAllMmaUiNow() {
    mmaAbortAllRef.current = true;
    try { mmaStreamRef.current?.close(); } catch {} mmaStreamRef.current = null;
    try { mmaInFlightRef.current.clear(); } catch {}
    try { mmaIdemKeyRef.current.clear(); } catch {}
    setStillGenerating(false);
    setMotionGenerating(false);
    setFeedbackSending(false);
    window.setTimeout(() => { mmaAbortAllRef.current = false; }, 300);
  };
}
