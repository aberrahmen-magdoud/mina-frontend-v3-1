// src/lib/minaApi.ts
// ============================================================================
// API helpers: MMA result parsing, URL picking, idempotency, SSE streaming
// ============================================================================

import type { MmaCreateResponse, MmaGenerationResponse, MmaStreamState } from "./minaTypes";
import { API_BASE_URL } from "./minaConstants";
import { isHttpUrl, stripSignedQuery } from "./minaHelpers";
import {
  extractMmaErrorTextFromResult,
  isTimeoutLikeStatus,
  UI_ERROR_MESSAGES,
} from "../lib/mmaErrors";

// ============================================================================
// Deep URL picker (extracts best image/video URL from nested MMA response)
// ============================================================================
export function deepPickHttpUrl(root: any, opts?: { preferVideo?: boolean }): string {
  const preferVideo = !!opts?.preferVideo;
  const isHttp = (s: any) => typeof s === "string" && /^https?:\/\//i.test(s.trim());
  const clean = (s: string) => s.trim();

  const seen = new Set<any>();
  let bestUrl = "";
  let bestScore = -1;

  const scoreUrl = (url: string, keyHint = "") => {
    const u = url.toLowerCase();
    const k = keyHint.toLowerCase();
    let score = 0;

    const isVid = /\.(mp4|webm|mov|m4v)(\?|#|$)/.test(u);
    const isImg = /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/.test(u);

    if (preferVideo) {
      if (isVid) score += 80;
      if (k.includes("video") || k.includes("kling")) score += 40;
      if (isImg) score -= 20;
    } else {
      if (isImg) score += 80;
      if (k.includes("image") || k.includes("seedream") || k.includes("nanobanana")) score += 40;
      if (isVid) score -= 20;
    }

    if (k.includes("output")) score += 10;
    if (k.includes("url")) score += 10;
    if (u.includes("assets.faltastudio.com")) score += 25;

    return score;
  };

  const visit = (node: any, depth: number, keyHint = "") => {
    if (depth > 10 || node == null) return;

    if (isHttp(node)) {
      const url = clean(node);
      const sc = scoreUrl(url, keyHint);
      if (sc > bestScore) {
        bestScore = sc;
        bestUrl = url;
      }
      return;
    }

    if (typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1, keyHint);
      return;
    }

    const keys = Object.keys(node);

    const keyPriority = preferVideo
      ? ["video_url", "kling", "video", "mp4", "outputs", "output", "url", "result", "provider_outputs"]
      : ["image_url", "seedream", "nanobanana", "image", "png", "jpg", "jpeg", "webp", "outputs", "output", "url", "result", "provider_outputs"];

    keys.sort((a, b) => {
      const ai = keyPriority.findIndex((p) => a.toLowerCase().includes(p));
      const bi = keyPriority.findIndex((p) => b.toLowerCase().includes(p));
      const ax = ai === -1 ? 999 : ai;
      const bx = bi === -1 ? 999 : bi;
      if (ax !== bx) return ax - bx;
      return a.localeCompare(b);
    });

    for (const k of keys) visit((node as any)[k], depth + 1, k);
  };

  visit(root, 0, "");
  return bestUrl;
}

// ============================================================================
// Input-asset URL set (prevents confusing input URLs with outputs)
// ============================================================================
function normalizeCompareUrl(u: any): string {
  if (typeof u !== "string") return "";
  return stripSignedQuery(u).trim();
}

function isHttp(u: any): u is string {
  return typeof u === "string" && /^https?:\/\//i.test(u.trim());
}

export function collectInputAssetUrlSet(mmaVars: any): Set<string> {
  const set = new Set<string>();
  const add = (v: any) => {
    const s = normalizeCompareUrl(v);
    if (s && isHttp(s)) set.add(s);
  };
  const addArr = (arr: any) => {
    if (!Array.isArray(arr)) return;
    for (const v of arr) add(v);
  };

  const assets = mmaVars?.assets || mmaVars?.asset || {};
  const inputs = mmaVars?.inputs || {};

  add(assets.product_image_url);
  add(assets.logo_image_url);
  addArr(assets.inspiration_image_urls);
  add(assets.start_image_url);
  add(assets.end_image_url);
  addArr(assets.kling_image_urls);
  add(assets.productImageUrl);
  add(assets.logoImageUrl);
  addArr(assets.inspirationImageUrls);
  addArr(assets.style_image_urls);
  addArr(assets.styleImageUrls);
  add(assets.startImageUrl);
  add(assets.endImageUrl);

  add(inputs.product_image_url);
  add(inputs.logo_image_url);
  addArr(inputs.inspiration_image_urls);
  add(inputs.start_image_url);
  add(inputs.end_image_url);
  addArr(inputs.kling_image_urls);
  addArr(inputs.style_image_urls);
  addArr(inputs.styleImageUrls);

  return set;
}

function pickFirstHttpNotInput(candidates: any[], inputSet: Set<string>): string {
  for (const c of candidates) {
    const s = normalizeCompareUrl(c);
    if (!s || !isHttp(s)) continue;
    if (inputSet.has(s)) continue;
    return s;
  }
  return "";
}

export function pickMmaImageUrl(resp: any): string {
  const inputSet = collectInputAssetUrlSet(resp?.mma_vars);
  const candidates = [
    resp?.outputs?.nanobanana_image_url,
    resp?.outputs?.seedream_image_url,
    resp?.outputs?.image_url,
    resp?.imageUrl,
    resp?.outputUrl,
    resp?.mg_output_url,
    deepPickHttpUrl(resp?.outputs, { preferVideo: false }),
  ];
  return pickFirstHttpNotInput(candidates, inputSet);
}

export function pickMmaVideoUrl(resp: any): string {
  const inputSet = collectInputAssetUrlSet(resp?.mma_vars);
  const candidates = [
    resp?.outputs?.kling_video_url,
    resp?.outputs?.video_url,
    resp?.videoUrl,
    resp?.outputUrl,
    resp?.mg_output_url,
    deepPickHttpUrl(resp?.outputs, { preferVideo: true }),
  ];
  return pickFirstHttpNotInput(candidates, inputSet);
}

// ============================================================================
// Idempotency key helpers
// ============================================================================
export function makeIdempotencyKey(prefix = "mma") {
  try {
    // @ts-ignore
    const u = crypto?.randomUUID?.();
    if (u) return `${prefix}_${u}`;
  } catch {}
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}_${Math.random()
    .toString(16)
    .slice(2)}`;
}

export function attachIdempotencyKey(payload: any, idem: string) {
  const body =
    payload && typeof payload === "object" && !Array.isArray(payload) ? { ...payload } : { payload };
  body.idempotency_key = idem;
  if (body.inputs && typeof body.inputs === "object" && !Array.isArray(body.inputs)) {
    body.inputs = { ...body.inputs, idempotency_key: idem };
  } else {
    body.inputs = { idempotency_key: idem };
  }
  return body;
}

export function buildMmaActionKey(createPath: string, body: any) {
  const b = body || {};
  const inputs = b.inputs || {};
  const intent = String(b.intent || inputs.intent || inputs.action || "").toLowerCase();
  const isSuggest =
    !!b.suggest_only ||
    !!b.suggestOnly ||
    !!inputs.suggest_only ||
    !!inputs.suggestOnly ||
    !!inputs.prompt_only ||
    !!inputs.promptOnly ||
    !!inputs.text_only ||
    !!inputs.textOnly ||
    intent.includes("suggest") ||
    intent.includes("type_for_me");
  return `${createPath}:${isSuggest ? "suggest" : "run"}:${intent}`.toLowerCase();
}

// ============================================================================
// MMA Fetch Result (polling helper)
// ============================================================================
export async function mmaFetchResult(
  generationId: string,
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>
): Promise<MmaGenerationResponse> {
  const id = encodeURIComponent(String(generationId || ""));
  const res = await apiFetch(`/mma/generations/${id}`);

  if (!res.ok) {
    return { generation_id: String(generationId), status: "queued" } as any;
  }

  const json = (await res.json().catch(() => ({}))) as any;

  const mmaVarsRaw = json?.mma_vars ?? json?.mg_mma_vars ?? json?.vars ?? undefined;
  let mmaVars: any = mmaVarsRaw;
  if (typeof mmaVarsRaw === "string") {
    try { mmaVars = JSON.parse(mmaVarsRaw); } catch { mmaVars = undefined; }
  }

  const status =
    json?.status ??
    json?.status_text ??
    json?.statusText ??
    json?.mg_mma_status ??
    json?.mg_mma_status_text ??
    json?.mma_status ??
    json?.state ??
    mmaVars?.status ??
    mmaVars?.status_text ??
    mmaVars?.statusText ??
    "queued";

  const mode = (json?.mode ?? json?.mg_mma_mode ?? mmaVars?.mode ?? "").toString();

  const outputs =
    json?.outputs ??
    mmaVars?.outputs ??
    mmaVars?.provider_outputs ??
    mmaVars?.result?.outputs ??
    undefined;

  const prompt = json?.prompt ?? json?.mg_prompt ?? mmaVars?.prompt ?? null;
  const error = json?.error ?? json?.mg_error ?? mmaVars?.error ?? undefined;

  const outputUrl =
    json?.outputUrl ??
    json?.mg_output_url ??
    (mode.toLowerCase().includes("video")
      ? pickMmaVideoUrl({ outputs, mma_vars: mmaVars, ...json })
      : pickMmaImageUrl({ outputs, mma_vars: mmaVars, ...json })) ??
    "";

  return {
    generation_id: String(json?.generation_id ?? json?.mg_generation_id ?? generationId),
    status: String(status),
    mode: mode || undefined,
    mma_vars: mmaVars,
    outputs,
    prompt,
    error,
    credits: json?.credits ?? json?.billing ?? undefined,
    ...(outputUrl ? { outputUrl } : {}),
  } as any;
}

// ============================================================================
// MMA Wait for Final (poll until terminal status)
// ============================================================================
export async function mmaWaitForFinal(
  generationId: string,
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>,
  opts?: { timeoutMs?: number; intervalMs?: number },
  onTick?: (snapshot: any) => void
): Promise<MmaGenerationResponse> {
  const timeoutMs = Math.max(5_000, Number(opts?.timeoutMs ?? 1_200_000));
  const intervalMs = Math.max(400, Number(opts?.intervalMs ?? 900));

  const started = Date.now();
  let last: MmaGenerationResponse = { generation_id: generationId, status: "queued" } as any;

  const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

  const MAX_NET_RETRIES = 6;          // up to ~18s of connectivity loss
  let consecutiveNetErrors = 0;

  while (Date.now() - started < timeoutMs) {
    let fetchOk = false;
    try {
      last = await mmaFetchResult(generationId, apiFetch);
      fetchOk = true;
      consecutiveNetErrors = 0;
    } catch (netErr: any) {
      // Network error (laptop sleep/wake, WiFi drop) — retry instead of failing
      consecutiveNetErrors++;
      if (consecutiveNetErrors > MAX_NET_RETRIES) throw netErr;
      await sleep(3000);
      continue;
    }
    if (!fetchOk) { await sleep(intervalMs); continue; }
    try { onTick?.(last); } catch {}

    const earlyErr = extractMmaErrorTextFromResult(last);
    if (earlyErr) return last;

    const st = String(last?.status || "").toLowerCase().trim();

    const isTerminalError =
      st === "error" || st === "failed" || st === "cancelled" || st === "canceled";
    if (isTerminalError) return last;

    const isTerminalSuccess =
      st === "done" || st === "succeeded" || st === "success" || st === "completed" || st === "suggested";

    const hasMedia = !!pickMmaImageUrl(last) || !!pickMmaVideoUrl(last);
    if (hasMedia) return last;

    if (isTerminalSuccess) {
      await sleep(intervalMs);
      continue;
    }

    await sleep(intervalMs);
  }

  return last;
}

// ============================================================================
// R2 URL picker helper
// ============================================================================
export function pickUrlFromR2Response(json: any): string | null {
  if (!json) return null;
  const candidates: any[] = [
    json.publicUrl, json.public_url, json.url, json.public,
    json.result?.publicUrl, json.result?.public_url, json.result?.url,
    json.data?.publicUrl, json.data?.public_url, json.data?.url,
    json.signedUrl, json.signed_url,
    json.result?.signedUrl, json.data?.signedUrl,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.startsWith("http")) return c;
  }
  return null;
}

// ============================================================================
// extractExpiresAt helper
// ============================================================================
export function extractExpiresAt(obj: any): string | null {
  const v =
    obj?.expiresAt ??
    obj?.expirationDate ??
    obj?.expiry ??
    obj?.expiration ??
    obj?.meta?.expiresAt ??
    obj?.meta?.expirationDate ??
    obj?.meta?.expiry ??
    obj?.meta?.expiration ??
    null;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
