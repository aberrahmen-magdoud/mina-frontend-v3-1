import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type MinaAppProps = {
  initialCustomerId: string | null;
  onSignOut: () => void;
};

const API_BASE_URL =
  import.meta.env.VITE_MINA_API_BASE_URL ||
  "https://mina-editorial-ai-api.onrender.com";

const TOPUP_URL =
  import.meta.env.VITE_MINA_TOPUP_URL ||
  "https://faltastudio.com/products/mina-machta-50";

type HealthStatus = "idle" | "ok" | "error";

type CreditsState = {
  balance: number | null;
  imageCost: number | null;
  motionCost: number | null;
  loading: boolean;
  error: string | null;
};

type EditorialGenerateResponse = {
  ok: boolean;
  message?: string;
  error?: string;
  imageUrl?: string | null;
  imageUrls?: string[];
  generationId?: string;
  sessionId?: string;
  credits?: {
    balance: number;
    cost: number;
  };
  prompt?: string;
};

type CreditsBalanceResponse = {
  ok: boolean;
  requestId?: string;
  customerId?: string;
  balance: number;
  historyLength?: number;
  meta?: {
    imageCost?: number;
    motionCost?: number;
  };
};

type StatsResponse = {
  ok: boolean;
  requestId: string;
  source: string;
  totalUsers: number | null;
};

type StudioItemKind = "image" | "video";

type StudioItem = {
  id: string;
  url: string;
  prompt: string;
  kind: StudioItemKind;
  createdAt: string;
};

type TabKey = "studio" | "profile";

function formatUserCount(count: number): string {
  if (count >= 1_000_000) {
    return (count / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  }
  if (count >= 1_000) {
    return (count / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  }
  return String(count);
}

function slugFromPrompt(prompt: string): string {
  if (!prompt) return "mina-image";
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "mina-image";
}

export function MinaApp({ initialCustomerId, onSignOut }: MinaAppProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("studio");

  // Customer id (same as login: email)
  const [customerId] = useState<string | null>(() => {
    if (initialCustomerId) return initialCustomerId;
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem("minaCustomerId");
      return stored || null;
    }
    return null;
  });

  // Session id used for history / feedback
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Health + credits + stats
  const [healthStatus, setHealthStatus] = useState<HealthStatus>("idle");
  const [healthMessage, setHealthMessage] = useState<string>("");

  const [credits, setCredits] = useState<CreditsState>({
    balance: null,
    imageCost: null,
    motionCost: null,
    loading: false,
    error: null,
  });

  const [totalUsers, setTotalUsers] = useState<number | null>(null);

  // Studio form state
  const [brief, setBrief] = useState("");
  const [tone, setTone] = useState("");

  // Ratio preset + orientation
  const [ratioChoice, setRatioChoice] = useState<
    "vertical" | "post" | "square" | null
  >("vertical");
  const [orientation, setOrientation] = useState<"vertical" | "horizontal">(
    "vertical"
  );

  // Image URLs (still URL-based for now)
  const [productImageUrl, setProductImageUrl] = useState("");
  const [styleImageUrlsRaw, setStyleImageUrlsRaw] = useState("");

  const styleImageUrls = useMemo(
    () =>
      styleImageUrlsRaw
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    [styleImageUrlsRaw]
  );

  // Style preset + Mina Vision
  const [stylePresetKey, setStylePresetKey] =
    useState<string>("soft-desert-editorial");
  const [minaVisionEnabled, setMinaVisionEnabled] = useState<boolean>(true);

  // Studio generation results
  const [studioItems, setStudioItems] = useState<StudioItem[]>([]);
  const [studioIndex, setStudioIndex] = useState<number>(0);
  const [studioLoading, setStudioLoading] = useState<boolean>(false);
  const [studioError, setStudioError] = useState<string | null>(null);

  // Feedback / like
  const [feedbackText, setFeedbackText] = useState("");
  const [likeSending, setLikeSending] = useState(false);
  const [likedIds, setLikedIds] = useState<string[]>([]);

  // Touch swipe for carousel
  const touchStartXRef = useRef<number | null>(null);

  const currentItem: StudioItem | null =
    studioItems.length > 0 ? studioItems[studioIndex] : null;

  const isCurrentLiked =
    !!currentItem && likedIds.includes(currentItem.id ?? "");

  // Map ratio/orientation to "platform" for backend
  const platform = useMemo(() => {
    if (!ratioChoice) return "tiktok";
    if (ratioChoice === "vertical") {
      return orientation === "vertical" ? "tiktok" : "youtube";
    }
    if (ratioChoice === "post") {
      return "instagram";
    }
    if (ratioChoice === "square") {
      return "square";
    }
    return "tiktok";
  }, [ratioChoice, orientation]);

  // --- Effects: health, credits, stats ---

  useEffect(() => {
    async function loadHealth() {
      try {
        const res = await fetch(`${API_BASE_URL}/health`);
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        setHealthStatus("ok");
        setHealthMessage(json.service || "Mina API online");
      } catch (err: any) {
        console.error("Health check failed", err);
        setHealthStatus("error");
        setHealthMessage("Mina API offline");
      }
    }
    void loadHealth();
  }, []);

  useEffect(() => {
    if (!customerId) return;

    async function loadCredits() {
      setCredits((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const res = await fetch(
          `${API_BASE_URL}/credits/balance?customerId=${encodeURIComponent(
            customerId
          )}`
        );
        const json: CreditsBalanceResponse = await res.json();
        if (!res.ok || !json.ok) {
          throw new Error(json as any);
        }
        setCredits({
          balance: json.balance,
          imageCost: json.meta?.imageCost ?? null,
          motionCost: json.meta?.motionCost ?? null,
          loading: false,
          error: null,
        });
      } catch (err: any) {
        console.error("loadCredits error", err);
        setCredits((prev) => ({
          ...prev,
          loading: false,
          error: "Could not load credits.",
        }));
      }
    }

    void loadCredits();
  }, [customerId]);

  useEffect(() => {
    async function loadStats() {
      try {
        const res = await fetch(`${API_BASE_URL}/public/stats/total-users`);
        const json: StatsResponse = await res.json();
        if (json && typeof json.totalUsers === "number") {
          setTotalUsers(json.totalUsers);
        } else {
          setTotalUsers(null);
        }
      } catch (err) {
        console.error("Stats error", err);
        setTotalUsers(null);
      }
    }
    void loadStats();
  }, []);

  // --- Helpers ---

  const ensureSession = useCallback(async () => {
    if (sessionId || !customerId) return sessionId;
    try {
      const res = await fetch(`${API_BASE_URL}/sessions/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          platform,
          title: "Mina Studio",
        }),
      });
      const json = await res.json();
      if (json?.ok && json.session?.id) {
        setSessionId(json.session.id);
        return json.session.id as string;
      }
    } catch (err) {
      console.error("ensureSession error", err);
    }
    return null;
  }, [customerId, platform, sessionId]);

  const handleGenerateImage = useCallback(async () => {
    const trimmedBrief = brief.trim();
    const trimmedTone = tone.trim();
    const product = productImageUrl.trim();

    if (!trimmedBrief) {
      setStudioError("Describe how you want your photo to be like.");
      return;
    }

    setStudioError(null);
    setStudioLoading(true);

    try {
      const sid = await ensureSession();

      const body = {
        productImageUrl: product || undefined,
        styleImageUrls,
        brief: trimmedBrief,
        tone: trimmedTone || undefined,
        platform,
        minaVisionEnabled,
        stylePresetKey: stylePresetKey || undefined,
        customerId: customerId || undefined,
        sessionId: sid || undefined,
        maxImages: 1,
      };

      const res = await fetch(`${API_BASE_URL}/editorial/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json: EditorialGenerateResponse = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(
          json.message ||
            json.error ||
            "Mina could not create this image. Try again."
        );
      }

      if (json.sessionId && json.sessionId !== sid) {
        setSessionId(json.sessionId);
      }

      if (json.credits && typeof json.credits.balance === "number") {
        setCredits((prev) => ({
          ...prev,
          balance: json.credits?.balance ?? prev.balance,
        }));
      }

      const url =
        json.imageUrl ||
        (Array.isArray(json.imageUrls) ? json.imageUrls[0] : null);

      if (url) {
        const item: StudioItem = {
          id: json.generationId || `gen_${Date.now()}`,
          url,
          prompt: json.prompt || trimmedBrief,
          kind: "image",
          createdAt: new Date().toISOString(),
        };
        setStudioItems((prev) => [item, ...prev]);
        setStudioIndex(0);
      }
    } catch (err: any) {
      console.error("handleGenerateImage error", err);
      setStudioError(
        err?.message || "Mina could not create this image. Try again."
      );
    } finally {
      setStudioLoading(false);
    }
  }, [
    brief,
    tone,
    productImageUrl,
    styleImageUrls,
    platform,
    minaVisionEnabled,
    stylePresetKey,
    customerId,
    ensureSession,
  ]);

  const sendFeedback = useCallback(
    async (options: { comment?: string; markLiked?: boolean }) => {
      const item = currentItem;
      if (!item || !customerId) return;

      const comment = options.comment?.trim();
      const markLiked = options.markLiked ?? false;

      setLikeSending(true);
      try {
        await fetch(`${API_BASE_URL}/feedback/like`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerId,
            resultType: item.kind,
            platform,
            prompt: item.prompt,
            comment: comment || undefined,
            imageUrl: item.kind === "image" ? item.url : undefined,
            videoUrl: item.kind === "video" ? item.url : undefined,
            sessionId: sessionId || undefined,
            generationId: item.id,
          }),
        });

        if (comment) {
          setFeedbackText("");
        }
        if (markLiked) {
          setLikedIds((prev) =>
            prev.includes(item.id) ? prev : [...prev, item.id]
          );
        }
      } catch (err) {
        console.error("sendFeedback error", err);
      } finally {
        setLikeSending(false);
      }
    },
    [currentItem, customerId, platform, sessionId]
  );

  const handleLikeClick = useCallback(() => {
    if (!currentItem) return;
    if (isCurrentLiked) {
      // Just UI toggle; we don't "unlike" on backend for now.
      setLikedIds((prev) => prev.filter((id) => id !== currentItem.id));
      return;
    }
    void sendFeedback({ markLiked: true });
  }, [currentItem, isCurrentLiked, sendFeedback]);

  const handleSendFeedback = useCallback(() => {
    if (!feedbackText.trim()) return;
    void sendFeedback({ comment: feedbackText.trim(), markLiked: true });
  }, [feedbackText, sendFeedback]);

  const handleDownloadCurrent = useCallback(() => {
    const item = currentItem;
    if (!item) return;
    const filename = `Mina-v3-${slugFromPrompt(item.prompt)}${
      item.kind === "video" ? ".mp4" : ".jpg"
    }`;

    try {
      const a = document.createElement("a");
      a.href = item.url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error("download failed, opening in new tab", err);
      window.open(item.url, "_blank");
    }
  }, [currentItem]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      touchStartXRef.current = e.touches[0].clientX;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const startX = touchStartXRef.current;
    if (startX == null) return;
    const endX = e.changedTouches[0].clientX;
    const diff = endX - startX;
    touchStartXRef.current = null;

    if (Math.abs(diff) < 40) return;
    if (diff < 0) {
      // swipe left → next
      setStudioIndex((prev) =>
        prev + 1 < studioItems.length ? prev + 1 : prev
      );
    } else {
      // swipe right → previous
      setStudioIndex((prev) => (prev - 1 >= 0 ? prev - 1 : prev));
    }
  };

  const handlePrev = () => {
    setStudioIndex((prev) => (prev - 1 >= 0 ? prev - 1 : prev));
  };

  const handleNext = () => {
    setStudioIndex((prev) =>
      prev + 1 < studioItems.length ? prev + 1 : prev
    );
  };

  // --- Render ---

  const briefLongEnough = brief.trim().length >= 20;

  return (
    <div className="mina-shell">
      {/* Header: transparent bar */}
      <header className="mina-header">
        <div className="mina-header-left">
          <button
            type="button"
            className="mina-logo-button"
            onClick={() => setActiveTab("studio")}
          >
            <img
              src="https://cdn.shopify.com/s/files/1/0678/9254/3571/files/Minalogo.svg?v=1765367006"
              alt="Mina"
            />
          </button>
          <nav className="mina-nav">
            <button
              type="button"
              className={
                activeTab === "studio"
                  ? "mina-nav-item active"
                  : "mina-nav-item"
              }
              onClick={() => setActiveTab("studio")}
            >
              Studio
            </button>
            <button
              type="button"
              className={
                activeTab === "profile"
                  ? "mina-nav-item active"
                  : "mina-nav-item"
              }
              onClick={() => setActiveTab("profile")}
            >
              Profile
            </button>
          </nav>
        </div>
        <div className="mina-header-right">
          {credits.balance !== null && (
            <div className="mina-header-credits">
              <span className="mina-header-credits-label">Credits</span>
              <span className="mina-header-credits-value">
                {credits.balance}
              </span>
            </div>
          )}
          <button
            type="button"
            className="mina-header-signout"
            onClick={onSignOut}
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mina-main">
        {activeTab === "studio" && (
          <div className="mina-studio-layout">
            {/* LEFT – controllers */}
            <section className="mina-studio-left">
              <div className="studio-field">
                <label className="studio-label">Direction</label>
                <div className="studio-direction-shell">
                  <textarea
                    className="studio-textarea"
                    placeholder="Describe how you want your photo to be like"
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                  />
                  <p className="studio-helper">
                    Use natural language, like talking to an art director.
                  </p>
                </div>
              </div>

              {briefLongEnough && (
                <>
                  <div className="studio-field">
                    <label className="studio-label">Format</label>
                    <div className="studio-format-row">
                      <div className="studio-format-presets">
                        <button
                          type="button"
                          className={
                            ratioChoice === "vertical"
                              ? "studio-chip active"
                              : "studio-chip"
                          }
                          onClick={() => setRatioChoice("vertical")}
                        >
                          TikTok / Instagram vertical
                        </button>
                        <button
                          type="button"
                          className={
                            ratioChoice === "post"
                              ? "studio-chip active"
                              : "studio-chip"
                          }
                          onClick={() => setRatioChoice("post")}
                        >
                          Post 2:3
                        </button>
                        <button
                          type="button"
                          className={
                            ratioChoice === "square"
                              ? "studio-chip active"
                              : "studio-chip"
                          }
                          onClick={() => setRatioChoice("square")}
                        >
                          Square 1:1
                        </button>
                      </div>
                      <button
                        type="button"
                        className="studio-orientation-toggle"
                        onClick={() =>
                          setOrientation((prev) =>
                            prev === "vertical" ? "horizontal" : "vertical"
                          )
                        }
                        aria-label="Toggle orientation"
                      >
                        <span
                          className={
                            orientation === "vertical"
                              ? "orientation-icon vertical"
                              : "orientation-icon horizontal"
                          }
                        />
                      </button>
                    </div>
                  </div>

                  <div className="studio-field">
                    <label className="studio-label">Product image</label>
                    <div className="studio-drop-line">
                      <input
                        className="studio-input"
                        type="url"
                        placeholder="Paste product image URL (drag & drop upload coming soon)"
                        value={productImageUrl}
                        onChange={(e) => setProductImageUrl(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="studio-field">
                    <label className="studio-label">
                      Reference images (optional)
                    </label>
                    <textarea
                      className="studio-textarea small"
                      placeholder="Paste one image URL per line – mood, lighting, angles..."
                      value={styleImageUrlsRaw}
                      onChange={(e) => setStyleImageUrlsRaw(e.target.value)}
                    />
                  </div>

                  <div className="studio-field">
                    <label className="studio-label">Editorial style</label>
                    <div className="studio-preset-grid">
                      <button
                        type="button"
                        className={
                          stylePresetKey === "soft-desert-editorial"
                            ? "studio-preset active"
                            : "studio-preset"
                        }
                        onClick={() =>
                          setStylePresetKey("soft-desert-editorial")
                        }
                      >
                        Soft desert
                        <span className="studio-preset-caption">
                          Warm, hazy, tactile
                        </span>
                      </button>
                      <button
                        type="button"
                        className={
                          stylePresetKey === "chrome-neon-night"
                            ? "studio-preset active"
                            : "studio-preset"
                        }
                        onClick={() => setStylePresetKey("chrome-neon-night")}
                      >
                        Chrome neon
                        <span className="studio-preset-caption">
                          Night city, sharp
                        </span>
                      </button>
                      <button
                        type="button"
                        className={
                          stylePresetKey === "bathroom-ritual"
                            ? "studio-preset active"
                            : "studio-preset"
                        }
                        onClick={() => setStylePresetKey("bathroom-ritual")}
                      >
                        Bathroom ritual
                        <span className="studio-preset-caption">
                          Steam, marble, glow
                        </span>
                      </button>
                      <button
                        type="button"
                        className="studio-preset ghost"
                        // Future: open training modal
                      >
                        <span className="studio-plus">＋</span> Build your own
                        style
                      </button>
                    </div>
                  </div>

                  <div className="studio-field compact">
                    <label className="studio-label">Tone (optional)</label>
                    <input
                      className="studio-input"
                      type="text"
                      placeholder="Soft, sensual, editorial, bold..."
                      value={tone}
                      onChange={(e) => setTone(e.target.value)}
                    />
                  </div>

                  <div className="studio-footer-row">
                    <button
                      type="button"
                      className="studio-vision-toggle"
                      onClick={() =>
                        setMinaVisionEnabled((prev) => !prev)
                      }
                    >
                      Mina Vision intelligence:{" "}
                      <span className="underline">
                        {minaVisionEnabled ? "ON" : "OFF"}
                      </span>
                    </button>

                    <button
                      type="button"
                      className="studio-create"
                      onClick={handleGenerateImage}
                      disabled={studioLoading}
                    >
                      {studioLoading ? "Creating…" : "Create"}
                    </button>
                  </div>

                  {studioError && (
                    <div className="studio-error">{studioError}</div>
                  )}
                </>
              )}
            </section>

            {/* RIGHT – generation output */}
            <section className="mina-studio-right">
              <div className="studio-output">
                <div
                  className="studio-output-frame"
                  onTouchStart={handleTouchStart}
                  onTouchEnd={handleTouchEnd}
                >
                  {currentItem ? (
                    currentItem.kind === "image" ? (
                      <img
                        src={currentItem.url}
                        alt={currentItem.prompt}
                        className="studio-output-media"
                        onClick={handleDownloadCurrent}
                      />
                    ) : (
                      <video
                        className="studio-output-media"
                        src={currentItem.url}
                        autoPlay
                        loop
                        muted
                        playsInline
                      />
                    )
                  ) : (
                    <div className="studio-output-placeholder">
                      <p>Your Mina image will appear here.</p>
                      <p className="studio-output-sub">
                        Start on the left, then tap “Create”.
                      </p>
                    </div>
                  )}
                </div>

                {studioItems.length > 1 && (
                  <div className="studio-carousel-row">
                    <button
                      type="button"
                      className="studio-arrow"
                      onClick={handlePrev}
                      disabled={studioIndex === 0}
                    >
                      ‹
                    </button>
                    <div className="studio-dots">
                      {studioItems.map((item, idx) => (
                        <button
                          key={item.id}
                          type="button"
                          className={
                            idx === studioIndex
                              ? "studio-dot active"
                              : "studio-dot"
                          }
                          onClick={() => setStudioIndex(idx)}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      className="studio-arrow"
                      onClick={handleNext}
                      disabled={studioIndex === studioItems.length - 1}
                    >
                      ›
                    </button>
                  </div>
                )}

                <div className="studio-output-actions">
                  <button
                    type="button"
                    className={
                      isCurrentLiked
                        ? "studio-pill-button liked"
                        : "studio-pill-button"
                    }
                    onClick={handleLikeClick}
                    disabled={!currentItem || likeSending}
                  >
                    {isCurrentLiked ? "Liked" : "Like"}
                  </button>
                  <button
                    type="button"
                    className="studio-pill-button"
                    onClick={handleDownloadCurrent}
                    disabled={!currentItem}
                  >
                    Download
                  </button>
                </div>

                <div className="studio-feedback-row">
                  <input
                    className="studio-input feedback"
                    type="text"
                    placeholder="Tell Mina what worked or what felt off…"
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                  />
                  <button
                    type="button"
                    className="studio-send"
                    onClick={handleSendFeedback}
                    disabled={!currentItem || !feedbackText.trim()}
                  >
                    Send
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === "profile" && (
          <div className="mina-profile">
            <div className="mina-profile-card">
              <h2>Profile</h2>
              <p className="mina-profile-line">
                Signed in as{" "}
                <strong>{customerId ?? "anonymous curator"}</strong>
              </p>
              <p className="mina-profile-line">
                Credits:{" "}
                <strong>
                  {credits.balance !== null ? credits.balance : "…"}
                </strong>
                {credits.imageCost !== null && (
                  <span className="mina-profile-meta">
                    {" "}
                    · still: {credits.imageCost} · motion:{" "}
                    {credits.motionCost ?? "—"}
                  </span>
                )}
              </p>
              <p className="mina-profile-line">
                <a
                  href={TOPUP_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="mina-link"
                >
                  Buy more Mina credits
                </a>
              </p>
              <p className="mina-profile-caption">
                Mina Vision learns from your likes and feedback to refine your
                editorial style over time.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Bottom-left: curators count + health pill */}
      <div className="mina-page-footer">
        <div className="mina-users-pill">
          {totalUsers !== null
            ? `${formatUserCount(totalUsers)} curators use Mina`
            : "curators use Mina"}
        </div>
        {healthStatus !== "idle" && (
          <div
            className={
              healthStatus === "ok"
                ? "mina-health-pill ok"
                : "mina-health-pill warn"
            }
          >
            {healthMessage || "Connection"}
          </div>
        )}
      </div>
    </div>
  );
}

export default MinaApp;
