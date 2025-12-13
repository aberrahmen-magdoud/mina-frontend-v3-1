// src/StudioRight.tsx
import React, { useEffect, useMemo, useState } from "react";
import "./StudioRight.css";

type StillItem = { id: string; url: string };
type MotionItem = { id: string; url: string };

type StudioRightProps = {
  currentStill: StillItem | null;
  currentMotion: MotionItem | null;

  stillItems: StillItem[];
  stillIndex: number;
  setStillIndex: (i: number) => void;

  feedbackText: string;
  setFeedbackText: (v: string) => void;
  feedbackSending: boolean;
  feedbackError: string | null;
  onSubmitFeedback: () => void;
};

export default function StudioRight(props: StudioRightProps) {
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

  const isEmpty = !currentStill && !currentMotion;

  const media = useMemo(() => {
    if (currentMotion) return { type: "video" as const, url: currentMotion.url };
    if (currentStill) return { type: "image" as const, url: currentStill.url };
    return null;
  }, [currentMotion, currentStill]);

  // Click-to-toggle: cover <-> contain (scale down centered)
  const [containMode, setContainMode] = useState(false);
  useEffect(() => {
    // reset when switching to another generation
    setContainMode(false);
  }, [media?.url]);

  const canSend = !feedbackSending && feedbackText.trim().length > 0;

  return (
    <div className="studio-right">
      <div className="studio-right-surface">
        {isEmpty ? (
          <div className="studio-empty-text">New ideas don’t actually exist, just recycle.</div>
        ) : (
          <>
            <button
              type="button"
              className="studio-output-click"
              onClick={() => setContainMode((v) => !v)}
              aria-label="Toggle fit"
            >
              <div className={`studio-output-frame ${containMode ? "is-contain" : ""}`}>
                {media?.type === "video" ? (
                  <video className="studio-output-media" src={media.url} autoPlay loop muted controls />
                ) : (
                  <img className="studio-output-media" src={media?.url || ""} alt="" />
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
                    aria-label={`Go to image ${idx + 1}`}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {!isEmpty && (
        <div className="studio-feedback-bar">
          <input
            className="studio-feedback-input--compact"
            placeholder="Speak to me tell me, what you like and dislike about my generation"
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSend) onSubmitFeedback();
            }}
          />

          <button
            type="button"
            className="studio-feedback-send"
            onClick={onSubmitFeedback}
            disabled={!canSend}
          >
            Send
          </button>

          {feedbackError && <div className="studio-feedback-error">{feedbackError}</div>}
        </div>
      )}
    </div>
  );
}
