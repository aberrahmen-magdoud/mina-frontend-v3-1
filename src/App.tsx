// =======================
// PART 1 – Imports & constants
// =======================
import React, { useEffect, useState } from "react";
import "./index.css";

// IMPORTANT: your backend URL from Render
// Make sure VITE_MINA_API_BASE_URL is set in Render → Environment
const API_BASE_URL =
  import.meta.env.VITE_MINA_API_BASE_URL ||
  "https://mina-editorial-ai-api.onrender.com";

// For now, use a fixed test customer id so credits & likes work
const MOCK_CUSTOMER_ID = "8766256447571";

type Mode = "still" | "motion";

interface HealthPayload {
  ok: boolean;
  service?: string;
  time?: string;
}

interface CreditsPayload {
  ok: boolean;
  customerId: string;
  balance: number;
  historyLength?: number;
  meta?: {
    imageCost?: number;
    motionCost?: number;
  };
}

interface EditorialResponse {
  ok: boolean;
  message?: string;
  requestId?: string;
  prompt?: string;
  imageUrl?: string;
  imageUrls?: string[];
  generationId?: string;
  sessionId?: string;
  credits?: {
    balance: number;
    cost: number;
  };
  error?: string;
}

interface MotionSuggestResponse {
  ok: boolean;
  suggestion?: string;
  error?: string;
}

interface MotionResponse {
  ok: boolean;
  message?: string;
  videoUrl?: string;
  prompt?: string;
  generationId?: string;
  sessionId?: string;
  credits?: {
    balance: number;
    cost: number;
  };
  error?: string;
}

interface GenerationHistoryItem {
  id: string;
  kind: "image" | "motion";
  url: string;
  prompt: string;
  createdAt: string;
}

// Small helper
function classNames(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

// =======================
// PART 2 – Main App
// =======================

const App: React.FC = () => {
  // ---- Global state ----
  const [mode, setMode] = useState<Mode>("still");
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Health
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  // Credits
  const [credits, setCredits] = useState<number | null>(null);
  const [creditsMeta, setCreditsMeta] = useState<{
    imageCost?: number;
    motionCost?: number;
  }>({});
  const [creditsError, setCreditsError] = useState<string | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);

  // Toast / banner
  const [flash, setFlash] = useState<string | null>(null);

  // ---- Still image form ----
  const [productImageUrl, setProductImageUrl] = useState("");
  const [styleUrl1, setStyleUrl1] = useState("");
  const [styleUrl2, setStyleUrl2] = useState("");
  const [brief, setBrief] = useState("");
  const [tone, setTone] = useState("Poetic");
  const [platform, setPlatform] = useState("tiktok");
  const [minaVisionEnabled, setMinaVisionEnabled] = useState(true);
  const [stylePresetKey, setStylePresetKey] = useState("");

  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [currentImagePrompt, setCurrentImagePrompt] = useState<string | null>(
    null
  );
  const [currentImageGenId, setCurrentImageGenId] = useState<string | null>(
    null
  );
  const [imageFeedback, setImageFeedback] = useState("");

  // ---- Motion form ----
  const [motionReferenceUrl, setMotionReferenceUrl] = useState("");
  const [motionDescription, setMotionDescription] = useState("");
  const [motionTone, setMotionTone] = useState("Editorial calm");
  const [motionPlatform, setMotionPlatform] = useState("tiktok");
  const [durationSeconds, setDurationSeconds] = useState(5);

  const [isSuggestingMotion, setIsSuggestingMotion] = useState(false);
  const [isGeneratingMotion, setIsGeneratingMotion] = useState(false);
  const [motionError, setMotionError] = useState<string | null>(null);

  const [currentVideoUrl, setCurrentVideoUrl] = useState<string | null>(null);
  const [currentVideoPrompt, setCurrentVideoPrompt] = useState<string | null>(
    null
  );
  const [currentMotionGenId, setCurrentMotionGenId] = useState<string | null>(
    null
  );
  const [motionFeedback, setMotionFeedback] = useState("");

  // ---- Simple history (last 12 items) ----
  const [history, setHistory] = useState<GenerationHistoryItem[]>([]);

  // =======================
  // PART 3 – Helpers (API)
  // =======================

  function flashMessage(msg: string) {
    setFlash(msg);
    setTimeout(() => {
      setFlash((cur) => (cur === msg ? null : cur));
    }, 4000);
  }

  async function loadHealth() {
    try {
      setCheckingHealth(true);
      setHealthError(null);
      const res = await fetch(`${API_BASE_URL}/health`);
      const data: HealthPayload = await res.json();
      setHealth(data);
    } catch (err: any) {
      console.error("Health check error", err);
      setHealthError(err?.message || "Failed to reach Mina backend.");
    } finally {
      setCheckingHealth(false);
    }
  }

  async function loadCredits() {
    try {
      setCreditsLoading(true);
      setCreditsError(null);
      const res = await fetch(
        `${API_BASE_URL}/credits/balance?customerId=${encodeURIComponent(
          MOCK_CUSTOMER_ID
        )}`
      );
      const data: CreditsPayload = await res.json();
      if (!data.ok) {
        setCreditsError("Credits API responded with error.");
        return;
      }
      setCredits(data.balance);
      if (data.meta) setCreditsMeta(data.meta);
    } catch (err: any) {
      console.error("Credits error", err);
      setCreditsError(err?.message || "Failed to load credits.");
    } finally {
      setCreditsLoading(false);
    }
  }

  async function ensureSession(currentPlatform: string): Promise<string> {
    if (sessionId) return sessionId;
    const res = await fetch(`${API_BASE_URL}/sessions/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: MOCK_CUSTOMER_ID,
        platform: currentPlatform,
        title: "Mina session",
      }),
    });
    const data = await res.json();
    if (!data.ok || !data.session?.id) {
      throw new Error("Could not start Mina session");
    }
    setSessionId(data.session.id);
    return data.session.id;
  }

  async function devTopUp() {
    try {
      const res = await fetch(`${API_BASE_URL}/credits/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: MOCK_CUSTOMER_ID,
          amount: 9999999,
          reason: "dev-topup",
          source: "ui",
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        flashMessage("Top up failed.");
        return;
      }
      flashMessage("Dev Machta added ✔");
      loadCredits();
    } catch (err) {
      console.error("Top up error", err);
      flashMessage("Top up error.");
    }
  }

  // =======================
  // PART 4 – Still generation
  // =======================

  async function handleGenerateImage() {
    try {
      setIsGeneratingImage(true);
      setImageError(null);
      setMode("still");

      if (!productImageUrl && !brief) {
        setImageError(
          "Give Mina at least a product image or a brief so she knows what to create."
        );
        return;
      }

      const sId = await ensureSession(platform);

      const styleImageUrls = [styleUrl1, styleUrl2].filter((u) => u.trim());
      const body = {
        customerId: MOCK_CUSTOMER_ID,
        sessionId: sId,
        productImageUrl: productImageUrl.trim() || undefined,
        styleImageUrls,
        brief: brief.trim() || undefined,
        tone: tone.trim() || undefined,
        platform,
        minaVisionEnabled,
        stylePresetKey: stylePresetKey || undefined,
      };

      const res = await fetch(`${API_BASE_URL}/editorial/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data: EditorialResponse = await res.json();
      if (!data.ok) {
        const msg =
          data.message ||
          data.error ||
          "Mina could not finish this editorial generation.";
        setImageError(msg);
        flashMessage(msg);
        return;
      }

      if (data.imageUrl) {
        setCurrentImageUrl(data.imageUrl);
        setCurrentImagePrompt(data.prompt || "");
        setCurrentImageGenId(data.generationId || null);
        setMotionReferenceUrl(data.imageUrl); // auto pass into motion

        const newItem: GenerationHistoryItem = {
          id: data.generationId || `img-${Date.now()}`,
          kind: "image",
          url: data.imageUrl,
          prompt: data.prompt || "",
          createdAt: new Date().toISOString(),
        };
        setHistory((prev) => [newItem, ...prev].slice(0, 12));
      }

      if (data.credits?.balance !== undefined) {
        setCredits(data.credits.balance);
      }

      flashMessage("Mina finished a still-life frame ✨");
    } catch (err: any) {
      console.error("Image generation error", err);
      const msg =
        err?.message || "Unexpected error during editorial generation.";
      setImageError(msg);
      flashMessage(msg);
    } finally {
      setIsGeneratingImage(false);
    }
  }

  async function handleLikeImage() {
    if (!currentImageUrl || !currentImagePrompt) {
      flashMessage("Generate an image first.");
      return;
    }
    try {
      const body = {
        customerId: MOCK_CUSTOMER_ID,
        resultType: "image",
        platform,
        prompt: currentImagePrompt,
        comment: imageFeedback.trim() || undefined,
        imageUrl: currentImageUrl,
        videoUrl: undefined,
        sessionId: sessionId || undefined,
        generationId: currentImageGenId || undefined,
      };

      const res = await fetch(`${API_BASE_URL}/feedback/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!data.ok) {
        flashMessage("Could not save Mina Vision like.");
        return;
      }
      flashMessage("Saved to Mina Vision Intelligence 💛");
    } catch (err) {
      console.error("Like image error", err);
      flashMessage("Error while saving like.");
    }
  }

  // =======================
  // PART 5 – Motion flows
  // =======================

  async function handleSuggestMotion() {
    try {
      setIsSuggestingMotion(true);
      setMotionError(null);

      const refUrl =
        motionReferenceUrl.trim() || currentImageUrl || productImageUrl;
      if (!refUrl) {
        setMotionError("Mina needs a still frame to imagine the motion.");
        return;
      }

      const body = {
        customerId: MOCK_CUSTOMER_ID,
        referenceImageUrl: refUrl,
        tone: motionTone.trim() || undefined,
        platform: motionPlatform,
        minaVisionEnabled,
        stylePresetKey: stylePresetKey || undefined,
      };

      const res = await fetch(`${API_BASE_URL}/motion/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data: MotionSuggestResponse = await res.json();
      if (!data.ok || !data.suggestion) {
        const msg =
          data.error || "Mina couldn't suggest a motion idea this time.";
        setMotionError(msg);
        flashMessage(msg);
        return;
      }

      setMotionDescription(data.suggestion);
      flashMessage("Mina suggested a motion idea 💭");
    } catch (err: any) {
      console.error("Motion suggest error", err);
      const msg =
        err?.message || "Unexpected error while suggesting motion idea.";
      setMotionError(msg);
      flashMessage(msg);
    } finally {
      setIsSuggestingMotion(false);
    }
  }

  async function handleGenerateMotion() {
    try {
      setIsGeneratingMotion(true);
      setMotionError(null);
      setMode("motion");

      const refUrl =
        motionReferenceUrl.trim() || currentImageUrl || productImageUrl;
      if (!refUrl) {
        setMotionError("Mina needs a still frame to animate.");
        return;
      }
      if (!motionDescription.trim()) {
        setMotionError("Describe the motion or let Mina suggest one.");
        return;
      }

      const sId = await ensureSession(motionPlatform);

      const body = {
        customerId: MOCK_CUSTOMER_ID,
        sessionId: sId,
        lastImageUrl: refUrl,
        motionDescription: motionDescription.trim(),
        tone: motionTone.trim() || undefined,
        platform: motionPlatform,
        minaVisionEnabled,
        stylePresetKey: stylePresetKey || undefined,
        durationSeconds,
      };

      const res = await fetch(`${API_BASE_URL}/motion/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data: MotionResponse = await res.json();
      if (!data.ok) {
        const msg =
          data.message ||
          data.error ||
          "Mina could not finish this motion clip.";
        setMotionError(msg);
        flashMessage(msg);
        return;
      }

      if (data.videoUrl) {
        setCurrentVideoUrl(data.videoUrl);
        setCurrentVideoPrompt(data.prompt || "");
        setCurrentMotionGenId(data.generationId || null);

        const newItem: GenerationHistoryItem = {
          id: data.generationId || `motion-${Date.now()}`,
          kind: "motion",
          url: data.videoUrl,
          prompt: data.prompt || "",
          createdAt: new Date().toISOString(),
        };
        setHistory((prev) => [newItem, ...prev].slice(0, 12));
      }

      if (data.credits?.balance !== undefined) {
        setCredits(data.credits.balance);
      }

      flashMessage("Mina finished a motion clip 🎬");
    } catch (err: any) {
      console.error("Motion generation error", err);
      const msg =
        err?.message || "Unexpected error during motion generation.";
      setMotionError(msg);
      flashMessage(msg);
    } finally {
      setIsGeneratingMotion(false);
    }
  }

  async function handleLikeMotion() {
    if (!currentVideoUrl || !currentVideoPrompt) {
      flashMessage("Generate a motion clip first.");
      return;
    }
    try {
      const body = {
        customerId: MOCK_CUSTOMER_ID,
        resultType: "motion",
        platform: motionPlatform,
        prompt: currentVideoPrompt,
        comment: motionFeedback.trim() || undefined,
        imageUrl: undefined,
        videoUrl: currentVideoUrl,
        sessionId: sessionId || undefined,
        generationId: currentMotionGenId || undefined,
      };

      const res = await fetch(`${API_BASE_URL}/feedback/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!data.ok) {
        flashMessage("Could not save Mina Vision like for motion.");
        return;
      }
      flashMessage("Saved motion to Mina Vision Intelligence 💛");
    } catch (err) {
      console.error("Like motion error", err);
      flashMessage("Error while saving motion like.");
    }
  }

  // =======================
  // PART 6 – Effects
  // =======================

  useEffect(() => {
    loadHealth();
    loadCredits();
  }, []);

  // =======================
  // PART 7 – UI sections
  // =======================

  const creditsLabel =
    credits === null
      ? "–"
      : credits.toLocaleString("en-US", { maximumFractionDigits: 0 });

  const imageCostLabel = creditsMeta.imageCost ?? 1;
  const motionCostLabel = creditsMeta.motionCost ?? 5;

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#EEEED2",
        color: "#080A00",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Top bar */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 24px",
          borderBottom: "1px solid rgba(8,10,0,0.12)",
          fontFamily: '"Schibsted Grotesk", system-ui, -apple-system, sans-serif',
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Mina Editorial AI</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            {checkingHealth
              ? "Checking backend…"
              : health?.ok
              ? `Online · ${health?.service ?? ""}`
              : healthError
              ? `Offline · ${healthError}`
              : "Status unknown"}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 16,
            alignItems: "center",
            fontSize: 12,
          }}
        >
          <div style={{ opacity: 0.7 }}>
            Image: {imageCostLabel} Machta · Motion: {motionCostLabel} Machta
          </div>
          <div
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid rgba(8,10,0,0.18)",
              backgroundColor: "#F6F4E5",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 11, textTransform: "uppercase" }}>
              Credits
            </span>
            <span style={{ fontSize: 14, fontWeight: 600 }}>
              {creditsLoading ? "…" : creditsLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={devTopUp}
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: 0.1,
              border: "none",
              background: "none",
              cursor: "pointer",
              opacity: 0.6,
            }}
          >
            + 9,999,999 Machta (dev)
          </button>
        </div>
      </header>

      {/* Flash */}
      {flash && (
        <div
          style={{
            padding: "8px 24px",
            fontSize: 13,
            backgroundColor: "#080A00",
            color: "#EEEED2",
          }}
        >
          {flash}
        </div>
      )}

      {/* Main body: 50/50 split */}
      <main
        style={{
          flex: 1,
          display: "flex",
          minHeight: 0,
        }}
      >
        {/* LEFT – controls */}
        <div
          style={{
            width: "50%",
            borderRight: "1px solid rgba(8,10,0,0.12)",
            padding: "24px 24px 32px",
            display: "flex",
            flexDirection: "column",
            gap: 24,
            fontFamily:
              '"Schibsted Grotesk", system-ui, -apple-system, sans-serif',
          }}
        >
          {/* Mode tabs */}
          <div
            style={{
              display: "flex",
              gap: 12,
              marginBottom: 4,
            }}
          >
            <button
              type="button"
              onClick={() => setMode("still")}
              style={{
                border: "none",
                background: "none",
                cursor: "pointer",
                padding: "4px 0",
                fontSize: 14,
                fontWeight: mode === "still" ? 600 : 400,
                opacity: mode === "still" ? 1 : 0.5,
                borderBottom:
                  mode === "still"
                    ? "2px solid rgba(8,10,0,0.9)"
                    : "2px solid transparent",
              }}
            >
              Still
            </button>
            <button
              type="button"
              onClick={() => setMode("motion")}
              style={{
                border: "none",
                background: "none",
                cursor: "pointer",
                padding: "4px 0",
                fontSize: 14,
                fontWeight: mode === "motion" ? 600 : 400,
                opacity: mode === "motion" ? 1 : 0.5,
                borderBottom:
                  mode === "motion"
                    ? "2px solid rgba(8,10,0,0.9)"
                    : "2px solid transparent",
              }}
            >
              Motion
            </button>
          </div>

          {/* Shared toggles */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              fontSize: 13,
              opacity: minaVisionEnabled ? 1 : 0.6,
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={minaVisionEnabled}
                onChange={(e) => setMinaVisionEnabled(e.target.checked)}
              />
              <span>Mina Vision Intelligence</span>
            </label>

            <select
              value={stylePresetKey}
              onChange={(e) => setStylePresetKey(e.target.value)}
              style={{
                fontSize: 12,
                border: "none",
                borderBottom: "1px solid rgba(8,10,0,0.25)",
                background: "transparent",
                padding: "2px 0",
              }}
            >
              <option value="">No preset</option>
              <option value="soft-desert-editorial">
                Soft Desert Editorial
              </option>
              <option value="chrome-neon-night">Chrome Neon Night</option>
              <option value="bathroom-ritual">Bathroom Ritual</option>
            </select>
          </div>

          {/* Mode content */}
          {mode === "still" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Step 1</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>
                  Product & references
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <label style={{ fontSize: 13 }}>
                  Product image URL
                  <input
                    type="text"
                    value={productImageUrl}
                    onChange={(e) => setProductImageUrl(e.target.value)}
                    placeholder="https://… main product image"
                    style={{
                      width: "100%",
                      border: "none",
                      borderBottom: "1px solid rgba(8,10,0,0.25)",
                      background: "transparent",
                      padding: "4px 0",
                      fontSize: 13,
                    }}
                  />
                </label>

                <label style={{ fontSize: 13 }}>
                  Style reference URL 1
                  <input
                    type="text"
                    value={styleUrl1}
                    onChange={(e) => setStyleUrl1(e.target.value)}
                    placeholder="https://… editorial mood"
                    style={{
                      width: "100%",
                      border: "none",
                      borderBottom: "1px solid rgba(8,10,0,0.25)",
                      background: "transparent",
                      padding: "4px 0",
                      fontSize: 13,
                    }}
                  />
                </label>

                <label style={{ fontSize: 13 }}>
                  Style reference URL 2 (optional)
                  <input
                    type="text"
                    value={styleUrl2}
                    onChange={(e) => setStyleUrl2(e.target.value)}
                    placeholder="https://… second mood"
                    style={{
                      width: "100%",
                      border: "none",
                      borderBottom: "1px solid rgba(8,10,0,0.25)",
                      background: "transparent",
                      padding: "4px 0",
                      fontSize: 13,
                    }}
                  />
                </label>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>Step 2</div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>
                    Brand brief
                  </div>
                </div>

                <textarea
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder="Tell Mina what you want to create. Brand context, mood, story…"
                  rows={4}
                  style={{
                    width: "100%",
                    border: "1px solid rgba(8,10,0,0.15)",
                    background: "rgba(255,255,255,0.4)",
                    padding: 8,
                    fontSize: 13,
                    resize: "vertical",
                  }}
                />

                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <label style={{ fontSize: 13 }}>
                    Tone
                    <input
                      type="text"
                      value={tone}
                      onChange={(e) => setTone(e.target.value)}
                      style={{
                        border: "none",
                        borderBottom: "1px solid rgba(8,10,0,0.25)",
                        background: "transparent",
                        padding: "4px 0",
                        fontSize: 13,
                        marginLeft: 8,
                      }}
                    />
                  </label>

                  <label style={{ fontSize: 13 }}>
                    Format
                    <select
                      value={platform}
                      onChange={(e) => setPlatform(e.target.value)}
                      style={{
                        border: "none",
                        borderBottom: "1px solid rgba(8,10,0,0.25)",
                        background: "transparent",
                        padding: "4px 0",
                        fontSize: 13,
                        marginLeft: 4,
                      }}
                    >
                      <option value="tiktok">TikTok / Reels (9:16)</option>
                      <option value="instagram-post">Instagram post (4:5)</option>
                      <option value="youtube">YouTube (16:9)</option>
                    </select>
                  </label>
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={handleGenerateImage}
                  disabled={isGeneratingImage}
                  style={{
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: 0.1,
                    opacity: isGeneratingImage ? 0.5 : 1,
                  }}
                >
                  {isGeneratingImage
                    ? "Mina is composing the frame…"
                    : "Create still"}
                </button>
                {imageError && (
                  <div style={{ fontSize: 12, color: "#A01010", marginTop: 6 }}>
                    {imageError}
                  </div>
                )}
              </div>

              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
                  Tell Mina what you liked
                </div>
                <textarea
                  value={imageFeedback}
                  onChange={(e) => setImageFeedback(e.target.value)}
                  placeholder="“I like the simplicity of the backdrop, but the light is too strong…”"
                  rows={2}
                  style={{
                    width: "100%",
                    border: "1px solid rgba(8,10,0,0.15)",
                    background: "rgba(255,255,255,0.3)",
                    padding: 6,
                    fontSize: 12,
                    resize: "vertical",
                  }}
                />
                <button
                  type="button"
                  onClick={handleLikeImage}
                  style={{
                    marginTop: 4,
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    fontSize: 12,
                    opacity: 0.8,
                  }}
                >
                  ❤️ Save this to Mina Vision
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Step 1</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>
                  Reference frame
                </div>
              </div>

              <label style={{ fontSize: 13 }}>
                Still to animate (URL)
                <input
                  type="text"
                  value={motionReferenceUrl}
                  onChange={(e) => setMotionReferenceUrl(e.target.value)}
                  placeholder="Leave empty to use the last generated still"
                  style={{
                    width: "100%",
                    border: "none",
                    borderBottom: "1px solid rgba(8,10,0,0.25)",
                    background: "transparent",
                    padding: "4px 0",
                    fontSize: 13,
                  }}
                />
              </label>

              <div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Step 2</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>
                  Motion idea
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <label style={{ fontSize: 13 }}>
                    Tone
                    <input
                      type="text"
                      value={motionTone}
                      onChange={(e) => setMotionTone(e.target.value)}
                      style={{
                        border: "none",
                        borderBottom: "1px solid rgba(8,10,0,0.25)",
                        background: "transparent",
                        padding: "4px 0",
                        fontSize: 13,
                        marginLeft: 8,
                      }}
                    />
                  </label>

                  <label style={{ fontSize: 13 }}>
                    Format
                    <select
                      value={motionPlatform}
                      onChange={(e) => setMotionPlatform(e.target.value)}
                      style={{
                        border: "none",
                        borderBottom: "1px solid rgba(8,10,0,0.25)",
                        background: "transparent",
                        padding: "4px 0",
                        fontSize: 13,
                        marginLeft: 4,
                      }}
                    >
                      <option value="tiktok">TikTok / Reels</option>
                      <option value="youtube">YouTube horizontal</option>
                    </select>
                  </label>

                  <label style={{ fontSize: 13 }}>
                    Duration (s)
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={durationSeconds}
                      onChange={(e) =>
                        setDurationSeconds(
                          Math.min(10, Math.max(1, Number(e.target.value) || 5))
                        )
                      }
                      style={{
                        width: 48,
                        marginLeft: 8,
                        border: "none",
                        borderBottom: "1px solid rgba(8,10,0,0.25)",
                        background: "transparent",
                        padding: "4px 0",
                        fontSize: 13,
                      }}
                    />
                  </label>
                </div>

                <textarea
                  value={motionDescription}
                  onChange={(e) => setMotionDescription(e.target.value)}
                  placeholder="Mina will suggest a motion idea if you press “Suggest motion idea”"
                  rows={3}
                  style={{
                    width: "100%",
                    border: "1px solid rgba(8,10,0,0.15)",
                    background: "rgba(255,255,255,0.4)",
                    padding: 8,
                    fontSize: 13,
                  }}
                />

                <div
                  style={{
                    display: "flex",
                    gap: 16,
                    marginTop: 4,
                    alignItems: "center",
                  }}
                >
                  <button
                    type="button"
                    onClick={handleSuggestMotion}
                    disabled={isSuggestingMotion}
                    style={{
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      fontSize: 13,
                      opacity: isSuggestingMotion ? 0.5 : 0.9,
                    }}
                  >
                    💭{" "}
                    {isSuggestingMotion
                      ? "Mina is reading the frame…"
                      : "Suggest motion idea"}
                  </button>

                  <button
                    type="button"
                    onClick={handleGenerateMotion}
                    disabled={isGeneratingMotion}
                    style={{
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      fontSize: 14,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: 0.1,
                      opacity: isGeneratingMotion ? 0.5 : 1,
                    }}
                  >
                    {isGeneratingMotion
                      ? "Mina is animating…"
                      : "Create motion"}
                  </button>
                </div>

                {motionError && (
                  <div style={{ fontSize: 12, color: "#A01010", marginTop: 6 }}>
                    {motionError}
                  </div>
                )}
              </div>

              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
                  Tell Mina what you liked in the clip
                </div>
                <textarea
                  value={motionFeedback}
                  onChange={(e) => setMotionFeedback(e.target.value)}
                  placeholder="“I like the slow camera move, but I want less shake…”"
                  rows={2}
                  style={{
                    width: "100%",
                    border: "1px solid rgba(8,10,0,0.15)",
                    background: "rgba(255,255,255,0.3)",
                    padding: 6,
                    fontSize: 12,
                  }}
                />
                <button
                  type="button"
                  onClick={handleLikeMotion}
                  style={{
                    marginTop: 4,
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    fontSize: 12,
                    opacity: 0.8,
                  }}
                >
                  ❤️ Save this motion to Mina Vision
                </button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT – preview + history */}
        <div
          style={{
            width: "50%",
            display: "flex",
            flexDirection: "column",
            padding: "24px 24px 32px",
            gap: 16,
          }}
        >
          {/* Preview */}
          <div
            style={{
              flex: 1,
              borderRadius: 16,
              overflow: "hidden",
              background:
                "radial-gradient(circle at top, #F6F4E5 0, #E2E0CF 40%, #D6D3C0 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            {!currentImageUrl && !currentVideoUrl ? (
              <div
                style={{
                  fontSize: 13,
                  opacity: 0.7,
                  textAlign: "center",
                  padding: 24,
                  maxWidth: 260,
                }}
              >
                Your stills and motion will appear here. Start with a product
                image and a brief on the left, and let Mina compose the frame.
              </div>
            ) : mode === "motion" && currentVideoUrl ? (
              <video
                src={currentVideoUrl}
                controls
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  display: "block",
                }}
              />
            ) : currentImageUrl ? (
              <img
                src={currentImageUrl}
                alt="Mina editorial"
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            ) : null}
          </div>

          {/* Simple history strip */}
          <div>
            <div
              style={{
                fontSize: 12,
                opacity: 0.7,
                marginBottom: 4,
              }}
            >
              Recent generations
            </div>
            {history.length === 0 ? (
              <div style={{ fontSize: 12, opacity: 0.5 }}>
                Nothing yet. Mina will remember the last stills and clips you
                create here.
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  overflowX: "auto",
                  paddingBottom: 4,
                }}
              >
                {history.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.kind === "image") {
                        setMode("still");
                        setCurrentImageUrl(item.url);
                        setCurrentImagePrompt(item.prompt);
                      } else {
                        setMode("motion");
                        setCurrentVideoUrl(item.url);
                        setCurrentVideoPrompt(item.prompt);
                      }
                    }}
                    title={item.prompt}
                    style={{
                      border: "none",
                      padding: 0,
                      borderRadius: 8,
                      overflow: "hidden",
                      minWidth: 64,
                      minHeight: 64,
                      background: "#D6D3C0",
                      cursor: "pointer",
                      position: "relative",
                    }}
                  >
                    {item.kind === "image" ? (
                      <img
                        src={item.url}
                        alt="thumb"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    ) : (
                      <>
                        <video
                          src={item.url}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            display: "block",
                          }}
                          muted
                        />
                        <div
                          style={{
                            position: "absolute",
                            bottom: 4,
                            right: 4,
                            fontSize: 10,
                            backgroundColor: "rgba(8,10,0,0.7)",
                            color: "#EEEED2",
                            padding: "2px 4px",
                            borderRadius: 999,
                          }}
                        >
                          Motion
                        </div>
                      </>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
