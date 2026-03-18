// src/handlers/minaDataFlow.ts
// Credits, history, session, health, fingertips, likes handlers.
// Extracted from MinaApp.tsx for module size.

import type {
  HealthState, CreditsState, GenerationRecord, FeedbackRecord,
  HistoryResponse, StillItem, UploadPanelKey, MmaStreamState,
} from "../lib/minaTypes";
import {
  isHttpUrl, stripSignedQuery, padEditorialNumber,
} from "../lib/minaHelpers";
import { isAssetsUrl, isVideoUrl } from "../lib/mediaHelpers";
import { extractExpiresAt } from "../lib/minaApi";
import { supabase } from "../lib/supabaseClient";
import { FT_ERROR_PHRASES, HISTORY_PAGE_LIMIT } from "../lib/minaConstants";

// Local type aliases (avoid React import for standalone TS files)
type SetState<T> = (value: T | ((prev: T) => T)) => void;
type MutableRef<T> = { current: T };

function isReplicateUrl(url: string): boolean {
  return /^https?:\/\/(replicate\.delivery|pbxt\.replicate\.com)\b/i.test(url);
}

type ApiFetchFn = (path: string, init?: RequestInit) => Promise<Response>;

// ────────────────────────────────────────────────────────────────────
// getSupabaseAccessToken
// ────────────────────────────────────────────────────────────────────
export async function getSupabaseAccessToken(accessTokenFromAuth: string | null): Promise<string | null> {
  if (accessTokenFromAuth) return accessTokenFromAuth;
  try { const { data } = await supabase.auth.getSession(); return data.session?.access_token || null; } catch { return null; }
}

// ────────────────────────────────────────────────────────────────────
// Health check
// ────────────────────────────────────────────────────────────────────
export async function handleCheckHealth(
  apiFetch: ApiFetchFn,
  setCheckingHealth: (b: boolean) => void,
  setHealth: (h: HealthState) => void,
) {
  try {
    setCheckingHealth(true);
    const res = await apiFetch("/health");
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
    setHealth({ ok: json.ok ?? false, message: json.message ?? "" });
  } catch (err: any) {
    setHealth({ ok: false, message: err?.message || "Unable to reach Mina." });
  } finally {
    setCheckingHealth(false);
  }
}

// ────────────────────────────────────────────────────────────────────
// Credits
// ────────────────────────────────────────────────────────────────────
export interface CreditsDeps {
  apiFetch: ApiFetchFn;
  currentPassId: string;
  credits: CreditsState | null;
  adminConfig: any;
  creditsCacheRef: MutableRef<Record<string, CreditsState>>;
  creditsCacheAtRef: MutableRef<Record<string, number>>;
  creditsDirtyRef: MutableRef<boolean>;
  setCredits: SetState<CreditsState | null>;
  setCreditsLoading: SetState<boolean>;
  setSessionMatchasSpent: SetState<number>;
}

export async function fetchCredits(deps: CreditsDeps) {
  if (!deps.currentPassId) return;
  try {
    const cached = deps.creditsCacheRef.current[deps.currentPassId];
    const cachedAt = deps.creditsCacheAtRef.current[deps.currentPassId] || 0;
    const isStale = Date.now() - cachedAt > 30_000;
    if (!deps.creditsDirtyRef.current && cached && !isStale) { deps.setCredits(cached); return; }

    deps.setCreditsLoading(true);
    const params = new URLSearchParams({ passId: deps.currentPassId });
    const res = await deps.apiFetch(`/credits/balance?${params.toString()}`);
    if (!res.ok) return;
    const json = (await res.json().catch(() => ({}))) as any;
    const expiresAt = extractExpiresAt(json);

    const cachedBalance = cached?.balance ?? deps.credits?.balance;
    let balance = cachedBalance;
    const rawBalance = json?.credits ?? json?.balance ?? json?.data?.credits ?? json?.data?.balance ?? null;
    if (rawBalance !== null && rawBalance !== undefined) { const parsed = Number(rawBalance); if (Number.isFinite(parsed)) balance = parsed; }
    if (balance === undefined || balance === null) balance = cachedBalance ?? 0;

    const nextCredits: CreditsState = {
      balance,
      meta: {
        imageCost: Number(json?.meta?.imageCost ?? deps.credits?.meta?.imageCost ?? deps.adminConfig.pricing?.imageCost ?? 1),
        motionCost: Number(json?.meta?.motionCost ?? deps.credits?.meta?.motionCost ?? deps.adminConfig.pricing?.motionCost ?? 10),
        expiresAt,
      },
    };
    deps.creditsCacheRef.current[deps.currentPassId] = nextCredits;
    deps.creditsCacheAtRef.current[deps.currentPassId] = Date.now();
    deps.creditsDirtyRef.current = false;
    deps.setCredits(nextCredits);
  } catch { /* silent */ } finally { deps.setCreditsLoading(false); }
}

export function applyCreditsFromResponse(deps: CreditsDeps, resp?: { balance: any; cost?: any }) {
  if (!resp) return;
  const parsed = Number(resp.balance);
  const prevBalance = deps.creditsCacheRef.current[deps.currentPassId || ""]?.balance ?? deps.credits?.balance;

  const costFromResp = Number(resp.cost);
  if (Number.isFinite(costFromResp) && costFromResp > 0) deps.setSessionMatchasSpent((prev) => prev + costFromResp);
  else if (Number.isFinite(parsed) && typeof prevBalance === "number" && Number.isFinite(prevBalance) && prevBalance > parsed)
    deps.setSessionMatchasSpent((prev) => prev + (prevBalance - parsed));

  const looksValid = Number.isFinite(parsed) && parsed >= 0;
  const suspiciousZero = looksValid && parsed === 0 && typeof prevBalance === "number" && Number.isFinite(prevBalance) && prevBalance > 0;
  if (!looksValid || suspiciousZero) { deps.creditsDirtyRef.current = true; void fetchCredits(deps); return; }

  deps.setCredits((prev) => ({ balance: parsed, meta: prev?.meta }));
  if (deps.currentPassId) {
    deps.creditsCacheRef.current[deps.currentPassId] = { balance: parsed, meta: deps.creditsCacheRef.current[deps.currentPassId]?.meta };
    deps.creditsCacheAtRef.current[deps.currentPassId] = Date.now();
    deps.creditsDirtyRef.current = false;
  }
}

// ────────────────────────────────────────────────────────────────────
// Session
// ────────────────────────────────────────────────────────────────────
export async function ensureSession(
  apiFetch: ApiFetchFn,
  currentPassId: string,
  sessionId: string | null,
  sessionTitle: string,
  currentAspectPlatformKey: string,
  setSessionId: (id: string) => void,
): Promise<string | null> {
  if (sessionId) return sessionId;
  if (!currentPassId) return null;
  try {
    const res = await apiFetch("/sessions/start", {
      method: "POST",
      body: JSON.stringify({ passId: currentPassId, platform: currentAspectPlatformKey, title: sessionTitle, meta: { timezone: "Asia/Dubai" } }),
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => ({}))) as any;
    const sid = json?.sessionId || json?.session_id || json?.session?.id || json?.session?.sessionId || null;
    if (sid) { setSessionId(String(sid)); return String(sid); }
  } catch { /* ignore */ }
  return null;
}

// ────────────────────────────────────────────────────────────────────
// History
// ────────────────────────────────────────────────────────────────────
export interface HistoryDeps {
  apiFetch: ApiFetchFn;
  currentPassId: string;
  adminConfig: any;
  storeRemoteToR2: (url: string, kind: string) => Promise<string>;
  historyCacheRef: MutableRef<Record<string, { generations: GenerationRecord[]; feedbacks: FeedbackRecord[]; page?: any }>>;
  historyDirtyRef: MutableRef<boolean>;
  setHistoryGenerations: SetState<GenerationRecord[]>;
  setHistoryFeedbacks: SetState<FeedbackRecord[]>;
  setHistoryLoading: SetState<boolean>;
  setHistoryLoadingMore: SetState<boolean>;
  setHistoryError: SetState<string | null>;
  setHistoryNextCursor: SetState<string | null>;
  setHistoryHasMore: SetState<boolean>;
  setCredits: SetState<CreditsState | null>;
  historyGenerations: GenerationRecord[];
  historyFeedbacks: FeedbackRecord[];
  historyLoading: boolean;
  historyLoadingMore: boolean;
  historyHasMore: boolean;
  historyNextCursor: string | null;
}

async function fetchHistoryForPass(apiFetch: ApiFetchFn, pid: string, opts?: { limit?: number; cursor?: string | null }): Promise<HistoryResponse> {
  const qs = new URLSearchParams();
  qs.set("limit", String(opts?.limit ?? HISTORY_PAGE_LIMIT));
  if (opts?.cursor) qs.set("cursor", String(opts.cursor));
  const res = await apiFetch(`/history/pass/${encodeURIComponent(pid)}?${qs.toString()}`);
  if (!res.ok) throw new Error(`Status ${res.status}`);
  const json = (await res.json().catch(() => ({}))) as HistoryResponse;
  if (!json.ok) throw new Error("History error");
  return json;
}

async function normalizeHistoryGeneration(g: GenerationRecord, storeRemoteToR2: (url: string, kind: string) => Promise<string>): Promise<GenerationRecord> {
  const original = String(g.outputUrl || "").trim();
  if (!original) return g;
  const stable = stripSignedQuery(original);
  if (isReplicateUrl(original) || isReplicateUrl(stable)) {
    try {
      const kind = isVideoUrl(original) ? "motions" : "generations";
      const r2 = await storeRemoteToR2(original, kind);
      const r2Stable = stripSignedQuery(r2);
      if (r2Stable && isAssetsUrl(r2Stable)) return { ...g, outputUrl: r2Stable };
      if (r2 && isAssetsUrl(r2)) return { ...g, outputUrl: r2 };
      return { ...g, outputUrl: "" };
    } catch { return { ...g, outputUrl: "" }; }
  }
  return stable && stable !== original ? { ...g, outputUrl: stable } : g;
}

function mergeAppendUniqueById<T extends { id: string }>(prev: T[], next: T[]) {
  const seen = new Set(prev.map((x) => x.id));
  return [...prev, ...(next || []).filter((x) => x?.id && !seen.has(x.id))];
}

export async function fetchHistory(deps: HistoryDeps) {
  if (!deps.currentPassId) return;
  try {
    if (!deps.historyDirtyRef.current && deps.historyCacheRef.current[deps.currentPassId]) {
      const cached = deps.historyCacheRef.current[deps.currentPassId];
      deps.setHistoryGenerations(cached.generations);
      deps.setHistoryFeedbacks(cached.feedbacks);
      deps.setHistoryNextCursor(cached.page?.nextCursor ?? null);
      deps.setHistoryHasMore(!!cached.page?.hasMore);
      return;
    }
    deps.setHistoryLoading(true);
    deps.setHistoryError(null);

    const history = await fetchHistoryForPass(deps.apiFetch, deps.currentPassId, { limit: HISTORY_PAGE_LIMIT, cursor: null });
    if (history?.credits) {
      deps.setCredits((prev) => ({
        balance: history.credits.balance,
        meta: { imageCost: prev?.meta?.imageCost ?? deps.adminConfig.pricing?.imageCost ?? 1, motionCost: prev?.meta?.motionCost ?? deps.adminConfig.pricing?.motionCost ?? 10, expiresAt: history.credits.expiresAt ?? prev?.meta?.expiresAt ?? null },
      }));
    }

    const gens = history?.generations || [];
    const feedbacks = history?.feedbacks || [];
    const nextCursor = history?.page?.nextCursor ?? null;
    const hasMore = !!history?.page?.hasMore;

    const quick = gens.map((g: GenerationRecord) => { const u = String(g.outputUrl || "").trim(); if (!u) return g; const s = stripSignedQuery(u); return s !== u ? { ...g, outputUrl: s } : g; });
    deps.setHistoryGenerations(quick);
    deps.setHistoryFeedbacks(feedbacks);
    deps.setHistoryNextCursor(nextCursor);
    deps.setHistoryHasMore(hasMore);
    deps.setHistoryLoading(false);

    const updated = await Promise.all(gens.map((g: GenerationRecord) => normalizeHistoryGeneration(g, deps.storeRemoteToR2)));
    deps.historyCacheRef.current[deps.currentPassId] = { generations: updated, feedbacks, page: { nextCursor, hasMore, limit: HISTORY_PAGE_LIMIT } };
    deps.historyDirtyRef.current = false;
    deps.setHistoryGenerations(updated);
  } catch (err: any) { deps.setHistoryError(err?.message || "Unable to load history."); } finally { deps.setHistoryLoading(false); }
}

export async function fetchHistoryMore(deps: HistoryDeps) {
  if (!deps.currentPassId || deps.historyLoading || deps.historyLoadingMore || !deps.historyHasMore || !deps.historyNextCursor) return;
  try {
    deps.setHistoryLoadingMore(true);
    const history = await fetchHistoryForPass(deps.apiFetch, deps.currentPassId, { limit: HISTORY_PAGE_LIMIT, cursor: deps.historyNextCursor });
    const gens = await Promise.all((history?.generations || []).map((g: GenerationRecord) => normalizeHistoryGeneration(g, deps.storeRemoteToR2)));
    const feedbacks = history?.feedbacks || [];
    const mergedGens = mergeAppendUniqueById(deps.historyGenerations, gens);
    const mergedFeedbacks = mergeAppendUniqueById(deps.historyFeedbacks, feedbacks);
    const nextCursor = history?.page?.nextCursor ?? null;
    const hasMore = !!history?.page?.hasMore;
    deps.setHistoryGenerations(mergedGens);
    deps.setHistoryFeedbacks(mergedFeedbacks);
    deps.setHistoryNextCursor(nextCursor);
    deps.setHistoryHasMore(hasMore);
    deps.historyCacheRef.current[deps.currentPassId] = { generations: mergedGens, feedbacks: mergedFeedbacks, page: { nextCursor, hasMore, limit: HISTORY_PAGE_LIMIT } };
    deps.historyDirtyRef.current = false;
  } catch (err: any) { deps.setHistoryError(err?.message || "Unable to load more history."); } finally { deps.setHistoryLoadingMore(false); }
}

// ────────────────────────────────────────────────────────────────────
// Fingertips
// ────────────────────────────────────────────────────────────────────
export interface FingertipsDeps {
  apiFetch: ApiFetchFn;
  currentPassId: string;
  ensureAssetsUrl: (url: string, kind: "generations" | "motions") => Promise<string>;
  fetchCredits: () => void;
  showMinaError: (err: any) => void;
  dismissMinaNotice: () => void;
  setMinaOverrideText: (t: string | null) => void;
  setMinaTalking: (b: boolean) => void;
  setMinaTone: (t: "thinking" | "error" | "info") => void;
  setFingertipsSending: SetState<boolean>;
  setFingertipsActiveModel: SetState<string | null>;
  setStillGenerating: SetState<boolean>;
  setStillItems: SetState<StillItem[]>;
  setStillIndex: SetState<number>;
  setActiveMediaKind: SetState<"still" | "motion" | null>;
  historyDirtyRef: MutableRef<boolean>;
  creditsDirtyRef: MutableRef<boolean>;
}

export async function handleFingertipsGenerate(
  deps: FingertipsDeps,
  args: { modelKey: string; inputs: Record<string, any> },
) {
  if (!deps.currentPassId) return null;
  deps.setFingertipsSending(true);
  deps.setFingertipsActiveModel(args.modelKey);
  deps.setStillGenerating(true);
  deps.setMinaTone("thinking");

  try {
    const res = await deps.apiFetch("/fingertips/generate", {
      method: "POST",
      body: JSON.stringify({ modelKey: args.modelKey, inputs: args.inputs, passId: deps.currentPassId }),
    });
    const json = await res.json();
    if (!res.ok) {
      const serverMsg = json?.details?.userMessage || json?.message || json?.error || "";
      const friendly = FT_ERROR_PHRASES[Math.floor(Math.random() * FT_ERROR_PHRASES.length)];
      deps.showMinaError({ message: serverMsg || friendly });
      return { generation_id: "", status: "error", error: serverMsg || friendly } as any;
    }

    const rawOut = json?.output;
    const outputUrl = json?.output_url
      || (typeof rawOut === "string" ? rawOut : null)
      || (Array.isArray(rawOut) && typeof rawOut[0] === "string" ? rawOut[0] : null)
      || (rawOut && typeof rawOut === "object" && typeof rawOut.url === "string" ? rawOut.url : null)
      || (rawOut && typeof rawOut === "object" && typeof rawOut.image === "string" ? rawOut.image : null)
      || null;
    if (outputUrl && typeof outputUrl === "string") {
      const finalUrl = await deps.ensureAssetsUrl(outputUrl, "generations");
      if (finalUrl) {
        const newItem = { id: json.generation_id || crypto.randomUUID(), url: finalUrl, createdAt: new Date().toISOString(), prompt: `fingertips:${args.modelKey}` };
        deps.setStillItems((prev: any) => { const next = [newItem, ...prev]; deps.setStillIndex(0); return next; });
        deps.setActiveMediaKind("still");
      }
    }

    deps.setMinaOverrideText(null);
    deps.dismissMinaNotice();
    deps.creditsDirtyRef.current = true;
    deps.historyDirtyRef.current = true;
    deps.fetchCredits();
    return json;
  } catch (err: any) {
    const friendly = FT_ERROR_PHRASES[Math.floor(Math.random() * FT_ERROR_PHRASES.length)];
    deps.showMinaError({ message: friendly });
    return { generation_id: "", status: "error", error: friendly } as any;
  } finally {
    deps.setFingertipsSending(false);
    deps.setFingertipsActiveModel(null);
    deps.setStillGenerating(false);
    deps.setMinaOverrideText(null);
    deps.setMinaTalking(false);
  }
}

// ────────────────────────────────────────────────────────────────────
// Likes
// ────────────────────────────────────────────────────────────────────
export function getCurrentMediaKey(
  activeMediaKind: "still" | "motion" | null,
  currentStill: { id?: string; url?: string } | null,
  currentMotion: { id?: string; url?: string } | null,
) {
  const norm = (url: string) => stripSignedQuery(String(url || "").trim());
  const kind = activeMediaKind === "motion" ? "motion" : "still";
  const item = kind === "motion" ? currentMotion : currentStill;
  const url = item?.url ? norm(item.url) : "";
  const id = item?.id || "";
  if (url) return `${kind}:url:${url}`;
  if (id) return `${kind}:id:${id}`;
  return "";
}

export async function handleLikeCurrent(
  apiFetch: ApiFetchFn,
  currentPassId: string,
  activeMediaKind: "still" | "motion" | null,
  currentStill: any,
  currentMotion: any,
  likedMap: Record<string, boolean>,
  setLikedMap: SetState<Record<string, boolean>>,
  setLikeSubmitting: SetState<boolean>,
  lastStillPrompt: string,
  stillBrief: string,
  brief: string,
) {
  const isMotion = activeMediaKind === "motion" && !!currentMotion?.url;
  const target = isMotion ? currentMotion : currentStill;
  if (!target || !currentPassId) return;

  const likeKey = getCurrentMediaKey(activeMediaKind, currentStill, currentMotion);
  const nextLiked = likeKey ? !likedMap[likeKey] : false;
  if (likeKey) setLikedMap((prev) => ({ ...prev, [likeKey]: nextLiked }));
  if (!nextLiked) return;

  try {
    setLikeSubmitting(true);
    await apiFetch("/mma/events", {
      method: "POST",
      body: JSON.stringify({
        passId: currentPassId, generation_id: target.id || null, event_type: "like",
        payload: { result_type: isMotion ? "motion" : "image", url: target.url, prompt: isMotion ? (currentMotion?.prompt || "") : (currentStill?.prompt || lastStillPrompt || stillBrief || brief || "") },
      }),
    });
  } catch { /* non-blocking */ } finally { setLikeSubmitting(false); }
}
