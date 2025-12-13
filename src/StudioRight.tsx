import React, { useMemo, useState } from "react";

type StillItem = {
  id: string;
  url: string;
  createdAt: string;
  prompt: string;
  aspectRatio?: string;
};

type MotionItem = {
  id: string;
  url: string;
  createdAt: string;
  prompt: string;
};

type Props = {
  currentStill: StillItem | null;
  currentMotion: MotionItem | null;

  stillItems: StillItem[];
  stillIndex: number;
  setStillIndex: React.Dispatch<React.SetStateAction<number>>;

  feedbackText: string;
  setFeedbackText: React.Dispatch<React.SetStateAction<string>>;
  feedbackSending: boolean;
  feedbackError: string | null;
  onSubmitFeedback: () => void;
};

type HoverZone = "left" | "middle" | "right" | null;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function StudioRight(props: Props) {
  const {
    currentStill,
    currentMotion,
    stillItems,
    stillIndex,
    setStillIndex,
    feedbackText,
    setFeedbackText,
    feedbackSending,
    feedbackError,
    onSubmitFeedback,
  } = props;

  const [hoverZone, setHoverZone] = useState<HoverZone>(null);
  const [zoomOpen, setZoomOpen] = useState(false);

  const hasMedia = !!(currentMotion?.url || currentStill?.url);
  const mediaUrl = currentMotion?.url || currentStill?.url || "";

  const canOlder = useMemo(() => stillItems.length > 1 && stillIndex < stillItems.length - 1, [stillItems.length, stillIndex]);
  const canNewer = useMemo(() => stillItems.length > 1 && stillIndex > 0, [stillItems.length, stillIndex]);

  // Your list is newest-first (index 0 is newest)
  const goOlder = () => {
    if (!canOlder) return;
    setStillIndex((i) => clamp(i + 1, 0, stillItems.length - 1));
  };

  const goNewer = () => {
    if (!canNewer) return;
    setStillIndex((i) => clamp(i - 1, 0, stillItems.length - 1));
  };

  const toggleZoom = () => {
    if (!mediaUrl) return;
    setZoomOpen((p) => !p);
  };

  const onMediaMouseMove: React.MouseEventHandler<HTMLDivElement> = (e) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = rect.width > 0 ? x / rect.width : 0.5;

    const nextZone: HoverZone = pct < 0.33 ? "left" : pct > 0.66 ? "right" : "middle";
    setHoverZone(nextZone);
  };

  const onMediaMouseLeave: React.MouseEventHandler<HTMLDivElement> = () => {
    setHoverZone(null);
  };

  const onMediaClick: React.MouseEventHandler<HTMLDivElement> = () => {
    if (!hasMedia) return;
    if (hoverZone === "left") return goOlder();
    if (hoverZone === "right") return goNewer();
    return toggleZoom();
  };

  const zoneHint =
    hoverZone === "left" ? "<" : hoverZone === "right" ? ">" : hoverZone === "middle" ? "+" : "";

  return (
    <div className={classNames("studio-right", hasMedia && "on-dark")}>
      <div className="studio-right-surface">
        {!hasMedia ? (
          <div className="studio-empty">
            <div className="studio-empty-text">New ideas don’t actually exist, just recycle.</div>
          </div>
        ) : (
          <>
            {/* Top overlay actions (same vibe as "send" button = link-button) */}
            <div className="studio-right-actions">
              <button
                type="button"
                className={classNames("link-button", "studio-right-action-btn")}
                onClick={goOlder}
                disabled={!canOlder}
                aria-label="Previous"
                title="Previous"
              >
                {"<"}
              </button>

              <button
                type="button"
                className={classNames("link-button", "studio-right-action-btn")}
                onClick={toggleZoom}
                aria-label="Zoom"
                title="Zoom"
              >
                {"+"}
              </button>

              <button
                type="button"
                className={classNames("link-button", "studio-right-action-btn")}
                onClick={goNewer}
                disabled={!canNewer}
                aria-label="Next"
                title="Next"
              >
                {">"}
              </button>
            </div>

            {/* Media */}
            <div
              className={classNames(
                "studio-right-media",
                hoverZone === "left" && "zone-left",
                hoverZone === "middle" && "zone-middle",
                hoverZone === "right" && "zone-right"
              )}
              onMouseMove={onMediaMouseMove}
              onMouseLeave={onMediaMouseLeave}
              onClick={onMediaClick}
              role="button"
              tabIndex={0}
            >
              {currentMotion?.url ? (
                <video className="studio-right-video" src={currentMotion.url} controls playsInline />
              ) : (
                <img className="studio-right-image" src={currentStill?.url || ""} alt="" />
              )}

              {/* Hover hint (shows < or + or >) */}
              {hoverZone && <div className="studio-right-hover-hint">{zoneHint}</div>}
            </div>
          </>
        )}

        {/* Feedback */}
        <div className="studio-right-feedback">
          <div className="studio-right-feedback-row">
            <textarea
              className="studio-right-feedback-input"
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Tell Mina what you want next…"
              rows={3}
            />
            <button
              type="button"
              className={classNames("link-button", "primary-button")}
              onClick={onSubmitFeedback}
              disabled={feedbackSending || !feedbackText.trim()}
            >
              {feedbackSending ? "Sending…" : "Send"}
            </button>
          </div>
          {feedbackError && <div className="error-text">{feedbackError}</div>}
        </div>
      </div>

      {/* Zoom modal */}
      {zoomOpen && (
        <div className="studio-zoom-backdrop" onClick={() => setZoomOpen(false)}>
          <div className="studio-zoom-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="link-button studio-zoom-close" onClick={() => setZoomOpen(false)}>
              Close
            </button>

            {currentMotion?.url ? (
              <video className="studio-zoom-video" src={currentMotion.url} controls autoPlay playsInline />
            ) : (
              <img className="studio-zoom-image" src={currentStill?.url || ""} alt="" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
