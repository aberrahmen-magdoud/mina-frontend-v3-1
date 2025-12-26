import React, { useMemo, useState } from "react";
import "./Profile.css";

type GenerationRecord = {
  id: string;
  type: string;
  sessionId?: string;
  passId?: string;
  platform?: string;
  prompt?: string;
  outputUrl?: string;
  createdAt?: string;
  meta?: any;
};

type FeedbackRecord = {
  id: string;
  passId: string;
  resultType: string;
  platform: string;
  prompt: string;
  comment: string;
  imageUrl?: string;
  videoUrl?: string;
  createdAt: string;
};

type ProfileDraft = {
  mode: "still" | "motion";
  brief: string;
  assets?: Record<string, any>;
  settings?: Record<string, any>;
  inputs?: Record<string, any>;
};

type Props = {
  email: string;
  credits: number | null;
  expiresAt: string | null;

  generations: GenerationRecord[];
  feedbacks: FeedbackRecord[];

  matchaUrl: string;

  loading: boolean;
  error: string | null;

  onRefresh: () => void;
  onDelete: (id: string) => Promise<void> | void;
  onRecreate: (draft: ProfileDraft) => void;

  onBackToStudio: () => void;
  onLogout: () => void;
};

// ---------- helpers ----------
function stripSignedQuery(url: string) {
  try {
    const u = new URL(url);
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}

function isVideoUrl(url: string) {
  const base = (url || "").split("?")[0].split("#")[0].toLowerCase();
  return base.endsWith(".mp4") || base.endsWith(".webm") || base.endsWith(".mov") || base.endsWith(".m4v");
}

function isHttpUrl(url: any) {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

function deepGet(obj: any, path: string[]) {
  let cur = obj;
  for (const k of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[k];
  }
  return cur;
}

function firstString(...vals: any[]) {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function firstStringFrom(obj: any, paths: string[][]) {
  for (const p of paths) {
    const v = deepGet(obj, p);
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function firstArrayFrom(obj: any, paths: string[][]) {
  for (const p of paths) {
    const v = deepGet(obj, p);
    if (Array.isArray(v)) {
      const arr = v.filter((x) => typeof x === "string" && x.startsWith("http"));
      if (arr.length) return arr;
    }
  }
  return [];
}

function parseMaybeJson(x: any) {
  if (!x) return x;
  if (typeof x === "object") return x;
  if (typeof x !== "string") return x;
  const s = x.trim();
  if (!s) return x;
  if (s[0] !== "{" && s[0] !== "[") return x;
  try {
    return JSON.parse(s);
  } catch {
    return x;
  }
}

function extractMmaVars(gen: any) {
  // try common places
  const meta = parseMaybeJson(gen?.meta);
  const candidates = [
    gen?.mma_vars,
    gen?.mg_mma_vars,
    gen?.vars,
    gen?.payload?.mma_vars,
    meta?.mma_vars,
    meta?.mg_mma_vars,
    meta?.vars,
    meta?.payload?.mma_vars,
  ].map(parseMaybeJson);

  for (const c of candidates) {
    if (c && typeof c === "object") return c;
  }
  return null;
}

function extractUserText(gen: GenerationRecord) {
  const mma = extractMmaVars(gen);

  // Prefer explicit user inputs / feedback fields
  const tweak = firstStringFrom(mma, [
    ["inputs", "tweak"],
    ["inputs", "tweak_text"],
    ["inputs", "user_tweak"],
    ["feedback", "comment"],
  ]);

  if (tweak) return tweak;

  const motion = firstStringFrom(mma, [
    ["inputs", "motion_user_brief"],
    ["inputs", "motion_description"],
    ["inputs", "motionDescription"],
    ["feedback", "motion_feedback"],
    ["inputs", "prompt_override"], // last resort
  ]);

  const still = firstStringFrom(mma, [
    ["inputs", "brief"],
    ["feedback", "still_feedback"],
  ]);

  const meta = parseMaybeJson(gen.meta);
  const metaUser = firstStringFrom(meta, [
    ["userText"],
    ["user_text"],
    ["brief"],
    ["tweak"],
    ["motionDescription"],
    ["motion_description"],
  ]);

  return firstString(
    motion,
    still,
    metaUser,
    gen.prompt || ""
  );
}

function extractSettings(gen: GenerationRecord) {
  const mma = extractMmaVars(gen);
  const meta = parseMaybeJson(gen.meta);

  const aspect =
    firstStringFrom(meta, [["aspectRatio"], ["aspect_ratio"]]) ||
    firstStringFrom(mma, [["inputs", "aspect_ratio"], ["inputs", "aspectRatio"], ["inputs", "ratio"]]);

  const vision =
    deepGet(meta, ["minaVisionEnabled"]) ??
    deepGet(mma, ["inputs", "minaVisionEnabled"]) ??
    undefined;

  const styleKeys =
    (Array.isArray(deepGet(meta, ["stylePresetKeys"])) ? deepGet(meta, ["stylePresetKeys"]) : null) ||
    (typeof deepGet(meta, ["stylePresetKey"]) === "string" ? [deepGet(meta, ["stylePresetKey"])] : null) ||
    (Array.isArray(deepGet(mma, ["inputs", "stylePresetKeys"])) ? deepGet(mma, ["inputs", "stylePresetKeys"]) : null) ||
    [];

  return {
    aspect_ratio: typeof aspect === "string" ? aspect : "",
    minaVisionEnabled: typeof vision === "boolean" ? vision : undefined,
    stylePresetKeys: Array.isArray(styleKeys) ? styleKeys.map(String) : [],
  };
}

function extractAssets(gen: GenerationRecord) {
  const mma = extractMmaVars(gen);
  const meta = parseMaybeJson(gen.meta);

  const product = firstStringFrom(meta, [["productImageUrl"], ["product_image_url"]]) ||
    firstStringFrom(mma, [["assets", "product_image_url"], ["assets", "productImageUrl"]]);

  const logo = firstStringFrom(meta, [["logoImageUrl"], ["logo_image_url"]]) ||
    firstStringFrom(mma, [["assets", "logo_image_url"], ["assets", "logoImageUrl"]]);

  const insp =
    firstArrayFrom(meta, [["styleImageUrls"], ["style_image_urls"]]) ||
    firstArrayFrom(mma, [["assets", "inspiration_image_urls"], ["assets", "style_image_urls"]]) ||
    [];

  const start =
    firstStringFrom(meta, [["start_image_url"], ["kling_start_image_url"], ["startImageUrl"]]) ||
    firstStringFrom(mma, [["assets", "start_image_url"], ["assets", "kling_start_image_url"], ["assets", "startImageUrl"]]);

  const end =
    firstStringFrom(meta, [["end_image_url"], ["kling_end_image_url"], ["endImageUrl"]]) ||
    firstStringFrom(mma, [["assets", "end_image_url"], ["assets", "kling_end_image_url"], ["assets", "endImageUrl"]]);

  return {
    product_image_url: isHttpUrl(product) ? product : "",
    logo_image_url: isHttpUrl(logo) ? logo : "",
    inspiration_image_urls: Array.from(new Set((insp || []).filter(isHttpUrl))).slice(0, 4),

    // motion
    start_image_url: isHttpUrl(start) ? start : "",
    end_image_url: isHttpUrl(end) ? end : "",
  };
}

function buildRecreateDraft(gen: GenerationRecord): ProfileDraft {
  const out = stripSignedQuery(String(gen.outputUrl || ""));

  const settings = extractSettings(gen);
  const assets = extractAssets(gen);
  const userText = extractUserText(gen);

  const motion = isVideoUrl(out) || gen.type?.toLowerCase().includes("video") || gen.type?.toLowerCase().includes("motion");

  // If it's a motion generation but we still don't have a start image,
  // best fallback: keep whatever is in assets; the user can drop an image if needed.
  return {
    mode: motion ? "motion" : "still",
    brief: userText, // ✅ real user text (create / tweak / animate)
    assets,
    settings,
  };
}

function buildAnimateDraftFromImage(outputImageUrl: string, gen: GenerationRecord): ProfileDraft {
  const settings = extractSettings(gen);
  return {
    mode: "motion",
    brief: "", // ✅ empty motion text area
    assets: {
      start_image_url: stripSignedQuery(outputImageUrl),
      end_image_url: "",
    },
    settings,
  };
}

// ---------- component ----------
const Profile: React.FC<Props> = ({
  email,
  credits,
  expiresAt,
  generations,
  feedbacks,
  matchaUrl,
  loading,
  error,
  onRefresh,
  onDelete,
  onRecreate,
  onBackToStudio,
  onLogout,
}) => {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const copy = [...(generations || [])];
    copy.sort((a, b) => {
      const ta = Date.parse(a.createdAt || "") || 0;
      const tb = Date.parse(b.createdAt || "") || 0;
      return tb - ta;
    });
    return copy;
  }, [generations]);

  return (
    <div className="profile-root">
      <div className="profile-topbar">
        <button type="button" className="profile-link" onClick={onBackToStudio}>
          Back to studio
        </button>

        <div className="profile-topbar-right">
          <a className="profile-link" href={matchaUrl} target="_blank" rel="noreferrer">
            Get matcha
          </a>
          <button type="button" className="profile-link" onClick={onLogout}>
            Logout
          </button>
        </div>
      </div>

      <div className="profile-header">
        <div className="profile-email">{email || "—"}</div>
        <div className="profile-meta">
          <div>Credits: {loading ? "…" : credits ?? "—"}</div>
          {!!expiresAt && <div>Expires: {expiresAt}</div>}
        </div>

        <div className="profile-header-actions">
          <button type="button" className="profile-link" onClick={onRefresh} disabled={loading}>
            Refresh
          </button>
        </div>

        {!!error && <div className="profile-error">{error}</div>}
      </div>

      <div className="profile-grid">
        {sorted.map((g) => {
          const out = stripSignedQuery(String(g.outputUrl || ""));
          const isVideo = out ? isVideoUrl(out) : false;
          const userText = extractUserText(g);
          const canAnimate = !!out && !isVideo; // ✅ only image outputs

          return (
            <div key={g.id} className="profile-card">
              <div className="profile-card-media">
                {out ? (
                  isVideo ? (
                    <video src={out} controls playsInline preload="metadata" />
                  ) : (
                    <img src={out} alt="" loading="lazy" />
                  )
                ) : (
                  <div className="profile-card-media-empty">No output</div>
                )}
              </div>

              <div className="profile-card-body">
                <div className="profile-card-text">
                  {userText ? userText : <span style={{ opacity: 0.6 }}>No user text found</span>}
                </div>

                <div className="profile-card-actions">
                  <button
                    type="button"
                    className="profile-action"
                    onClick={() => onRecreate(buildRecreateDraft(g))}
                    style={{ textDecoration: "none" }}
                  >
                    Recreate
                  </button>

                  {canAnimate && (
                    <button
                      type="button"
                      className="profile-action"
                      onClick={() => onRecreate(buildAnimateDraftFromImage(out, g))}
                      style={{ textDecoration: "none" }}
                    >
                      Animate
                    </button>
                  )}

                  {!!out && (
                    <a
                      className="profile-action"
                      href={out}
                      target="_blank"
                      rel="noreferrer"
                      style={{ textDecoration: "none" }}
                    >
                      Open
                    </a>
                  )}

                  <button
                    type="button"
                    className="profile-action profile-action-danger"
                    disabled={deletingId === g.id}
                    onClick={async () => {
                      try {
                        setDeletingId(g.id);
                        await onDelete(g.id);
                      } finally {
                        setDeletingId(null);
                      }
                    }}
                    style={{ textDecoration: "none" }}
                  >
                    {deletingId === g.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!sorted.length && !loading && <div className="profile-empty">No generations yet.</div>}
    </div>
  );
};

export default Profile;
