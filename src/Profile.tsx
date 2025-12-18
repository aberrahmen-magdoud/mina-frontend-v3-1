// =============================================================
// FILE: src/Profile.tsx
// Mina — Profile (Archive)
// - Mina-style header (logo left, Back to Studio right, Logout far right)
// - Meta row (pass + email + stats)
// - Archive grid, "infinite" reveal (10/page, client-side)
// - Click item => download (no new tab)
// - Prompt line + tiny "view more"
// - Date + Delete with confirm
// - Filters (motion/type / creation/platform / liked / recent / session) => non-matching dim to 10%
// =============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import "./Profile.css";

const PAGE_SIZE = 10;

type GenerationRecord = {
  id: string;
  type?: string | null;
  sessionId?: string | null;
  passId?: string | null;
  platform?: string | null;
  prompt?: string | null;
  outputUrl?: string | null;
  createdAt?: string | null;
  meta?: Record<string, unknown> | null;
};

type FeedbackRecord = {
  id: string;
  passId?: string | null;
  resultType?: string | null;
  platform?: string | null;
  prompt?: string | null;
  comment?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  createdAt?: string | null;
};

type HistoryResponse = {
  ok: boolean;
  passId: string;
  credits?: { balance: number; expiresAt?: string | null };
  generations?: GenerationRecord[];
  feedbacks?: FeedbackRecord[];
};

type ProfileProps = {
  passId: string | null | undefined;
  apiBaseUrl: string;
  onBackToStudio?: () => void;
};

function pick(obj: any, keys: string[], fallback: any = ""): any {
  if (!obj) return fallback;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return fallback;
}

function toBool(v: unknown): boolean {
  if (v === true || v === false) return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (!s) return false;
    if (["true", "1", "yes", "y", "t"].includes(s)) return true;
    if (["false", "0", "no", "n", "f"].includes(s)) return false;
    return Boolean(s);
  }
  return Boolean(v);
}

function formatDate(iso?: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
  } catch {
    return String(iso);
  }
}

function extFromUrl(url?: string | null): string {
  if (!url) return "";
  const clean = url.split("?")[0].split("#")[0];
  const m = clean.match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : "";
}

function isVideoUrl(url?: string | null): boolean {
  const ext = extFromUrl(url);
  return ["mp4", "webm", "mov", "m4v"].includes(ext);
}

function safeFilename(base: string, url?: string | null): string {
  const ext = extFromUrl(url);
  const suffix = ext ? `.${ext}` : ".bin";
  return `${base}${suffix}`;
}

async function getSupabaseAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  } catch {
    return null;
  }
}

export default function Profile({ passId, apiBaseUrl, onBackToStudio }: ProfileProps) {
  const [email, setEmail] = useState<string>("");
  const [allItems, setAllItems] = useState<GenerationRecord[]>([]);
  const [feedbacks, setFeedbacks] = useState<FeedbackRecord[]>([]);

  const [isBootLoading, setIsBootLoading] = useState(true);
  const [error, setError] = useState("");

  // paging (client-side)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const hasMore = visibleCount < allItems.length;

  const [expandedPromptId, setExpandedPromptId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Filters
  const [filterMotion, setFilterMotion] = useState("all"); // all / still / motion
  const [filterCreation, setFilterCreation] = useState("all"); // platform
  const [filterLiked, setFilterLiked] = useState(false);
  const [filterRecent, setFilterRecent] = useState(false); // last 7 days
  const [filterSession, setFilterSession] = useState("all");

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Local liked map (from MinaApp)
  const likedMap = useMemo<Record<string, boolean>>(() => {
    try {
      const raw = window.localStorage.getItem("minaLikedMap");
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  }, []);

  const apiFetch = useCallback(
    async (path: string, init: RequestInit = {}) => {
      if (!apiBaseUrl) throw new Error("Missing API base URL");
      const headers = new Headers(init.headers || {});
      const token = await getSupabaseAccessToken();
      if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
      if (passId && !headers.has("X-Mina-Pass-Id")) headers.set("X-Mina-Pass-Id", passId);
      if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
      return fetch(`${apiBaseUrl}${path}`, { ...init, headers });
    },
    [apiBaseUrl, passId]
  );

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    // Let AuthGate handle redirect on reload
    window.location.reload();
  };

  const handleBackToStudio = () => {
    if (onBackToStudio) return onBackToStudio();
    window.location.href = "/studio";
  };

  const normalizeGen = useCallback((g: GenerationRecord): GenerationRecord => {
    // Normalize key casing (so our pick() works consistently)
    return {
      ...g,
      id: String(g.id),
      type: (g.type ?? null) as any,
      sessionId: (g.sessionId ?? null) as any,
      platform: (g.platform ?? null) as any,
      prompt: (g.prompt ?? null) as any,
      outputUrl: (g.outputUrl ?? null) as any,
      createdAt: (g.createdAt ?? null) as any,
      meta: (g.meta ?? null) as any,
    };
  }, []);

  // Boot: user email + history
  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();

    (async () => {
      setIsBootLoading(true);
      setError("");

      if (!passId || !String(passId).trim()) {
        setIsBootLoading(false);
        setError("Missing pass id. Please log in again.");
        return;
      }

      try {
        // email (optional)
        try {
          const { data } = await supabase.auth.getSession();
          const e = (data.session?.user?.email || "").trim();
          if (!cancelled) setEmail(e);
        } catch {
          // ignore
        }

        const res = await apiFetch(`/history/pass/${encodeURIComponent(passId)}`, {
          method: "GET",
          signal: ac.signal,
        });

        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(`History failed (${res.status})${txt ? `: ${txt.slice(0, 220)}` : ""}`);
        }

        const json = (await res.json().catch(() => null)) as HistoryResponse | null;
        if (!json || json.ok !== true) throw new Error("History error (invalid response).");

        const gens = Array.isArray(json.generations) ? json.generations.map(normalizeGen) : [];
        const fbs = Array.isArray(json.feedbacks) ? json.feedbacks : [];

        // Sort newest first (defensive)
        gens.sort((a, b) => {
          const ta = new Date(a.createdAt || "").getTime() || 0;
          const tb = new Date(b.createdAt || "").getTime() || 0;
          return tb - ta;
        });

        if (!cancelled) {
          setAllItems(gens);
          setFeedbacks(fbs);
          setVisibleCount(PAGE_SIZE);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load profile.");
      } finally {
        if (!cancelled) setIsBootLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [apiFetch, normalizeGen, passId]);

  // Infinite reveal sentinel
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((c) => Math.min(allItems.length, c + PAGE_SIZE));
        }
      },
      { root: null, threshold: 0.1 }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [allItems.length]);

  const items = useMemo(() => allItems.slice(0, visibleCount), [allItems, visibleCount]);

  // Liked inference (server feedbacks + local liked map)
  const likedUrlSet = useMemo(() => {
    const set = new Set<string>();
    for (const f of feedbacks) {
      const comment = (f.comment || "").trim();
      // Mina uses /feedback/like with comment: "" to represent likes
      if (comment !== "") continue;
      const u = (f.imageUrl || f.videoUrl || "").trim();
      if (u) set.add(u);
    }
    return set;
  }, [feedbacks]);

  const isLiked = useCallback(
    (g: GenerationRecord) => {
      const url = (g.outputUrl || "").trim();
      const id = String(g.id || "");
      const kind = isVideoUrl(url) || String(g.type || "").toLowerCase().includes("motion") ? "motion" : "still";

      const candidates = [
        `${kind}:${id}`,
        `${kind}:${url}`,
        `motion:${id}`,
        `motion:${url}`,
        `still:${id}`,
        `still:${url}`,
      ];

      for (const k of candidates) {
        if (likedMap[k]) return true;
      }
      if (url && likedUrlSet.has(url)) return true;
      return false;
    },
    [likedMap, likedUrlSet]
  );

  const totalCount = allItems.length;
  const likedCount = useMemo(() => allItems.reduce((acc, g) => acc + (isLiked(g) ? 1 : 0), 0), [allItems, isLiked]);

  // Filter options
  const motionOptions = useMemo(() => ["all", "still", "motion"], []);

  const creationOptions = useMemo(() => {
    const set = new Set<string>();
    for (const it of allItems) {
      const p = String(pick(it, ["platform"], "") || "").trim();
      if (p) set.add(p);
    }
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [allItems]);

  const sessionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const it of allItems) {
      const s = String(pick(it, ["sessionId", "session_id", "session"], "") || "").trim();
      if (s) set.add(s);
    }
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [allItems]);

  const isMatch = useCallback(
    (it: GenerationRecord) => {
      const url = (it.outputUrl || "").trim();
      const kind = isVideoUrl(url) || String(it.type || "").toLowerCase().includes("motion") ? "motion" : "still";

      if (filterMotion !== "all" && kind !== filterMotion) return false;

      if (filterCreation !== "all") {
        const p = String(pick(it, ["platform"], "") || "").trim();
        if (p !== filterCreation) return false;
      }

      if (filterSession !== "all") {
        const s = String(pick(it, ["sessionId", "session_id", "session"], "") || "").trim();
        if (s !== filterSession) return false;
      }

      if (filterLiked && !isLiked(it)) return false;

      if (filterRecent) {
        const created = String(pick(it, ["createdAt", "created_at", "createdAt"], it.createdAt || "") || "");
        const dt = new Date(created).getTime();
        const now = Date.now();
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        if (!dt || Number.isNaN(dt) || now - dt > sevenDays) return false;
      }

      return true;
    },
    [filterCreation, filterLiked, filterMotion, filterRecent, filterSession, isLiked]
  );

  const downloadItem = useCallback(async (g: GenerationRecord, indexNumber: number) => {
    try {
      setError("");
      const url = (g.outputUrl || "").trim();
      if (!url) return;

      const base = `mina-${indexNumber}`;
      const filename = safeFilename(base, url);

      // no new tab: fetch -> blob -> a.download
      const res = await fetch(url, { credentials: "omit" });
      if (!res.ok) throw new Error(`Download failed (${res.status}).`);

      const blob = await res.blob();
      const href = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = href;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(href);
    } catch (e: any) {
      setError(e?.message || "Download failed.");
    }
  }, []);

  const tryDeleteRemote = useCallback(
    async (id: string) => {
      // 1) Try likely backend endpoints (best-effort)
      const candidates: Array<{ method: string; path: string }> = [
        { method: "DELETE", path: `/generations/${encodeURIComponent(id)}` },
        { method: "DELETE", path: `/history/generation/${encodeURIComponent(id)}` },
        { method: "POST", path: `/history/generation/${encodeURIComponent(id)}/delete` },
      ];

      for (const c of candidates) {
        try {
          const res = await apiFetch(c.path, { method: c.method });
          if (res.ok) return true;
          if (res.status === 404) continue;
        } catch {
          // ignore, try next
        }
      }

      // 2) Try Supabase tables (name drift)
      const tableCandidates = ["mega_generation", "mega_generations", "generations", "generation", "mega_generation_v2"];
      for (const t of tableCandidates) {
        try {
          const { error } = await supabase.from(t).delete().eq("id", id);
          if (!error) return true;

          const msg = String((error as any)?.message || "").toLowerCase();
          // table missing / not exposed => try next
          if (msg.includes("does not exist") || msg.includes("not found") || msg.includes("404")) continue;

          // other errors (RLS, etc) => stop
          return false;
        } catch {
          // try next
        }
      }

      return false;
    },
    [apiFetch]
  );

  const deleteItem = useCallback(
    async (g: GenerationRecord) => {
      const id = String(g.id || "").trim();
      if (!id) return;

      try {
        setError("");
        const ok = await tryDeleteRemote(id);
        if (!ok) throw new Error("Delete is not configured on the server yet.");

        setAllItems((prev) => prev.filter((x) => String(x.id) !== id));
        setConfirmDeleteId(null);
      } catch (e: any) {
        setError(e?.message || "Delete failed.");
      }
    },
    [tryDeleteRemote]
  );

  const cardVariantClass = useCallback((i: number) => {
    if (i % 19 === 0) return "profile-card--hero";
    if (i % 11 === 0) return "profile-card--tall";
    if (i % 7 === 0) return "profile-card--wide";
    return "profile-card--mini";
  }, []);

  const metaPairs = useMemo(() => {
    const out: Array<{ k: string; v: string }> = [];
    if (passId) out.push({ k: "Pass", v: passId });
    if (email) out.push({ k: "Email", v: email });
    out.push({ k: "Creations", v: String(totalCount) });
    out.push({ k: "Liked", v: String(likedCount) });

    const sessions = new Set<string>();
    for (const it of allItems) {
      const s = String(pick(it, ["sessionId"], "") || "").trim();
      if (s) sessions.add(s);
    }
    if (sessions.size) out.push({ k: "Sessions", v: String(sessions.size) });

    return out;
  }, [allItems, email, likedCount, passId, totalCount]);

  return (
    <div className="profile-shell">
      <div className="profile-topbar">
        <a
          className="profile-logo-link"
          href="/studio"
          onClick={(e) => {
            e.preventDefault();
            handleBackToStudio();
          }}
        >
          <img className="profile-logo" src="/mina-logo.svg" alt="Mina" />
        </a>

        <div className="profile-topbar-right">
          <button type="button" className="studio-header-cta" onClick={handleBackToStudio}>
            Back to Studio
          </button>

          <button type="button" className="profile-logout" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div>

      <div className="profile-meta-strip">
        {metaPairs.map((p) => (
          <div key={`${p.k}-${p.v}`} className="profile-kv">
            <span className="profile-k">{p.k}</span>
            <span className="profile-v">{p.v}</span>
          </div>
        ))}
      </div>

      <div className="profile-archive-head">
        <div className="profile-archive-left">
          <div className="profile-archive-title">Archive</div>
          <div className="profile-archive-sub">
            {items.length ? `${items.length}${hasMore ? "+" : ""} loaded` : "No creations yet."}
          </div>
        </div>

        <div className="profile-filters">
          {/* Motion (still/motion) */}
          <label className="profile-filter">
            <span className="profile-filter-label">Motion</span>
            <select className="profile-filter-select" value={filterMotion} onChange={(e) => setFilterMotion(e.target.value)}>
              {motionOptions.map((m) => (
                <option key={m} value={m}>
                  {m === "all" ? "All" : m === "still" ? "Still" : "Motion"}
                </option>
              ))}
            </select>
          </label>

          {/* Creation (platform) */}
          <label className="profile-filter">
            <span className="profile-filter-label">Creation</span>
            <select
              className="profile-filter-select"
              value={filterCreation}
              onChange={(e) => setFilterCreation(e.target.value)}
            >
              {creationOptions.map((c) => (
                <option key={c} value={c}>
                  {c === "all" ? "All" : c}
                </option>
              ))}
            </select>
          </label>

          {/* Liked */}
          <button
            type="button"
            className={`profile-filter-pill ${filterLiked ? "active" : ""}`}
            onClick={() => setFilterLiked((v) => !v)}
          >
            Liked
          </button>

          {/* Recent */}
          <button
            type="button"
            className={`profile-filter-pill ${filterRecent ? "active" : ""}`}
            onClick={() => setFilterRecent((v) => !v)}
          >
            Recent
          </button>

          {/* Session */}
          <label className="profile-filter">
            <span className="profile-filter-label">Session</span>
            <select
              className="profile-filter-select"
              value={filterSession}
              onChange={(e) => setFilterSession(e.target.value)}
            >
              {sessionOptions.map((s) => (
                <option key={s} value={s}>
                  {s === "all" ? "All" : s}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {error ? <div className="error-text profile-error">{error}</div> : null}

      <div className="profile-grid">
        {items.map((g, i) => {
          const n = i + 1;
          const variant = cardVariantClass(i);
          const dim = !isMatch(g);

          const prompt = String(g.prompt || "").trim();
          const createdAt = g.createdAt || "";
          const url = String(g.outputUrl || "").trim();
          const liked = isLiked(g);

          const showExpanded = expandedPromptId === String(g.id);

          return (
            <div key={String(g.id)} className={`profile-card ${variant} ${dim ? "is-dim" : ""}`}>
              <div className="profile-card-top">
                <button type="button" className="profile-card-show" onClick={() => downloadItem(g, n)} title="Download">
                  {n}. Show
                </button>

                {liked ? <div className="profile-card-liked">Liked</div> : <div className="profile-card-liked ghost"> </div>}
              </div>

              <button type="button" className="profile-card-media" onClick={() => downloadItem(g, n)} title="Download">
                {url ? (
                  isVideoUrl(url) ? (
                    <video src={url} muted playsInline preload="metadata" style={{ width: "100%", height: "100%", display: "block" }} />
                  ) : (
                    <img src={url} alt="" loading="lazy" decoding="async" draggable="false" />
                  )
                ) : (
                  <div className="profile-card-media-empty" />
                )}
              </button>

              <div className="profile-card-promptline">
                <div className={`profile-card-prompt ${showExpanded ? "expanded" : ""}`}>{prompt || "—"}</div>

                {prompt && prompt.length > 60 ? (
                  <button
                    type="button"
                    className="profile-card-viewmore"
                    onClick={() => setExpandedPromptId((prev) => (prev === String(g.id) ? null : String(g.id)))}
                  >
                    {showExpanded ? "less" : "view more"}
                  </button>
                ) : null}
              </div>

              <div className="profile-card-bottom">
                <div className="profile-card-date">{formatDate(createdAt)}</div>

                {confirmDeleteId === String(g.id) ? (
                  <div className="profile-card-confirm">
                    <button type="button" className="profile-card-confirm-yes" onClick={() => deleteItem(g)}>
                      Yes delete
                    </button>
                    <button type="button" className="profile-card-confirm-no" onClick={() => setConfirmDeleteId(null)}>
                      No keep
                    </button>
                  </div>
                ) : (
                  <button type="button" className="profile-card-delete" onClick={() => setConfirmDeleteId(String(g.id))}>
                    Delete
                  </button>
                )}
              </div>
            </div>
          );
        })}

        <div ref={sentinelRef} className="profile-grid-sentinel" />
      </div>

      <div className="profile-foot">
        {isBootLoading ? (
          <div className="profile-foot-note">Loading…</div>
        ) : hasMore ? (
          <div className="profile-foot-note">Scroll to load more.</div>
        ) : (
          <div className="profile-foot-note">{allItems.length ? "End of archive." : "No creations yet."}</div>
        )}
      </div>
    </div>
  );
}
