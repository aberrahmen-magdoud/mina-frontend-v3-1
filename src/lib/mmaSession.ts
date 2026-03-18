// src/lib/mmaSession.ts
// MMA SSE streaming, create + wait, idempotency, R2 upload, storeRemote

import type { MmaCreateResponse, MmaStreamState } from "./minaTypes";
import { isHttpUrl, normalizeNonExpiringUrl } from "./minaHelpers";
import { isVideoUrl } from "./mediaHelpers";
import { buildMmaActionKey, attachIdempotencyKey, makeIdempotencyKey, pickUrlFromR2Response } from "./minaApi";

export type ApiFetchFn = (path: string, init?: RequestInit) => Promise<Response>;

// ─── Idempotency helpers ───────────────────────────────────────────────

export function createIdempotencyManager() {
  const inFlight = new Map<string, Promise<{ generationId: string }>>();
  const idemKeys = new Map<string, string>();

  function getIdemForRun(actionKey: string) {
    const existing = idemKeys.get(actionKey);
    if (existing) return existing;
    const key = makeIdempotencyKey(actionKey.replace(/[^a-z0-9:_-]/gi, "").slice(0, 40) || "mma");
    idemKeys.set(actionKey, key);
    return key;
  }

  return { inFlight, idemKeys, getIdemForRun };
}

// ─── MMA create + SSE wait ─────────────────────────────────────────────

export function createMmaRunner(
  apiBaseUrl: string,
  apiFetch: ApiFetchFn,
  idem: ReturnType<typeof createIdempotencyManager>,
  streamRef: { current: EventSource | null },
  abortRef: { current: boolean }
) {
  function mmaCreateAndWait(
    createPath: string,
    body: any,
    onProgress?: (s: MmaStreamState) => void
  ): Promise<{ generationId: string }> {
    const actionKey = buildMmaActionKey(createPath, body);

    if (abortRef.current) return Promise.reject(new Error("Stopped."));

    const existing = idem.inFlight.get(actionKey);
    if (existing) return existing;

    const run = (async () => {
      if (abortRef.current) throw new Error("Stopped.");
      const idemKey = idem.getIdemForRun(actionKey);
      const bodyWithIdem = attachIdempotencyKey(body || {}, idemKey);

      const res = await apiFetch(createPath, { method: "POST", body: JSON.stringify(bodyWithIdem) });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.message || `MMA create failed (${res.status})`);
      }

      const created = (await res.json().catch(() => ({}))) as Partial<MmaCreateResponse> & any;
      const generationId = created.generation_id || created.generationId || created.id || null;
      if (!generationId) throw new Error("MMA create returned no generation id.");

      const relSse = created.sse_url || created.sseUrl || `/mma/stream/${encodeURIComponent(String(generationId))}`;
      const sseUrl = /^https?:\/\//i.test(String(relSse))
        ? String(relSse)
        : `${apiBaseUrl}${String(relSse)}`;

      const scanLines: string[] = [];
      let status = created.status || "queued";
      try { onProgress?.({ status, scanLines: [...scanLines] }); } catch {}

      try { streamRef.current?.close(); } catch {}
      streamRef.current = null;

      const es = new EventSource(sseUrl);
      streamRef.current = es;

      await new Promise<void>((resolve) => {
        let finished = false;

        const isFinalStatus = (s: any) => {
          const st = String(s || "").toLowerCase().trim();
          return ["done", "error", "failed", "succeeded", "success", "completed", "cancelled", "canceled", "suggested"].includes(st);
        };

        const cleanup = () => { try { es.close(); } catch {} if (streamRef.current === es) streamRef.current = null; };

        const finish = () => {
          if (finished) return;
          finished = true;
          window.clearTimeout(hardTimeout);
          cleanup();
          resolve();
        };

        const hardTimeout = window.setTimeout(finish, 1_200_000);

        es.onmessage = (ev: MessageEvent) => {
          try {
            const raw = (ev as any)?.data;
            if (typeof raw === "string" && raw.trim() && raw.trim()[0] !== "{" && raw.trim()[0] !== "[") {
              status = raw.trim();
              onProgress?.({ status, scanLines: [...scanLines] });
              if (isFinalStatus(status)) finish();
              return;
            }

            const data = JSON.parse(raw || "{}");
            const nextStatus = data.status || data.status_text || data.statusText || data.text || data.message || null;
            if (typeof nextStatus === "string" && nextStatus.trim()) status = nextStatus.trim();

            const incoming = (Array.isArray(data.scanLines) && data.scanLines) || (Array.isArray(data.scan_lines) && data.scan_lines) || [];
            if (incoming.length) {
              scanLines.length = 0;
              incoming.forEach((x: any) => { const t = typeof x === "string" ? x : x?.text; if (t) scanLines.push(String(t)); });
            }

            onProgress?.({ status, scanLines: [...scanLines] });
            if (isFinalStatus(status)) finish();
          } catch {}
        };

        es.addEventListener("status", (ev: any) => {
          try {
            const data = JSON.parse(ev.data || "{}");
            const next = data.status || data.status_text || data.statusText || data.text || null;
            if (typeof next === "string" && next.trim()) status = next.trim();
            onProgress?.({ status, scanLines: [...scanLines] });
            if (isFinalStatus(status)) finish();
          } catch {}
        });

        es.addEventListener("scan_line", (ev: any) => {
          try {
            const data = JSON.parse(ev.data || "{}");
            const text = String(data.text || data.message || data.line || "");
            if (text) scanLines.push(text);
            onProgress?.({ status, scanLines: [...scanLines] });
          } catch {}
        });

        es.addEventListener("done", finish);
        es.onerror = () => { window.setTimeout(finish, 900); };
      });

      return { generationId: String(generationId) };
    })();

    idem.inFlight.set(actionKey, run);
    run.finally(() => {
      const cur = idem.inFlight.get(actionKey);
      if (cur === run) idem.inFlight.delete(actionKey);
      idem.idemKeys.delete(actionKey);
    });
    return run;
  }

  return mmaCreateAndWait;
}

// ─── R2 upload helpers ─────────────────────────────────────────────────

export async function uploadFileToR2(
  apiFetch: ApiFetchFn,
  currentPassId: string,
  panel: string,
  file: File
): Promise<string> {
  const contentType = file.type || "application/octet-stream";
  const fileName = file.name || `upload_${Date.now()}`;

  const res = await apiFetch("/api/r2/upload-signed", {
    method: "POST",
    body: JSON.stringify({ contentType, fileName, folder: "user_uploads", kind: panel, passId: currentPassId }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) {
    throw new Error(json?.message || json?.error || `Upload-signed failed (${res.status})`);
  }

  const uploadUrl = json.uploadUrl || json.upload_url || json.signedUrl || json.signed_url || json.url || null;
  const publicUrl = pickUrlFromR2Response(json);

  if (!uploadUrl || !publicUrl) throw new Error("Upload-signed response missing uploadUrl/publicUrl");

  const putRes = await fetch(String(uploadUrl), { method: "PUT", headers: { "Content-Type": contentType }, body: file });
  if (!putRes.ok) throw new Error(`R2 PUT failed (${putRes.status})`);

  const stable = normalizeNonExpiringUrl(String(publicUrl));
  if (!stable.startsWith("http")) throw new Error("Upload returned invalid publicUrl");
  return stable;
}

export async function storeRemoteToR2(
  apiFetch: ApiFetchFn,
  currentPassId: string,
  url: string,
  kind: string
): Promise<string> {
  const res = await apiFetch("/api/r2/store-remote", {
    method: "POST",
    body: JSON.stringify({ url, kind, passId: currentPassId }),
  });
  const json = await res.json().catch(() => ({}));
  const publicUrl = pickUrlFromR2Response(json);
  if (!publicUrl) throw new Error("store-remote returned no URL");
  return normalizeNonExpiringUrl(publicUrl);
}

export async function ensureAssetsUrl(
  apiFetch: ApiFetchFn,
  currentPassId: string,
  url: string,
  kind: "generations" | "motions"
): Promise<string> {
  const raw = String(url || "").trim();
  if (!raw || !isHttpUrl(raw)) return "";

  const clean = normalizeNonExpiringUrl(raw);

  if (/assets\.faltastudio\.com/i.test(clean) && !clean.includes("/cdn-cgi/image/")) return clean;

  if (isVideoUrl(raw)) {
    try { return await storeRemoteToR2(apiFetch, currentPassId, raw, kind); } catch { return clean; }
  }

  try { return await storeRemoteToR2(apiFetch, currentPassId, raw, kind); } catch { return clean; }
}
