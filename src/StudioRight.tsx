// src/StudioRight.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./StudioRight.css";
import StillImage from "./components/StillImage";
import type { StillItem, MotionItem, FtMode, FtModelKey, FingertipsResult } from "./lib/minaTypes";
import { MASK_MODELS, PROMPT_MODELS, FT_INITIAL_DELAY, FT_STAGGER } from "./lib/studioRightHelpers";
import { useFingertips } from "./hooks/useFingertips";

type StudioRightProps = {
  currentStill: StillItem | null;
  currentMotion: MotionItem | null;
  stillItems: StillItem[];
  stillIndex: number;
  setStillIndex: (i: number) => void;
  tweakText: string;
  setTweakText: (v: string) => void;
  onSendTweak: (text: string) => void;
  onRecreate?: (args: { kind: "still" | "motion"; stillIndex: number }) => void;
  onSetScene?: (args: { url: string; clearInspiration?: boolean }) => void;
  sending?: boolean;
  error?: string | null;
  tweakCreditsOk?: boolean;
  tweakBlockReason?: string | null;
  onFingertipsGenerate?: (args: {
    modelKey: FtModelKey;
    inputs: Record<string, any>;
  }) => Promise<FingertipsResult | null>;
  fingertipsSending?: boolean;
  currentAspect?: string;
  onLike?: () => void;
  isLiked?: boolean;
  likeDisabled?: boolean;
  onDownload?: () => void;
  downloadDisabled?: boolean;
  animateMode?: boolean;
  onDropUpload?: (file: File) => void;
  rightUploading?: boolean;
};

export default function StudioRight(props: StudioRightProps) {
  const {
    currentStill, currentMotion, stillItems, stillIndex, setStillIndex,
    tweakText, setTweakText, onSendTweak, onSetScene,
    sending, error, tweakCreditsOk, tweakBlockReason,
    onFingertipsGenerate, fingertipsSending, currentAspect,
    onLike, isLiked, likeDisabled, onDownload, downloadDisabled,
    animateMode, onDropUpload, rightUploading,
  } = props;

  const isEmpty = !currentStill && !currentMotion;

  const [showMotion, setShowMotion] = useState(false);
  useEffect(() => { setShowMotion(!!currentMotion); }, [currentMotion?.url]);

  const safeStillUrl = useMemo(() => {
    const clean = (u: any) => String(u || "").trim();
    const isInputAsset = (u: string) => /\/(product|logo|inspiration|style)\//i.test(u);
    const isReplicateTemp = (u: string) => /replicate\.delivery/i.test(u);
    const isGeneratedStill = (u: string) =>
      !!u && !isReplicateTemp(u) && !isInputAsset(u) &&
      (/\/mma\//i.test(u) || /\/generations\//i.test(u));
    const byIndex = clean(stillItems?.[stillIndex]?.url);
    const fromCurrent = clean(currentStill?.url);
    if (isGeneratedStill(byIndex)) return byIndex;
    if (isGeneratedStill(fromCurrent)) return fromCurrent;
    const best = stillItems?.map((it) => clean(it?.url)).find((u) => isGeneratedStill(u)) || "";
    if (best) return best;
    const fallback = byIndex || fromCurrent;
    if (fallback && !isReplicateTemp(fallback)) return fallback;
    return "";
  }, [stillItems, stillIndex, currentStill?.url]);

  const media = useMemo(() => {
    if (currentMotion && (showMotion || !safeStillUrl)) return { type: "video" as const, url: currentMotion.url };
    if (safeStillUrl) return { type: "image" as const, url: safeStillUrl };
    return null;
  }, [currentMotion, showMotion, safeStillUrl]);

  // Preload adjacent carousel images
  useEffect(() => {
    if (stillItems.length < 2) return;
    const n = stillItems.length;
    [(stillIndex - 1 + n) % n, (stillIndex + 1) % n].forEach((i) => {
      const url = stillItems[i]?.url;
      if (url) { const img = new Image(); img.src = url; }
    });
  }, [stillIndex, stillItems]);

  // ============================================================================
  // Swipe/drag handling
  // ============================================================================
  const suppressClickRef = useRef(false);
  const pointerRef = useRef({ active: false, startX: 0, startY: 0, pointerId: null as number | null });
  const wheelRef = useRef({ acc: 0, lastT: 0 });
  const WHEEL_TRIGGER = 60;
  const SWIPE_PX = 44;
  const SWIPE_SLOPE = 1.2;

  const [containMode, setContainMode] = useState(false);
  useEffect(() => { setContainMode(false); }, [media?.url]);

  const hasStills = stillItems.length > 0;
  const hasStillCarousel = stillItems.length > 1;

  const goPrev = () => {
    if (!hasStills) return;
    if (showMotion) setShowMotion(false);
    if (!hasStillCarousel) return;
    const n = stillItems.length;
    setStillIndex((stillIndex - 1 + n) % n);
  };
  const goNext = () => {
    if (!hasStills) return;
    if (showMotion) setShowMotion(false);
    if (!hasStillCarousel) return;
    const n = stillItems.length;
    setStillIndex((stillIndex + 1) % n);
  };

  // ============================================================================
  // FINGERTIPS (delegated to hook)
  // ============================================================================
  const ft = useFingertips({ safeStillUrl, currentAspect, onFingertipsGenerate });
  const { ftMode } = ft;

  // ============================================================================
  // DOUBLE-CLICK -> enter fingertips
  // ============================================================================
  const lastClickRef = useRef<number>(0);

  const handleFrameClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
    if (ftMode === "mask") return;
    if (!media) return;
    const now = Date.now();
    const delta = now - lastClickRef.current;
    lastClickRef.current = now;
    if (delta < 400 && media.type === "image" && !ftMode) {
      setContainMode(true);
      ft.setFtMode("toolbar");
      return;
    }
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const pct = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0.5;
    const EDGE = 0.18;
    if (hasStills && pct <= EDGE) return goPrev();
    if (hasStills && pct >= 1 - EDGE) return goNext();
    setContainMode((v) => !v);
  };

  const onPointerDown: React.PointerEventHandler<HTMLButtonElement> = (e) => {
    if (!media) return;
    pointerRef.current = { active: true, startX: e.clientX, startY: e.clientY, pointerId: e.pointerId };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  };

  const onPointerMove: React.PointerEventHandler<HTMLButtonElement> = (e) => {
    const st = pointerRef.current;
    if (!st.active) return;
    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    if (Math.abs(dx) < SWIPE_PX) return;
    if (Math.abs(dx) < Math.abs(dy) * SWIPE_SLOPE) return;
    st.active = false;
    suppressClickRef.current = true;
    if (dx > 0) goPrev(); else goNext();
  };

  const onPointerEnd: React.PointerEventHandler<HTMLButtonElement> = (e) => {
    const st = pointerRef.current;
    st.active = false;
    if (st.pointerId != null) { try { e.currentTarget.releasePointerCapture(st.pointerId); } catch {} }
    st.pointerId = null;
  };

  const onWheel: React.WheelEventHandler<HTMLButtonElement> = (e) => {
    if (!hasStills) return;
    const dx = e.deltaX; const dy = e.deltaY;
    if (Math.abs(dx) < 8) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.1) return;
    const now = performance.now();
    const dt = now - wheelRef.current.lastT;
    wheelRef.current.lastT = now;
    if (dt > 120) wheelRef.current.acc = 0;
    wheelRef.current.acc += dx;
    if (Math.abs(wheelRef.current.acc) < WHEEL_TRIGGER) return;
    e.preventDefault();
    suppressClickRef.current = true;
    if (wheelRef.current.acc > 0) goNext(); else goPrev();
    wheelRef.current.acc = 0;
  };

  // ============================================================================
  // TWEAK BAR STATE
  // ============================================================================
  const trimmed = (tweakText || "").trim();
  const creditsOk = tweakCreditsOk !== false;
  const blockMsg = (tweakBlockReason || "Get more matchas to tweak.").trim();
  const canSend = !isEmpty && !!trimmed && !sending && creditsOk;
  const sendNow = () => { if (!canSend) return; onSendTweak(trimmed); };
  const isImage = media?.type === "image";
  const isBusy = !!sending || !!fingertipsSending || ft.ftProcessing;

  // ============================================================================
  // UPLOAD BUTTON (Create mode, state 0)
  // ============================================================================
  const fileInputRef = useRef<HTMLInputElement>(null);
  const onFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) { const t = (file.type || "").toLowerCase(); if (t.startsWith("image/")) onDropUpload?.(file); }
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [onDropUpload],
  );
  const showUploadBtn = isEmpty && !animateMode && !!onDropUpload;

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <div className="studio-right">
      <div className="studio-right-surface">
        {isEmpty ? (
          showUploadBtn ? (
            <>
              <button
                type="button"
                className={`studio-upload-btn${rightUploading ? " studio-upload-btn--loading" : ""}`}
                disabled={!!rightUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {rightUploading ? "Uploading…" : "+ Upload image to edit"}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFileInputChange} />
            </>
          ) : (
            <div className="studio-empty-text">New ideas don't exist, just recycle.</div>
          )
        ) : (
          <>
            <button
              type="button"
              className="studio-output-click"
              onClick={handleFrameClick}
              onPointerDown={ftMode === "mask" ? undefined : onPointerDown}
              onPointerMove={ftMode === "mask" ? undefined : onPointerMove}
              onPointerUp={ftMode === "mask" ? undefined : onPointerEnd}
              onPointerCancel={ftMode === "mask" ? undefined : onPointerEnd}
              onWheel={ftMode === "mask" ? undefined : onWheel}
              aria-label="Toggle zoom / Navigate / Swipe"
            >
              <div className={`studio-output-frame ${containMode ? "is-contain" : ""}`}>
                {media?.type === "video" ? (
                  <video
                    key={media.url} className="studio-output-media" src={media.url}
                    autoPlay loop muted controls draggable={false}
                    onDragStart={(e) => e.preventDefault()}
                  />
                ) : (
                  <StillImage key={media.url} url={media?.url || ""} />
                )}
              </div>
            </button>

            {/* MASK OVERLAY */}
            {ftMode === "mask" && safeStillUrl && (
              <div
                className={`ft-mask-overlay${ft.maskPanning ? " is-panning" : ""}${ft.cursorInZone ? " cursor-in" : " cursor-out"}`}
                ref={ft.maskOverlayRef}
                onPointerEnter={(e) => {
                  ft.setCursorInZone(true);
                  if (ft.maskCursorRef.current) {
                    ft.maskCursorRef.current.style.left = `${e.clientX}px`;
                    ft.maskCursorRef.current.style.top = `${e.clientY}px`;
                  }
                }}
                onPointerLeave={() => ft.setCursorInZone(false)}
                onWheel={(e) => {
                  const z = ft.maskZoomRef.current;
                  if (e.ctrlKey) {
                    const pinchDelta = e.deltaY > 0 ? 0.95 : 1.05;
                    const newScale = Math.max(0.5, Math.min(5, z.scale * pinchDelta));
                    const rect = ft.maskOverlayRef.current!.getBoundingClientRect();
                    const mx = e.clientX - rect.left; const my = e.clientY - rect.top;
                    z.x = mx - (mx - z.x) * (newScale / z.scale);
                    z.y = my - (my - z.y) * (newScale / z.scale);
                    z.scale = newScale;
                    ft.applyMaskZoom();
                    return;
                  }
                  if (e.shiftKey || (Math.abs(e.deltaX) > Math.abs(e.deltaY) * 0.5 && Math.abs(e.deltaX) > 2)) {
                    z.x -= e.deltaX || e.deltaY;
                    z.y -= e.shiftKey ? e.deltaY : 0;
                    ft.applyMaskZoom();
                    return;
                  }
                  const delta = e.deltaY > 0 ? 0.92 : 1.08;
                  const newScale = Math.max(0.5, Math.min(5, z.scale * delta));
                  const rect = ft.maskOverlayRef.current!.getBoundingClientRect();
                  const mx = e.clientX - rect.left; const my = e.clientY - rect.top;
                  z.x = mx - (mx - z.x) * (newScale / z.scale);
                  z.y = my - (my - z.y) * (newScale / z.scale);
                  z.scale = newScale;
                  ft.applyMaskZoom();
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  ft.maskZoomRef.current = { scale: 1, x: 0, y: 0 };
                  ft.applyMaskZoom();
                }}
              >
                <img className="ft-mask-underlay" src={safeStillUrl} alt="" draggable={false} />
                <canvas ref={ft.maskCanvasRef} className="ft-mask-canvas" style={{ opacity: 0, pointerEvents: "none" }} />
                <svg
                  ref={ft.lassoSvgRef}
                  className="ft-mask-svg"
                  onPointerDown={(e) => {
                    if (ft.maskPanning) {
                      e.preventDefault();
                      ft.maskPanStartRef.current = { x: e.clientX, y: e.clientY, zx: ft.maskZoomRef.current.x, zy: ft.maskZoomRef.current.y };
                      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                      return;
                    }
                    ft.handleMaskPointerDown(e);
                  }}
                  onPointerMove={(e) => {
                    if (ft.maskPanning && ft.maskPanStartRef.current) {
                      const ps = ft.maskPanStartRef.current;
                      const z = ft.maskZoomRef.current;
                      z.x = ps.zx + (e.clientX - ps.x);
                      z.y = ps.zy + (e.clientY - ps.y);
                      ft.applyMaskZoom();
                      return;
                    }
                    ft.handleMaskPointerMove(e);
                  }}
                  onPointerUp={(e) => {
                    if (ft.maskPanning) { ft.maskPanStartRef.current = null; return; }
                    ft.handleMaskPointerUp();
                  }}
                  onPointerCancel={() => {
                    if (ft.maskPanning) { ft.maskPanStartRef.current = null; return; }
                    ft.handleMaskPointerUp();
                  }}
                />
                {ft.eraseAnimating && ft.eraseClipPathRef.current && (
                  <svg className="ft-erase-svg">
                    <defs>
                      <clipPath id="erase-clip"><path d={ft.eraseClipPathRef.current} /></clipPath>
                    </defs>
                    <rect x="0" y="0" width="100%" height="100%" clipPath="url(#erase-clip)" className="ft-erase-fill" />
                  </svg>
                )}
                <div ref={ft.maskCursorRef} className={`ft-mask-cursor${ft.maskPanning ? " is-panning" : ""}${ft.cursorInZone ? " is-in" : " is-out"}`} />
                <div className="ft-mask-hint">Scroll to zoom · Space+drag to pan · Right-click to reset</div>
              </div>
            )}

            {hasStills && (hasStillCarousel || !!currentMotion) && !ftMode && (
              <div className="studio-dots-row" aria-label="Media carousel">
                {currentMotion && (
                  <button type="button" className={`studio-dot ${showMotion ? "active" : ""} is-video`}
                    onClick={() => setShowMotion(true)} aria-label="Show video" title="Video" />
                )}
                {stillItems.map((item, idx) => (
                  <button key={item.id} type="button"
                    className={`studio-dot ${!showMotion && idx === stillIndex ? "active" : ""}`}
                    onClick={() => { setShowMotion(false); setStillIndex(idx); }}
                    aria-label={`Go to image ${idx + 1}`} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* NORMAL TWEAK BAR */}
      {!isEmpty && !ftMode && (
        <div className="studio-feedback-bar">
          <input
            className="studio-feedback-input--compact"
            placeholder="Double click or type to edit "
            value={tweakText}
            onChange={(e) => setTweakText(e.target.value)}
            disabled={!!sending || !creditsOk}
            onKeyDown={(e) => { if (e.key === "Enter" && canSend) sendNow(); }}
          />
          <div className="studio-feedback-actions">
            <button type="button" className="studio-action-btn"
              onClick={() => { if (!safeStillUrl) return; onSetScene?.({ url: safeStillUrl, clearInspiration: true }); }}
              disabled={isEmpty || !!sending || !onSetScene || !safeStillUrl}
              title={!onSetScene ? "Set Scene not available" : undefined}
            >Set Scene</button>
            <span className="studio-action-separator" aria-hidden="true">|</span>
            <button type="button" className={`studio-action-btn${isLiked ? " is-on" : ""}`}
              onClick={() => onLike?.()} disabled={isEmpty || likeDisabled}
            >{isLiked ? "Liked" : "Like"}</button>
            <span className="studio-action-separator" aria-hidden="true">|</span>
            <button type="button" className="studio-action-btn"
              onClick={() => onDownload?.()} disabled={isEmpty || downloadDisabled}
            >Download</button>
            <span className="studio-action-separator" aria-hidden="true">|</span>
            <button type="button" className="studio-action-btn"
              onClick={sendNow} disabled={!canSend}
              title={!creditsOk ? blockMsg : undefined}
            >{sending ? "Tweaking…" : "Tweak"}</button>
          </div>
          {!creditsOk && <div className="studio-feedback-error">{blockMsg}</div>}
          {!!error && <div className="studio-feedback-error">{error}</div>}
        </div>
      )}

      {/* FINGERTIPS TOOLBAR */}
      {!isEmpty && ftMode === "toolbar" && (
        <div className="studio-fingertips-bar">
          {([
            { key: "expand" as FtModelKey, label: "Expand", sep: false },
            { key: "flux_fill" as FtModelKey, label: "Draw", sep: true },
            { key: "eraser" as FtModelKey, label: "Erase", sep: false },
          ]).map((item, idx) => (
            <React.Fragment key={item.key}>
              {item.sep && (
                <span className={`ft-btn-separator ${ft.ftBtnVisible ? "is-visible" : ""}`}
                  style={{ transitionDelay: ft.ftBtnVisible ? `${FT_INITIAL_DELAY + idx * FT_STAGGER}ms` : "0ms" }}
                  aria-hidden="true">|</span>
              )}
              <button type="button"
                className={`ft-btn ${ft.ftBtnVisible ? "is-visible" : ""}`}
                style={{ transitionDelay: ft.ftBtnVisible ? `${FT_INITIAL_DELAY + idx * FT_STAGGER}ms` : "0ms" }}
                onClick={() => { item.key === "flux_fill" ? ft.handleFluxFill() : ft.handleFtModel(item.key); }}
                disabled={isBusy}
              >{ft.ftProcessing && ft.ftActiveModel === item.key ? "Processing…" : item.label}</button>
            </React.Fragment>
          ))}
          <span style={{ flex: "1 1 auto" }} />
          <button type="button"
            className={`ft-btn ${ft.ftBtnVisible ? "is-visible" : ""}`}
            style={{ transitionDelay: ft.ftBtnVisible ? `${FT_INITIAL_DELAY + 10 * FT_STAGGER}ms` : "0ms" }}
            onClick={ft.exitFingertips}
          >Back</button>
          {ft.ftError && <div className="ft-error">{ft.ftError}</div>}
        </div>
      )}

      {/* FINGERTIPS PROMPT MODE */}
      {!isEmpty && ftMode === "prompt" && (
        <div className="studio-fingertips-bar">
          <button type="button"
            className={`ft-btn ${ft.ftBtnVisible ? "is-visible" : ""}`}
            style={{ transitionDelay: ft.ftBtnVisible ? `${FT_INITIAL_DELAY}ms` : "0ms" }}
            onClick={() => { ft.setFtMode("toolbar"); ft.setFtActiveModel(null); ft.setFtPrompt(""); }}
          >Back</button>
          <input
            className={`ft-prompt-input ${ft.ftBtnVisible ? "is-visible" : ""}`}
            style={{ transitionDelay: ft.ftBtnVisible ? `${FT_INITIAL_DELAY + FT_STAGGER}ms` : "0ms" }}
            placeholder="Describe what to generate in the selection…"
            value={ft.ftPrompt}
            onChange={(e) => ft.setFtPrompt(e.target.value)}
            disabled={isBusy}
            onKeyDown={(e) => { if (e.key === "Enter" && ft.ftPrompt.trim()) ft.handlePromptSubmit(); }}
            autoFocus
          />
          <button type="button"
            className={`ft-btn is-underline ${ft.ftBtnVisible ? "is-visible" : ""}`}
            style={{ transitionDelay: ft.ftBtnVisible ? `${FT_INITIAL_DELAY + 2 * FT_STAGGER}ms` : "0ms" }}
            onClick={ft.handlePromptSubmit}
            disabled={isBusy || !ft.ftPrompt.trim()}
          >{ft.ftProcessing ? "Processing…" : "Tweak"}</button>
          {ft.ftError && <div className="ft-error">{ft.ftError}</div>}
        </div>
      )}

      {/* FINGERTIPS MASK MODE */}
      {!isEmpty && ftMode === "mask" && (
        <div className="studio-fingertips-bar">
          <button type="button"
            className={`ft-btn ${ft.ftBtnVisible ? "is-visible" : ""}`}
            style={{ transitionDelay: ft.ftBtnVisible ? `${FT_INITIAL_DELAY}ms` : "0ms" }}
            onClick={() => {
              if (ft.ftActiveModel === "flux_fill") ft.setFtMode("prompt");
              else { ft.setFtMode("toolbar"); ft.setFtActiveModel(null); }
            }}
          >Back</button>
          <span
            className={`ft-btn ${ft.ftBtnVisible ? "is-visible" : ""}`}
            style={{ transitionDelay: ft.ftBtnVisible ? `${FT_INITIAL_DELAY + FT_STAGGER}ms` : "0ms", cursor: "default", opacity: ft.ftBtnVisible ? 0.5 : 0 }}
          >{ft.ftActiveModel === "eraser" ? "Draw around the area to erase" : "Draw around the area to fill"}</span>
          <button type="button"
            className={`ft-btn ${ft.ftBtnVisible ? "is-visible" : ""}`}
            style={{ transitionDelay: ft.ftBtnVisible ? `${FT_INITIAL_DELAY + 2 * FT_STAGGER}ms` : "0ms" }}
            onClick={ft.clearMaskCanvas}
          >Clear</button>
          <span style={{ flex: "1 1 auto" }} />
          <button type="button"
            className={`ft-btn ${ft.ftBtnVisible ? "is-visible" : ""}`}
            style={{ transitionDelay: ft.ftBtnVisible ? `${FT_INITIAL_DELAY + 3 * FT_STAGGER}ms` : "0ms" }}
            onClick={ft.handleMaskSubmit}
            disabled={isBusy}
          >{ft.ftProcessing ? "Processing…" : ft.ftActiveModel === "eraser" ? "Erase" : "Apply"}</button>
          {ft.ftError && <div className="ft-error">{ft.ftError}</div>}
        </div>
      )}
    </div>
  );
}