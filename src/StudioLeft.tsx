// src/StudioLeft.tsx
// ============================================================================
// Mina Studio — LEFT SIDE
// - Create mode (your normal UI)
// - Animate mode (Image + Mouvement style + Ratio auto + AI typing suggestion)
// ============================================================================

import React, { useEffect, useMemo, useRef } from "react";
import "./StudioLeft.css";

export type MotionStyleKey =
  | "melt"
  | "drop"
  | "expand"
  | "satisfying"
  | "slow-motion"
  | "fix-camera";

export type UploadItem = {
  id: string;
  url: string; // preview / remote
  remoteUrl?: string; // if you store to R2, use this
};

type AnimatePanel = "image" | "motionStyle" | null;

type StudioLeftProps = {
  // mode is driven by header toggle in MinaApp
  mode: "create" | "animate";

  // existing left create textarea
  brief: string;
  onBriefChange: (v: string) => void;

  // vision toggle (keep as-is)
  minaVisionEnabled: boolean;
  onToggleVision: () => void;

  // create action (keep as-is)
  onCreateStill: () => void;
  stillGenerating: boolean;
  stillError: string | null;

  // --------------------------
  // Animate mode state (from MinaApp)
  // --------------------------
  animateActivePanel: AnimatePanel;
  setAnimateActivePanel: (p: AnimatePanel) => void;

  motionImage: UploadItem | null;
  onPickMotionImage: (files: FileList) => void;
  onRemoveMotionImage: () => void;

  motionStylesSelected: MotionStyleKey[];
  setMotionStylesSelected: (keys: MotionStyleKey[]) => void;

  // textarea for motion prompt
  motionBrief: string;
  onMotionBriefChange: (v: string) => void;

  // ✅ call your backend /motion/suggest (MinaApp will pass it)
  // returns suggestion text to type into textarea
  onSuggestMotionBrief: (referenceImageUrl: string) => Promise<string>;

  // ratio is auto (MinaApp computes it)
  motionAspectLabel: string; // e.g. "9:16" or "16:9"
  motionAspectSubtitle: string; // e.g. "Auto"
  motionAspectIconUrl: string;
  motionAspectIconRotateDeg: number;

  // animate action (MinaApp calls /motion/generate)
  onCreateMotion: () => void;
  motionGenerating: boolean;
  motionError: string | null;
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function StudioLeft(props: StudioLeftProps) {
  const {
    mode,
    brief,
    onBriefChange,
    minaVisionEnabled,
    onToggleVision,
    onCreateStill,
    stillGenerating,
    stillError,

    animateActivePanel,
    setAnimateActivePanel,
    motionImage,
    onPickMotionImage,
    onRemoveMotionImage,
    motionStylesSelected,
    setMotionStylesSelected,
    motionBrief,
    onMotionBriefChange,
    onSuggestMotionBrief,
    motionAspectLabel,
    motionAspectSubtitle,
    motionAspectIconUrl,
    motionAspectIconRotateDeg,
    onCreateMotion,
    motionGenerating,
    motionError,
  } = props;

  // --------------------------------------------------------------------------
  // Animate styles list (multi-select)
  // --------------------------------------------------------------------------
  const motionStyles = useMemo(
    () => [
      { key: "melt" as const, letter: "M", label: "Melt" },
      { key: "drop" as const, letter: "D", label: "Drop" },
      { key: "expand" as const, letter: "E", label: "Expand" },
      { key: "satisfying" as const, letter: "S", label: "Satisfying" },
      { key: "slow-motion" as const, letter: "S", label: "Slow motion" },
      { key: "fix-camera" as const, letter: "F", label: "Fix camera" },
    ],
    []
  );

  // ✅ default selected style in animate mode = fix-camera (but user can deselect)
  useEffect(() => {
    if (mode !== "animate") return;
    if (motionStylesSelected.length === 0) {
      setMotionStylesSelected(["fix-camera"]);
    }
    // only run when switching to animate
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const toggleMotionStyle = (k: MotionStyleKey) => {
    const has = motionStylesSelected.includes(k);
    if (has) {
      setMotionStylesSelected(motionStylesSelected.filter((x) => x !== k));
    } else {
      setMotionStylesSelected([...motionStylesSelected, k]);
    }
  };

  // --------------------------------------------------------------------------
  // AI typing suggestion for motion textarea (cute typing effect)
  // - auto triggers when:
  //   mode=animate AND motionImage exists AND motionBrief empty
  // --------------------------------------------------------------------------
  const typingAbortRef = useRef(false);
  const lastSuggestKeyRef = useRef<string>("");

  const setTypedBrief = (full: string) => {
    // type effect
    typingAbortRef.current = false;
    onMotionBriefChange(""); // clear first

    let i = 0;
    const step = () => {
      if (typingAbortRef.current) return;
      i++;
      onMotionBriefChange(full.slice(0, i));

      if (i < full.length) {
        const jitter = 14 + Math.floor(Math.random() * 22); // 14-36ms
        window.setTimeout(step, jitter);
      }
    };

    // start
    window.setTimeout(step, 80);
  };

  useEffect(() => {
    if (mode !== "animate") return;
    if (!motionImage) return;

    const refUrl = motionImage.remoteUrl || motionImage.url;
    if (!refUrl) return;

    // only when textarea is empty (don’t overwrite user)
    if (motionBrief.trim().length > 0) return;

    // don’t re-suggest same image repeatedly
    if (lastSuggestKeyRef.current === refUrl) return;
    lastSuggestKeyRef.current = refUrl;

    let cancelled = false;

    (async () => {
      try {
        const text = await onSuggestMotionBrief(refUrl);
        if (cancelled) return;
        if (!text || !text.trim()) return;
        setTypedBrief(text.trim());
      } catch {
        // ignore; UI stays usable
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, motionImage?.remoteUrl, motionImage?.url]);

  // user typing cancels AI typing
  const handleMotionChange = (v: string) => {
    typingAbortRef.current = true;
    onMotionBriefChange(v);
  };

  // --------------------------------------------------------------------------
  // File input for animate image
  // --------------------------------------------------------------------------
  const motionInputRef = useRef<HTMLInputElement | null>(null);

  const handleMotionFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length) onPickMotionImage(files);
    e.target.value = "";
  };

  // --------------------------------------------------------------------------
  // CTA states
  // --------------------------------------------------------------------------
  const createReady = brief.trim().length >= 40;
  const createLabel = stillGenerating ? "Creating…" : createReady ? "Create" : "Describe more";

  const animateHasImage = !!motionImage;
  const animateReady = animateHasImage && motionBrief.trim().length >= 10;
  const animateLabel = motionGenerating
    ? "Animating…"
    : !animateHasImage
      ? "Add image"
      : animateReady
        ? "Animate"
        : "Describe more";

  const onClickCTA = () => {
    if (mode === "create") {
      if (stillGenerating) return;
      if (!createReady) return; // keep your behavior (focus etc) in MinaApp if you want
      onCreateStill();
      return;
    }

    // animate
    if (motionGenerating) return;
    if (!animateHasImage) {
      motionInputRef.current?.click();
      return;
    }
    if (!animateReady) return;
    onCreateMotion();
  };

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  return (
    <div className="studio-left">
      <div className="studio-left-main">
        {/* Pills */}
        <div className="studio-pills-slot">
          <div className="studio-row studio-row--pills">
            {mode === "create" ? (
              <>
                {/* keep your existing pills in MinaApp if you have them;
                    here we keep minimal — your UI already does it */}
                <button type="button" className="studio-pill active">
                  <span className="studio-pill-main">Image</span>
                  <span aria-hidden="true">✓</span>
                </button>

                <button type="button" className="studio-pill">
                  <span className="studio-pill-main">Style</span>
                  <span aria-hidden="true">✓</span>
                </button>

                <button type="button" className="studio-pill studio-pill--aspect">
                  <span className="studio-pill-icon">
                    <img src={motionAspectIconUrl} alt="" />
                  </span>
                  <span className="studio-pill-main">2:3</span>
                  <span className="studio-pill-sub">Printing</span>
                </button>
              </>
            ) : (
              <>
                {/* Image */}
                <button
                  type="button"
                  className={cx("studio-pill", animateActivePanel === "image" && "active")}
                  onClick={() => setAnimateActivePanel("image")}
                >
                  <span className="studio-pill-main">Image</span>
                  <span aria-hidden="true">{motionImage ? "✓" : "+"}</span>
                </button>

                {/* Mouvement style */}
                <button
                  type="button"
                  className={cx("studio-pill", animateActivePanel === "motionStyle" && "active")}
                  onClick={() => setAnimateActivePanel("motionStyle")}
                >
                  <span className="studio-pill-main">Mouvement style</span>
                  <span aria-hidden="true">{motionStylesSelected.length ? "✓" : "+"}</span>
                </button>

                {/* Ratio (auto, disabled) */}
                <button type="button" className="studio-pill studio-pill--aspect" disabled>
                  <span className="studio-pill-icon">
                    <img
                      src={motionAspectIconUrl}
                      alt=""
                      style={{ transform: `rotate(${motionAspectIconRotateDeg}deg)` }}
                    />
                  </span>
                  <span className="studio-pill-main">{motionAspectLabel}</span>
                  <span className="studio-pill-sub">{motionAspectSubtitle}</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Big textarea */}
        <div className="studio-brief-block">
          <div className="studio-brief-shell">
            {mode === "create" ? (
              <textarea
                className="studio-brief-input"
                placeholder="Describe how you want your still life image to look like"
                value={brief}
                onChange={(e) => onBriefChange(e.target.value)}
                rows={4}
              />
            ) : (
              <textarea
                className="studio-brief-input"
                placeholder="Type for me here"
                value={motionBrief}
                onChange={(e) => handleMotionChange(e.target.value)}
                rows={4}
              />
            )}
          </div>
        </div>

        {/* Panels (only for animate mode — create panels stay in your MinaApp layout) */}
        {mode === "animate" && (
          <div className="mina-left-block">
            {/* Image panel */}
            {animateActivePanel === "image" && (
              <div className="studio-panel">
                <div className="studio-panel-title">Image to animate</div>

                <div className="studio-panel-row">
                  <div className="studio-thumbs studio-thumbs--inline">
                    {motionImage ? (
                      <button
                        type="button"
                        className="studio-thumb"
                        onClick={onRemoveMotionImage}
                        title="Click to delete"
                      >
                        <img src={motionImage.remoteUrl || motionImage.url} alt="" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="studio-plusbox studio-plusbox--inline"
                        onClick={() => motionInputRef.current?.click()}
                        title="Add image"
                      >
                        <span aria-hidden="true">+</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Motion style panel */}
            {animateActivePanel === "motionStyle" && (
              <div className="studio-panel">
                <div className="studio-panel-title">Pick a mouvement style</div>

                <div className="motion-style-row">
                  {motionStyles.map((s) => {
                    const active = motionStylesSelected.includes(s.key);
                    return (
                      <button
                        key={s.key}
                        type="button"
                        className={cx("motion-style-tile", active && "active")}
                        onClick={() => toggleMotionStyle(s.key)}
                      >
                        <div className="motion-style-letter">{s.letter}</div>
                        <div className="motion-style-label" title={s.label}>
                          {s.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Controls */}
            <div className="studio-controls">
              <div className="studio-controls-divider" />

              <button type="button" className="studio-vision-toggle" onClick={onToggleVision}>
                Mina Vision Intelligence:{" "}
                <span className="studio-vision-state">{minaVisionEnabled ? "ON" : "OFF"}</span>
              </button>

              <div className="studio-create-block">
                <button
                  type="button"
                  className={cx("studio-create-link", (stillGenerating || motionGenerating) && "disabled")}
                  onClick={onClickCTA}
                  disabled={stillGenerating || motionGenerating}
                >
                  {mode === "create" ? createLabel : animateLabel}
                </button>
              </div>

              {motionError && <div className="error-text">{motionError}</div>}
            </div>
          </div>
        )}

        {/* Errors for create mode */}
        {mode === "create" && stillError && <div className="error-text">{stillError}</div>}

        {/* hidden input for animate */}
        <input
          ref={motionInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleMotionFile}
        />
      </div>
    </div>
  );
}
