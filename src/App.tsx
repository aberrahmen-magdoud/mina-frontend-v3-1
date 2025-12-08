import React, { useEffect, useState } from "react";

const API_BASE_URL =
  import.meta.env.VITE_MINA_API_BASE_URL ||
  "https://mina-editorial-ai-api.onrender.com";

// -------- Types --------

type HealthPayload = {
  ok: boolean;
  service: string;
  time: string;
};

type CreditsMeta = {
  imageCost: number;
  motionCost: number;
};

type CreditsBalance = {
  ok: boolean;
  requestId: string;
  customerId: string;
  balance: number;
  historyLength: number;
  meta: CreditsMeta;
};

type EditorialResponse = {
  ok: boolean;
  message: string;
  requestId: string;
  prompt: string;
  imageUrl: string | null;
  imageUrls?: string[];
  generationId: string;
  sessionId: string;
  credits: {
    balance: number;
    cost: number;
  };
  gpt?: any;
};

type MotionSuggestResponse = {
  ok: boolean;
  requestId: string;
  suggestion: string;
  gpt?: any;
};

type MotionResponse = {
  ok: boolean;
  message: string;
  requestId: string;
  prompt: string;
  videoUrl: string | null;
  generationId: string;
  sessionId: string;
  credits: {
    balance: number;
    cost: number;
  };
  gpt?: any;
};

type LikePayload = {
  ok: boolean;
  message: string;
  requestId: string;
  totals: {
    likesForCustomer: number;
  };
};

type StillItem = {
  id: string;
  url: string;
  prompt: string;
  createdAt: string;
};

type MotionItem = {
  id: string;
  url: string;
  prompt: string;
  createdAt: string;
};

// -------- Helpers --------

const devCustomerId = "8766256447571"; // your test user, credits come from backend

function formatTime(ts?: string) {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    return d.toLocaleString();
  } catch {
    return ts;
  }
}

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

// -------- App --------

function App() {
  // Tabs
  const [activeTab, setActiveTab] = useState<"playground" | "profile">(
    "playground"
  );

  // Health
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  // Credits
  const [credits, setCredits] = useState<CreditsBalance | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [creditsError, setCreditsError] = useState<string | null>(null);

  // Session (Mina session id from API)
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStarting, setSessionStarting] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Still: inputs
  const [productImageUrl, setProductImageUrl] = useState("");
  const [styleImageUrlsRaw, setStyleImageUrlsRaw] = useState("");
  const [brief, setBrief] = useState("");
  const [tone, setTone] = useState("Poetic");
  const [platform, setPlatform] = useState("tiktok");
  const [stylePresetKey, setStylePresetKey] = useState("soft-desert-editorial");
  const [minaVisionEnabled, setMinaVisionEnabled] = useState(true);

  // Still: generation state
  const [stillGenerating, setStillGenerating] = useState(false);
  const [stillError, setStillError] = useState<string | null>(null);
  const [lastStillPrompt, setLastStillPrompt] = useState<string | null>(null);
  const [stillItems, setStillItems] = useState<StillItem[]>([]);
  const [stillIndex, setStillIndex] = useState(0);

  // Motion: inputs
  const [motionDescription, setMotionDescription] = useState("");
  const [motionSuggestLoading, setMotionSuggestLoading] = useState(false);
  const [motionSuggestError, setMotionSuggestError] = useState<string | null>(
    null
  );

  // Motion: generation state
  const [motionGenerating, setMotionGenerating] = useState(false);
  const [motionError, setMotionError] = useState<string | null>(null);
  const [motionItems, setMotionItems] = useState<MotionItem[]>([]);
  const [motionIndex, setMotionIndex] = useState(0);

  // Profile / auto-topup (UI only for now)
  const [autoTopupEnabled, setAutoTopupEnabled] = useState(false);
  const [autoTopupLimit, setAutoTopupLimit] = useState("200");
  const [autoTopupPack, setAutoTopupPack] = useState("MINA-50");

  // --- Derived: steps completion (Notion-like) ---

  const step1Done = Boolean(health?.ok && sessionId);
  const step2Done = Boolean(productImageUrl || styleImageUrlsRaw.trim().length);
  const step3Done = Boolean(brief.trim().length);
  const step4Done = stillItems.length > 0;
  const step5Done = motionItems.length > 0;

  // --- Start-up: check health + credits + session once ---

  useEffect(() => {
    const bootstrap = async () => {
      await handleCheckHealth();
      await handleFetchCredits();
      await handleStartSession();
    };
    void bootstrap();
  }, []);

  // --- API calls ---

  const handleCheckHealth = async () => {
    try {
      setCheckingHealth(true);
      setHealthError(null);
      const res = await fetch(`${API_BASE_URL}/health`);
      if (!res.ok) {
        throw new Error(`Health error: ${res.status}`);
      }
      const data = (await res.json()) as HealthPayload;
      setHealth(data);
    } catch (err: any) {
      setHealthError(err?.message || "Failed to reach Mina API.");
    } finally {
      setCheckingHealth(false);
    }
  };

  const handleFetchCredits = async () => {
    try {
      setCreditsLoading(true);
      setCreditsError(null);
      const res = await fetch(
        `${API_BASE_URL}/credits/balance?customerId=${encodeURIComponent(
          devCustomerId
        )}`
      );
      if (!res.ok) {
        throw new Error(`Credits error: ${res.status}`);
      }
      const data = (await res.json()) as CreditsBalance;
      setCredits(data);
    } catch (err: any) {
      setCreditsError(err?.message || "Failed to load credits.");
    } finally {
      setCreditsLoading(false);
    }
  };

  const handleStartSession = async () => {
    try {
      setSessionStarting(true);
      setSessionError(null);
      const res = await fetch(`${API_BASE_URL}/sessions/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: devCustomerId,
          platform,
          title: "Mina Editorial Session",
        }),
      });
      if (!res.ok) {
        throw new Error(`Session error: ${res.status}`);
      }
      const data = await res.json();
      if (data?.session?.id) {
        setSessionId(data.session.id);
      } else {
        throw new Error("Missing session id in response.");
      }
    } catch (err: any) {
      setSessionError(err?.message || "Failed to start session.");
    } finally {
      setSessionStarting(false);
    }
  };

  const handleGenerateStill = async () => {
    try {
      setStillGenerating(true);
      setStillError(null);

      const styleImageUrls = styleImageUrlsRaw
        .split("\n")
        .map((v) => v.trim())
        .filter(Boolean);

      const res = await fetch(`${API_BASE_URL}/editorial/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: devCustomerId,
          sessionId,
          productImageUrl: productImageUrl.trim() || null,
          styleImageUrls,
          brief,
          tone,
          platform,
          minaVisionEnabled,
          stylePresetKey,
          maxImages: 1,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const msg =
          errJson?.message ||
          `Error ${res.status}: Failed to generate editorial still.`;
        throw new Error(msg);
      }

      const data = (await res.json()) as EditorialResponse;
      const url = data.imageUrl || data.imageUrls?.[0];
      if (!url) {
        throw new Error("No image URL in Mina response.");
      }

      setLastStillPrompt(data.prompt);
      if (data.credits) {
        setCredits((prev) =>
          prev
            ? {
                ...prev,
                balance: data.credits.balance,
              }
            : prev
        );
      }

      const newItem: StillItem = {
        id: data.generationId,
        url,
        prompt: data.prompt,
        createdAt: new Date().toISOString(),
      };

      setStillItems((prev) => {
        const next = [newItem, ...prev];
        setStillIndex(0);
        return next;
      });
    } catch (err: any) {
      setStillError(err?.message || "Unexpected error generating still.");
    } finally {
      setStillGenerating(false);
    }
  };

  const handleSuggestMotion = async () => {
    if (!stillItems.length) return;
    const currentStill = stillItems[stillIndex] || stillItems[0];
    if (!currentStill) return;

    try {
      setMotionSuggestLoading(true);
      setMotionSuggestError(null);
      const res = await fetch(`${API_BASE_URL}/motion/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: devCustomerId,
          referenceImageUrl: currentStill.url,
          tone,
          platform,
          minaVisionEnabled,
          stylePresetKey,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const msg =
          errJson?.message ||
          `Error ${res.status}: Failed to suggest motion idea.`;
        throw new Error(msg);
      }

      const data = (await res.json()) as MotionSuggestResponse;
      setMotionDescription(data.suggestion);
    } catch (err: any) {
      setMotionSuggestError(
        err?.message || "Unexpected error suggesting motion."
      );
    } finally {
      setMotionSuggestLoading(false);
    }
  };

  const handleGenerateMotion = async () => {
    if (!stillItems.length) {
      setMotionError("Generate at least one still image first.");
      return;
    }

    const currentStill = stillItems[stillIndex] || stillItems[0];
    if (!currentStill) {
      setMotionError("No still selected.");
      return;
    }

    if (!motionDescription.trim()) {
      setMotionError("Describe the motion first (or use Mina’s suggestion).");
      return;
    }

    try {
      setMotionGenerating(true);
      setMotionError(null);

      const res = await fetch(`${API_BASE_URL}/motion/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: devCustomerId,
          sessionId,
          lastImageUrl: currentStill.url,
          motionDescription: motionDescription.trim(),
          tone,
          platform,
          minaVisionEnabled,
          stylePresetKey,
          durationSeconds: 5, // your default
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const msg =
          errJson?.message ||
          `Error ${res.status}: Failed to generate motion.`;
        throw new Error(msg);
      }

      const data = (await res.json()) as MotionResponse;
      const url = data.videoUrl;
      if (!url) {
        throw new Error("No video URL in Mina response.");
      }

      if (data.credits) {
        setCredits((prev) =>
          prev
            ? {
                ...prev,
                balance: data.credits.balance,
              }
            : prev
        );
      }

      const newItem: MotionItem = {
        id: data.generationId,
        url,
        prompt: data.prompt,
        createdAt: new Date().toISOString(),
      };

      setMotionItems((prev) => {
        const next = [newItem, ...prev];
        setMotionIndex(0);
        return next;
      });
    } catch (err: any) {
      setMotionError(err?.message || "Unexpected error generating motion.");
    } finally {
      setMotionGenerating(false);
    }
  };

  const handleLike = async (type: "image" | "motion") => {
    try {
      const isImage = type === "image";
      const item = isImage
        ? stillItems[stillIndex] || stillItems[0]
        : motionItems[motionIndex] || motionItems[0];

      if (!item) return;

      const res = await fetch(`${API_BASE_URL}/feedback/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: devCustomerId,
          sessionId,
          generationId: item.id,
          platform,
          resultType: type,
          prompt: item.prompt,
          comment: "",
          imageUrl: isImage ? item.url : "",
          videoUrl: !isImage ? item.url : "",
        }),
      });

      if (!res.ok) {
        return;
      }

      const data = (await res.json()) as LikePayload;
      console.log("Like stored. Total likes:", data.totals.likesForCustomer);
    } catch {
      // ignore like errors from UI
    }
  };

  // -------- Render helpers --------

  const currentStill = stillItems[stillIndex] || null;
  const currentMotion = motionItems[motionIndex] || null;

  const imageCost = credits?.meta?.imageCost ?? 1;
  const motionCost = credits?.meta?.motionCost ?? 5;

  const canGenerateStill =
    !stillGenerating &&
    !!sessionId &&
    !!productImageUrl.trim() &&
    !!brief.trim();

  const canGenerateMotion =
    !motionGenerating &&
    !!sessionId &&
    !!currentStill &&
    !!motionDescription.trim();

  const creditsLabel = (() => {
    if (creditsLoading) return "Loading credits…";
    if (creditsError) return "Credits error";
    if (!credits) return "Credits —";
    return `Credits ${credits.balance}`;
  })();

  const isConnected = Boolean(health?.ok);

  // -------- JSX --------

  return (
    <div className="mina-root">
      {/* Header */}
      <header className="mina-header">
        <div className="mina-logo">MINA · Editorial AI</div>
        <div className="mina-header-right">
          <div className="mina-tabs">
            <button
              className={classNames(
                "tab",
                activeTab === "playground" && "active"
              )}
              onClick={() => setActiveTab("playground")}
            >
              Playground
            </button>
            <button
              className={classNames(
                "tab",
                activeTab === "profile" && "active"
              )}
              onClick={() => setActiveTab("profile")}
            >
              Profile
            </button>
          </div>
          <div className="mina-credits-badge">{creditsLabel}</div>
        </div>
      </header>

      {/* Main */}
      <main className="mina-main">
        {activeTab === "playground" ? (
          <div className="mina-layout">
            {/* LEFT – Steps / inputs */}
            <div className="mina-left">
              {/* STEP 1 – Connection & session */}
              <section className="mina-section">
                <div className="section-title">
                  <span
                    className={classNames(
                      "step-dot",
                      step1Done && "step-done"
                    )}
                  />
                  <span>01 · Connection & session</span>
                </div>
                <div className="section-body">
                  <div className="status-row">
                    <div className="status-label">API</div>
                    <div
                      className={classNames(
                        "status-chip",
                        isConnected && "ok",
                        healthError && "error"
                      )}
                    >
                      {checkingHealth
                        ? "Checking…"
                        : isConnected
                        ? "Connected"
                        : "Not connected"}
                    </div>
                    <button
                      className="link-button subtle"
                      onClick={handleCheckHealth}
                      disabled={checkingHealth}
                    >
                      Recheck
                    </button>
                  </div>
                  {health?.time && (
                    <div className="hint small">
                      Last ping:{" "}
                      {new Date(health.time).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  )}
                  {healthError && (
                    <div className="status-error">{healthError}</div>
                  )}

                  <div className="status-row">
                    <div className="status-label">Session</div>
                    <div
                      className={classNames(
                        "status-chip",
                        sessionId && "ok",
                        sessionError && "error"
                      )}
                    >
                      {sessionStarting
                        ? "Starting…"
                        : sessionId
                        ? "Active"
                        : "Idle"}
                    </div>
                    <button
                      className="link-button subtle"
                      onClick={handleStartSession}
                      disabled={sessionStarting}
                    >
                      Restart
                    </button>
                  </div>
                  {sessionError && (
                    <div className="status-error">{sessionError}</div>
                  )}
                </div>
              </section>

              {/* STEP 2 – Product & style */}
              <section className="mina-section">
                <div className="section-title">
                  <span
                    className={classNames(
                      "step-dot",
                      step2Done && "step-done"
                    )}
                  />
                  <span>02 · Product & style</span>
                </div>
                <div className="section-body">
                  <div className="field">
                    <div className="field-label">Hero product image URL</div>
                    <input
                      className="field-input"
                      placeholder="https://cdn.shopify.com/..."
                      value={productImageUrl}
                      onChange={(e) => setProductImageUrl(e.target.value)}
                    />
                    <div className="hint small">
                      Later this becomes real upload / drag & drop. For now,
                      paste an image URL from Shopify or CDN.
                    </div>
                  </div>

                  <div className="field">
                    <div className="field-label">Extra style reference URLs</div>
                    <textarea
                      className="field-textarea"
                      placeholder="Optional. One URL per line."
                      value={styleImageUrlsRaw}
                      onChange={(e) => setStyleImageUrlsRaw(e.target.value)}
                    />
                  </div>

                  <div className="field-row">
                    <div className="field field-inline">
                      <div className="field-label">Style preset</div>
                      <select
                        className="field-input"
                        value={stylePresetKey}
                        onChange={(e) => setStylePresetKey(e.target.value)}
                      >
                        <option value="soft-desert-editorial">
                          Soft desert editorial
                        </option>
                        <option value="chrome-neon-night">
                          Chrome neon night
                        </option>
                        <option value="bathroom-ritual">
                          Bathroom ritual
                        </option>
                      </select>
                    </div>
                    <div className="field-toggle">
                      <input
                        type="checkbox"
                        checked={minaVisionEnabled}
                        onChange={(e) =>
                          setMinaVisionEnabled(e.target.checked)
                        }
                      />
                      <span
                        className={classNames(
                          "toggle-label",
                          minaVisionEnabled ? "on" : "off"
                        )}
                      >
                        Mina Vision Intelligence
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              {/* STEP 3 – Brief & tone */}
              <section className="mina-section">
                <div className="section-title">
                  <span
                    className={classNames(
                      "step-dot",
                      step3Done && "step-done"
                    )}
                  />
                  <span>03 · Brief & format</span>
                </div>
                <div className="section-body">
                  <div className="field">
                    <div className="field-label">Brief</div>
                    <textarea
                      className="field-textarea"
                      placeholder="Tell Mina what you want to create…"
                      value={brief}
                      onChange={(e) => setBrief(e.target.value)}
                    />
                  </div>

                  <div className="field-row">
                    <div className="field field-inline">
                      <div className="field-label">Tone</div>
                      <input
                        className="field-input"
                        value={tone}
                        onChange={(e) => setTone(e.target.value)}
                      />
                    </div>
                    <div className="field field-inline">
                      <div className="field-label">Platform</div>
                      <select
                        className="field-input"
                        value={platform}
                        onChange={(e) => setPlatform(e.target.value)}
                      >
                        <option value="tiktok">TikTok / Reels (9:16)</option>
                        <option value="instagram">Instagram post (4:5)</option>
                        <option value="youtube">YouTube (16:9)</option>
                      </select>
                    </div>
                  </div>

                  <div className="section-actions">
                    <button
                      className="primary-button"
                      onClick={handleGenerateStill}
                      disabled={!canGenerateStill}
                    >
                      {stillGenerating
                        ? "Creating still…"
                        : `Create still (−${imageCost} credits)`}
                    </button>
                    {stillError && (
                      <div className="error-text">{stillError}</div>
                    )}
                  </div>
                </div>
              </section>

              {/* STEP 4 & 5 – Motion */}
              <section className="mina-section">
                <div className="section-title">
                  <span
                    className={classNames(
                      "step-dot",
                      step4Done && step5Done && "step-done"
                    )}
                  />
                  <span>04 · Motion loop</span>
                </div>
                <div className="section-body">
                  <div className="hint small">
                    Mina reads the current still, proposes a motion idea, then
                    Kling animates it.
                  </div>

                  <div className="field-row">
                    <button
                      className="secondary-button"
                      onClick={handleSuggestMotion}
                      disabled={
                        motionSuggestLoading ||
                        !stillItems.length ||
                        stillGenerating
                      }
                    >
                      {motionSuggestLoading
                        ? "Thinking motion…"
                        : "Suggest motion"}
                    </button>
                    <button
                      className="secondary-button"
                      onClick={handleGenerateMotion}
                      disabled={!canGenerateMotion}
                    >
                      {motionGenerating
                        ? "Animating…"
                        : `Create motion (−${motionCost} credits)`}
                    </button>
                  </div>

                  <div className="field">
                    <div className="field-label">Motion description</div>
                    <textarea
                      className="field-textarea"
                      placeholder="Wait for Mina’s idea… or type your own motion in 1–2 sentences."
                      value={motionDescription}
                      onChange={(e) => setMotionDescription(e.target.value)}
                    />
                  </div>

                  {motionError && (
                    <div className="status-error">{motionError}</div>
                  )}
                  {motionSuggestError && (
                    <div className="status-error">{motionSuggestError}</div>
                  )}
                </div>
              </section>
            </div>

            {/* RIGHT – Output / pile */}
            <div className="mina-right">
              {/* Stills */}
              <section className="mina-section">
                <div className="section-title">
                  <span
                    className={classNames(
                      "step-dot",
                      step4Done && "step-done"
                    )}
                  />
                  <span>Stills · Pile</span>
                </div>
                <div className="section-body">
                  <div className="output-shell">
                    {stillItems.length === 0 ? (
                      <div className="output-placeholder">
                        No stills yet. Fill steps 2 & 3, then “Create still”.
                      </div>
                    ) : (
                      <>
                        <div className="output-media">
                          {currentStill && (
                            <img
                              src={currentStill.url}
                              alt="Mina still"
                              loading="lazy"
                            />
                          )}
                        </div>
                        <div className="output-meta">
                          <div className="output-tag-row">
                            <div className="output-tag">
                              {stillIndex + 1} / {stillItems.length}
                            </div>
                            <div className="output-tag subtle">Still</div>
                          </div>
                          {currentStill && (
                            <>
                              <div className="output-prompt">
                                {currentStill.prompt}
                              </div>
                              <div className="hint small">
                                {formatTime(currentStill.createdAt)}
                              </div>
                            </>
                          )}
                          <div className="section-actions">
                            <button
                              className="secondary-button"
                              onClick={() =>
                                setStillIndex((prev) =>
                                  prev <= 0
                                    ? stillItems.length - 1
                                    : prev - 1
                                )
                              }
                              disabled={stillItems.length <= 1}
                            >
                              ◀
                            </button>
                            <button
                              className="secondary-button"
                              onClick={() =>
                                setStillIndex((prev) =>
                                  prev >= stillItems.length - 1 ? 0 : prev + 1
                                )
                              }
                              disabled={stillItems.length <= 1}
                            >
                              ▶
                            </button>
                            <button
                              className="link-button"
                              onClick={() => handleLike("image")}
                              disabled={!currentStill}
                            >
                              ♥ Like · “More of this”
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </section>

              {/* Motion */}
              <section className="mina-section">
                <div className="section-title">
                  <span
                    className={classNames(
                      "step-dot",
                      step5Done && "step-done"
                    )}
                  />
                  <span>Motion · Pile</span>
                </div>
                <div className="section-body">
                  <div className="output-shell">
                    {motionItems.length === 0 ? (
                      <div className="output-placeholder">
                        No motion yet. Generate a still, let Mina suggest motion,
                        then animate.
                      </div>
                    ) : (
                      <>
                        <div className="output-media">
                          {currentMotion && (
                            <video
                              src={currentMotion.url}
                              controls
                              playsInline
                              loop
                            />
                          )}
                        </div>
                        <div className="output-meta">
                          <div className="output-tag-row">
                            <div className="output-tag">
                              {motionIndex + 1} / {motionItems.length}
                            </div>
                            <div className="output-tag subtle">Motion</div>
                          </div>
                          {currentMotion && (
                            <>
                              <div className="output-prompt">
                                {currentMotion.prompt}
                              </div>
                              <div className="hint small">
                                {formatTime(currentMotion.createdAt)}
                              </div>
                            </>
                          )}
                          <div className="section-actions">
                            <button
                              className="secondary-button"
                              onClick={() =>
                                setMotionIndex((prev) =>
                                  prev <= 0
                                    ? motionItems.length - 1
                                    : prev - 1
                                )
                              }
                              disabled={motionItems.length <= 1}
                            >
                              ◀
                            </button>
                            <button
                              className="secondary-button"
                              onClick={() =>
                                setMotionIndex((prev) =>
                                  prev >= motionItems.length - 1 ? 0 : prev + 1
                                )
                              }
                              disabled={motionItems.length <= 1}
                            >
                              ▶
                            </button>
                            <button
                              className="link-button"
                              onClick={() => handleLike("motion")}
                              disabled={!currentMotion}
                            >
                              ♥ Like · “More of this”
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </div>
        ) : (
          // PROFILE TAB
          <div className="profile-layout">
            <section className="mina-section wide">
              <div className="section-title">
                <span className="step-dot step-done" />
                <span>Profile · Account & billing</span>
              </div>
              <div className="section-body">
                <div className="profile-body">
                  <div>
                    <div className="profile-label">Customer id</div>
                    <div className="profile-value">{devCustomerId}</div>
                    <div className="profile-hint">
                      Coming from Shopify customer. Later: real login / auth.
                    </div>
                  </div>
                  <div>
                    <div className="profile-label">Credits</div>
                    <div className="profile-value">
                      {credits?.balance ?? 0} Machta
                    </div>
                    <div className="profile-hint">
                      Image −{imageCost} · Motion −{motionCost} credits
                    </div>
                  </div>
                  <div className="auto-topup-row">
                    <div className="profile-label">Auto top-up</div>
                    <div className="field-toggle">
                      <input
                        type="checkbox"
                        checked={autoTopupEnabled}
                        onChange={(e) =>
                          setAutoTopupEnabled(e.target.checked)
                        }
                      />
                      <span
                        className={classNames(
                          "toggle-label",
                          autoTopupEnabled ? "on" : "off"
                        )}
                      >
                        Enable auto top-up like OpenAI API
                      </span>
                    </div>
                    <div className="auto-topup-grid">
                      <div className="field">
                        <div className="field-label">
                          Monthly limit{" "}
                          <span className="field-unit">(USD)</span>
                        </div>
                        <input
                          className="field-input"
                          type="number"
                          min={10}
                          value={autoTopupLimit}
                          onChange={(e) => setAutoTopupLimit(e.target.value)}
                        />
                      </div>
                      <div className="field">
                        <div className="field-label">Pack</div>
                        <select
                          className="field-input"
                          value={autoTopupPack}
                          onChange={(e) => setAutoTopupPack(e.target.value)}
                        >
                          <option value="MINA-50">Mina 50 Machta</option>
                          {/* later: more packs */}
                        </select>
                      </div>
                    </div>
                    <div className="profile-hint">
                      This is UI only for now. Later your admin dashboard will
                      connect this to Stripe + Shopify.
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="mina-section wide">
              <div className="section-title">
                <span className="step-dot" />
                <span>Gallery · Recent generations</span>
              </div>
              <div className="section-body">
                <div className="hint small">
                  Next step: this will pull real history from the Mina backend.
                  For now, only the current session lives in memory on the
                  server.
                </div>
                <div className="gallery-grid">
                  {stillItems.map((s) => (
                    <div key={s.id} className="gallery-item">
                      <div className="gallery-media">
                        <img src={s.url} alt="Still" loading="lazy" />
                      </div>
                      <div className="gallery-meta">
                        <div className="gallery-meta-top">
                          <span className="gallery-tag">Still</span>
                          <span className="gallery-date">
                            {formatTime(s.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {motionItems.map((m) => (
                    <div key={m.id} className="gallery-item">
                      <div className="gallery-media">
                        <video src={m.url} muted playsInline />
                      </div>
                      <div className="gallery-meta">
                        <div className="gallery-meta-top">
                          <span className="gallery-tag subtle">Motion</span>
                          <span className="gallery-date">
                            {formatTime(m.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {stillItems.length === 0 && motionItems.length === 0 && (
                    <div className="hint small">
                      No generations yet in this browser. Use Playground first.
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
