// ==============================================
// 1. Imports & environment
// ==============================================
import React, { useEffect, useState, useRef } from "react";
import { supabase } from "./lib/supabaseClient";

const API_BASE_URL = import.meta.env.VITE_MINA_API_BASE_URL || "";
const TOPUP_URL =
  import.meta.env.VITE_MINA_TOPUP_URL ||
  "https://www.faltastudio.com/checkouts/cn/hWN6EhbqQW5KrdIuBO3j5HKV/en-ae?_r=AQAB9NY_ccOV_da3y7VmTxJU-dDoLEOCdhP9sg2YlvDwLQQ";

// ==============================================
// 2. Types
// ==============================================

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

type ApiGeneration = {
  id: string;
  type: "image" | "motion";
  sessionId: string;
  customerId: string;
  platform: string;
  prompt: string;
  outputUrl: string;
  createdAt: string;
  meta?: Record<string, any>;
};

type CreditsHistoryEntry = {
  delta: number;
  reason: string;
  source: string;
  at: string;
};

type CustomerHistory = {
  ok: boolean;
  customerId: string;
  credits: {
    balance: number;
    history: CreditsHistoryEntry[];
  };
  generations: ApiGeneration[];
  feedbacks: any[];
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

// 2.1 Aspect & style options (pure UI)

type AspectKey = "9-16" | "4-5" | "2-3" | "1-1";

type AspectOption = {
  key: AspectKey;
  label: string;
  subtitle: string;
  ratio: string; // e.g. "9:16"
  platform: "tiktok" | "instagram" | "printing" | "square";
  iconUrl: string;
};

const ASPECT_OPTIONS: AspectOption[] = [
  {
    key: "9-16",
    label: "9:16",
    subtitle: "Tiktok/Reel",
    ratio: "9:16",
    platform: "tiktok",
    iconUrl:
      "https://cdn.shopify.com/s/files/1/0678/9254/3571/files/tiktokreels_icon_e116174c-afc7-4174-9cf0-f24a07c8517b.svg?v=1765425956",
  },
  {
    key: "4-5",
    label: "4:5",
    subtitle: "Post",
    ratio: "4:5",
    platform: "instagram",
    iconUrl:
      "https://cdn.shopify.com/s/files/1/0678/9254/3571/files/post_icon_f646fcb5-03be-4cf5-b25c-b1ec38f6794e.svg?v=1765425956",
  },
  {
    key: "2-3",
    label: "2:3",
    subtitle: "Printing",
    ratio: "2:3",
    platform: "printing",
    iconUrl:
      "https://cdn.shopify.com/s/files/1/0678/9254/3571/files/Printing_icon_c7252c7d-863e-4efb-89c4-669261119d61.svg?v=1765425956",
  },
  {
    key: "1-1",
    label: "1:1",
    subtitle: "Square",
    ratio: "1:1",
    platform: "square",
    iconUrl:
      "https://cdn.shopify.com/s/files/1/0678/9254/3571/files/square_icon_901d47a8-44a8-4ab9-b412-2224e97fd9d9.svg?v=1765425956",
  },
];

type StyleKey =
  | "soft-desert-editorial"
  | "chrome-neon-night"
  | "bathroom-ritual"
  | "custom";

type StyleOption = {
  key: StyleKey;
  label: string;
  imageUrl: string;
};

// NOTE: imageUrl values are placeholders – purely visual.
const STYLE_OPTIONS: StyleOption[] = [
  {
    key: "soft-desert-editorial",
    label: "Vintage",
    imageUrl:
      "https://cdn.shopify.com/s/files/1/0678/9254/3571/files/style_vintage.jpg?v=1",
  },
  {
    key: "chrome-neon-night",
    label: "Gradient",
    imageUrl:
      "https://cdn.shopify.com/s/files/1/0678/9254/3571/files/style_gradient.jpg?v=1",
  },
  {
    key: "bathroom-ritual",
    label: "Back light",
    imageUrl:
      "https://cdn.shopify.com/s/files/1/0678/9254/3571/files/style_backlight.jpg?v=1",
  },
  {
    key: "custom",
    label: "Style 1",
    imageUrl:
      "https://cdn.shopify.com/s/files/1/0678/9254/3571/files/style_1.jpg?v=1",
  },
];

// ==============================================
// 3. Helpers
// ==============================================

const devCustomerId = "8766256447571";

function getInitialCustomerId(initialCustomerId?: string): string {
  try {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get("customerId");
      if (fromUrl && fromUrl.trim().length > 0) {
        return fromUrl.trim();
      }
      const stored = window.localStorage.getItem("minaCustomerId");
      if (stored && stored.trim().length > 0) {
        return stored.trim();
      }
    }
  } catch {
    // ignore
  }

  if (initialCustomerId && initialCustomerId.trim().length > 0) {
    return initialCustomerId.trim();
  }

  return "";
}

function formatTime(ts?: string) {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    return d.toLocaleString();
  } catch {
    return ts;
  }
}

function classNames(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts.filter(Boolean).join(" ");
}

// ==============================================
// 4. Component props
// ==============================================

type MinaAppProps = {
  initialCustomerId?: string;
};

// ==============================================
// 5. MinaApp component
// ==============================================

function MinaApp({ initialCustomerId }: MinaAppProps) {
  // --------------------------------------------
  // 5.1 Routing & identity
  // --------------------------------------------
  const [activeTab, setActiveTab] = useState<"studio" | "profile">("studio");
  const [customerId, setCustomerId] = useState(() =>
    getInitialCustomerId(initialCustomerId)
  );

  // --------------------------------------------
  // 5.2 Health, credits, session, history
  // --------------------------------------------
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  const [credits, setCredits] = useState<CreditsBalance | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [creditsError, setCreditsError] = useState<string | null>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStarting, setSessionStarting] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const [history, setHistory] = useState<CustomerHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // --------------------------------------------
  // 5.3 Studio – left side (prompt, aspect, uploads, style)
  // --------------------------------------------
  const [brief, setBrief] = useState("");
  const [aspectIndex, setAspectIndex] = useState(0);
  const [stylePresetKey, setStylePresetKey] =
    useState<StyleKey>("soft-desert-editorial");
  const [minaVisionEnabled, setMinaVisionEnabled] = useState(true);
  const [tone] = useState("Poetic");

  // upload (local only for now)
  const [productImageUrl, setProductImageUrl] = useState("");
  const [brandLogoUrl, setBrandLogoUrl] = useState("");
  const [activeUploadTarget, setActiveUploadTarget] = useState<
    "product" | "logo" | null
  >(null);
  const [productPreviewUrl, setProductPreviewUrl] = useState<string | null>(
    null
  );
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [isDraggingUpload, setIsDraggingUpload] = useState(false);

  const productInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  // --------------------------------------------
  // 5.4 Studio – right side (stills & motion)
  // --------------------------------------------
  const [stillItems, setStillItems] = useState<StillItem[]>([]);
  const [stillIndex, setStillIndex] = useState(0);
  const [motionItems, setMotionItems] = useState<MotionItem[]>([]);
  const [motionIndex, setMotionIndex] = useState(0);
  const [outputMode, setOutputMode] = useState<"still" | "motion">("still");

  const [stillGenerating, setStillGenerating] = useState(false);
  const [stillError, setStillError] = useState<string | null>(null);

  const [motionDescription, setMotionDescription] = useState("");
  const [motionSuggestLoading, setMotionSuggestLoading] = useState(false);
  const [motionSuggestError, setMotionSuggestError] = useState<string | null>(
    null
  );
  const [motionGenerating, setMotionGenerating] = useState(false);
  const [motionError, setMotionError] = useState<string | null>(null);

  // --------------------------------------------
  // 5.5 Studio – feedback
  // --------------------------------------------
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // ============================================
  // 6. Effects – persist customer, bootstrap data
  // ============================================

  // 6.1 persist customer id
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("minaCustomerId", customerId);
      }
    } catch {
      // ignore
    }
  }, [customerId]);

  // 6.2 bootstrap on customer change
  useEffect(() => {
    if (!customerId || !API_BASE_URL) return;

    const bootstrap = async () => {
      await handleCheckHealth();
      await handleFetchCredits();
      await handleStartSession();
      await fetchHistory(customerId);
    };

    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  // ============================================
  // 7. API helpers – health, credits, session, history
  // ============================================

  async function handleCheckHealth() {
    if (!API_BASE_URL) {
      setHealthError("Missing API base URL.");
      return;
    }
    try {
      setCheckingHealth(true);
      setHealthError(null);
      const res = await fetch(`${API_BASE_URL}/health`);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = (await res.json()) as HealthPayload;
      setHealth(data);
    } catch (err: any) {
      setHealthError(err?.message || "Failed to reach Mina.");
    } finally {
      setCheckingHealth(false);
    }
  }

  async function handleFetchCredits() {
    const trimmedId = customerId?.trim();
    if (!trimmedId || !API_BASE_URL) {
      setCredits(null);
      return;
    }
    try {
      setCreditsLoading(true);
      setCreditsError(null);
      const res = await fetch(
        `${API_BASE_URL}/credits/balance?customerId=${encodeURIComponent(
          trimmedId
        )}`
      );
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = (await res.json()) as CreditsBalance;
      setCredits(data);
    } catch (err: any) {
      setCreditsError(err?.message || "Failed to load credits.");
    } finally {
      setCreditsLoading(false);
    }
  }

  async function handleStartSession() {
    const trimmedId = customerId?.trim();
    if (!trimmedId || !API_BASE_URL) return;

    const aspect = ASPECT_OPTIONS[aspectIndex] || ASPECT_OPTIONS[0];

    try {
      setSessionStarting(true);
      setSessionError(null);
      const res = await fetch(`${API_BASE_URL}/sessions/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: trimmedId,
          platform: aspect.platform,
          title: "Mina Studio session",
        }),
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      if (data?.session?.id) {
        setSessionId(data.session.id);
      } else {
        throw new Error("Missing session id.");
      }
    } catch (err: any) {
      setSessionError(err?.message || "Failed to start session.");
    } finally {
      setSessionStarting(false);
    }
  }

  async function fetchHistory(cid: string) {
    const trimmedId = cid?.trim();
    if (!trimmedId || !API_BASE_URL) {
      setHistory(null);
      return;
    }
    try {
      setHistoryLoading(true);
      setHistoryError(null);
      const res = await fetch(
        `${API_BASE_URL}/history/customer/${encodeURIComponent(trimmedId)}`
      );
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = (await res.json()) as CustomerHistory;
      setHistory(data);
    } catch (err: any) {
      setHistoryError(err?.message || "Failed to load history.");
    } finally {
      setHistoryLoading(false);
    }
  }

  // ============================================
  // 8. API helpers – stills, motion, feedback
  // ============================================

  async function handleGenerateStill() {
    if (!API_BASE_URL) {
      setStillError("Missing API base URL.");
      return;
    }
    if (!sessionId) {
      setStillError("Session not started yet.");
      return;
    }
    const briefText = brief.trim();
    if (!briefText || briefText.length < 40) {
      setStillError("Type at least 40 characters first.");
      return;
    }

    const aspect = ASPECT_OPTIONS[aspectIndex] || ASPECT_OPTIONS[0];

    try {
      setStillGenerating(true);
      setStillError(null);

      const style = STYLE_OPTIONS.find((s) => s.key === stylePresetKey);
      const body = {
        customerId,
        sessionId,
        productImageUrl: productImageUrl.trim() || null,
        brandLogoUrl: brandLogoUrl.trim() || null,
        brief: briefText,
        tone,
        platform: aspect.platform,
        aspectRatio: aspect.ratio,
        minaVisionEnabled,
        stylePresetKey: style?.key || "soft-desert-editorial",
        maxImages: 1,
      };

      const res = await fetch(`${API_BASE_URL}/editorial/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const msg =
          errJson?.message ||
          `Error ${res.status}: failed to generate still image.`;
        throw new Error(msg);
      }

      const data = (await res.json()) as EditorialResponse;
      const url = data.imageUrl || data.imageUrls?.[0];
      if (!url) throw new Error("No image URL in Mina response.");

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

      setStillItems((prev) => [newItem, ...prev]);
      setStillIndex(0);
      setOutputMode("still");

      void fetchHistory(customerId);
    } catch (err: any) {
      setStillError(err?.message || "Unexpected error while generating.");
    } finally {
      setStillGenerating(false);
    }
  }

  async function handleSuggestMotion() {
    if (!API_BASE_URL) {
      setMotionSuggestError("Missing API base URL.");
      return;
    }
    const currentStill = stillItems[stillIndex] || stillItems[0];
    if (!currentStill) {
      setMotionSuggestError("Create a still image first.");
      return;
    }

    try {
      setMotionSuggestLoading(true);
      setMotionSuggestError(null);
      const aspect = ASPECT_OPTIONS[aspectIndex] || ASPECT_OPTIONS[0];
      const res = await fetch(`${API_BASE_URL}/motion/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          referenceImageUrl: currentStill.url,
          tone,
          platform: aspect.platform,
          minaVisionEnabled,
          stylePresetKey,
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const msg =
          errJson?.message ||
          `Error ${res.status}: failed to suggest motion.`;
        throw new Error(msg);
      }
      const data = (await res.json()) as MotionSuggestResponse;
      setMotionDescription(data.suggestion);
    } catch (err: any) {
      setMotionSuggestError(err?.message || "Failed to suggest motion.");
    } finally {
      setMotionSuggestLoading(false);
    }
  }

  async function handleGenerateMotion() {
    if (!API_BASE_URL) {
      setMotionError("Missing API base URL.");
      return;
    }
    if (!sessionId) {
      setMotionError("Session not started yet.");
      return;
    }
    const currentStill = stillItems[stillIndex] || stillItems[0];
    if (!currentStill) {
      setMotionError("Create a still image first.");
      return;
    }

    const aspect = ASPECT_OPTIONS[aspectIndex] || ASPECT_OPTIONS[0];
    const description =
      motionDescription.trim() ||
      `Subtle motion built from this scene and brief: ${brief.trim()}`;

    try {
      setMotionGenerating(true);
      setMotionError(null);

      const res = await fetch(`${API_BASE_URL}/motion/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          sessionId,
          lastImageUrl: currentStill.url,
          motionDescription: description,
          tone,
          platform: aspect.platform,
          minaVisionEnabled,
          stylePresetKey,
          durationSeconds: 5,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const msg =
          errJson?.message ||
          `Error ${res.status}: failed to generate motion.`;
        throw new Error(msg);
      }

      const data = (await res.json()) as MotionResponse;
      const url = data.videoUrl;
      if (!url) throw new Error("No video URL in Mina response.");

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

      setMotionItems((prev) => [newItem, ...prev]);
      setMotionIndex(0);
      setOutputMode("motion");

      void fetchHistory(customerId);
    } catch (err: any) {
      setMotionError(err?.message || "Unexpected error while generating.");
    } finally {
      setMotionGenerating(false);
    }
  }

  async function handleLike(type: "image" | "motion") {
    if (!API_BASE_URL) return;

    const isImage = type === "image";
    const item = isImage
      ? stillItems[stillIndex] || stillItems[0]
      : motionItems[motionIndex] || motionItems[0];
    if (!item) return;

    try {
      const res = await fetch(`${API_BASE_URL}/feedback/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          sessionId,
          generationId: item.id,
          platform: "mina-studio",
          resultType: type,
          prompt: item.prompt,
          comment: "",
          imageUrl: isImage ? item.url : "",
          videoUrl: !isImage ? item.url : "",
        }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as LikePayload;
      console.log("Like stored. Total likes:", data.totals.likesForCustomer);
    } catch {
      // non-blocking
    }
  }

  async function handleSubmitFeedback() {
    if (!API_BASE_URL) return;
    const text = feedbackText.trim();
    if (!text) return;

    const type: "image" | "motion" = outputMode === "still" ? "image" : "motion";
    const isImage = type === "image";
    const item = isImage
      ? stillItems[stillIndex] || stillItems[0]
      : motionItems[motionIndex] || motionItems[0];
    if (!item) return;

    try {
      setFeedbackSending(true);
      setFeedbackError(null);
      const res = await fetch(`${API_BASE_URL}/feedback/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          sessionId,
          generationId: item.id,
          platform: "mina-studio",
          resultType: type,
          prompt: item.prompt,
          comment: text,
          imageUrl: isImage ? item.url : "",
          videoUrl: !isImage ? item.url : "",
        }),
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      await res.json();
      setFeedbackText("");
    } catch (err: any) {
      setFeedbackError(err?.message || "Failed to send feedback.");
    } finally {
      setFeedbackSending(false);
    }
  }

  // ============================================
  // 9. Local helpers – downloads, uploads, logout
  // ============================================

  function makeDownloadName(
    prefix: string,
    prompt: string | undefined,
    ext: "jpg" | "mp4"
  ) {
    const basePrompt = prompt || "";
    const slug = basePrompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");
    return `${prefix}-${slug || "mina"}.${ext}`;
  }

  function handleDownload(type: "image" | "motion") {
    const isImage = type === "image";
    const item = isImage
      ? stillItems[stillIndex] || stillItems[0]
      : motionItems[motionIndex] || motionItems[0];
    if (!item) return;

    const ext = isImage ? "jpg" : "mp4";
    const fileName = makeDownloadName("Mina-v3", item.prompt, ext);

    try {
      const link = document.createElement("a");
      link.href = item.url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      // ignore
    }
  }

  function handleCycleAspect() {
    setAspectIndex((prev) => {
      const next = prev + 1;
      return next >= ASPECT_OPTIONS.length ? 0 : next;
    });
  }

  function handleUploadClick(target: "product" | "logo") {
    setActiveUploadTarget(target);
    if (target === "product" && productInputRef.current) {
      productInputRef.current.click();
    } else if (target === "logo" && logoInputRef.current) {
      logoInputRef.current.click();
    }
  }

  function handleProductFile(file: File | null) {
    if (!file) return;
    if (productPreviewUrl) {
      URL.revokeObjectURL(productPreviewUrl);
    }
    const url = URL.createObjectURL(file);
    setProductPreviewUrl(url);
    setProductImageUrl(url);
  }

  function handleLogoFile(file: File | null) {
    if (!file) return;
    if (logoPreviewUrl) {
      URL.revokeObjectURL(logoPreviewUrl);
    }
    const url = URL.createObjectURL(file);
    setLogoPreviewUrl(url);
    setBrandLogoUrl(url);
  }

  function handleProductInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    handleProductFile(file);
    e.target.value = "";
  }

  function handleLogoInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    handleLogoFile(file);
    e.target.value = "";
  }

  function handleLeftDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (!activeUploadTarget) return;
    e.preventDefault();
    setIsDraggingUpload(true);
  }

  function handleLeftDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDraggingUpload(false);
  }

  function handleLeftDrop(e: React.DragEvent<HTMLDivElement>) {
    if (!activeUploadTarget) return;
    e.preventDefault();
    setIsDraggingUpload(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (activeUploadTarget === "product") {
      handleProductFile(file);
    } else {
      handleLogoFile(file);
    }
  }

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("minaCustomerId");
        const params = new URLSearchParams(window.location.search);
        params.delete("customerId");
        const newUrl =
          window.location.pathname +
          (params.toString() ? "?" + params.toString() : "");
        window.history.replaceState({}, "", newUrl);
      }
    } catch {
      // ignore
    }
    setCustomerId("");
    setSessionId(null);
    setStillItems([]);
    setMotionItems([]);
  }

  function handleAnimateThis() {
    void handleGenerateMotion();
  }

  // ============================================
  // 10. Derived values (for UI logic)
  // ============================================

  const currentStill = stillItems[stillIndex] || null;
  const currentMotion = motionItems[motionIndex] || null;
  const currentAspect = ASPECT_OPTIONS[aspectIndex] || ASPECT_OPTIONS[0];

  const briefChars = brief.trim().length;
  const showRatioControl = briefChars >= 20;
  const showUploadRow = briefChars >= 20;
  const showStyleRow = briefChars >= 40;

  const imageCost = credits?.meta?.imageCost ?? 1;
  const motionCost = credits?.meta?.motionCost ?? 5;

  const hasCreditsForStill = credits ? credits.balance >= imageCost : true;
  const hasCreditsForMotion = credits ? credits.balance >= motionCost : true;

  const canGenerateStill =
    !stillGenerating && !!sessionId && briefChars >= 40 && hasCreditsForStill;

  const canGenerateMotion =
    !motionGenerating && !!sessionId && !!currentStill && hasCreditsForMotion;

  const creditsLabel = (() => {
    if (creditsLoading) return "Credits: …";
    if (creditsError) return "Credits: error";
    if (!credits) return "Credits: —";
    const base = `Credits: ${credits.balance}`;
    return `${base} (img −${imageCost} · motion −${motionCost})`;
  })();

  const isConnected = Boolean(health?.ok);

  const historyStills: ApiGeneration[] =
    history?.generations.filter((g) => g.type === "image") ?? [];
  const historyMotions: ApiGeneration[] =
    history?.generations.filter((g) => g.type === "motion") ?? [];

  // ============================================
  // 11. Render
  // ============================================

  return (
    <div className="mina-root">
      {/* 11.1 Header */}
      <header className="mina-header">
        <button
          type="button"
          className="mina-logo"
          onClick={() => setActiveTab("studio")}
        >
          <img
            src="https://cdn.shopify.com/s/files/1/0678/9254/3571/files/Minalogo.svg?v=1765367006"
            alt="Mina"
          />
        </button>

        <div className="mina-header-right">
          <div className="mina-tabs">
            <button
              className={classNames("tab", activeTab === "studio" && "active")}
              onClick={() => setActiveTab("studio")}
            >
              Studio
            </button>
            <button
              className={classNames("tab", activeTab === "profile" && "active")}
              onClick={() => setActiveTab("profile")}
            >
              Profile
            </button>
          </div>

          <div className="mina-credits-badge">{creditsLabel}</div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                maxWidth: 160,
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                fontSize: 12,
              }}
            >
              {customerId || devCustomerId}
            </span>
            <button
              type="button"
              className="link-button subtle"
              onClick={handleLogout}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* 11.2 Main */}
      <main className="mina-main">
        {/* 11.2.1 Studio tab */}
        {activeTab === "studio" && (
          <div className="studio-layout">
            {/* Left – prompt & steps */}
            <div
              className={classNames(
                "studio-left",
                isDraggingUpload && "drag-active"
              )}
              onDragOver={handleLeftDragOver}
              onDragLeave={handleLeftDragLeave}
              onDrop={handleLeftDrop}
            >
              {/* tiny connection row */}
              <div className="studio-status-row">
                <span className={classNames("status-dot", isConnected && "ok")} />
                <span className="status-label-small">
                  {checkingHealth
                    ? "Checking Mina…"
                    : isConnected
                    ? "Mina is online"
                    : "Not connected"}
                </span>
                <button
                  type="button"
                  className="link-button subtle"
                  onClick={handleCheckHealth}
                  disabled={checkingHealth}
                >
                  Recheck
                </button>
                {sessionId && !sessionStarting && (
                  <span className="status-label-small">· Session active</span>
                )}
              </div>
              {healthError && (
                <div className="status-error">{healthError}</div>
              )}
              {sessionError && (
                <div className="status-error">{sessionError}</div>
              )}

              {/* Step 1 – main prompt */}
              <div className="studio-brief-block">
                <div className="studio-brief-title">
                  Describe how you want your photo to be like
                </div>
                <div className="studio-brief-shell">
                  <textarea
                    className="studio-brief-input"
                    placeholder="I want to create an editorial image where…"
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                  />
                  <div className="studio-brief-gradient studio-brief-gradient--top" />
                  <div className="studio-brief-gradient studio-brief-gradient--bottom" />
                </div>
              </div>

              {/* Step 2 – aspect & uploads */}
              {showRatioControl && (
                <div className="studio-row">
                  <button
                    type="button"
                    className="studio-pill"
                    onClick={handleCycleAspect}
                  >
                    <img
                      src={currentAspect.iconUrl}
                      alt={currentAspect.subtitle}
                      className="studio-pill-icon"
                    />
                    <span className="studio-pill-main">
                      {currentAspect.label}
                    </span>
                    <span className="studio-pill-sub">
                      {currentAspect.subtitle}
                    </span>
                  </button>

                  {showUploadRow && (
                    <>
                      <button
                        type="button"
                        className={classNames(
                          "studio-pill",
                          activeUploadTarget === "product" && "active"
                        )}
                        onClick={() => handleUploadClick("product")}
                      >
                        <span className="studio-pill-main">Product image</span>
                        <span className="studio-pill-sub">
                          {productPreviewUrl
                            ? "1 file added"
                            : "No product image"}
                        </span>
                      </button>

                      <button
                        type="button"
                        className={classNames(
                          "studio-pill",
                          activeUploadTarget === "logo" && "active"
                        )}
                        onClick={() => handleUploadClick("logo")}
                      >
                        <span className="studio-pill-main">Brand logo</span>
                        <span className="studio-pill-sub">
                          {logoPreviewUrl ? "1 file added" : "No logo"}
                        </span>
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Hidden inputs */}
              <input
                ref={productInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleProductInputChange}
              />
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleLogoInputChange}
              />

              {/* Step 3 – style & vision */}
              {showStyleRow && (
                <>
                  <div className="studio-style-title">
                    Pick one editorial style
                  </div>
                  <div className="studio-style-row">
                    {STYLE_OPTIONS.map((style) => (
                      <button
                        key={style.key}
                        type="button"
                        className={classNames(
                          "studio-style-card",
                          stylePresetKey === style.key && "active"
                        )}
                        onClick={() => setStylePresetKey(style.key)}
                      >
                        <div className="studio-style-thumb">
                          <img src={style.imageUrl} alt={style.label} />
                        </div>
                        <div className="studio-style-label">
                          {style.label}
                        </div>
                      </button>
                    ))}
                    <button
                      type="button"
                      className="studio-style-card add"
                      onClick={() => setStylePresetKey("custom")}
                    >
                      <div className="studio-style-thumb">
                        <span>+</span>
                      </div>
                      <div className="studio-style-label">Add yours</div>
                    </button>
                  </div>

                  <button
                    type="button"
                    className="studio-vision-toggle"
                    onClick={() =>
                      setMinaVisionEnabled((prev) => !prev)
                    }
                  >
                    Mina Vision Intelligence:{" "}
                    <span className="studio-vision-state">
                      {minaVisionEnabled ? "ON" : "OFF"}
                    </span>
                  </button>
                </>
              )}

              {/* Step 4 – create */}
              <div className="studio-create-block">
                <button
                  type="button"
                  className={classNames(
                    "studio-create-link",
                    !canGenerateStill && "disabled"
                  )}
                  onClick={handleGenerateStill}
                  disabled={!canGenerateStill}
                >
                  Create
                </button>
                {stillError && (
                  <div className="status-error">
                    {stillError}
                    {TOPUP_URL && (
                      <>
                        {" "}
                        ·{" "}
                        <a
                          href={TOPUP_URL}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Buy credits
                        </a>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="studio-footer">Profile</div>
            </div>

            {/* Right – output */}
            <div className="studio-right">
              <div className="studio-right-header">
                <div className="studio-right-title">Still life images</div>
                <div className="studio-right-actions">
                  <button
                    type="button"
                    className="link-button"
                    onClick={handleAnimateThis}
                    disabled={!canGenerateMotion}
                  >
                    Animate this
                  </button>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() =>
                      handleLike(outputMode === "still" ? "image" : "motion")
                    }
                    disabled={
                      outputMode === "still" ? !currentStill : !currentMotion
                    }
                  >
                    ♡ more of this
                  </button>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() =>
                      handleDownload(
                        outputMode === "still" ? "image" : "motion"
                      )
                    }
                    disabled={
                      outputMode === "still" ? !currentStill : !currentMotion
                    }
                  >
                    Download
                  </button>
                </div>
              </div>

              <div className="studio-output-main">
                <button
                  type="button"
                  className="studio-output-click"
                  onClick={() =>
                    handleDownload(
                      outputMode === "still" ? "image" : "motion"
                    )
                  }
                  disabled={
                    outputMode === "still"
                      ? !currentStill
                      : !currentMotion
                  }
                >
                  <div className="studio-output-frame">
                    {outputMode === "still" ? (
                      currentStill ? (
                        <img
                          src={currentStill.url}
                          alt="Mina still"
                          className="studio-output-media"
                        />
                      ) : (
                        <div className="output-placeholder">
                          Create a still on the left to see it here.
                        </div>
                      )
                    ) : currentMotion ? (
                      <video
                        src={currentMotion.url}
                        className="studio-output-media"
                        playsInline
                        loop
                        controls
                      />
                    ) : (
                      <div className="output-placeholder">
                        Animate a still to see motion here.
                      </div>
                    )}
                  </div>
                </button>

                {/* Dots */}
                <div className="studio-dots-row">
                  {outputMode === "still"
                    ? stillItems.map((item, idx) => (
                        <button
                          key={item.id}
                          type="button"
                          className={classNames(
                            "studio-dot",
                            idx === stillIndex && "active"
                          )}
                          onClick={() => setStillIndex(idx)}
                        />
                      ))
                    : motionItems.map((item, idx) => (
                        <button
                          key={item.id}
                          type="button"
                          className={classNames(
                            "studio-dot",
                            idx === motionIndex && "active"
                          )}
                          onClick={() => setMotionIndex(idx)}
                        />
                      ))}
                </div>

                {/* Motion helpers */}
                <div className="studio-motion-helpers">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={handleSuggestMotion}
                    disabled={
                      motionSuggestLoading || !currentStill || stillGenerating
                    }
                  >
                    {motionSuggestLoading ? "Thinking motion…" : "Suggest motion"}
                  </button>
                  {motionSuggestError && (
                    <div className="status-error">
                      {motionSuggestError}
                    </div>
                  )}
                  {motionError && (
                    <div className="status-error">
                      {motionError}
                    </div>
                  )}
                </div>

                {/* Feedback strip */}
                <div className="studio-feedback-row">
                  <span className="studio-feedback-hint">
                    Speak to me, tell me what you like and dislike about my
                    generation
                  </span>
                  <input
                    className="studio-feedback-input"
                    placeholder="Type feedback…"
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                  />
                  <button
                    type="button"
                    className="primary-button"
                    onClick={handleSubmitFeedback}
                    disabled={
                      !feedbackText.trim() ||
                      feedbackSending ||
                      (outputMode === "still"
                        ? !currentStill
                        : !currentMotion)
                    }
                  >
                    {feedbackSending ? "Sending…" : "Send"}
                  </button>
                </div>
                {feedbackError && (
                  <div className="status-error">{feedbackError}</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 11.2.2 Profile tab */}
        {activeTab === "profile" && (
          <div className="profile-layout">
            <section className="mina-section wide">
              <div className="section-title">
                <span className="step-dot step-done" />
                <span>Profile</span>
              </div>
              <div className="section-body">
                <div className="profile-body">
                  <div>
                    <div className="profile-label">Customer id</div>
                    <div className="profile-value">
                      {customerId || devCustomerId}
                    </div>
                  </div>
                  <div>
                    <div className="profile-label">Credits</div>
                    <div className="profile-value">
                      {credits?.balance ?? history?.credits?.balance ?? 0}
                    </div>
                    {TOPUP_URL && (
                      <div className="profile-hint">
                        Need more?{" "}
                        <a
                          href={TOPUP_URL}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Buy credits
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                {historyLoading && (
                  <div className="hint small">Loading history…</div>
                )}
                {historyError && (
                  <div className="status-error">{historyError}</div>
                )}

                {/* Tiny history gallery */}
                <div className="gallery-grid">
                  {historyStills.map((g) => (
                    <div key={g.id} className="gallery-item">
                      <div className="gallery-media">
                        <img src={g.outputUrl} alt="Still" />
                      </div>
                      <div className="gallery-meta">
                        <div className="gallery-meta-top">
                          <span className="gallery-tag">Still</span>
                          <span className="gallery-date">
                            {formatTime(g.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {historyMotions.map((g) => (
                    <div key={g.id} className="gallery-item">
                      <div className="gallery-media">
                        <video src={g.outputUrl} muted playsInline loop />
                      </div>
                      <div className="gallery-meta">
                        <div className="gallery-meta-top">
                          <span className="gallery-tag">Motion</span>
                          <span className="gallery-date">
                            {formatTime(g.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {!historyLoading &&
                  !historyError &&
                  historyStills.length === 0 &&
                  historyMotions.length === 0 && (
                    <div className="hint small">
                      No generations in server history yet.
                    </div>
                  )}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default MinaApp;
