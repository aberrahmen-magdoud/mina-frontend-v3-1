import React, { useEffect, useState } from "react";
import "./StudioRight.css";

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

type StudioRightProps = {
  currentStill: StillItem | null;
  currentMotion: MotionItem | null;

  stillItems: StillItem[];
  stillIndex: number;
  setStillIndex: (i: number) => void;

  feedbackText: string;
  setFeedbackText: (v: string) => void;
  onSubmitFeedback: () => void;

  feedbackSending: boolean;
  feedbackError: string | null;
};

const StudioRight: React.FC<StudioRightProps> = ({
  currentStill,
  currentMotion,
  stillItems,
  stillIndex,
  setStillIndex,
  feedbackText,
  setFeedbackText,
  onSubmitFeedback,
  feedbackSending,
  feedbackError,
}) => {
  const hasOutput = Boolean(currentStill || currentMotion);

  // cover (default) -> contain (see full) toggle
  const [previewMode, setPreviewMode] = useState<"cover" | "contain">("cover");

  useEffect(() => {
    // whenever output changes, go back to cover
    setPreviewMode("cover");
  }, [currentStill?.url, currentMotion?.url]);

  const handleTogglePreview = () => {
    if (!hasOutput) return;
    setPreviewMode((m) => (m === "cover" ? "contain" : "cover"));
  };

  const cursor = !hasOutput ? "default" : previewMode === "cover" ? "zoom-out" : "zoom-in";

  return (
    <div className={`studio-right mina-slide ${!hasOutput ? "studio-right--empty" : ""}`}>
      <div className="studio-right-surface">
        <button
          type="button"
          className="studio-output-click"
          onClick={handleTogglePreview}
          disabled={!hasOutput}
          style={{ cursor }}
          aria-label={hasOutput ? "Toggle preview mode" : "No output yet"}
        >
          <div className={`studio-output-frame ${previewMode === "contain" ? "is-contain" : ""}`}>
            {currentMotion ? (
              <video className="studio-output-media" src={currentMotion.url} autoPlay loop muted playsInline />
            ) : currentStill ? (
              <img className="studio-output-media" src={currentStill.url} alt="" />
            ) : (
              <div className="output-placeholder">New ideas don’t actually exist, just recycle.</div>
            )}
          </div>
        </button>

        {stillItems.length > 1 && (
          <div className="studio-dots-row">
            {stillItems.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                className={`studio-dot ${idx === stillIndex ? "active" : ""}`}
                onClick={() => setStillIndex(idx)}
                aria-label={`Go to generation ${idx + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      {hasOutput && (
        <>
          <div className="studio-feedback-bar">
            <input
              className="studio-feedback-input--compact"
              placeholder="Type feedback..."
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
            />
            <button
              type="button"
              className="studio-feedback-send"
              onClick={onSubmitFeedback}
              disabled={feedbackSending}
            >
              {feedbackSending ? "Sending…" : "Send"}
            </button>
          </div>

          {feedbackError && <div className="error-text">{feedbackError}</div>}
        </>
      )}
    </div>
  );
};

export default StudioRight;
