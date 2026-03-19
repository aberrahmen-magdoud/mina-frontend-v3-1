// src/MinaApp.tsx
// ============================================================================
// MMA-ONLY MinaApp – slim orchestrator (all handlers extracted to /handlers/*)
// ============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import StudioLeft from "./StudioLeft";
import StudioRight from "./StudioRight";
import { isAdmin as checkIsAdmin, loadAdminConfig } from "./lib/adminConfig";
import { useAuthContext, usePassId } from "./components/AuthGate";
import Profile from "./Profile";
import TopLoadingBar from "./components/TopLoadingBar";
import WelcomeMatchaModal from "./components/WelcomeMatchaModal";
import { downloadMinaAsset } from "./lib/minaDownload";
import { useUndoRedo } from "./lib/useUndoRedo";
import {
  extractMmaErrorTextFromResult, humanizeUploadError, humanizeMmaError,
  isTimeoutLikeStatus, UI_ERROR_MESSAGES,
} from "./lib/mmaErrors";

import type {
  HealthState, CreditsMeta, CreditsState, GptMeta, GenerationRecord,
  FeedbackRecord, HistoryResponse, StillItem, MotionItem,
  MmaCreateResponse, MmaGenerationResponse, MotionStyleKey,
  CustomStyleImage, CustomStylePreset, UploadKind, UploadItem,
  UploadPanelKey, AspectKey, StillLane, AspectOption, MinaAppProps,
  PanelKey, CustomStyle, MinaNoticeTone, MmaStreamState,
} from "./lib/minaTypes";

import {
  API_BASE_URL, MATCHA_URL, MATCHA_5000_URL, LIKE_STORAGE_KEY,
  RECREATE_DRAFT_KEY, STILL_LANE_LS_KEY, STILL_RESOLUTION,
  CUSTOM_STYLES_LS_KEY, WELCOME_CLAIMED_KEY,
  MOTION_FRAME2_VIDEO_MIN_SEC, MOTION_FRAME2_VIDEO_MAX_SEC,
  FABRIC_AUDIO_MIN_SEC, FABRIC_AUDIO_MAX_SEC,
  ASPECT_OPTIONS, ASPECT_ICON_URLS, REPLICATE_ASPECT_RATIO_MAP,
  STYLE_PRESETS, PILL_INITIAL_DELAY_MS, PILL_STAGGER_MS,
  PILL_SLIDE_DURATION_MS, PANEL_REVEAL_DELAY_MS,
  CONTROLS_REVEAL_DELAY_MS, GROUP_FADE_DURATION_MS,
  MAX_BRIEF_CHARS, TYPING_HIDE_DELAY_MS, TYPING_REVEAL_DELAY_MS,
  TEXTAREA_FLOAT_DISTANCE_PX, HISTORY_PAGE_LIMIT,
} from "./lib/minaConstants";

import {
  classNames, padEditorialNumber, isHttpUrl,
  aspectRatioToNumber, pickNearestAspectOption,
  loadCustomStyles, saveCustomStyles, preloadImage, scheduleIdle,
  cancelIdle, swapAspectRatio, normalizeNonExpiringUrl,
  stripSignedQuery,
} from "./lib/minaHelpers";

import {
  isAssetsUrl, isVideoUrl, isAudioUrl,
  inferMediaTypeFromFile, inferMediaTypeFromUrl,
} from "./lib/mediaHelpers";

import { mmaFetchResult, mmaWaitForFinal } from "./lib/minaApi";

// Extracted handler modules
import { createCdnOptimizer, createMmaRunner, createStopAllMma, ensureAssetsUrl as ensureAssetsUrlFn, storeRemoteToR2 as storeRemoteToR2Fn } from "./handlers/minaCdnFlow";
import { addFilesToPanel, addUrlToPanel, removeUploadItem, moveUploadItem, patchUploadItem, uploadFileToR2 } from "./handlers/minaUploadFlow";
import type { UploadFlowDeps } from "./handlers/minaUploadFlow";
import { handleGenerateStill, handleGenerateMotion, handleTypeForMe } from "./handlers/minaGenerateFlow";
import type { GenerateDeps } from "./handlers/minaGenerateFlow";
import { handleTweak } from "./handlers/minaTweakFlow";
import {
  getSupabaseAccessToken, handleCheckHealth,
  fetchCredits as fetchCreditsFn, applyCreditsFromResponse as applyCreditsFromResponseFn,
  ensureSession as ensureSessionFn,
  fetchHistory as fetchHistoryFn, fetchHistoryMore as fetchHistoryMoreFn,
  handleFingertipsGenerate, getCurrentMediaKey, handleLikeCurrent,
} from "./handlers/minaDataFlow";
import type { CreditsDeps, HistoryDeps, FingertipsDeps } from "./handlers/minaDataFlow";
import {
  handleTrainCustomStyle, handleSelectCustomStyleHero,
  handleCustomStyleFiles, deleteCustomStyle,
  handleRenameCustomPreset, handleDeleteCustomPreset,
} from "./handlers/minaCustomStyleFlow";
import {
  handleCycleAspect as cycleAspect,
  handleToggleAnimateMode as toggleAnimateModeFn,
  handleBriefChange as briefChangeFn,
  handleDownloadCurrent as downloadCurrentFn,
  handleSetSceneFromViewer as setSceneFn,
  applyRecreateDraft as applyRecreateDraftFn,
  buildRecreateDraftFromUi,
  handleSignOut,
  setupGlobalDragDrop,
} from "./handlers/minaUiFlow";
import type { BriefChangeDeps } from "./handlers/minaUiFlow";

const MinaApp: React.FC<MinaAppProps> = () => {
  // ── Auth + identity ──
  const passId = usePassId();
  const authContext = useAuthContext();
  const undoRedo = useUndoRedo();

  // ── Admin / config ──
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [adminConfig, setAdminConfig] = useState(loadAdminConfig());
  const [computedStylePresets, setComputedStylePresets] = useState(STYLE_PRESETS);

  // ── Tabs / session ──
  const [activeTab, setActiveTab] = useState<"studio" | "profile">("studio");
  const goTab = useCallback((tab: "studio" | "profile", mode: "push" | "replace" = "push") => {
    setActiveTab(tab);
    if (typeof window === "undefined") return;
    const base = window.location.pathname + window.location.search;
    const url = base + (tab === "profile" ? "#profile" : "#studio");
    try { if (mode === "replace") window.history.replaceState({ minaTab: tab }, "", url); else window.history.pushState({ minaTab: tab }, "", url); } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const h = (window.location.hash || "").toLowerCase();
    goTab(h.includes("profile") ? "profile" : "studio", "replace");
    const onPop = (ev: PopStateEvent) => {
      const st = (ev.state as any)?.minaTab;
      if (st === "studio" || st === "profile") { setActiveTab(st); return; }
      setActiveTab((window.location.hash || "").toLowerCase().includes("profile") ? "profile" : "studio");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [goTab]);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionTitle] = useState("Mina Studio session");
  const [sessionMatchasSpent, setSessionMatchasSpent] = useState(0);
  const sessionStartTimeRef = useRef(new Date().toISOString());

  // ── Health / credits / loading ──
  const [health, setHealth] = useState<HealthState | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [credits, setCredits] = useState<CreditsState | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [pendingRequests, setPendingRequests] = useState(0);

  // ── Welcome popup ──
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const welcomeShownRef = useRef(false);

  // ── Studio: brief + modes ──
  const [brief, setBrief] = useState("");
  const isMobileInit = typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;
  const [hasEverTyped, setHasEverTyped] = useState<boolean>(isMobileInit);
  const [stillBrief, setStillBrief] = useState("");
  const [tone] = useState("still-life");

  // ── Still lane ──
  const [stillLane, setStillLane] = useState<StillLane>(() => {
    try { const v = (typeof window !== "undefined" && window.localStorage.getItem(STILL_LANE_LS_KEY)) || ""; return v === "main" || v === "niche" ? v : "niche"; } catch { return "niche"; }
  });
  const toggleStillLane = useCallback(() => setStillLane((prev) => (prev === "niche" ? "main" : "niche")), []);
  useEffect(() => { try { window.localStorage.setItem(STILL_LANE_LS_KEY, stillLane); } catch {} }, [stillLane]);

  // ── Video lane ──
  const [videoLane, setVideoLane] = useState<"short" | "story">("short");
  const handleToggleVideoLane = useCallback(() => setVideoLane((prev) => (prev === "short" ? "story" : "short")), []);

  const effectiveStillResolution = STILL_RESOLUTION;
  const [, setPlatform] = useState("tiktok");
  const [aspectIndex, setAspectIndex] = useState(() => isMobileInit ? 0 : 2);
  const [aspectLandscape, setAspectLandscape] = useState(false);
  const [animateAspectKey, setAnimateAspectKey] = useState<AspectKey>(ASPECT_OPTIONS[aspectIndex].key);
  const [animateMode, setAnimateMode] = useState(false);

  // ── Stills ──
  const [stillItems, setStillItems] = useState<StillItem[]>([]);
  const [stillIndex, setStillIndex] = useState(0);
  const [stillGenerating, setStillGenerating] = useState(false);
  const [stillError, setStillError] = useState<string | null>(null);
  const [lastStillPrompt, setLastStillPrompt] = useState<string>("");

  // ── Mina UI notice ──
  const [minaMessage, setMinaMessage] = useState("");
  const [minaTalking, setMinaTalking] = useState(false);
  const [minaOverrideText, setMinaOverrideText] = useState<string | null>(null);
  const [minaTone, setMinaTone] = useState<MinaNoticeTone>("thinking");
  const dismissMinaNotice = useCallback(() => { if (minaTone === "thinking") return; setMinaTalking(false); setMinaMessage(""); setMinaOverrideText(null); setMinaTone("thinking"); }, [minaTone]);
  const showMinaError = useCallback((err: any) => { setMinaTone("error"); setMinaTalking(true); setMinaOverrideText(null); setMinaMessage(humanizeMmaError(err)); }, []);
  const showMinaInfo = useCallback((msg: string) => { setMinaTone("info"); setMinaTalking(true); setMinaOverrideText(null); setMinaMessage(msg); }, []);
  const clearMinaError = useCallback(() => { if (minaTone !== "error") return; dismissMinaNotice(); }, [dismissMinaNotice, minaTone]);

  // ── Motion ──
  const [motionItems, setMotionItems] = useState<MotionItem[]>([]);
  const [motionIndex, setMotionIndex] = useState(0);
  const [motionDescription, setMotionDescription] = useState("");
  const [motionFinalPrompt, setMotionFinalPrompt] = useState("");
  const [motionStyleKeys, setMotionStyleKeys] = useState<MotionStyleKey[]>([]);
  const [motionSuggesting, setMotionSuggesting] = useState(false);
  const [motionSuggestTyping, setMotionSuggestTyping] = useState(false);
  const [animateAspectRotated, setAnimateAspectRotated] = useState(false);
  const [motionGenerating, setMotionGenerating] = useState(false);
  const [motionError, setMotionError] = useState<string | null>(null);
  const [motionAudioEnabled, setMotionAudioEnabled] = useState(true);
  const [motionDurationSec, setMotionDurationSec] = useState<5 | 10 | 15>(5);
  const [activeMediaKind, setActiveMediaKind] = useState<"still" | "motion" | null>(null);

  // ── Feedback (tweak) ──
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // ── Likes ──
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>(() => { try { const raw = typeof window !== "undefined" ? window.localStorage.getItem(LIKE_STORAGE_KEY) : null; return raw ? JSON.parse(raw) : {}; } catch { return {}; } });
  const [likeSubmitting, setLikeSubmitting] = useState(false);

  // ── Panels / stage ──
  const [activePanel, setActivePanel] = useState<PanelKey>(isMobileInit ? "product" : null);
  const [uiStage, setUiStage] = useState<0 | 1 | 2 | 3>(isMobileInit ? 3 : 0);
  const stageT2Ref = useRef<number | null>(null);
  const stageT3Ref = useRef<number | null>(null);
  const [globalDragging, setGlobalDragging] = useState(false);
  const dragDepthRef = useRef(0);

  // ── Uploads ──
  const [uploads, setUploads] = useState<Record<UploadPanelKey, UploadItem[]>>({ product: [], logo: [], inspiration: [] });
  const uploadsRef = useRef(uploads);
  useEffect(() => { uploadsRef.current = uploads; }, [uploads]);

  // ── Styles ──
  const [stylePresetKeys, setStylePresetKeys] = useState<string[]>([]);
  const [minaVisionEnabled, setMinaVisionEnabled] = useState(true);
  const [styleLabelOverrides, setStyleLabelOverrides] = useState<Record<string, string>>(() => { try { const raw = window.localStorage.getItem("minaStyleLabelOverrides"); return raw ? JSON.parse(raw) : {}; } catch { return {}; } });
  const [customStyles, setCustomStyles] = useState<CustomStyle[]>(() => { try { const raw = window.localStorage.getItem("minaCustomStyles"); return raw ? JSON.parse(raw) : []; } catch { return []; } });
  const [editingStyleKey, setEditingStyleKey] = useState<string | null>(null);
  const [editingStyleValue, setEditingStyleValue] = useState<string>("");

  // ── Admin number map ──
  const [numberMap, setNumberMap] = useState<Record<string, string>>(() => { try { const raw = typeof window !== "undefined" ? window.localStorage.getItem("minaProfileNumberMap") : null; return raw ? JSON.parse(raw) : {}; } catch { return {}; } });
  const [editingNumberId, setEditingNumberId] = useState<string | null>(null);
  const [editingNumberValue, setEditingNumberValue] = useState<string>("");

  // ── History ──
  const [historyGenerations, setHistoryGenerations] = useState<GenerationRecord[]>([]);
  const [historyFeedbacks, setHistoryFeedbacks] = useState<FeedbackRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyNextCursor, setHistoryNextCursor] = useState<string | null>(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const historyCacheRef = useRef<Record<string, { generations: GenerationRecord[]; feedbacks: FeedbackRecord[]; page?: any }>>({});
  const historyDirtyRef = useRef(false);
  const creditsCacheRef = useRef<Record<string, CreditsState>>({});
  const creditsDirtyRef = useRef(true);
  const creditsCacheAtRef = useRef<Record<string, number>>({});

  // ── Upload refs ──
  const productInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const inspirationInputRef = useRef<HTMLInputElement | null>(null);

  // ── Brief helper hint ──
  const [showDescribeMore, setShowDescribeMore] = useState(false);
  const describeMoreTimeoutRef = useRef<number | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const typingCalmTimeoutRef = useRef<number | null>(null);
  const typingHideTimeoutRef = useRef<number | null>(null);
  const typingRevealTimeoutRef = useRef<number | null>(null);
  const [typingUiHidden, setTypingUiHidden] = useState(false);
  const briefShellRef = useRef<HTMLDivElement | null>(null);

  // ── Custom style modal ──
  const [customStylePanelOpen, setCustomStylePanelOpen] = useState(false);
  const [customStyleImages, setCustomStyleImages] = useState<CustomStyleImage[]>([]);
  const [customStyleHeroId, setCustomStyleHeroId] = useState<string | null>(null);
  const [customStyleHeroThumb, setCustomStyleHeroThumb] = useState<string | null>(null);
  const [customStyleTraining, setCustomStyleTraining] = useState(false);
  const [customStyleError, setCustomStyleError] = useState<string | null>(null);
  const customStyleInputRef = useRef<HTMLInputElement | null>(null);
  const [customPresets, setCustomPresets] = useState<CustomStylePreset[]>(() => typeof window === "undefined" ? [] : loadCustomStyles());
  const customStyleHeroThumbRef = useRef<string | null>(customStyleHeroThumb);
  const customStyleImagesRef = useRef<CustomStyleImage[]>(customStyleImages);
  const applyingRecreateDraftRef = useRef(false);
  useEffect(() => { customStyleHeroThumbRef.current = customStyleHeroThumb; }, [customStyleHeroThumb]);
  useEffect(() => { customStyleImagesRef.current = customStyleImages; }, [customStyleImages]);

  // ── Fingertips ──
  const [fingertipsSending, setFingertipsSending] = useState(false);
  const [fingertipsActiveModel, setFingertipsActiveModel] = useState<string | null>(null);

  // ── Upload flash ──
  const [uploadFlashPanel, setUploadFlashPanel] = useState<UploadPanelKey | null>(null);
  const uploadFlashTimerRef = useRef<number | null>(null);
  const uploadMsgTimerRef = useRef<number | null>(null);

  const showUploadNotice = useCallback((panel: UploadPanelKey, message: string) => {
    setUploadFlashPanel(panel);
    if (uploadFlashTimerRef.current !== null) window.clearTimeout(uploadFlashTimerRef.current);
    uploadFlashTimerRef.current = window.setTimeout(() => { setUploadFlashPanel(null); }, 5000);
    showMinaError(message);
    setStillError(message);
    setMotionError(message);
    if (uploadMsgTimerRef.current !== null) window.clearTimeout(uploadMsgTimerRef.current);
    uploadMsgTimerRef.current = window.setTimeout(() => { setStillError((prev) => (prev === message ? null : prev)); setMotionError((prev) => (prev === message ? null : prev)); }, 5000);
  }, [showMinaError]);

  // ── MMA SSE refs ──
  const mmaInFlightRef = useRef<Map<string, Promise<{ generationId: string }>>>(new Map());
  const mmaIdemKeyRef = useRef<Map<string, string>>(new Map());
  const mmaStreamRef = useRef<EventSource | null>(null);
  const mmaAbortAllRef = useRef(false);
  useEffect(() => { return () => { try { mmaStreamRef.current?.close(); } catch {} mmaStreamRef.current = null; }; }, []);

  // ── Clean timers ──
  useEffect(() => {
    return () => {
      [describeMoreTimeoutRef, typingCalmTimeoutRef, typingHideTimeoutRef, typingRevealTimeoutRef, stageT2Ref, stageT3Ref, uploadFlashTimerRef, uploadMsgTimerRef].forEach((r) => { if (r.current !== null) window.clearTimeout(r.current); });
    };
  }, []);

  // ── Persist maps ──
  useEffect(() => { try { window.localStorage.setItem("minaProfileNumberMap", JSON.stringify(numberMap)); } catch {} }, [numberMap]);
  useEffect(() => { try { window.localStorage.setItem("minaStyleLabelOverrides", JSON.stringify(styleLabelOverrides)); } catch {} }, [styleLabelOverrides]);
  useEffect(() => { try { window.localStorage.setItem("minaCustomStyles", JSON.stringify(customStyles)); } catch {} }, [customStyles]);
  useEffect(() => { try { window.localStorage.setItem(LIKE_STORAGE_KEY, JSON.stringify(likedMap)); } catch {} }, [likedMap]);
  useEffect(() => { setAdminConfig(loadAdminConfig()); const h = () => setAdminConfig(loadAdminConfig()); window.addEventListener("storage", h); return () => window.removeEventListener("storage", h); }, []);

  // ── Auth / admin sync ──
  useEffect(() => {
    const email = authContext?.session?.user?.email?.toLowerCase() || null;
    setCurrentUserEmail(email);
    let cancelled = false;
    void (async () => { try { const ok = await checkIsAdmin(); if (!cancelled) setIsAdminUser(ok); } catch { if (!cancelled) setIsAdminUser(false); } })();
    return () => { cancelled = true; };
  }, [authContext]);

  useEffect(() => { if (credits?.balance === 1 && stillLane !== "main") setStillLane("main"); }, [credits?.balance, stillLane]);

  // Welcome modal (disabled)
  useEffect(() => { return; }, [authContext?.isNewUser]);

  // Motion keywords from config
  useEffect(() => {
    const allowed: MotionStyleKey[] = ["melt", "drop", "expand", "satisfying", "slow_motion", "fix_camera", "loop"];
    const from = adminConfig.styles?.movementKeywords || [];
    const filtered = from.filter((k: any): k is MotionStyleKey => allowed.includes(k as any));
    if (filtered.length) setMotionStyleKeys(filtered);
    const published = (adminConfig.styles?.presets || []).filter((p: any) => p.status === "published").map((p: any) => ({ key: p.id, label: p.name, thumb: p.heroImage || p.images[0] || "" }));
    setComputedStylePresets([...STYLE_PRESETS, ...published]);
  }, [adminConfig]);

  // Brief ↔ mode sync
  useEffect(() => {
    if (applyingRecreateDraftRef.current) return;
    if (animateMode) { setStillBrief(brief); setMotionDescription(brief); setTypingUiHidden(true); window.setTimeout(() => setTypingUiHidden(false), 220); }
    else { setStillBrief(brief); setMotionDescription(brief); }
  }, [animateMode]);

  // ═══════════════════════════════════════════════════════════════════
  // DERIVED VALUES
  // ═══════════════════════════════════════════════════════════════════
  const briefLength = brief.trim().length;
  const uploadsPending = Object.values(uploads).some((arr) => arr.some((it) => it.uploading));
  const currentPassId = passId;
  const showPills = uiStage >= 1 && !typingUiHidden;
  const showPanels = uiStage >= 1;
  const showControls = uiStage >= 3 || hasEverTyped;
  const currentAspect = ASPECT_OPTIONS[aspectIndex];
  const effectiveAspectRatio = useMemo(() => { const base = String(currentAspect?.ratio || "").trim(); return aspectLandscape ? swapAspectRatio(base) : base; }, [aspectLandscape, currentAspect?.ratio]);
  const latestStill: StillItem | null = stillItems[0] || null;
  const currentStill: StillItem | null = stillItems[stillIndex] || stillItems[0] || null;
  const currentMotion: MotionItem | null = motionItems[motionIndex] || motionItems[0] || null;
  const newestStillAt = stillItems[0]?.createdAt ? Date.parse(stillItems[0].createdAt) || 0 : 0;
  const newestMotionAt = motionItems[0]?.createdAt ? Date.parse(motionItems[0].createdAt) || 0 : 0;
  const animateImage = uploads.product[0] || null;
  const animateAspectOption = ASPECT_OPTIONS.find((opt) => opt.key === animateAspectKey) || currentAspect;
  const animateAspectIconUrl = ASPECT_ICON_URLS[animateAspectOption.key];
  const animateEffectiveAspectRatio = animateAspectRotated ? swapAspectRatio(animateAspectOption.ratio) : animateAspectOption.ratio;
  const animateImageHttp = animateImage?.remoteUrl && isHttpUrl(animateImage.remoteUrl) ? animateImage.remoteUrl : animateImage?.url && isHttpUrl(animateImage.url) ? animateImage.url : "";
  const motionReferenceImageUrl = animateImageHttp || currentStill?.url || latestStill?.url || "";
  const frame2Item = uploads.product?.[1] || null;
  const frame2Url = frame2Item?.remoteUrl || frame2Item?.url || "";
  const frame2Http = isHttpUrl(frame2Url) ? frame2Url : "";
  const frame2Kind = frame2Item?.mediaType || inferMediaTypeFromUrl(frame2Url) || null;
  const hasFrame2Video = animateMode && frame2Kind === "video" && isHttpUrl(frame2Url);
  const hasFrame2Audio = animateMode && frame2Kind === "audio" && isHttpUrl(frame2Url);
  const effectiveMotionAudioEnabled = motionAudioEnabled !== false;
  const personalityThinking = useMemo(() => (adminConfig.ai?.personality?.thinking?.length ? adminConfig.ai.personality.thinking : []), [adminConfig.ai?.personality?.thinking]);
  const personalityFiller = useMemo(() => (adminConfig.ai?.personality?.filler?.length ? adminConfig.ai.personality.filler : []), [adminConfig.ai?.personality?.filler]);

  // Cost calculations
  const imageCost = stillLane === "niche" ? 2 : 1;
  const frame2Duration = Number(frame2Item?.durationSec || 0);
  const videoSec = hasFrame2Video ? Math.min(30, Math.max(3, Math.round(frame2Duration || 5))) : 0;
  const audioSec = hasFrame2Audio ? Math.min(60, Math.max(1, Math.round(frame2Duration || 5))) : 0;
  const motionCost = hasFrame2Video ? videoSec : hasFrame2Audio ? audioSec : motionDurationSec;
  const motionCostLabel = hasFrame2Video ? `${videoSec} matchas (${videoSec}s video)` : hasFrame2Audio ? `${audioSec} matchas (${audioSec}s audio)` : `${motionCost} matchas (${motionDurationSec}s)`;
  const creditBalance = credits?.balance;
  const hasCreditNumber = typeof creditBalance === "number" && Number.isFinite(creditBalance);
  const imageCreditsOk = hasCreditNumber ? creditBalance! >= imageCost : true;
  const motionCreditsOk = hasCreditNumber ? creditBalance! >= motionCost : true;
  const motionBlockReason = motionCreditsOk ? null : "Get more matchas to animate.";
  const tweakCreditsOk = activeMediaKind === "motion" ? motionCreditsOk : activeMediaKind === "still" ? imageCreditsOk : true;
  const tweakBlockReason = tweakCreditsOk ? null : "Get more matchas to tweak.";
  const normalizeStyleKeyForApi = (k: string) => (k.startsWith("custom-") ? "custom-style" : k);
  const stylePresetKeysForApi = (stylePresetKeys.length ? stylePresetKeys : ["none"]).map(normalizeStyleKeyForApi);
  const primaryStyleKeyForApi = stylePresetKeysForApi[0] || "none";
  const motionTextTrimmed = motionDescription.trim();
  const canCreateMotion = !!motionReferenceImageUrl && (motionTextTrimmed.length > 0 || hasFrame2Video || hasFrame2Audio) && !motionSuggestTyping && !motionSuggesting;
  const minaBusy = stillGenerating || motionGenerating || motionSuggesting || motionSuggestTyping || customStyleTraining || feedbackSending;

  const animationTimingVars = useMemo<React.CSSProperties>(() => ({ "--pill-slide-duration": `${PILL_SLIDE_DURATION_MS}ms`, "--group-fade-duration": `${GROUP_FADE_DURATION_MS}ms`, "--textarea-float-distance": `${TEXTAREA_FLOAT_DISTANCE_PX}px` }), []);

  // ═══════════════════════════════════════════════════════════════════
  // API + CDN + MMA runner (created once, depend on apiFetch)
  // ═══════════════════════════════════════════════════════════════════
  const apiFetch = async (path: string, init: RequestInit = {}) => {
    setPendingRequests((n) => n + 1);
    try {
      if (!API_BASE_URL) throw new Error(UI_ERROR_MESSAGES.missingApiBaseUrl);
      const headers = new Headers(init.headers || {});
      const token = await getSupabaseAccessToken(authContext?.accessToken || null);
      if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
      if (currentPassId && !headers.has("X-Mina-Pass-Id")) headers.set("X-Mina-Pass-Id", currentPassId);
      if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
      return await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
    } finally { setPendingRequests((n) => Math.max(0, n - 1)); }
  };

  const cdnOpt = useMemo(() => createCdnOptimizer(animateMode), [animateMode]);
  const mmaCreateAndWait = useMemo(() => createMmaRunner(apiFetch, API_BASE_URL, mmaInFlightRef, mmaIdemKeyRef, mmaStreamRef, mmaAbortAllRef), [currentPassId]);
  const stopAllMmaUiNow = useMemo(() => createStopAllMma(mmaAbortAllRef, mmaStreamRef, mmaInFlightRef, mmaIdemKeyRef, setStillGenerating, setMotionGenerating, setFeedbackSending), []);
  const _ensureAssetsUrl = useCallback((url: string, kind: "generations" | "motions") => ensureAssetsUrlFn(apiFetch, currentPassId, url, kind), [currentPassId]);
  const _storeRemoteToR2 = useCallback((url: string, kind: string) => storeRemoteToR2Fn(apiFetch, currentPassId, url, kind), [currentPassId]);
  const _ensureSession = useCallback(() => ensureSessionFn(apiFetch, currentPassId, sessionId, sessionTitle, currentAspect.platformKey, (id) => setSessionId(id)), [currentPassId, sessionId, sessionTitle, currentAspect.platformKey]);
  const _uploadFileToR2 = useCallback((panel: UploadPanelKey, file: File) => uploadFileToR2(apiFetch, currentPassId, panel, file), [currentPassId]);

  // ── Credits deps ──
  const creditsDeps: CreditsDeps = { apiFetch, currentPassId, credits, adminConfig, creditsCacheRef, creditsCacheAtRef, creditsDirtyRef, setCredits, setCreditsLoading, setSessionMatchasSpent };
  const _fetchCredits = useCallback(() => { void fetchCreditsFn(creditsDeps); }, [currentPassId, credits, adminConfig]);
  const _applyCreditsFromResponse = useCallback((resp?: any) => applyCreditsFromResponseFn(creditsDeps, resp), [currentPassId, credits]);

  // ── History deps ──
  const historyDeps: HistoryDeps = { apiFetch, currentPassId, adminConfig, storeRemoteToR2: _storeRemoteToR2, historyCacheRef, historyDirtyRef, setHistoryGenerations, setHistoryFeedbacks, setHistoryLoading, setHistoryLoadingMore, setHistoryError, setHistoryNextCursor, setHistoryHasMore, setCredits, historyGenerations, historyFeedbacks, historyLoading, historyLoadingMore, historyHasMore, historyNextCursor };
  const _fetchHistory = useCallback(() => { void fetchHistoryFn(historyDeps); }, [currentPassId]);

  // ── Upload deps ──
  const uploadDeps: UploadFlowDeps = { animateMode, currentPassId, uploadsRef, setUploads, apiFetch, showUploadNotice, showMinaError, setMinaOverrideText, setStillError, setMotionError, ensureOptimizedInputUrl: cdnOpt.ensureOptimizedInputUrl, undoRedoPush: undoRedo.push };

  // ── Generate deps ──
  const genDeps: GenerateDeps = {
    apiFetch, currentPassId, ensureSession: _ensureSession, sessionId, sessionTitle,
    mmaCreateAndWait, stopAllMmaUiNow, ensureOptimizedInputUrl: cdnOpt.ensureOptimizedInputUrl,
    ensureAssetsUrl: _ensureAssetsUrl, fetchCredits: _fetchCredits, applyCreditsFromResponse: _applyCreditsFromResponse,
    showMinaError, showMinaInfo, dismissMinaNotice, setMinaTone, setMinaOverrideText,
    stillBrief, effectiveAspectRatio, currentAspect, tone, stylePresetKeys, stylePresetKeysForApi,
    primaryStyleKeyForApi, computedStylePresets, customStyles, minaVisionEnabled, stillLane,
    effectiveStillResolution, uploads, setStillGenerating, setStillError, setStillItems, setStillIndex,
    setActiveMediaKind, setLastStillPrompt, motionDescription, motionFinalPrompt, motionTextTrimmed,
    motionStyleKeys, motionDurationSec, effectiveMotionAudioEnabled, motionReferenceImageUrl,
    hasFrame2Video, hasFrame2Audio, videoSec, audioSec, animateAspectOption, animateEffectiveAspectRatio,
    videoLane, setMotionGenerating, setMotionError, setMotionItems, setMotionIndex, setMotionFinalPrompt,
    setMotionDescription, setMotionSuggesting, setMotionSuggestTyping, setBrief, setShowDescribeMore,
    describeMoreTimeoutRef, brief, historyDirtyRef, creditsDirtyRef,
  };

  // ═══════════════════════════════════════════════════════════════════
  // EFFECTS
  // ═══════════════════════════════════════════════════════════════════
  // Auto-select media kind
  useEffect(() => {
    if (activeMediaKind === null) { if (newestStillAt || newestMotionAt) setActiveMediaKind(newestMotionAt > newestStillAt ? "motion" : "still"); return; }
    if (activeMediaKind === "motion" && !motionItems.length && stillItems.length) { setActiveMediaKind("still"); return; }
    if (activeMediaKind === "still" && !stillItems.length && motionItems.length) setActiveMediaKind("motion");
  }, [activeMediaKind, newestMotionAt, newestStillAt, motionItems.length, stillItems.length]);

  // Typing UI hide/reveal
  useEffect(() => {
    if (isTyping) {
      if (typingRevealTimeoutRef.current !== null) { window.clearTimeout(typingRevealTimeoutRef.current); typingRevealTimeoutRef.current = null; }
      if (typingHideTimeoutRef.current === null && !typingUiHidden) typingHideTimeoutRef.current = window.setTimeout(() => { setTypingUiHidden(true); typingHideTimeoutRef.current = null; }, TYPING_HIDE_DELAY_MS);
      return;
    }
    if (typingHideTimeoutRef.current !== null) { window.clearTimeout(typingHideTimeoutRef.current); typingHideTimeoutRef.current = null; }
    typingRevealTimeoutRef.current = window.setTimeout(() => { setTypingUiHidden(false); typingRevealTimeoutRef.current = null; }, TYPING_REVEAL_DELAY_MS);
  }, [isTyping, typingUiHidden]);

  // Infer animate aspect from image
  useEffect(() => {
    let cancelled = false;
    const setFromRatio = (r: number) => { if (cancelled) return; const n = pickNearestAspectOption(r, ASPECT_OPTIONS); setAnimateAspectKey(n.key); setAnimateAspectRotated(r > 1); };
    const inferFromUrl = (url: string, fallback?: number) => { const img = new Image(); img.onload = () => { if (!cancelled) setFromRatio(img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1); }; img.onerror = () => { if (!cancelled && fallback) setFromRatio(fallback); }; img.src = url; };
    const primaryUrl = animateImage?.remoteUrl || animateImage?.url;
    if (primaryUrl) { inferFromUrl(primaryUrl, aspectRatioToNumber(currentAspect.ratio)); return () => { cancelled = true; }; }
    if (latestStill?.aspectRatio) { setFromRatio(aspectRatioToNumber(latestStill.aspectRatio)); return () => { cancelled = true; }; }
    if (latestStill?.url) { inferFromUrl(latestStill.url, aspectRatioToNumber(currentAspect.ratio)); return () => { cancelled = true; }; }
    setFromRatio(aspectRatioToNumber(currentAspect.ratio));
    return () => { cancelled = true; };
  }, [animateImage?.remoteUrl, animateImage?.url, latestStill?.aspectRatio, latestStill?.url, currentAspect.ratio]);

  // Stage reveal
  useEffect(() => {
    if (stageT2Ref.current !== null) window.clearTimeout(stageT2Ref.current);
    if (stageT3Ref.current !== null) window.clearTimeout(stageT3Ref.current);
    stageT2Ref.current = null; stageT3Ref.current = null;
    const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;
    if (briefLength <= 0) { setUiStage((hasEverTyped || isMobile) ? 3 : 0); if (hasEverTyped || isMobile) setActivePanel((prev) => prev ?? "product"); else setActivePanel(null); setGlobalDragging(false); dragDepthRef.current = 0; return; }
    if (uiStage < 1) { setUiStage(1); setActivePanel((prev) => prev ?? "product"); }
    stageT2Ref.current = window.setTimeout(() => setUiStage((s) => (s < 2 ? 2 : s)), PANEL_REVEAL_DELAY_MS);
    stageT3Ref.current = window.setTimeout(() => setUiStage((s) => (s < 3 ? 3 : s)), CONTROLS_REVEAL_DELAY_MS);
  }, [briefLength, uiStage, hasEverTyped]);

  // Mina thinking animation
  useEffect(() => {
    if (minaTone !== "thinking" || !minaBusy || minaOverrideText) return;
    setMinaTalking(true);
    const phrases = [...personalityThinking, ...personalityFiller].filter(Boolean);
    let phraseIndex = 0, charIndex = 0, t: number | null = null;
    const tick = () => { const phrase = phrases[phraseIndex % phrases.length] || ""; const next = charIndex + 1; setMinaMessage(phrase.slice(0, Math.min(next, phrase.length)) || "typing…"); const end = next > phrase.length; charIndex = end ? 0 : next; if (end) phraseIndex += 1; t = window.setTimeout(tick, end ? 160 : 35); };
    t = window.setTimeout(tick, 35);
    return () => { if (t !== null) window.clearTimeout(t); };
  }, [minaBusy, minaOverrideText, minaTone, personalityThinking, personalityFiller]);

  useEffect(() => {
    if (minaTone !== "thinking" || !minaOverrideText) return;
    setMinaTalking(true); setMinaMessage("");
    let cancelled = false, i = 0, t: number | null = null;
    const text = minaOverrideText;
    const tick = () => { if (cancelled) return; i += 1; setMinaMessage(text.slice(0, i)); if (i < text.length) t = window.setTimeout(tick, 6); };
    t = window.setTimeout(tick, 6);
    return () => { cancelled = true; if (t !== null) window.clearTimeout(t); };
  }, [minaOverrideText, minaTone]);

  useEffect(() => { if (!minaBusy && !minaOverrideText && minaTone === "thinking") { setMinaTalking(false); setMinaMessage(""); } }, [minaBusy, minaOverrideText, minaTone]);

  // Preload style thumbs
  useEffect(() => {
    const h = scheduleIdle(() => {
      const urls: string[] = [];
      (computedStylePresets as any[])?.forEach((p) => { if (typeof p?.thumb === "string") urls.push(p.thumb); if (Array.isArray(p?.hero)) urls.push(...p.hero); });
      (customStyles || []).forEach((s) => { if (typeof s?.thumbUrl === "string") urls.push(s.thumbUrl); if (Array.isArray(s?.heroUrls)) urls.push(...s.heroUrls); });
      Array.from(new Set(urls.filter((u) => typeof u === "string" && isHttpUrl(u)))).slice(0, 60).forEach(preloadImage);
    }, 900);
    return () => cancelIdle(h);
  }, [computedStylePresets, customStyles]);

  // Profile mount
  useEffect(() => { if (activeTab === "profile" && currentPassId) { _fetchCredits(); _fetchHistory(); } }, [activeTab, currentPassId]);
  // Refresh credits on focus
  useEffect(() => { const m = () => { creditsDirtyRef.current = true; historyDirtyRef.current = true; _fetchCredits(); }; const v = () => { if (!document.hidden) m(); }; window.addEventListener("focus", m); document.addEventListener("visibilitychange", v); return () => { window.removeEventListener("focus", m); document.removeEventListener("visibilitychange", v); }; }, [currentPassId]);
  // Checkout redirect
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "complete") return;
    params.delete("checkout");
    window.history.replaceState(null, "", window.location.pathname + (params.toString() ? `?${params}` : "") + window.location.hash);
    creditsDirtyRef.current = true; _fetchCredits(); showMinaInfo("Payment received – your matchas are on the way!");
  }, []);

  // Drag/drop/paste
  useEffect(() => {
    if (uiStage === 0) return;
    const getTarget = (): UploadPanelKey => activePanel === "logo" ? "logo" : activePanel === "inspiration" ? "inspiration" : "product";
    return setupGlobalDragDrop({ getTargetPanel: getTarget, addFilesToPanel: (p, f) => addFilesToPanel(uploadDeps, p, f), addUrlToPanel: (p, u) => addUrlToPanel(uploadDeps, p, u), dragDepthRef, setGlobalDragging });
  }, [uiStage, activePanel, animateMode]);

  // Recreate draft from localStorage
  useEffect(() => {
    if (activeTab !== "studio") return;
    try { const raw = window.localStorage.getItem(RECREATE_DRAFT_KEY); if (!raw) return; const draft = JSON.parse(raw); window.localStorage.removeItem(RECREATE_DRAFT_KEY); applyRecreateDraftFn(draft, setAnimateMode, setMotionDescription, setStillBrief, setBrief, setAspectIndex, setStylePresetKeys, setMinaVisionEnabled, setUploads, setActivePanel, setUiStage, applyingRecreateDraftRef, setAspectLandscape); } catch {}
  }, [activeTab]);

  // Mirror product upload to right panel
  const mirrorIdRef = useRef<string | null>(null);
  useEffect(() => {
    const first = uploads.product[0]; const url = first?.remoteUrl || first?.url || ""; const isUsable = !!url && !url.startsWith("blob:") && !first?.uploading;
    if (isUsable && url) { const id = `mirror_${first.id}`; if (mirrorIdRef.current !== id) { if (mirrorIdRef.current) { const prevId = mirrorIdRef.current; setStillItems((prev) => prev.filter((s) => s.id !== prevId)); } mirrorIdRef.current = id; setStillItems((prev) => { const without = prev.filter((s) => s.id !== id); return [{ id, url }, ...without]; }); setStillIndex(0); } }
    else { if (mirrorIdRef.current) { const prevId = mirrorIdRef.current; setStillItems((prev) => prev.filter((s) => s.id !== prevId)); mirrorIdRef.current = null; } }
  }, [uploads.product[0]?.id, uploads.product[0]?.remoteUrl, uploads.product[0]?.uploading]);

  // ═══════════════════════════════════════════════════════════════════
  // HANDLER WIRING (delegates to extracted modules)
  // ═══════════════════════════════════════════════════════════════════
  const onCreateStill = () => void handleGenerateStill(genDeps);
  const onCreateMotion = () => void handleGenerateMotion(genDeps);
  const onTypeForMe = useCallback(() => void handleTypeForMe(genDeps), [genDeps]);
  const onTweak = useCallback((text: string) => void handleTweak({ ...genDeps, activeMediaKind, currentStill, currentMotion, uploads, brief, stillBrief, motionTextTrimmed, motionDescription, motionReferenceImageUrl, effectiveAspectRatio, currentAspect, animateAspectOption, animateEffectiveAspectRatio, stylePresetKeys, stylePresetKeysForApi, primaryStyleKeyForApi, minaVisionEnabled, stillLane, effectiveStillResolution, setFeedbackSending, setFeedbackError, setFeedbackText, setStillItems, setStillIndex, setMotionItems, setMotionIndex, setActiveMediaKind, setLastStillPrompt, historyDirtyRef, creditsDirtyRef }, text), [activeMediaKind, currentStill, currentMotion]);

  const onConfirmCheckout = useCallback(async (qty: number) => {
    try { showMinaInfo("Preparing your checkout…"); const res = await apiFetch("/api/checkout/create", { method: "POST", body: JSON.stringify({ qty }) }); const json = await res.json(); if (!json?.ok || !json?.checkoutUrl) throw new Error(json?.error || "Failed to create checkout"); window.open(json.checkoutUrl, "_blank"); showMinaInfo("Complete your purchase on Shopify, then come back here – your matchas will appear automatically."); }
    catch { const clamp = (n: number) => Math.max(1, Math.min(100, Math.floor(Number(n || 1)))); const is5000 = qty === 100; const url = is5000 ? MATCHA_5000_URL : `${MATCHA_URL.replace(/:1$/, "")}:${clamp(qty)}`; window.open(url, "_blank", "noopener"); showMinaInfo("Complete your purchase on Shopify, then come back here – your matchas will appear automatically."); }
  }, []);

  const onFingertipsGenerate = useCallback(async (args: { modelKey: string; inputs: Record<string, any> }) => handleFingertipsGenerate({ apiFetch, currentPassId, ensureAssetsUrl: _ensureAssetsUrl, fetchCredits: _fetchCredits, showMinaError, dismissMinaNotice, setMinaOverrideText, setMinaTalking, setMinaTone, setFingertipsSending, setFingertipsActiveModel, setStillGenerating, setStillItems, setStillIndex, setActiveMediaKind, historyDirtyRef, creditsDirtyRef }, args), [currentPassId]);

  const onLikeCurrent = () => void handleLikeCurrent(apiFetch, currentPassId, activeMediaKind, currentStill, currentMotion, likedMap, setLikedMap, setLikeSubmitting, lastStillPrompt, stillBrief, brief);
  const onDownloadCurrent = () => void downloadCurrentFn(activeMediaKind, currentStill, currentMotion, motionFinalPrompt, motionTextTrimmed, motionDescription, lastStillPrompt, stillBrief, brief, setStillError, setMotionError);

  const handleBriefChangeLocal = (v: string) => briefChangeFn({ setBrief, setMotionFinalPrompt, setMotionDescription, setStillBrief, setShowDescribeMore, setIsTyping, setTypingUiHidden, setHasEverTyped, animateMode, hasEverTyped, hasFrame2Video, hasFrame2Audio, describeMoreTimeoutRef, typingCalmTimeoutRef, typingHideTimeoutRef, typingRevealTimeoutRef, typingUiHidden }, v);
  const handleBriefFocus = useCallback(() => { if (!hasEverTyped) setHasEverTyped(true); setActivePanel((prev) => prev ?? "product"); setUiStage((s) => (s < 3 ? 3 : s)); }, [hasEverTyped]);
  const handleCycleAspectLocal = () => cycleAspect(setAspectIndex, setPlatform);
  const handleToggleAnimateModeLocal = () => toggleAnimateModeFn(setAnimateMode, setUploads, latestStill);
  const openPanel = (key: PanelKey) => { if (!key) return; if (!hasEverTyped) setHasEverTyped(true); setActivePanel(key); setUiStage((s) => (s < 3 ? 3 : s)); };
  const triggerPick = (panel: UploadPanelKey) => { if (!hasEverTyped) setHasEverTyped(true); setActivePanel(panel); setUiStage((s) => (s < 3 ? 3 : s)); if (panel === "product") productInputRef.current?.click(); if (panel === "logo") logoInputRef.current?.click(); if (panel === "inspiration") inspirationInputRef.current?.click(); };

  const handleRecreateFromViewer = (args: { kind: "still" | "motion"; stillIndex: number }) => {
    if (args.kind === "motion") { const draft = (motionItems?.[motionIndex] as any)?.draft || buildRecreateDraftFromUi("motion", uploads, motionReferenceImageUrl, motionFinalPrompt, motionTextTrimmed, motionDescription, brief, lastStillPrompt, stillBrief, effectiveAspectRatio, animateEffectiveAspectRatio, stylePresetKeys, minaVisionEnabled); applyRecreateDraftFn(draft, setAnimateMode, setMotionDescription, setStillBrief, setBrief, setAspectIndex, setStylePresetKeys, setMinaVisionEnabled, setUploads, setActivePanel, setUiStage, applyingRecreateDraftRef, setAspectLandscape); return; }
    const candidate = stillItems?.[args.stillIndex] || stillItems?.[stillIndex] || null;
    const draft = (candidate as any)?.draft || buildRecreateDraftFromUi("still", uploads, motionReferenceImageUrl, motionFinalPrompt, motionTextTrimmed, motionDescription, brief, lastStillPrompt, stillBrief, effectiveAspectRatio, animateEffectiveAspectRatio, stylePresetKeys, minaVisionEnabled);
    applyRecreateDraftFn(draft, setAnimateMode, setMotionDescription, setStillBrief, setBrief, setAspectIndex, setStylePresetKeys, setMinaVisionEnabled, setUploads, setActivePanel, setUiStage, applyingRecreateDraftRef, setAspectLandscape);
  };

  const handleSetScene = useCallback((args: { url: string; clearInspiration?: boolean }) => setSceneFn(args, animateMode, hasEverTyped, setHasEverTyped, setActivePanel, setUiStage, setUploads, (p, id, pt) => patchUploadItem(setUploads, p, id, pt), cdnOpt.ensureOptimizedInputUrl), [animateMode, hasEverTyped]);

  const currentMediaKey = getCurrentMediaKey(activeMediaKind, currentStill, currentMotion);
  const isCurrentLiked = currentMediaKey ? likedMap[currentMediaKey] : false;
  const mediaKindForDisplay = activeMediaKind ?? (newestMotionAt > newestStillAt ? "motion" : newestStillAt ? "still" : null);
  const displayedMotion = mediaKindForDisplay === "motion" ? currentMotion : null;
  const displayedStill = mediaKindForDisplay === "motion" ? null : currentStill;

  const handleRightPanelUpload = (file: File) => { if (!hasEverTyped) setHasEverTyped(true); setActivePanel((prev) => prev ?? "product"); setUiStage((s) => (s < 3 ? 3 : s)); addFilesToPanel(uploadDeps, "product", { 0: file, length: 1, item: (i: number) => (i === 0 ? file : null) } as unknown as FileList); };

  // ── Header contrast ──
  const [headerIsDark, setHeaderIsDark] = useState<boolean | null>(null);
  const headerSampleUrl = (mediaKindForDisplay === "motion" ? motionReferenceImageUrl : displayedStill?.url) || "";
  useEffect(() => { setHeaderIsDark(false); }, [headerSampleUrl]);
  const headerOverlayClass = headerIsDark === true ? "header-on-dark" : "header-on-light";

  const topBarActive = pendingRequests > 0 || uploadsPending || stillGenerating || motionGenerating || customStyleTraining || feedbackSending;

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════
  return (
    <>
      <TopLoadingBar active={topBarActive} />
      <div className={classNames("mina-studio-root", uploadFlashPanel ? `mina-upload-flash mina-upload-flash--${uploadFlashPanel}` : "")}>
        <div className={classNames("mina-drag-overlay", globalDragging && "show")} />
        <div className="studio-frame">
          <div className={classNames("studio-header-overlay", headerOverlayClass)}>
            <div className="studio-header-left">
              <a href="#studio" className="studio-logo-link" onClick={(e) => { e.preventDefault(); goTab("studio", activeTab === "profile" ? "push" : "replace"); }}>
                <img src="https://assets.faltastudio.com/Website%20Assets/Black_Logo_mina.svg" alt="Mina logo" className="studio-logo" />
              </a>
            </div>
            <div className="studio-header-right">
              {activeTab === "studio" && (
                <button type="button" className="studio-animate-toggle studio-animate-toggle--header" onClick={handleToggleAnimateModeLocal} disabled={stillGenerating || motionGenerating || feedbackSending}>
                  {feedbackSending ? "Tweaking…" : stillGenerating ? "Creating…" : motionGenerating ? "Animating…" : animateMode ? "Create" : "Animate"}
                </button>
              )}
            </div>
          </div>

          {activeTab === "studio" ? (
            <div className={classNames("studio-body", "studio-body--two-col")}>
              <StudioLeft
                globalDragging={globalDragging} typingHidden={typingUiHidden} timingVars={animationTimingVars}
                showPills={showPills} showPanels={showPanels} showControls={showControls} uiStage={uiStage}
                brief={brief} briefHintVisible={showDescribeMore} briefShellRef={briefShellRef}
                onBriefScroll={() => {}} onBriefChange={handleBriefChangeLocal} onBriefFocus={handleBriefFocus}
                animateMode={animateMode} onToggleAnimateMode={handleToggleAnimateModeLocal}
                activePanel={activePanel} openPanel={openPanel}
                pillInitialDelayMs={PILL_INITIAL_DELAY_MS} pillStaggerMs={PILL_STAGGER_MS} panelRevealDelayMs={PANEL_REVEAL_DELAY_MS}
                currentAspect={currentAspect} currentAspectIconUrl={ASPECT_ICON_URLS[currentAspect.key]}
                onCycleAspect={handleCycleAspectLocal}
                aspectLandscape={aspectLandscape} onToggleAspectLandscape={() => setAspectLandscape((v) => !v)}
                animateAspect={animateAspectOption} animateAspectIconUrl={animateAspectIconUrl}
                animateAspectIconRotated={animateAspectRotated}
                uploads={uploads} uploadsPending={uploadsPending}
                removeUploadItem={(p, id) => removeUploadItem(setUploads, p, id, undoRedo.push)}
                moveUploadItem={(p, f, t) => moveUploadItem(setUploads, p, f, t, animateMode)}
                triggerPick={triggerPick} onFilesPicked={(p, f) => addFilesToPanel(uploadDeps, p, f)}
                productInputRef={productInputRef} logoInputRef={logoInputRef} inspirationInputRef={inspirationInputRef}
                stylePresetKeys={stylePresetKeys} setStylePresetKeys={setStylePresetKeys}
                stylePresets={computedStylePresets} customStyles={customStyles}
                getStyleLabel={(_k: string, fb: string) => fb}
                deleteCustomStyle={(key) => deleteCustomStyle(key, setCustomStyles, setStyleLabelOverrides, setStylePresetKeys, undoRedo.push)}
                onOpenCustomStylePanel={() => { setCustomStylePanelOpen(true); setCustomStyleError(null); }}
                onImageUrlPasted={(url) => addUrlToPanel(uploadDeps, activePanel === "logo" ? "logo" : activePanel === "inspiration" ? "inspiration" : "product", url)}
                minaVisionEnabled={minaVisionEnabled} onToggleVision={() => setMinaVisionEnabled((p) => !p)}
                stillGenerating={stillGenerating} stillError={stillError} onCreateStill={onCreateStill}
                motionStyleKeys={motionStyleKeys} setMotionStyleKeys={setMotionStyleKeys}
                motionSuggesting={motionSuggesting} canCreateMotion={canCreateMotion}
                motionHasImage={(uploads.product?.length ?? 0) > 0}
                motionCreditsOk={motionCreditsOk} motionBlockReason={motionBlockReason}
                motionGenerating={motionGenerating} motionError={motionError}
                onCreateMotion={onCreateMotion} onTypeForMe={onTypeForMe}
                motionAudioEnabled={motionAudioEnabled} motionAudioLocked={false}
                effectiveMotionAudioEnabled={effectiveMotionAudioEnabled}
                onToggleMotionAudio={() => setMotionAudioEnabled((v) => !v)}
                motionDurationSec={motionDurationSec} motionCostLabel={motionCostLabel}
                onToggleMotionDuration={() => setMotionDurationSec((v) => (v === 5 ? 10 : v === 10 ? 15 : 5))}
                sessionMatchasSpent={sessionMatchasSpent} sessionStartTime={sessionStartTimeRef.current}
                imageCreditsOk={imageCreditsOk} matchaUrl={MATCHA_URL} matcha5000Url={MATCHA_5000_URL}
                onConfirmCheckout={onConfirmCheckout}
                minaMessage={minaMessage} minaTalking={minaTalking} minaTone={minaTone}
                onDismissMinaNotice={dismissMinaNotice}
                minaError={minaTone === "error" ? minaMessage : null} onClearMinaError={clearMinaError}
                stillLane={stillLane} onToggleStillLane={toggleStillLane} stillLaneDisabled={minaBusy}
                videoLane={videoLane} onToggleVideoLane={handleToggleVideoLane}
                onGoProfile={() => goTab("profile")} feedbackSending={feedbackSending}
              />
              <StudioRight
                currentStill={displayedStill} currentMotion={displayedMotion}
                stillItems={stillItems} stillIndex={stillIndex} setStillIndex={setStillIndex}
                tweakText={feedbackText} setTweakText={setFeedbackText}
                onSendTweak={(text) => void onTweak(text)} sending={feedbackSending}
                error={feedbackError} tweakCreditsOk={tweakCreditsOk} tweakBlockReason={tweakBlockReason}
                onRecreate={handleRecreateFromViewer}
                onSetScene={({ url, clearInspiration }) => handleSetScene({ url, clearInspiration: clearInspiration ?? true })}
                onFingertipsGenerate={onFingertipsGenerate} fingertipsSending={fingertipsSending}
                currentAspect={effectiveAspectRatio}
                onLike={onLikeCurrent} isLiked={isCurrentLiked}
                likeDisabled={(!currentStill && !currentMotion) || likeSubmitting || feedbackSending || stillGenerating || motionGenerating}
                onDownload={onDownloadCurrent}
                downloadDisabled={(!currentStill && !currentMotion) || feedbackSending || stillGenerating || motionGenerating}
                animateMode={animateMode} onDropUpload={handleRightPanelUpload}
                rightUploading={!!uploads.product[0]?.uploading}
              />
              <div className="studio-mobile-footer">
                <button type="button" className="studio-footer-link" onClick={() => goTab("profile")}>Profile</button>
                <a className="studio-footer-link" href="https://wa.me/971522177594" target="_blank" rel="noreferrer">Need help?</a>
                <span className="studio-footer-link studio-footer-link--disabled">Tutorial</span>
              </div>
            </div>
          ) : (
            <Profile
              email={currentUserEmail || ""} credits={credits?.balance ?? null}
              expiresAt={credits?.meta?.expiresAt ?? null}
              generations={historyGenerations as any} feedbacks={historyFeedbacks as any}
              matchaUrl={MATCHA_URL} matcha5000Url={MATCHA_5000_URL} onConfirmCheckout={onConfirmCheckout}
              loading={historyLoading || creditsLoading} error={historyError}
              onLoadMore={() => void fetchHistoryMoreFn(historyDeps)}
              hasMore={historyHasMore} loadingMore={historyLoadingMore}
              onRefresh={() => { historyDirtyRef.current = true; creditsDirtyRef.current = true; _fetchCredits(); _fetchHistory(); }}
              onDelete={async (id) => {
                const deletedGen = historyGenerations.find((g: any) => g.id === id) || null;
                const deletedFb = historyFeedbacks.filter((f: any) => f.id === id);
                const res = await apiFetch(`/history/${encodeURIComponent(id)}`, { method: "DELETE" });
                if (!res.ok) { const txt = await res.text().catch(() => ""); throw new Error(`Delete failed (${res.status})${txt ? `: ${txt.slice(0, 180)}` : ""}`); }
                setHistoryGenerations((prev) => prev.filter((g) => g.id !== id));
                setHistoryFeedbacks((prev) => prev.filter((f) => f.id !== id));
                if (currentPassId && historyCacheRef.current[currentPassId]) { const c = historyCacheRef.current[currentPassId]; historyCacheRef.current[currentPassId] = { generations: c.generations.filter((g) => g.id !== id), feedbacks: c.feedbacks.filter((f) => f.id !== id), page: c.page }; }
                undoRedo.push({
                  label: "Delete creation",
                  undo: () => { if (deletedGen) setHistoryGenerations((prev) => [deletedGen as any, ...prev]); if (deletedFb.length) setHistoryFeedbacks((prev) => [...deletedFb, ...prev]); },
                  redo: () => { setHistoryGenerations((prev) => prev.filter((g) => g.id !== id)); setHistoryFeedbacks((prev) => prev.filter((f) => f.id !== id)); },
                });
              }}
              onRecreate={(draft) => { try { window.localStorage.setItem(RECREATE_DRAFT_KEY, JSON.stringify(draft)); } catch {} goTab("studio"); }}
              onBackToStudio={() => goTab("studio")} onLogout={handleSignOut}
            />
          )}
        </div>
        {customStylePanelOpen && (
          <div className="mina-modal-backdrop" onClick={() => setCustomStylePanelOpen(false)}>
            <div className="mina-modal" onClick={(e) => e.stopPropagation()}>
              <div className="mina-modal-header"><div>Create a style</div><button type="button" className="mina-modal-close" onClick={() => setCustomStylePanelOpen(false)}>Close</button></div>
              <div className="mina-modal-drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); handleCustomStyleFiles(e.dataTransfer.files, customStyleImages, customStyleHeroId, setCustomStyleImages, setCustomStyleHeroId, setCustomStyleHeroThumb); }}>
                <div className="mina-modal-drop-main"><button type="button" className="link-button" onClick={() => customStyleInputRef.current?.click()}>Upload images</button><span>(up to 10)</span></div>
                <div className="mina-modal-drop-help">Drop up to 10 reference images and pick one as hero.</div>
                <input ref={customStyleInputRef} id="mina_custom_style_upload" name="mina_custom_style_upload" type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => { handleCustomStyleFiles(e.target.files, customStyleImages, customStyleHeroId, setCustomStyleImages, setCustomStyleHeroId, setCustomStyleHeroThumb); e.target.value = ""; }} />
              </div>
              {customStyleImages.length > 0 && (
                <div className="mina-modal-grid">{customStyleImages.map((img) => (
                  <button key={img.id} type="button" className={classNames("mina-modal-thumb", customStyleHeroId === img.id && "hero")} onClick={() => handleSelectCustomStyleHero(img.id, customStyleImages, setCustomStyleHeroId, setCustomStyleHeroThumb)}>
                    <img src={img.url} alt="" />{customStyleHeroId === img.id && <div className="mina-modal-thumb-tag">Hero</div>}
                  </button>
                ))}</div>
              )}
              <div className="mina-modal-footer">
                {customStyleError && <div className="error-text">{customStyleError}</div>}
                <button type="button" className="mina-modal-train" onClick={() => void handleTrainCustomStyle({ apiFetch, currentPassId, uploadFileToR2: _uploadFileToR2, customStyleImages, customStyleHeroId, customStyles, setCustomStyleTraining, setCustomStyleError, setCustomStyles, setStylePresetKeys, setCustomStyleImages, setCustomStyleHeroId, setCustomStyleHeroThumb, setCustomStylePanelOpen })} disabled={!customStyleImages.length || !customStyleHeroId || customStyleTraining}>
                  {customStyleTraining ? "Creating…" : "Create style"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <WelcomeMatchaModal open={welcomeOpen} onClose={() => { setWelcomeOpen(false); try { window.localStorage.setItem(WELCOME_CLAIMED_KEY, "1"); } catch {} }} />
      {undoRedo.toast && <div className="mina-undo-toast">{undoRedo.toast}</div>}
    </>
  );
};

export default MinaApp;