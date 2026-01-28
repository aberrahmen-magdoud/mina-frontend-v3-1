// src/services.ts
// Consolidated client services and shared helpers for Mina frontend.

import { createClient } from "@supabase/supabase-js";

// =============================================================================
// Supabase client
// =============================================================================
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase env vars (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)");
}

const storage =
  typeof window !== "undefined" && typeof window.localStorage !== "undefined"
    ? window.localStorage
    : undefined;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
    storageKey: "mina.supabase.auth",
    storage,
  },
});

export async function getSupabaseJwt(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export async function withSupabaseAuthHeaders(
  base: Record<string, string> = {}
): Promise<Record<string, string>> {
  const jwt = await getSupabaseJwt();
  return jwt ? { ...base, Authorization: `Bearer ${jwt}` } : base;
}

// =============================================================================
// Admin config helpers
// =============================================================================
export type AdminConfig = {
  pricing?: {
    imageCost?: number;
    motionCost?: number;
  };
  ai?: {
    personality?: {
      thinking?: string[];
      filler?: string[];
    };
  };
  styles?: {
    movementKeywords?: string[];
    presets?: Array<{
      id: string;
      name: string;
      status: "published" | "draft" | string;
      heroImage?: string;
      images: string[];
    }>;
  };
};

const ADMIN_LS_KEY = "minaAdminConfig";

export const DEFAULT_ADMIN_CONFIG: AdminConfig = {
  pricing: { imageCost: 1, motionCost: 5 },
  ai: { personality: { thinking: [], filler: [] } },
  styles: { movementKeywords: ["fix_camera"], presets: [] },
};

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadAdminConfig(): AdminConfig {
  try {
    if (typeof window === "undefined") return DEFAULT_ADMIN_CONFIG;
    const raw = window.localStorage.getItem(ADMIN_LS_KEY);
    if (!raw) return DEFAULT_ADMIN_CONFIG;

    const parsed = safeJsonParse<AdminConfig>(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_ADMIN_CONFIG;

    return {
      ...DEFAULT_ADMIN_CONFIG,
      ...parsed,
      pricing: { ...DEFAULT_ADMIN_CONFIG.pricing, ...parsed.pricing },
      ai: {
        ...DEFAULT_ADMIN_CONFIG.ai,
        ...parsed.ai,
        personality: {
          ...DEFAULT_ADMIN_CONFIG.ai?.personality,
          ...parsed.ai?.personality,
        },
      },
      styles: { ...DEFAULT_ADMIN_CONFIG.styles, ...parsed.styles },
    };
  } catch {
    return DEFAULT_ADMIN_CONFIG;
  }
}

export function saveAdminConfig(next: AdminConfig) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ADMIN_LS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

const MEGA_CUSTOMERS = "mega_customers";
const COL_USER_ID = "mg_user_id";
const COL_EMAIL = "mg_email";
const COL_ADMIN_ALLOWLIST = "mg_admin_allowlist";

function normalizeAdminEmail(email?: string | null) {
  const e = (email || "").trim().toLowerCase();
  return e || "";
}

function truthy(v: unknown): boolean {
  if (v === true) return true;
  if (v === 1) return true;
  if (typeof v === "string" && v.toLowerCase().trim() === "true") return true;
  return false;
}

export async function isAdmin(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getUser();
    const user = data.user;

    const userId = (user?.id || "").trim();
    const email = normalizeAdminEmail(user?.email || "");

    if (!userId && !email) return false;

    let row: any | null = null;

    if (userId) {
      const { data: byId, error } = await supabase
        .from(MEGA_CUSTOMERS)
        .select("*")
        .eq(COL_USER_ID, userId)
        .limit(1)
        .maybeSingle();

      if (!error && byId) row = byId as any;
    }

    if (!row && email) {
      const { data: byEmail, error } = await supabase
        .from(MEGA_CUSTOMERS)
        .select("*")
        .eq(COL_EMAIL, email)
        .limit(1)
        .maybeSingle();

      if (!error && byEmail) row = byEmail as any;
    }

    if (!row) return false;
    if (truthy(row?.[COL_ADMIN_ALLOWLIST])) return true;

    return false;
  } catch {
    return false;
  }
}

// =============================================================================
// Error reporting
// =============================================================================
export type ClientErrorPayload = {
  emoji: "🖥️" | "⚠️" | string;
  code: string;
  message: string;
  stack?: string | null;
  url?: string;
  userAgent?: string;
  userId?: string;
  email?: string;
  extra?: any;
};

export function getErrorEndpoint(): string {
  const base = (import.meta.env.VITE_BACKEND_URL as string | undefined) || "";
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${normalizedBase}/api/log-error`;
}

export async function sendClientError(payload: ClientErrorPayload): Promise<void> {
  try {
    const endpoint = getErrorEndpoint();
    const body: ClientErrorPayload = {
      ...payload,
      url: payload.url ?? window.location.href,
      userAgent: payload.userAgent ?? navigator.userAgent,
    };

    if (!body.userId || !body.email) {
      try {
        const { data } = await supabase.auth.getSession();
        body.userId = body.userId ?? data.session?.user?.id ?? undefined;
        body.email = body.email ?? data.session?.user?.email ?? undefined;
      } catch {
        // ignore auth lookup issues
      }
    }

    await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {
      // ignore network errors
    });
  } catch {
    // swallow to avoid UX impact
  }
}

// =============================================================================
// Global error handlers
// =============================================================================
let handlersInstalled = false;

export function installGlobalErrorHandlers() {
  if (typeof window === "undefined" || handlersInstalled) return;

  handlersInstalled = true;

  window.addEventListener("error", (event) => {
    sendClientError({
      emoji: "🖥️",
      code: "FRONTEND_CRASH",
      message: event.message || "window.error",
      stack: (event as any)?.error?.stack || null,
      extra: {
        filename: (event as any).filename,
        lineno: (event as any).lineno,
        colno: (event as any).colno,
      },
    });
  });

  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent | any) => {
    const reason = event?.reason;
    sendClientError({
      emoji: "🖥️",
      code: "UNHANDLED_REJECTION",
      message: reason?.message || String(reason) || "unhandledrejection",
      stack: reason?.stack || null,
    });
  });
}

// =============================================================================
// Scene library
// =============================================================================
export type SceneLibraryItem = {
  id: string;
  title: string;
  url: string;
  keywords: string[];
};

export const FALLBACK_SCENE_LIBRARY_RAW =
  "1,Frosted glass vessel with amber liquid,https://assets.faltastudio.com/mma/still/12656216-f4ae-44a2-8416-e9b98875f024.png,editorial;frosted glass;glass sculpture;amber liquid;macro;still life;luxury;soft light;minimal;industry perfumery;industry luxury;background black;gradient|" +
  "2,Amouage perfume with red anthurium,https://assets.faltastudio.com/mma/still/88a1569d-0e9f-486e-b664-ac4d3cc8dce0.png,editorial;perfume;amouage;jubilation 40;anthurium;red flower;still life;luxury;warm light;muted tone;industry perfumery;industry beauty;background beige|" +
  "3,Ceramic bow cuff bracelet still life,https://assets.faltastudio.com/mma/still/53005a7d-7e05-41e5-9bab-bae2498a3af7.png,editorial;ceramic;bow;bracelet;cuff;jewelry;sculpture;still life;minimal;handmade;industry fashion;industry accessories;background blue|" +
  "4,Hermes leather mushroom pouch,https://assets.faltastudio.com/mma/still/6ba951cb-457f-4276-832f-b3f9e58e39ef.png,editorial;hermes;leather;pouch;zipper;accessories;luxury;product shot;industry fashion;industry luxury;background blue;dark gradient|" +
  "5,Influencer lifestyle bedroom iPhone photo,https://assets.faltastudio.com/mma/still/268f50ef-5633-4a08-b325-9d1c80d07d91.png,lifestyle;influencer;iphone photo;bedroom;woman;dog;home interior;natural light;ugc;social media;industry lifestyle;industry fashion;background beige|" +
  "6,Perfume bottle wrapped by green snake,https://assets.faltastudio.com/mma/still/22f2c4b7-60dd-4e9b-a622-6f3530d16af1.png,editorial;perfume;fragrance;snake;green snake;still life;glass bottle;dark luxury;surreal;industry perfumery;industry beauty;background red|" +
  "7,Red loafers with eggplants and glazed donut,https://assets.faltastudio.com/mma/still/da8e364c-950c-47fb-87ea-9ffe191c8699.png,fashion;still life;shoes;loafers;red shoes;eggplant;aubergine;donut;food styling;editorial;industry fashion;industry luxury;background beige|" +
  "8,Bather soothing body cleanser tube,https://assets.faltastudio.com/mma/still/dedf0568-e47b-4beb-a2b9-53b76667db98.png,editorial;body cleanser;skincare;cosmetics;tube;black packaging;minimal;product shot;still life;luxury;soft light;studio lighting;industry beauty;industry skincare;background navy blue;blue;gradient;background beige;cream|" +
  "9,Editorial portrait with gold jewelry,https://assets.faltastudio.com/mma/still/22d25022-90b5-4584-8b20-76d1af650691.png,editorial;portrait;beauty;fashion;model;woman;slick hair;blonde;gold jewelry;earrings;necklace;chain;charms;luxury;soft light;muted tones;close-up;studio portrait;industry fashion;industry jewelry;industry beauty;background olive green;background green;gradient";

function sceneClean(value: any) {
  let t = String(value ?? "").trim();
  while (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

function sceneTryJson(raw: string) {
  const s = sceneClean(raw);
  if (!s) return null;
  if (!(s.startsWith("[") || s.startsWith("{"))) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export function parseSceneLibraryEnv(raw: any): SceneLibraryItem[] {
  const input = sceneClean(raw);
  if (!input) return [];

  const j = sceneTryJson(input);
  if (Array.isArray(j)) {
    return j
      .map((x: any) => ({
        id: sceneClean(x?.id ?? x?.ID),
        title: sceneClean(x?.title ?? x?.name),
        url: sceneClean(x?.url ?? x?.imageUrl),
        keywords: Array.isArray(x?.keywords)
          ? x.keywords.map(sceneClean).filter(Boolean)
          : sceneClean(x?.keywords)
              .split(/[;,\s]+/)
              .map(sceneClean)
              .filter(Boolean),
      }))
      .filter((x) => x.id && x.title && x.url);
  }

  const rows = input.split("|").map((r) => sceneClean(r)).filter(Boolean);
  const out: SceneLibraryItem[] = [];

  for (const row of rows) {
    const parts = row.split(",").map((p) => sceneClean(p)).filter((p) => p !== "");
    if (parts.length < 3) continue;

    const id = parts[0];
    const urlIdx = parts.findIndex((p) => /^https?:\/\//i.test(p));
    if (urlIdx === -1) continue;

    const title = parts.slice(1, urlIdx).join(",").trim();
    const url = parts[urlIdx];

    const kwRaw = parts.slice(urlIdx + 1).join(",").trim();
    const keywords = kwRaw ? kwRaw.split(";").map(sceneClean).filter(Boolean) : [];

    if (!id || !title || !url) continue;
    out.push({ id, title, url, keywords });
  }

  return out;
}

export function getSceneLibraryRawFromViteEnv(): string {
  const raw = (import.meta as any)?.env?.VITE_SCENE_LIBRARY_JSON;
  const cleaned = sceneClean(raw);
  return cleaned ? cleaned : FALLBACK_SCENE_LIBRARY_RAW;
}

// =============================================================================
// MMA error helpers
// =============================================================================
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
  sensitiveFlagged: "That request was flagged as sensitive. Please change your input and try again.",
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

function safeStr(value: any, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  const s = String(value).trim();
  return s ? s : fallback;
}

function lower(value: any): string {
  return safeStr(value).toLowerCase();
}

export function extractMmaErrorTextFromResult(result: any): string {
  if (!result) return "";

  const direct =
    result?.error ??
    result?.mg_error ??
    result?.mma_vars?.error ??
    result?.mmaVars?.error ??
    result?.mma_vars?.mg_error ??
    result?.mmaVars?.mg_error;

  if (direct && typeof direct === "object") {
    const code = safeStr(direct.code || direct.error || direct.name, "");
    const msg = safeStr(direct.message || direct.detail || direct.reason, "");

    const p = direct.provider || direct?.meta?.provider || null;
    const pErr =
      safeStr(p?.error, "") ||
      safeStr(p?.detail, "") ||
      safeStr(p?.message, "") ||
      safeStr(p?.logs, "");

    const best = pErr || msg;

    if (code && best) return `${code}: ${best}`;
    return code || best || "";
  }

  if (typeof direct === "string") return direct.trim();

  const st = lower(result?.status || result?.mg_status || result?.mg_mma_status);
  if (st.includes("error") || st.includes("failed")) return "PIPELINE_ERROR";

  return "";
}

export function isTimeoutLikeStatus(status: string): boolean {
  const s = (status || "").toLowerCase();
  return s.includes("timeout");
}

export function humanizeMmaError(err: MmaErrorLike): string {
  const extracted = err && typeof err === "object" ? extractMmaErrorTextFromResult(err) : "";
  const raw =
    typeof err === "string"
      ? err
      : safeStr(
          extracted ||
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

  if (s.includes("e005") || s.includes("flagged as sensitive")) {
    return UI_ERROR_MESSAGES.sensitiveFlagged;
  }

  if (s.includes("insufficient_credits")) return "I need more matchas to do that.";

  if (s.includes("failed to fetch") || s.includes("networkerror") || s.includes("fetch")) {
    return "Connection issue. Please retry.";
  }

  if (s.includes("timeout") || s.includes("still generating") || s.includes("in background")) {
    return "It’s still generating in the background — open Profile and refresh in a minute.";
  }

  if (
    s.includes("no complete upper body") ||
    (s.includes("upper body") && (s.includes("detected") || s.includes("ensure")))
  ) {
    return "This animation needs a clear photo of a person (upper body visible). Try a different image.";
  }

  if (s.includes("image recognition failed")) {
    return "That image can’t be animated with this setting. Try a clearer image or a different one.";
  }

  if (s.includes("image size is too large") || (s.includes("image") && s.includes("too large"))) {
    return "That image is too large. Try a smaller image.";
  }

  if (s.includes("code 1201") || (s.includes("duration") && s.includes("must not exceed 10 seconds"))) {
    return "That reference clip is too long. Use a 10s (or shorter) video.";
  }

  if (
    s.includes("video_no_url") ||
    s.includes("mma_no_url") ||
    s.includes("pipeline_error") ||
    s.includes("no_output_url") ||
    s.includes("no output url")
  ) {
    return "Niche mode is in high demand. Please use Main mode.";
  }

  return raw;
}

// =============================================================================
// Download helper
// =============================================================================
export type MinaDownloadKind = "still" | "motion";

type DownloadOpts = {
  url: string;
  kind: MinaDownloadKind;
  prompt?: string;
  baseNameOverride?: string;
};

const normalizeBase = (raw?: string | null) => {
  if (!raw) return "";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
};

const API_BASE_URL = (() => {
  const envBase = normalizeBase(
    (import.meta as any).env?.VITE_MINA_API_BASE_URL ||
      (import.meta as any).env?.VITE_API_BASE_URL ||
      (import.meta as any).env?.VITE_BACKEND_URL
  );
  return envBase || "";
})();

function safeString(value: any, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  const s = String(value);
  return s === "undefined" || s === "null" ? fallback : s;
}

function sanitizeFilename(name: string) {
  return name
    .replace(/[\/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function slugFromPrompt(prompt: string) {
  const p = (prompt || "").trim();
  if (!p) return "";
  return p
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function extFromUrl(url: string) {
  try {
    const u = new URL(url);
    const p = u.pathname.toLowerCase();
    const m = p.match(/\.([a-z0-9]{2,5})$/i);
    return m ? `.${m[1]}` : "";
  } catch {
    const p = String(url || "").split("?")[0].split("#")[0].toLowerCase();
    const m = p.match(/\.([a-z0-9]{2,5})$/i);
    return m ? `.${m[1]}` : "";
  }
}

function extFromContentType(ct: string, fallback: string) {
  const c = (ct || "").toLowerCase();
  if (c.includes("video/mp4")) return ".mp4";
  if (c.includes("video/webm")) return ".webm";
  if (c.includes("video/quicktime")) return ".mov";
  if (c.includes("image/jpeg")) return ".jpg";
  if (c.includes("image/png")) return ".png";
  if (c.includes("image/webp")) return ".webp";
  if (c.includes("image/gif")) return ".gif";
  return fallback;
}

function forceDownloadBlob(blob: Blob, filename: string) {
  const name = sanitizeFilename(filename || "Mina_export");

  // @ts-ignore
  if (typeof (window as any).navigator?.msSaveOrOpenBlob === "function") {
    // @ts-ignore
    (window as any).navigator.msSaveOrOpenBlob(blob, name);
    return;
  }

  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();

  window.setTimeout(() => {
    try {
      URL.revokeObjectURL(blobUrl);
    } catch {
      // ignore
    }
  }, 1500);
}

async function fetchAsBlob(url: string): Promise<{ blob: Blob; contentType: string }> {
  const res = await fetch(url, {
    method: "GET",
    mode: "cors",
    credentials: "omit",
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Download fetch failed (${res.status})`);
  }

  const contentType = res.headers.get("content-type") || "";
  const blob = await res.blob();
  return { blob, contentType };
}

function buildName(opts: DownloadOpts, extGuess: string) {
  const base =
    safeString(opts.baseNameOverride, "") ||
    (opts.kind === "motion" ? "Mina_video" : "Mina_image");

  const slug = slugFromPrompt(safeString(opts.prompt, ""));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  const core = slug ? `${base}_${slug}_${stamp}` : `${base}_${stamp}`;
  const ext = extGuess || (opts.kind === "motion" ? ".mp4" : ".jpg");

  return core.endsWith(ext) ? core : `${core}${ext}`;
}

export async function downloadMinaAsset(opts: DownloadOpts): Promise<void> {
  const url = String(opts?.url || "").trim();
  if (!url) throw new Error("Missing url");

  try {
    const urlExt = extFromUrl(url) || (opts.kind === "motion" ? ".mp4" : ".jpg");
    const { blob, contentType } = await fetchAsBlob(url);
    const ext = extFromContentType(contentType, urlExt);
    forceDownloadBlob(blob, buildName(opts, ext));
    return;
  } catch (e1) {
    if (API_BASE_URL) {
      try {
        const proxy = `${API_BASE_URL}/public/download?url=${encodeURIComponent(url)}`;
        const urlExt = extFromUrl(url) || (opts.kind === "motion" ? ".mp4" : ".jpg");
        const { blob, contentType } = await fetchAsBlob(proxy);
        const ext = extFromContentType(contentType, urlExt);
        forceDownloadBlob(blob, buildName(opts, ext));
        return;
      } catch {
        throw e1 instanceof Error ? e1 : new Error("Download failed");
      }
    }

    throw e1 instanceof Error ? e1 : new Error("Download failed");
  }
}
