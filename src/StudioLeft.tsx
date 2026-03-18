// src/StudioLeft.tsx
// Mina Studio — LEFT SIDE (Input + pills + panels + style + create + motion)
// Logic extracted to useStudioLeftState hook for module size.

import React from "react";
import MatchaQtyModal from "./components/MatchaQtyModal";
import SceneLibraryModal from "./components/SceneLibraryModal";
import "./StudioLeft.css";
import Collapse from "./components/Collapse";
import { cfInput1080 } from "./lib/cfInput1080";
import { classNames } from "./lib/minaHelpers";
import {
  AUDIO_THUMB_URL, TYPE_FOR_ME_ICON, MOTION_STYLES,
  inferMediaTypeFromItem,
} from "./lib/studioLeftHelpers";
import TutorialModal from "./components/TutorialModal";
import type { StudioLeftProps } from "./lib/studioLeftTypes";
import { useStudioLeftState } from "./hooks/useStudioLeftState";

const StudioLeft: React.FC<StudioLeftProps> = (props) => {
  const state = useStudioLeftState(props);
  const {
    globalDragging, typingHidden, minaTalking, timingVars,
    showPills, showPanels, showControls, uiStage,
    brief, briefHintVisible, briefShellRef, onBriefScroll, onBriefChange,
    activePanel, openPanel,
    pillInitialDelayMs, pillStaggerMs, panelRevealDelayMs,
    currentAspect, currentAspectIconUrl,
    onToggleAspectLandscape,
    animateAspectIconUrl, animateAspectIconRotated,
    uploads, uploadsPending,
    removeUploadItem, triggerPick,
    productInputRef, logoInputRef, inspirationInputRef,
    stylePresetKeys,
    onOpenCustomStylePanel, onImageUrlPasted,
    minaVisionEnabled, onToggleVision,
    stillGenerating, stillError, onCreateStill,
    motionGenerating, motionError, onCreateMotion, onTypeForMe,
    motionDurationSec, onToggleMotionDuration,
    sessionMatchasSpent, sessionStartTime,
    motionAudioEnabled, onToggleMotionAudio,
    minaMessage, minaTone,
    onDismissMinaNotice, onBriefFocus,
    minaError, onClearMinaError,
    stillLane, onToggleStillLane, stillLaneDisabled,
    videoLane, onToggleVideoLane,
    onGoProfile,
    // computed state
    aspectLandscape, displayAspectLabel, aspectIconRotate,
    onAspectPointerDown, onAspectClick, clearAspectHold,
    motionAspectLabel, motionAspectSubtitle, motionCostLabel,
    motionAudioLocked, effectiveMotionAudioEnabled, motionAudioLockHint,
    animateMode, isMotion, hasFrame2Video, hasFrame2Audio, hasRefMedia, refSeconds,
    allStyleCards, styleThumb, styleLabel, motionStyleThumb, motionStyleLabel,
    effectivePanel, pillBaseStyle, getDisplayUrl,
    productThumb, logoThumb, inspirationThumb,
    createState, createLabel, createDisabled, handleCreateClick, hasMotionHandler,
    motionSuggesting, motionHasImage, motionCreditsOk, typeForMeLabel,
    deleteConfirm, confirmDeleteYes, confirmDeleteNo,
    TUTORIAL_VIDEO_URL, tutorialOpen, setTutorialOpen, tutorialMobile, closeTutorial,
    sceneLibraryOpen, setSceneLibraryOpen,
    matchaQtyOpen, matchaQty, setMatchaQty, setMatchaQtyOpen, confirmMatchaQty, clampQty,
    onStyleSingleClick, onStyleDoubleClick,
    onThumbPointerDown, onThumbPointerMove, onThumbPointerUp, handleThumbClick,
    handleDropOnPanel, handleDragOver, handleFileInput,
    briefInputRef, briefFontSize,
    wantsMatcha, imageCreditsOk,
  } = state;

  const renderPillIcon = (
    src: string,
    fallback: React.ReactNode,
    isPlus?: boolean,
    options?: { plain?: boolean }
  ) => (
    <span
      className={classNames(
        "studio-pill-icon",
        src ? (options?.plain ? "studio-pill-icon-plain" : "studio-pill-icon-thumb") : "studio-pill-icon-mark",
        !src && isPlus && "studio-pill-icon--plus"
      )}
      aria-hidden="true"
    >
      {src ? <img src={src} alt="" /> : fallback}
    </span>
  );

  return (
    <div
      className={classNames(
        "studio-left",
        globalDragging && "drag-active",
        typingHidden && "is-typing-hidden",
        minaTalking && "is-thinking"
      )}
      style={timingVars}
    >
      {tutorialOpen && (
        <TutorialModal videoUrl={TUTORIAL_VIDEO_URL} mobile={tutorialMobile} onClose={closeTutorial} />
      )}
      <MatchaQtyModal
        open={matchaQtyOpen}
        qty={matchaQty}
        setQty={(n) => setMatchaQty(clampQty(n))}
        onClose={() => setMatchaQtyOpen(false)}
        onConfirm={(q) => confirmMatchaQty(q)}
        title="Get more Matcha"
        min={1}
        max={10}
      />
      <SceneLibraryModal
        open={sceneLibraryOpen}
        onClose={() => setSceneLibraryOpen(false)}
        onSetScene={(sceneUrl) => {
          // ✅ match Profile "Scene" behavior: set the scene + inject the scene prompt
          const SCENE_PROMPT =
            "Replace my product in the scene, keep my scene, composition, tone, aesthetic, highlights, and vibe style exactly the same";

          openPanel("product");

          // ✅ force the brief (this is what you meant by “add prompt like Profile”)
          onBriefChange(SCENE_PROMPT);

          // ✅ IMPORTANT: pass an optimized jpeg input so Mina can actually read it
          // Use higher width in animate mode to preserve detail for motion workflows.
          onImageUrlPasted?.(cfInput1080(sceneUrl, "product", animateMode ? 2160 : 1080));

          // optional: close modal immediately
          setSceneLibraryOpen(false);
        }}
      />

      <div className="studio-left-main">
        {/* Input 1 */}
        <div className="studio-input1-block">
          {/* Pills slot */}
          <div className="studio-pills-slot">
            <div className={classNames("studio-row", "studio-row--pills", !showPills && "hidden")}>
              {!isMotion ? (
                <>
                  {/* Product */}
                  <button
                    type="button"
                    className={classNames(
                      "studio-pill",
                      effectivePanel === "product" && "active",
                      !productThumb && "studio-pill--solo-plus"
                    )}
                    style={pillBaseStyle(0)}
                    title="Scene / Composition / Vibe"
                    onClick={() => {
                      if (!productThumb) triggerPick("product");
                      else openPanel("product");
                    }}
                    onMouseEnter={() => openPanel("product")}
                  >
                    {renderPillIcon(productThumb, "+", true)}
                    <span className="studio-pill-main">Scene</span>
                  </button>

                  {/* Logo */}
                  <button
                    type="button"
                    className={classNames(
                      "studio-pill",
                      activePanel === "logo" && "active",
                      !logoThumb && "studio-pill--solo-plus"
                    )}
                    style={pillBaseStyle(1)}
                    title="Logo / Label / Icon / Text / Design"
                    onClick={() => {
                      if (!logoThumb) triggerPick("logo");
                      else openPanel("logo");
                    }}
                    onMouseEnter={() => openPanel("logo")}
                  >
                    {renderPillIcon(logoThumb, "+", true)}
                    <span className="studio-pill-main">Logo</span>
                  </button>

                  {/* Inspiration */}
                  <button
                    type="button"
                    className={classNames(
                      "studio-pill",
                      activePanel === "inspiration" && "active",
                      !inspirationThumb && "studio-pill--solo-plus"
                    )}
                    style={pillBaseStyle(2)}
                    title="Product / Element / Texture / Material"
                    onClick={() => {
                      if (!inspirationThumb) triggerPick("inspiration");
                      else openPanel("inspiration");
                    }}
                    onMouseEnter={() => openPanel("inspiration")}
                  >
                    {renderPillIcon(inspirationThumb, "+", true)}
                    <span className="studio-pill-main">Product & Elements</span>
                  </button>

                  {/* Style */}
                  <button
                    type="button"
                    className={classNames(
                      "studio-pill",
                      "studio-pill--moodboard",
                      activePanel === "style" && "active",
                      !styleThumb && "studio-pill--solo-plus"
                    )}
                    style={pillBaseStyle(3)}
                    onClick={() => openPanel("style")}
                    onMouseEnter={() => openPanel("style")}
                  >
                    {renderPillIcon(styleThumb, "+", true)}
                    <span className="studio-pill-main">{styleLabel}</span>
                  </button>

                  <button
                    type="button"
                    className={classNames(
                      "studio-pill",
                      "pill-infinite-toggle",
                      stillLane === "niche" ? "is-niche" : "is-main"
                    )}
                    style={pillBaseStyle(4)}
                    onClick={onToggleStillLane}
                    disabled={!!stillLaneDisabled}
                    aria-label="Toggle still engine lane"
                    title="Toggle still engine"
                  >
                    <span className="studio-pill-main">{stillLane === "niche" ? "Niche" : "Main"}</span>
                  </button>

                  {/* Ratio */}
                  <button
                    type="button"
                    className={classNames("studio-pill", "studio-pill--aspect")}
                    style={pillBaseStyle(5)}
                    onPointerDown={onAspectPointerDown}
                    onPointerUp={clearAspectHold}
                    onPointerCancel={clearAspectHold}
                    onPointerLeave={clearAspectHold}
                    onContextMenu={(e) => e.preventDefault()}
                    onClick={onAspectClick}
                    title={onToggleAspectLandscape ? "Tap to cycle • Hold to flip landscape" : "Tap to cycle"}
                  >
                    <span className="studio-pill-icon">
                      <img src={currentAspectIconUrl} alt="" style={{ transform: aspectIconRotate }} />
                    </span>
                    <span className="studio-pill-main">{displayAspectLabel}</span>
                    <span className="studio-pill-sub">{currentAspect.subtitle}</span>
                  </button>
                </>
              ) : (
                <>
                  {/* Frames */}
                  <button
                    type="button"
                    className={classNames(
                      "studio-pill",
                      effectivePanel === "product" && "active",
                      !productThumb && "studio-pill--solo-plus"
                    )}
                    style={pillBaseStyle(0)}
                    onClick={() => {
                      if (!productThumb) triggerPick("product");
                      else openPanel("product");
                    }}
                    onMouseEnter={() => openPanel("product")}
                  >
                    {(() => {
                      // ✅ If Frame 1 was deleted and only Frame 2 remains:
                      // - audio => show GIF thumbnail
                      // - video => show autoplay mini-video thumbnail
                      const list = uploads.product || [];

                      if (isMotion && list.length === 1) {
                        const it = list[0];
                        const kind = inferMediaTypeFromItem(it);
                        const u = String(it.remoteUrl || it.url || "").trim();

                        if (kind === "audio") {
                          return renderPillIcon(AUDIO_THUMB_URL, "+", true);
                        }

                        if (kind === "video" && u) {
                          return (
                            <span
                              className={classNames("studio-pill-icon", "studio-pill-icon-thumb")}
                              aria-hidden="true"
                            >
                              <video
                                src={u}
                                autoPlay
                                loop
                                muted
                                playsInline
                                preload="metadata"
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              />
                            </span>
                          );
                        }
                      }

                      // Default: normal image thumbnail or plus
                      return renderPillIcon(productThumb, "+", true);
                    })()}
                    <span className="studio-pill-main">Frames</span>
                  </button>

                  {/* Short / Story toggle */}
                  <button
                    type="button"
                    className={classNames(
                      "studio-pill",
                      "pill-infinite-toggle",
                      videoLane === "story" ? "is-niche" : "is-main"
                    )}
                    style={pillBaseStyle(1)}
                    onClick={onToggleVideoLane}
                    aria-label="Toggle video lane"
                    title={videoLane === "story" ? "Story mode – cinematic multi-frame" : "Short mode – quick single or multi-frame"}
                  >
                    <span className="studio-pill-main">{videoLane === "story" ? "Story" : "Short"}</span>
                  </button>

                  {/* ✅ Sound / Muted (now always visible) */}
                  <button
                    type="button"
                    className={classNames(
                      "studio-pill",
                      "pill-audio-toggle",
                      effectiveMotionAudioEnabled ? "is-sound" : "is-mute",
                      motionAudioLocked && "studio-pill--ghost"
                    )}
                    style={pillBaseStyle(2)}
                    onClick={() => {
                      if (motionAudioLocked) return;
                      onToggleMotionAudio?.();
                    }}
                    disabled={motionAudioLocked || !onToggleMotionAudio}
                    title={motionAudioLockHint}
                  >
                    <span className="studio-pill-main">{effectiveMotionAudioEnabled ? "Sound" : "Muted"}</span>
                  </button>

                  {/* ✅ Duration (disabled when video/audio is used) */}
                  <button
                    type="button"
                    className={classNames("studio-pill", "pill-duration-toggle", hasRefMedia && "studio-pill--ghost")}
                    style={pillBaseStyle(3)}
                    onClick={() => {
                      if (hasRefMedia) return;
                      onToggleMotionDuration?.();
                    }}
                    disabled={!onToggleMotionDuration || hasRefMedia}
                    title={motionCostLabel}
                  >
                    <span className="studio-pill-main">
                      {hasRefMedia ? `${Math.round(refSeconds || 5)}s` : `${motionDurationSec}s`}
                    </span>
                  </button>

                  {/* Movement style */}
                  <button
                    type="button"
                    className={classNames(
                      "studio-pill",
                      effectivePanel === "style" && "active",
                      !motionStyleThumb && "studio-pill--solo-plus"
                    )}
                    style={pillBaseStyle(4)}
                    onClick={() => openPanel("style")}
                    onMouseEnter={() => openPanel("style")}
                  >
                    {renderPillIcon(motionStyleThumb, "+", true)}
                    <span className="studio-pill-main">{motionStyleLabel}</span>
                  </button>

                  {/* ✅ Ratio (fixed) */}
                  <button
                    type="button"
                    className={classNames("studio-pill", "studio-pill--aspect")}
                    style={pillBaseStyle(5)}
                    disabled
                  >
                    <span className="studio-pill-icon">
                      <img
                        src={animateAspectIconUrl || currentAspectIconUrl}
                        alt=""
                        style={{ transform: animateAspectIconRotated ? "rotate(90deg)" : undefined }}
                      />
                    </span>
                    <span className="studio-pill-main">{motionAspectLabel}</span>
                    <span className="studio-pill-sub">{motionAspectSubtitle}</span>
                  </button>

                  {/* ──────────────────────────────────────────────────────
                      "Type for me" pill — HIDDEN (not working reliably).
                      To re-enable, simply uncomment the JSX block below.
                      ────────────────────────────────────────────────────── */}
                  {/* <-- uncomment this block to restore the "Type for me" pill
                  {(() => {
                    const typeForMeDisabled =
                      motionSuggesting || motionGenerating || !hasMotionImage || !motionCreditsOk || hasRefMedia;

                    const typeForMeTitle = !hasMotionImage
                      ? "Upload at least 1 frame first"
                      : hasRefMedia
                      ? "Not needed when using video/audio"
                      : !motionCreditsOk
                      ? "Not enough Matcha"
                      : motionGenerating
                      ? "Animating…"
                      : motionSuggesting
                      ? "Typing…"
                      : "Type for me";

                    return (
                      <button
                        type="button"
                        className={classNames(
                          "studio-pill",
                          motionSuggesting && "active",
                          typeForMeDisabled && "studio-pill--ghost"
                        )}
                        style={pillBaseStyle(5)}
                        onClick={() => {
                          if (typeForMeDisabled) return;
                          onTypeForMe?.();
                        }}
                        disabled={typeForMeDisabled}
                        aria-disabled={typeForMeDisabled}
                        title={typeForMeTitle}
                      >
                        {renderPillIcon(TYPE_FOR_ME_ICON, "✎", false, { plain: true })}
                        <span className="studio-pill-main">{typeForMeLabel}</span>
                      </button>
                    );
                  })()}
                  end of "Type for me" pill --> */}
                </>
              )}
            </div>
          </div>

          {/* Session cost bar */}
          {isMotion && typeof sessionMatchasSpent === "number" && sessionMatchasSpent > 0 ? (
            <div className="studio-session-cost">
              <span className="studio-session-cost-label">Session</span>
              <span className="studio-session-cost-value">{sessionMatchasSpent} matchas</span>
              {sessionStartTime ? (
                <span className="studio-session-cost-time">
                  {new Date(sessionStartTime).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                </span>
              ) : null}
            </div>
          ) : null}

          {/* Textarea */}
          <div className="studio-brief-block">
            <div className={classNames("studio-brief-shell", briefHintVisible && "has-brief-hint")} ref={briefShellRef} onScroll={onBriefScroll}>
              <textarea
                ref={briefInputRef}
                className="studio-brief-input"
                maxLength={2500}
                style={{ fontSize: `${briefFontSize}px` }}
                placeholder={
                  isMotion ? "Describe the motion, the sound and the scene" : "Describe how you want your image"
                }
                value={brief}
                onChange={(e) => onBriefChange(e.target.value)}
                onFocus={() => { onDismissMinaNotice?.(); onBriefFocus?.(); }}
                rows={4}
                onPaste={(e) => {
                  const text = e.clipboardData?.getData("text/plain") || "";
                  if (!text) return;
                  const url = text.match(/https?:\/\/[^\s)]+/i)?.[0];
                  if (!url) return;

                  const okStill = /\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i.test(url);
                  const okMotion =
                    okStill || /\.(mp4|mov|webm|m4v|mp3|wav|m4a|aac|ogg)(\?.*)?$/i.test(url);

                  if ((isMotion && okMotion) || (!isMotion && okStill)) {
                    onImageUrlPasted?.(url);
                  }
                }}
              />
              {(() => {
                const hasError = !!(minaError && minaError.trim());
                const isInfo = !hasError && minaTone === "info";

                const overlayText = hasError ? minaError! : minaTalking ? minaMessage || "" : "";
                const overlayVisible = !!overlayText;

                return (
                  <div
                    className={classNames(
                      "studio-brief-overlay",
                      overlayVisible && "is-visible",
                      hasError && "is-error",
                      isInfo && "is-info"
                    )}
                    onClick={() => {
                      if (!hasError && !isInfo) return;
                      onDismissMinaNotice?.();
                      requestAnimationFrame(() => briefInputRef.current?.focus());
                    }}
                    aria-hidden="true"
                  >
                    {overlayText}
                  </div>
                );
              })()}
              {briefHintVisible && <div className="studio-brief-hint">Describe more</div>}
            </div>
          </div>
        </div>

        {/* Panels */}
        <div className="mina-left-block">
          {!isMotion ? (
            <>
              <Collapse open={showPanels && (effectivePanel === "product" || activePanel === null)} delayMs={panelRevealDelayMs}>
                <div className="studio-panel">
                  <div className="studio-panel-title">Add scene or inspiration</div>

                  <div className="studio-panel-row">
                    <div className="studio-thumbs studio-thumbs--inline" onDragOver={handleDragOver} onDrop={handleDropOnPanel("product")}>
                      {uploads.product.map((it, idx) => (
                        <button
                          key={it.id}
                          type="button"
                          className="studio-thumb"
                          data-panel="product"
                          data-index={idx}
                          style={{ touchAction: "none" }}
                          onPointerDown={onThumbPointerDown("product", idx)}
                          onPointerMove={onThumbPointerMove}
                          onPointerUp={onThumbPointerUp}
                          onPointerCancel={onThumbPointerUp}
                          onClick={() => handleThumbClick("product", it.id)}
                          title="Drag to reorder • Click to delete"
                        >
                          {getDisplayUrl(it) ? (
                            <img src={getDisplayUrl(it)} alt="" draggable={false} />
                          ) : it.uploading ? (
                            <span className="studio-thumb-spinner" aria-hidden="true" />
                          ) : null}
                        </button>
                      ))}

                      {uploads.product.length === 0 && (
                        <>
                          <button
                            type="button"
                            className="studio-plusbox studio-plusbox--inline"
                            onClick={() => triggerPick("product")}
                            title="Add image"
                          >
                            <span aria-hidden="true">+</span>
                          </button>
                          <button
                            type="button"
                            className="studio-librarybox"
                            onClick={() => setSceneLibraryOpen(true)}
                          >
                            Library
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </Collapse>

              <Collapse open={showPanels && activePanel === "logo"} delayMs={panelRevealDelayMs}>
                <div className="studio-panel">
                  <div className="studio-panel-title">Add logo, label, icon, text, packaging or design</div>

                  <div className="studio-panel-row">
                    <div className="studio-thumbs studio-thumbs--inline" onDragOver={handleDragOver} onDrop={handleDropOnPanel("logo")}>
                      {uploads.logo.map((it) => (
                        <button key={it.id} type="button" className="studio-thumb" onClick={() => removeUploadItem("logo", it.id)} title="Click to delete">
                          {getDisplayUrl(it) ? <img src={getDisplayUrl(it)} alt="" /> : it.uploading ? <span className="studio-thumb-spinner" aria-hidden="true" /> : null}
                        </button>
                      ))}

                      {uploads.logo.length === 0 && (
                        <button type="button" className="studio-plusbox studio-plusbox--inline" onClick={() => triggerPick("logo")} title="Add image">
                          <span aria-hidden="true">+</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </Collapse>

              <Collapse open={showPanels && activePanel === "inspiration"} delayMs={panelRevealDelayMs}>
                <div className="studio-panel">
                  <div className="studio-panel-title">Add product, elements, textures and materials</div>

                  <div className="studio-panel-row">
                    <div className="studio-thumbs studio-thumbs--inline" onDragOver={handleDragOver} onDrop={handleDropOnPanel("inspiration")}>
                      {uploads.inspiration.map((it, idx) => (
                        <button
                          key={it.id}
                          type="button"
                          className="studio-thumb"
                          data-panel="inspiration"
                          data-index={idx}
                          style={{ touchAction: "none" }}
                          onPointerDown={onThumbPointerDown("inspiration", idx)}
                          onPointerMove={onThumbPointerMove}
                          onPointerUp={onThumbPointerUp}
                          onPointerCancel={onThumbPointerUp}
                          onClick={() => handleThumbClick("inspiration", it.id)}
                          onDragStart={(e) => e.preventDefault()}
                          title="Drag to reorder • Click to delete"
                        >
                          {getDisplayUrl(it) ? (
                            <img src={getDisplayUrl(it)} alt="" draggable={false} style={{ WebkitUserDrag: "none", userSelect: "none" }} />
                          ) : it.uploading ? (
                            <span className="studio-thumb-spinner" aria-hidden="true" />
                          ) : null}
                        </button>
                      ))}

                      {uploads.inspiration.length < 8 && (
                        <button type="button" className="studio-plusbox studio-plusbox--inline" onClick={() => triggerPick("inspiration")} title="Add image">
                          <span aria-hidden="true">+</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </Collapse>

              <Collapse open={showPanels && activePanel === "style"} delayMs={panelRevealDelayMs}>
                <div className="studio-panel">
                  <div className="studio-panel-title">Pick a style</div>

                  <div className="studio-style-row">
                    {allStyleCards.map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        draggable
                        onDragStart={(e) => {
                          // marker (use BOTH types for cross-browser reliability)
                          e.dataTransfer.setData("text/x-mina-style-thumb", "1");
                          e.dataTransfer.setData("application/x-mina-style-thumb", "1");

                          e.dataTransfer.setData("text/uri-list", s.thumb);
                          e.dataTransfer.setData("text/plain", s.thumb);
                          e.dataTransfer.effectAllowed = "copy";
                        }}
                        className={classNames("studio-style-card", stylePresetKeys.includes(s.key) && "active")}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onStyleSingleClick(s.key); // single click = select
                        }}
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onStyleDoubleClick(s); // double click = confirm delete (custom only)
                        }}
                        title={s.isCustom ? "Double click to delete" : undefined}
                      >
                        <div className="studio-style-thumb">
                          {s.thumb ? <img src={s.thumb} alt="" draggable={false} /> : <span aria-hidden="true">+</span>}
                        </div>
                        <div className="studio-style-label">{s.label}</div>
                      </button>
                    ))}

                    {/* Create style */}
                    <button type="button" className={classNames("studio-style-card", "add")} onClick={onOpenCustomStylePanel}>
                      <div className="studio-style-thumb">
                        <span aria-hidden="true">+</span>
                      </div>
                      <div className="studio-style-label">Your style</div>
                    </button>
                  </div>
                </div>
              </Collapse>
            </>
          ) : (
            <>
              <Collapse open={showPanels && (effectivePanel === "product" || activePanel === null)} delayMs={panelRevealDelayMs}>
                <div className="studio-panel">
                  <div className="studio-panel-title">Add frames, video or sound</div>

                  <div className="studio-panel-row">
                    <div className="studio-thumbs studio-thumbs--inline" onDragOver={handleDragOver} onDrop={handleDropOnPanel("product")}>
                      {(() => {
                        const solo = uploads.product.length === 1;
                        const item = uploads.product[0];
                        const kind = inferMediaTypeFromItem(item);
                        const hasSoloRef = solo && (kind === "video" || kind === "audio");

                        if (!hasSoloRef) return null;

                        return (
                          <button
                            type="button"
                            className="studio-plusbox studio-plusbox--inline"
                            onClick={() => triggerPick("product")}
                            title="Add start frame (image)"
                          >
                            <span aria-hidden="true">+</span>
                          </button>
                        );
                      })()}
                      {uploads.product.map((it, idx) => (
                        <button
                          key={it.id}
                          type="button"
                          className="studio-thumb"
                          data-panel="product"
                          data-index={idx}
                          style={{ touchAction: "none" }}
                          onPointerDown={onThumbPointerDown("product", idx)}
                          onPointerMove={onThumbPointerMove}
                          onPointerUp={onThumbPointerUp}
                          onPointerCancel={onThumbPointerUp}
                          onClick={() => handleThumbClick("product", it.id)}
                          title="Drag to reorder • Click to delete"
                        >
                          {(() => {
                            const previewUrl = it.remoteUrl || it.url || "";
                            const kind = inferMediaTypeFromItem(it) || "image";

                            if (kind === "video" && previewUrl) {
                              return (
                                <video
                                  src={previewUrl}
                                  preload="metadata"
                                  playsInline
                                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                  onLoadedData={(e) => {
                                    try {
                                      const v = e.currentTarget;
                                      v.currentTime = 0;
                                      v.pause();
                                    } catch {}
                                  }}
                                  onMouseEnter={(e) => {
                                    const v = e.currentTarget;
                                    try {
                                      v.muted = false;
                                      v.currentTime = 0;
                                    } catch {}
                                    const p = v.play();
                                    if (p && typeof (p as Promise<void>).catch === "function") {
                                      (p as Promise<void>).catch(() => {});
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    const v = e.currentTarget;
                                    v.pause();
                                    try {
                                      v.currentTime = 0;
                                    } catch {}
                                  }}
                                />
                              );
                            }

                            if (kind === "audio" && previewUrl) {
                              return (
                                <img
                                  src={AUDIO_THUMB_URL}
                                  alt=""
                                  draggable={false}
                                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                  onMouseEnter={() => playHoverAudio(previewUrl)}
                                  onMouseLeave={() => stopHoverAudio(previewUrl)}
                                />
                              );
                            }

                            return getDisplayUrl(it) ? (
                              <img src={getDisplayUrl(it)} alt="" draggable={false} />
                            ) : it.uploading ? (
                              <span className="studio-thumb-spinner" aria-hidden="true" />
                            ) : null;
                          })()}
                        </button>
                      ))}

                      {uploads.product.length < 2 &&
                        !(
                          uploads.product.length === 1 &&
                          (() => {
                            const kind = inferMediaTypeFromItem(uploads.product[0]);
                            return kind === "video" || kind === "audio";
                          })()
                        ) && (
                        <button
                          type="button"
                          className="studio-plusbox studio-plusbox--inline"
                          onClick={() => triggerPick("product")}
                            title={
                              uploads.product.length === 0
                                ? "Add start frame (image)"
                                : "Add frame 2 (image / video / audio)"
                            }
                        >
                          <span aria-hidden="true">+</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </Collapse>

              <Collapse open={showPanels && (effectivePanel === "style" || activePanel === null)} delayMs={panelRevealDelayMs}>
                <div className="studio-panel">
                  <div className="studio-panel-title">Pick movement styles</div>

                  <div className="studio-style-row">
                    {MOTION_STYLES.map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/x-mina-style-thumb", "1");
                          e.dataTransfer.setData("application/x-mina-style-thumb", "1");
                          e.dataTransfer.setData("text/uri-list", m.thumb);
                          e.dataTransfer.setData("text/plain", m.thumb);
                          e.dataTransfer.effectAllowed = "copy";
                        }}
                        className={classNames("studio-style-card", "studio-motion-style-card", motionStyleKeys.includes(m.key) && "active")}
                        onClick={() => pickMotionStyle(m.key)}
                      >
                        <div className={classNames("studio-style-thumb", "studio-motion-style-thumb")}>
                          {m.thumb ? (
                            <img src={m.thumb} alt="" draggable={false} />
                          ) : (
                            <span aria-hidden="true">{m.label.slice(0, 1)}</span>
                          )}
                        </div>
                        <div className="studio-motion-style-label">{m.label}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </Collapse>
            </>
          )}

          {/* Controls */}
          {showControls && (
            <div className="studio-controls">
              <div className="studio-controls-divider" />

              <button type="button" className="studio-vision-toggle" onClick={onToggleVision}>
                Mina Vision Intelligence: <span className="studio-vision-state">{minaVisionEnabled ? "ON" : "OFF"}</span>
              </button>

              {isMotion && motionBlockReason ? <div className="error-text">{motionBlockReason}</div> : null}

              <div className="studio-create-block">
                <button
                  type="button"
                  aria-busy={createDisabled}
                  className={classNames("studio-create-link", createDisabled && "disabled", createState === "describe_more" && "state-describe")}
                  disabled={createDisabled}
                  onClick={handleCreateClick}
                  title={isMotion && !hasMotionHandler ? "Wire onCreateMotion in MinaApp" : undefined}
                >
                  {createLabel}
                </button>
              </div>

              {!isMotion && stillError && !(minaError && minaError.trim()) && (
                <div className="error-text">{stillError}</div>
              )}
              {isMotion && motionError && !(minaError && minaError.trim()) && (
                <div className="error-text">{motionError}</div>
              )}
            </div>
          )}
        </div>

        {/* Delete confirm modal */}
        {deleteConfirm && (
          <div
            onClick={confirmDeleteNo}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
              padding: 16,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "min(420px, 92vw)",
                background: "#fff",
                borderRadius: 18,
                padding: 18,
                boxShadow: "0 16px 50px rgba(0,0,0,0.25)",
              }}
            >
              <div style={{ fontSize: 16, marginBottom: 12 }}>
                Do you want delete style <b>{deleteConfirm.label}</b>?
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={confirmDeleteNo}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    background: "#fff",
                    cursor: "pointer",
                  }}
                >
                  <b>NO</b>
                </button>

                <button
                  type="button"
                  onClick={confirmDeleteYes}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid #111",
                    background: "#111",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  <b>YES</b>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Hidden file inputs */}
        <input
          ref={productInputRef}
          type="file"
          accept={isMotion ? "image/*,video/*,audio/*" : "image/*"}
          multiple={isMotion}
          style={{ display: "none" }}
          onChange={(e) => handleFileInput("product", e)}
        />
        <input
          ref={logoInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => handleFileInput("logo", e)}
        />
        <input
          ref={inspirationInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => handleFileInput("inspiration", e)}
        />
      </div>

      <div className="studio-footer-links">
        <button type="button" className="studio-footer-link" onClick={onGoProfile}>
          Profile
        </button>
        <a className="studio-footer-link" href="https://wa.me/971522177594" target="_blank" rel="noreferrer">
          Need help?
        </a>
        <button type="button" className="studio-footer-link" onClick={() => setTutorialOpen(true)}>
          Tutorial
        </button>
      </div>
    </div>
  );
};

export default StudioLeft;