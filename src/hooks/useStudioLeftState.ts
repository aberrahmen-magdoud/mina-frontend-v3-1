import { useEffect, useMemo, useRef, useState } from "react";
import type { StudioLeftProps } from "../lib/studioLeftTypes";
import type {
  UploadPanelKey, PanelKey, UploadItem,
  AspectOptionLike, MotionStyleKey,
} from "../lib/minaTypes";
import { classNames } from "../lib/minaHelpers";
import { isVideoUrl, isAudioUrl } from "../lib/mediaHelpers";
import {
  AUDIO_THUMB_URL, TYPE_FOR_ME_ICON, MOTION_STYLES,
  inferMediaTypeFromItem,
} from "../lib/studioLeftHelpers";
import { cfInput1080 } from "../lib/cfInput1080";

type SetState<T> = (value: T | ((prev: T) => T)) => void;
type MutableRef<T> = { current: T };

// ────────────────────────────────────────────────────────────
// useStudioLeftState — all logic formerly inside <StudioLeft>
// ────────────────────────────────────────────────────────────

export function useStudioLeftState(props: StudioLeftProps) {
  const {
    globalDragging,
    typingHidden,
    showPills,
    showPanels,
    showControls,
    uiStage,

    brief,
    briefHintVisible,
    briefShellRef,
    onBriefScroll,
    onBriefChange,

    activePanel,
    openPanel,

    pillInitialDelayMs,
    pillStaggerMs,
    panelRevealDelayMs,

    currentAspect,
    currentAspectIconUrl,
    onCycleAspect,
    aspectLandscape: aspectLandscapeProp,
    onToggleAspectLandscape,

    animateAspect,
    animateAspectIconUrl,
    animateAspectIconRotated,

    uploads,
    uploadsPending,

    removeUploadItem,
    moveUploadItem,
    triggerPick,

    productInputRef,
    logoInputRef,
    inspirationInputRef,

    stylePresetKeys,
    setStylePresetKeys,
    stylePresets,
    customStyles,
    getStyleLabel,
    deleteCustomStyle,

    onOpenCustomStylePanel,
    onImageUrlPasted,

    minaVisionEnabled,
    onToggleVision,

    stillGenerating,
    stillError,
    onCreateStill,

    motionHasImage: motionHasImageProp,
    motionGenerating,
    motionError,
    onCreateMotion,
    onTypeForMe,
    motionDurationSec,
    motionCostLabel: motionCostLabelProp,
    onToggleMotionDuration,

    sessionMatchasSpent,
    sessionStartTime,

    motionAudioEnabled,
    motionAudioLocked: motionAudioLockedProp,
    effectiveMotionAudioEnabled: effectiveMotionAudioEnabledProp,
    onToggleMotionAudio,

    imageCreditsOk: imageCreditsOkProp,
    credits: creditsProp,
    matchaUrl,
    matcha5000Url,
    onConfirmCheckout,

    minaMessage,
    minaTalking,
    minaTone,
    onDismissMinaNotice,
    onBriefFocus,
    minaError,
    onClearMinaError,

    stillLane,
    onToggleStillLane,
    stillLaneDisabled,

    videoLane,
    onToggleVideoLane,

    timingVars,

    onGoProfile,
  } = props;

  // ────────────────── Mobile auto-cycle to 9:16 ──────────────────
  const mobileAspectTriesRef = useRef(0);
  const mobileAspectDoneRef = useRef(false);

  const aspectToken = useMemo(() => {
    return String(currentAspect?.ratio || currentAspect?.key || currentAspect?.label || "").trim();
  }, [currentAspect?.ratio, currentAspect?.key, currentAspect?.label]);

  useEffect(() => {
    const isMobile = window.matchMedia("(max-width: 900px)").matches;
    if (!isMobile) return;
    if (mobileAspectDoneRef.current) return;

    const raw = aspectToken;
    const norm = raw.replace(/\s+/g, "").toLowerCase();
    const digits = norm.replace(/[^0-9]/g, "");

    const isTarget = norm === "9:16" || norm === "9/16" || digits === "916";
    if (isTarget) { mobileAspectDoneRef.current = true; return; }

    if (mobileAspectTriesRef.current >= 20) { mobileAspectDoneRef.current = true; return; }
    mobileAspectTriesRef.current += 1;

    const t = window.setTimeout(() => onCycleAspect?.(), 0);
    return () => window.clearTimeout(t);
  }, [aspectToken, onCycleAspect]);

  const aspectLandscape = !!aspectLandscapeProp;

  // ────────────────── Aspect hold / long-press ──────────────────
  const aspectHoldTimerRef = useRef<number | null>(null);
  const suppressNextAspectClickRef = useRef(false);

  const parseRatio = (s: string) => {
    const t = String(s || "").trim();
    if (!t) return null;
    const m = t.match(/^(\d+(?:\.\d+)?)\s*[:\/xX-]\s*(\d+(?:\.\d+)?)$/);
    if (!m) return null;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null;
    return { a, b };
  };

  const swapRatioText = (s: string) => {
    const r = parseRatio(s);
    if (!r) return s;
    if (r.a === r.b) return `${r.a}:${r.b}`;
    return `${r.b}:${r.a}`;
  };

  const isSquareRatio = (s: string) => {
    const r = parseRatio(s);
    if (!r) return false;
    return r.a === r.b;
  };

  const displayAspectLabel = useMemo(() => {
    const base = String(currentAspect?.label || currentAspect?.ratio || "").trim();
    if (!aspectLandscape) return base;
    return swapRatioText(base);
  }, [aspectLandscape, currentAspect?.label, currentAspect?.ratio]);

  const aspectIconRotate = useMemo(() => {
    const base = String(currentAspect?.label || currentAspect?.ratio || "").trim();
    return aspectLandscape && base && !isSquareRatio(base) ? "rotate(90deg)" : undefined;
  }, [aspectLandscape, currentAspect?.label, currentAspect?.ratio]);

  const motionAspect = (animateAspect ?? currentAspect) as AspectOptionLike;
  const motionAspectLabel = String(motionAspect?.label || motionAspect?.ratio || "").trim() || "Auto";
  const motionAspectSubtitle = String(motionAspect?.subtitle || "").trim();

  const clearAspectHold = () => {
    if (aspectHoldTimerRef.current !== null) {
      window.clearTimeout(aspectHoldTimerRef.current);
      aspectHoldTimerRef.current = null;
    }
  };

  const onAspectPointerDown = () => {
    if (!onToggleAspectLandscape) return;
    suppressNextAspectClickRef.current = false;
    clearAspectHold();
    aspectHoldTimerRef.current = window.setTimeout(() => {
      suppressNextAspectClickRef.current = true;
      onToggleAspectLandscape?.();
      clearAspectHold();
    }, 520);
  };

  const onAspectClick = () => {
    if (suppressNextAspectClickRef.current) { suppressNextAspectClickRef.current = false; return; }
    onCycleAspect?.();
  };

  // ────────────────── Matcha / credits ──────────────────
  const creditBalance = Number(creditsProp);
  const hasCreditNumber = Number.isFinite(creditBalance);
  const STILL_COST = stillLane === "niche" ? 2 : 1;
  const imageCreditsOk = hasCreditNumber ? creditBalance >= STILL_COST : (imageCreditsOkProp ?? true);
  const hasMotionImage = !!motionHasImageProp;

  const briefInputRef = useRef<HTMLTextAreaElement | null>(null);

  // ────────────────── Style delete confirm ──────────────────
  const [deleteConfirm, setDeleteConfirm] = useState<{ key: string; label: string } | null>(null);

  // ────────────────── Tutorial ──────────────────
  const TUTORIAL_VIDEO_URL =
    "https://assets.faltastudio.com/Website%20Assets/Video%20Mina%20tutorial.mp4";
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialMobile, setTutorialMobile] = useState(false);
  const [sceneLibraryOpen, setSceneLibraryOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const update = () => setTutorialMobile(mq.matches);
    update();
    // @ts-ignore
    if (mq.addEventListener) mq.addEventListener("change", update);
    else mq.addListener(update);
    return () => {
      // @ts-ignore
      if (mq.removeEventListener) mq.removeEventListener("change", update);
      else mq.removeListener(update);
    };
  }, []);

  useEffect(() => {
    if (!tutorialOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setTutorialOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tutorialOpen]);

  const closeTutorial = () => setTutorialOpen(false);

  // ────────────────── Matcha quantity popup ──────────────────
  const [matchaQtyOpen, setMatchaQtyOpen] = useState(false);
  const [matchaQty, setMatchaQty] = useState(1);

  const clampQty = (n: number) => Math.max(1, Math.min(100, Math.floor(Number(n || 1))));

  const buildMatchaCheckoutUrl = (base: string, qty: number) => {
    const q = clampQty(qty);
    try {
      const u = new URL(String(base || ""));
      const m = u.pathname.match(/\/cart\/(\d+)(?::(\d+))?/);
      if (m?.[1]) { u.pathname = `/cart/${m[1]}:${q}`; return u.toString(); }
      if (u.pathname.includes("/cart/add")) { u.searchParams.set("quantity", String(q)); return u.toString(); }
      u.searchParams.set("quantity", String(q));
      return u.toString();
    } catch { return String(base || ""); }
  };

  const openMatchaQty = () => { setMatchaQty(1); setMatchaQtyOpen(true); };

  const confirmMatchaQty = (qty: number) => {
    setMatchaQtyOpen(false);
    if (onConfirmCheckout) { onConfirmCheckout(qty); } else {
      const is5000 = qty === 100 && matcha5000Url;
      const url = is5000 ? matcha5000Url : buildMatchaCheckoutUrl(matchaUrl, qty);
      window.open(url, "_blank", "noopener");
    }
  };

  // ────────────────── Style single/double click ──────────────────
  const styleClickTimerRef = useRef<number | null>(null);
  const pendingStyleKeyRef = useRef<string | null>(null);

  useEffect(() => {
    return () => { if (styleClickTimerRef.current !== null) window.clearTimeout(styleClickTimerRef.current); };
  }, []);

  const onStyleSingleClick = (key: string) => {
    if (styleClickTimerRef.current !== null) window.clearTimeout(styleClickTimerRef.current);
    pendingStyleKeyRef.current = key;
    styleClickTimerRef.current = window.setTimeout(() => {
      const k = pendingStyleKeyRef.current;
      pendingStyleKeyRef.current = null;
      styleClickTimerRef.current = null;
      if (k) toggleStylePreset(k);
    }, 220);
  };

  const onStyleDoubleClick = (s: { key: string; label: string; isCustom: boolean }) => {
    if (styleClickTimerRef.current !== null) window.clearTimeout(styleClickTimerRef.current);
    styleClickTimerRef.current = null;
    pendingStyleKeyRef.current = null;
    if (!s.isCustom) return;
    setDeleteConfirm({ key: s.key, label: s.label });
  };

  const confirmDeleteYes = () => { if (!deleteConfirm) return; deleteCustomStyle(deleteConfirm.key); setDeleteConfirm(null); };
  const confirmDeleteNo = () => setDeleteConfirm(null);

  // ────────────────── Pointer-based reordering ──────────────────
  const reorderRef = useRef<{
    panel: UploadPanelKey; index: number; pointerId: number;
    startX: number; startY: number; active: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const DRAG_THRESHOLD_PX = 6;

  const onThumbPointerDown =
    (panel: UploadPanelKey, index: number) =>
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      if ((uploads[panel]?.length || 0) < 2) return;
      if (animateMode && panel === "product") {
        const list = uploads.product || [];
        const hasRef = list.some((it) => { const k = inferMediaTypeFromItem(it); return k === "video" || k === "audio"; });
        if (hasRef) return;
      }
      suppressClickRef.current = false;
      reorderRef.current = { panel, index, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, active: false };
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
      e.preventDefault(); e.stopPropagation();
    };

  const onThumbPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const st = reorderRef.current;
    if (!st || st.pointerId !== e.pointerId) return;
    if (animateMode && st.panel === "product") {
      const list = uploads.product || [];
      const hasRef = list.some((it) => { const k = inferMediaTypeFromItem(it); return k === "video" || k === "audio"; });
      if (hasRef) return;
    }
    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    const dist = Math.hypot(dx, dy);
    if (!st.active) { if (dist < DRAG_THRESHOLD_PX) return; st.active = true; suppressClickRef.current = true; }
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const btn = el?.closest("button.studio-thumb") as HTMLButtonElement | null;
    const to = btn?.dataset?.index ? Number(btn.dataset.index) : NaN;
    if (!Number.isFinite(to)) return;
    if (to !== st.index) { moveUploadItem(st.panel, st.index, to); st.index = to; }
    e.preventDefault(); e.stopPropagation();
  };

  const onThumbPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const st = reorderRef.current;
    if (!st || st.pointerId !== e.pointerId) return;
    reorderRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    if (st.active) { window.setTimeout(() => { suppressClickRef.current = false; }, 0); }
  };

  const handleThumbClick = (panel: UploadPanelKey, id: string) => {
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
    removeUploadItem(panel, id);
  };

  // ────────────────── Motion mode (with local fallback) ──────────────────
  const [localAnimate, setLocalAnimate] = useState(false);
  const animateMode = props.animateMode ?? localAnimate;
  const prevAnimateModeRef = useRef(animateMode);

  const [localMotionStyle, setLocalMotionStyle] = useState<MotionStyleKey[]>([]);
  const motionStyleKeys = props.motionStyleKeys ?? localMotionStyle;
  const setMotionStyleKeys = props.setMotionStyleKeys ?? setLocalMotionStyle;

  useEffect(() => { if (animateMode) setMotionStyleKeys([]); }, [animateMode, setMotionStyleKeys]);

  const stillBriefRef = useRef<string>("");
  const motionBriefRef = useRef<string>("");

  useEffect(() => {
    if (animateMode) motionBriefRef.current = brief;
    else stillBriefRef.current = brief;
  }, [brief, animateMode]);

  useEffect(() => {
    const prev = prevAnimateModeRef.current;
    if (animateMode === prev) return;
    if (animateMode) { stillBriefRef.current = brief; openPanel("product"); }
    else { motionBriefRef.current = brief; openPanel("product"); }
    prevAnimateModeRef.current = animateMode;
  }, [animateMode, brief, onBriefChange, openPanel]);

  const isMotion = animateMode;

  // ────────────────── Frame 2 media detection ──────────────────
  const frame2Item = isMotion ? uploads?.product?.[1] : null;
  const frame2Kind = inferMediaTypeFromItem(frame2Item);
  const hasFrame2Video = isMotion && !!frame2Item && frame2Kind === "video";
  const hasFrame2Audio = isMotion && !!frame2Item && frame2Kind === "audio";
  const hasRefMedia = hasFrame2Video || hasFrame2Audio;

  // Auto-fix ordering: if video/audio first, swap image to Frame 1
  useEffect(() => {
    if (!animateMode) return;
    const list = uploads.product || [];
    if (list.length !== 2) return;
    const k0 = inferMediaTypeFromItem(list[0]);
    const k1 = inferMediaTypeFromItem(list[1]);
    if ((k0 === "video" || k0 === "audio") && k1 === "image") moveUploadItem("product", 1, 0);
  }, [animateMode, uploads.product, moveUploadItem]);

  const motionAudioLocked = false;
  const effectiveMotionAudioEnabled = motionAudioEnabled !== false;
  const motionAudioLockHint = hasFrame2Audio
    ? "Toggle audio for reference audio"
    : hasFrame2Video
    ? "Toggle audio for reference video"
    : "Toggle audio";

  const forcedAudioSyncRef = useRef(false);
  useEffect(() => {
    if (!motionAudioLocked) { forcedAudioSyncRef.current = false; return; }
    if (forcedAudioSyncRef.current) return;
    if (typeof onToggleMotionAudio !== "function") return;
    forcedAudioSyncRef.current = true;
  }, [motionAudioLocked, onToggleMotionAudio]);

  // ────────────────── Motion cost ──────────────────
  const matchasPerSec = 1;
  const MOTION_COST_BASE = (motionDurationSec ?? 5) * matchasPerSec;

  const frame2DurationSec = Number((frame2Item as any)?.durationSec || 0);
  const refSecondsRaw = hasFrame2Video
    ? Math.min(30, frame2DurationSec || 5)
    : hasFrame2Audio ? Math.min(60, frame2DurationSec || 5) : 0;

  const refSeconds = hasRefMedia
    ? hasFrame2Video
      ? Math.min(30, Math.max(3, Math.round(refSecondsRaw || 5)))
      : Math.min(60, Math.max(1, Math.round(refSecondsRaw || 5)))
    : 0;

  const MOTION_COST = hasRefMedia ? (refSeconds || 5) * matchasPerSec : MOTION_COST_BASE;

  const computedMotionCostLabel = (() => {
    if (hasFrame2Video) return `${MOTION_COST} matchas (${Math.round(refSeconds || 5)}s video)`;
    if (hasFrame2Audio) return `${MOTION_COST} matchas (${Math.round(refSeconds || 5)}s audio)`;
    return `${MOTION_COST} matchas (${motionDurationSec}s)`;
  })();

  const motionCostLabel = motionCostLabelProp ?? computedMotionCostLabel;

  // ────────────────── Brief font size ──────────────────
  const briefLen = brief.trim().length;
  const briefFontSize = briefLen <= 500 ? 32 : Math.max(16, 32 - ((briefLen - 500) / 2000) * 16);

  // ────────────────── Hover audio ──────────────────
  const hoverAudioRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  const playHoverAudio = (url: string) => {
    if (!url) return;
    const cache = hoverAudioRef.current;
    let audio = cache.get(url);
    if (!audio) { audio = new Audio(url); audio.loop = true; cache.set(url, audio); }
    try { audio.currentTime = 0; } catch {}
    const p = audio.play();
    if (p && typeof (p as Promise<void>).catch === "function") (p as Promise<void>).catch(() => {});
  };

  const stopHoverAudio = (url: string) => {
    const audio = hoverAudioRef.current.get(url);
    if (!audio) return;
    audio.pause();
    try { audio.currentTime = 0; } catch {}
  };

  // ────────────────── Pill delay style ──────────────────
  const pillBaseStyle = (index: number): React.CSSProperties => ({
    transitionDelay: showPills ? `${pillInitialDelayMs + index * pillStaggerMs}ms` : "0ms",
    opacity: showPills ? 1 : 0,
    transform: showPills ? "translateY(0)" : "translateY(-8px)",
  });

  // ────────────────── Panel helpers ──────────────────
  const effectivePanel: PanelKey = uiStage === 0 ? null : activePanel ?? "product";

  const getFirstImageUrl = (items: UploadItem[]) => items[0]?.remoteUrl || items[0]?.url || "";

  const getDisplayUrl = (it: UploadItem) => {
    const u = it?.remoteUrl || it?.url || "";
    if (!u || u.startsWith("blob:")) return "";
    return u;
  };

  // ────────────────── Drag / drop ──────────────────
  const extractDropUrl = (e: React.DragEvent) => {
    const dt = e.dataTransfer;
    const uri = (dt.getData("text/uri-list") || "").trim();
    const plain = (dt.getData("text/plain") || "").trim();
    const html = dt.getData("text/html") || "";
    const fromHtml =
      html.match(/src\s*=\s*["']([^"']+)["']/i)?.[1] || html.match(/https?:\/\/[^\s"'<>]+/i)?.[0] || "";
    const candidates = [uri, plain, fromHtml].filter(Boolean).map((u) => u.split("\n")[0].trim());
    for (const u of candidates) { if (/^https?:\/\//i.test(u)) return u; }
    return "";
  };

  const handleDropOnPanel = (panel: UploadPanelKey) => (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    const dt = e.dataTransfer;
    const types = Array.from(dt?.types ?? []);
    const isStyleThumbDrag =
      types.includes("text/x-mina-style-thumb") ||
      types.includes("application/x-mina-style-thumb") ||
      dt?.getData("text/x-mina-style-thumb") === "1" ||
      dt?.getData("application/x-mina-style-thumb") === "1";
    if (isStyleThumbDrag) return;
    const url = extractDropUrl(e);
    if (url) { openPanel(panel); props.onImageUrlPasted?.(url); return; }
    const files = e.dataTransfer?.files;
    if (files && files.length) { props.onFilesPicked(panel, files); return; }
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; };

  // ────────────────── Thumbnail URLs ──────────────────
  const productThumb = getFirstImageUrl(uploads.product);
  const logoThumb = getFirstImageUrl(uploads.logo);
  const inspirationThumb = getFirstImageUrl(uploads.inspiration);

  // ────────────────── Style cards ──────────────────
  const allStyleCards = useMemo(() => {
    return [
      ...stylePresets.map((p) => ({ key: p.key, label: getStyleLabel(p.key, p.label), thumb: p.thumb, isCustom: false })),
      ...customStyles.map((s) => ({ key: s.key, label: getStyleLabel(s.key, s.label), thumb: s.thumbUrl, isCustom: true })),
    ];
  }, [stylePresets, customStyles, getStyleLabel]);

  const selectedStyleCards = allStyleCards.filter((c: { key: string }) => stylePresetKeys.includes(c.key));
  const primaryStyleCard = selectedStyleCards[0] || null;
  const styleThumb = primaryStyleCard?.thumb || "";
  const styleLabel =
    selectedStyleCards.length === 0 ? "Mooadboard"
    : selectedStyleCards.length === 1 ? primaryStyleCard?.label || "Style"
    : `${selectedStyleCards.length} styles`;

  const motionStyleCards = MOTION_STYLES;
  const selectedMotionCards = motionStyleCards.filter((c) => motionStyleKeys.includes(c.key));
  const motionStyleThumb = selectedMotionCards[0]?.thumb || "";
  const motionStyleLabel =
    selectedMotionCards.length === 0 ? "Styles"
    : selectedMotionCards.length === 1 ? selectedMotionCards[0].label
    : `${selectedMotionCards.length} styles`;

  // ────────────────── Create CTA state machine ──────────────────
  type CreateState = "creating" | "uploading" | "need_frame" | "describe_more" | "ready";

  const hasMotionHandler = typeof props.onCreateMotion === "function";
  const motionSuggesting = !!props.motionSuggesting;
  const motionHasImage = !!props.motionHasImage;
  const canCreateMotion = props.canCreateMotion ?? (hasRefMedia ? true : briefLen >= 1);
  const motionCreditsOk = hasCreditNumber ? creditBalance >= MOTION_COST : (props.motionCreditsOk ?? true);

  const motionBlockReason =
    !motionCreditsOk ? "I need more matchas to animate." : (props.motionBlockReason || null);

  const typeForMeLabel = motionSuggesting ? "Typing…" : "Type for me";

  const imageCreateState: CreateState = stillGenerating
    ? "creating" : uploadsPending
    ? "uploading" : !imageCreditsOk
    ? "describe_more" : briefLen < 20
    ? "describe_more" : "ready";

  const motionCreateState: CreateState = motionGenerating
    ? "creating" : motionSuggesting
    ? "creating" : uploadsPending
    ? "uploading" : !motionHasImage
    ? "need_frame" : !motionCreditsOk
    ? "describe_more" : canCreateMotion
    ? "ready" : "describe_more";

  const createState: CreateState = isMotion ? motionCreateState : imageCreateState;
  const canCreateStill = imageCreateState === "ready";

  const wantsMatcha = (!isMotion && !imageCreditsOk) || (isMotion && !motionCreditsOk);

  const createLabel =
    createState === "creating"
      ? isMotion ? (motionSuggesting ? "Typing…" : "Animating…") : "Creating…"
    : createState === "uploading" ? "Uploading…"
    : createState === "need_frame" ? "Add frame"
    : createState === "describe_more"
      ? wantsMatcha ? (isMotion ? "I need more matchas" : "Get more matchas") : "Describe more"
    : isMotion ? "Animate" : "Create";

  const createDisabled = (() => {
    if (createState === "creating" || createState === "uploading") return true;
    if (createState === "need_frame") return false;
    if (createState === "describe_more") return false;
    if (isMotion) return !hasMotionHandler || motionSuggesting || !motionCreditsOk || !motionHasImage || !canCreateMotion;
    return !canCreateStill || !imageCreditsOk;
  })();

  const handleCreateClick = () => {
    if (createState === "ready") { if (isMotion) onCreateMotion?.(); else onCreateStill(); return; }
    if (createState === "need_frame") { openPanel("product"); triggerPick("product"); return; }
    if (createState === "describe_more") {
      if (wantsMatcha) { openMatchaQty(); return; }
      requestAnimationFrame(() => briefInputRef.current?.focus());
    }
  };

  // ────────────────── File inputs ──────────────────
  const handleFileInput = (panel: UploadPanelKey, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length) props.onFilesPicked(panel, files);
    e.target.value = "";
  };

  // ────────────────── Motion style pick ──────────────────
  const pickMotionStyle = (k: MotionStyleKey) => {
    const exists = motionStyleKeys.includes(k);
    const next = exists ? motionStyleKeys.filter((x: MotionStyleKey) => x !== k) : [...motionStyleKeys, k];
    const added = !exists;
    setMotionStyleKeys(next);
    openPanel("style");
    const trimmed = brief.trim();
    if ((!trimmed || trimmed.length < 4) && added) {
      const seed = MOTION_STYLES.find((s) => s.key === k)?.seed || "";
      if (seed) onBriefChange(seed);
    }
  };

  // ────────────────── Still style toggle ──────────────────
  const toggleStylePreset = (key: string) => {
    const exists = stylePresetKeys.includes(key);
    const next = !isMotion ? (exists ? [] : [key]) : (exists ? stylePresetKeys.filter((k: string) => k !== key) : [...stylePresetKeys, key]);
    setStylePresetKeys(next);
    openPanel("style");
  };

  // ════════════════════════════════════════════════════════════
  // Return everything the JSX needs
  // ════════════════════════════════════════════════════════════
  return {
    // props pass-through (JSX references these directly)
    globalDragging, typingHidden,
    showPills, showPanels, showControls, uiStage,
    brief, briefHintVisible, briefShellRef, onBriefScroll, onBriefChange,
    activePanel, openPanel,
    pillInitialDelayMs, pillStaggerMs, panelRevealDelayMs,
    currentAspect, currentAspectIconUrl, onCycleAspect,
    onToggleAspectLandscape,
    animateAspect, animateAspectIconUrl, animateAspectIconRotated,
    uploads, uploadsPending,
    removeUploadItem, moveUploadItem, triggerPick,
    productInputRef, logoInputRef, inspirationInputRef,
    stylePresetKeys, setStylePresetKeys,
    stylePresets, customStyles, getStyleLabel, deleteCustomStyle,
    onOpenCustomStylePanel, onImageUrlPasted,
    minaVisionEnabled, onToggleVision,
    stillGenerating, stillError, onCreateStill,
    motionGenerating, motionError, onCreateMotion, onTypeForMe,
    motionDurationSec,
    onToggleMotionDuration,
    sessionMatchasSpent, sessionStartTime,
    motionAudioEnabled, onToggleMotionAudio,
    matchaUrl, matcha5000Url, onConfirmCheckout,
    minaMessage, minaTalking, minaTone,
    onDismissMinaNotice, onBriefFocus,
    minaError, onClearMinaError,
    stillLane, onToggleStillLane, stillLaneDisabled,
    videoLane, onToggleVideoLane,
    timingVars, onGoProfile,

    // computed / local state
    aspectLandscape, displayAspectLabel, aspectIconRotate,
    onAspectPointerDown, onAspectClick, clearAspectHold,

    motionAspect, motionAspectLabel, motionAspectSubtitle,
    motionCostLabel,
    motionAudioLocked, effectiveMotionAudioEnabled, motionAudioLockHint,

    creditBalance, hasCreditNumber, STILL_COST, MOTION_COST,
    imageCreditsOk, hasMotionImage, wantsMatcha,

    briefInputRef, briefFontSize,

    deleteConfirm, confirmDeleteYes, confirmDeleteNo,

    TUTORIAL_VIDEO_URL,
    tutorialOpen, setTutorialOpen, tutorialMobile, closeTutorial,
    sceneLibraryOpen, setSceneLibraryOpen,

    matchaQtyOpen, matchaQty, setMatchaQty, setMatchaQtyOpen,
    openMatchaQty, confirmMatchaQty, clampQty,

    onStyleSingleClick, onStyleDoubleClick,
    toggleStylePreset, pickMotionStyle,

    onThumbPointerDown, onThumbPointerMove, onThumbPointerUp,
    handleThumbClick,

    animateMode, isMotion, motionStyleKeys, setMotionStyleKeys,
    frame2Kind, hasFrame2Video, hasFrame2Audio, hasRefMedia, refSeconds,

    allStyleCards, selectedStyleCards, styleThumb, styleLabel,
    motionStyleThumb, motionStyleLabel,

    effectivePanel,
    pillBaseStyle,
    getDisplayUrl,

    productThumb, logoThumb, inspirationThumb,

    createState, createLabel, createDisabled, handleCreateClick,
    canCreateMotion, canCreateStill, hasMotionHandler,
    motionSuggesting, motionHasImage, motionCreditsOk, motionBlockReason,
    typeForMeLabel,

    handleFileInput,
    handleDropOnPanel, handleDragOver,
    playHoverAudio, stopHoverAudio,
  };
}
