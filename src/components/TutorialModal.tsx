// src/components/TutorialModal.tsx
// Tutorial lightbox extracted from StudioLeft for module size.

import React from "react";

interface TutorialModalProps {
  videoUrl: string;
  mobile: boolean;
  onClose: () => void;
}

const STEPS = [
  "Upload your main image (you or your product).",
  "Add your logo / label design.",
  "Add inspiration images (up to 4). If you need more, use Moodboard (up to 10).",
  <>Pick your mode: <b>Main</b> (faster) or <b>Niche</b> (slower, more detailed).</>,
  <>Set your ratio (usually <b>2:3</b> works everywhere).</>,
  "Describe what you want in your own words (many languages + dialects).",
  <>Hit <b>Create</b>. Keep <b>Vision Intelligence</b> ON so Mina learns your taste.</>,
  <>When you like a result, tap <b>Love</b> → "more like this".</>,
  <>Small change? Use the <b>Tweak</b> bar. Want animation? Tap <b>Animate</b> and keep prompts simple.</>,
  <>For longer videos, switch to <b>UGC</b> mode (30–60s). Mina plans shots, generates clips, and stitches them together.</>,
];

const VideoBlock: React.FC<{ src: string }> = ({ src }) => (
  <video
    src={src}
    autoPlay
    playsInline
    controls
    style={{ width: "100%", maxHeight: "70vh", background: "#000", display: "block" }}
  />
);

const StepsList: React.FC = () => (
  <div style={{ fontSize: 12, lineHeight: 1.35, opacity: 0.85 }}>
    <div style={{ fontWeight: 700, marginBottom: 8 }}>For Instagram & TikTok</div>
    <ul style={{ margin: 0, paddingLeft: 18 }}>
      {STEPS.map((s, i) => <li key={i}>{s}</li>)}
    </ul>
  </div>
);

const TutorialModal: React.FC<TutorialModalProps> = ({ videoUrl, mobile, onClose }) => (
  <div
    role="dialog"
    aria-modal="true"
    onClick={onClose}
    style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 9999, padding: 16,
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ width: "min(980px, 96vw)", background: "#fff", borderRadius: 0, padding: 16, boxShadow: "0 16px 50px rgba(0,0,0,0.25)" }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.01em", opacity: 0.9 }}>
          Mina tutorial
        </div>
        <button type="button" className="studio-footer-link" onClick={onClose}><b>Close</b></button>
      </div>

      <div style={{ display: "flex", flexDirection: mobile ? "column" : "row", gap: 16, alignItems: "stretch" }}>
        {mobile ? (
          <>
            <div style={{ flex: "0 0 auto" }}><VideoBlock src={videoUrl} /></div>
            <StepsList />
          </>
        ) : (
          <>
            <div style={{ flex: "1 1 320px", minWidth: 280 }}><StepsList /></div>
            <div style={{ flex: "2 1 520px" }}><VideoBlock src={videoUrl} /></div>
          </>
        )}
      </div>
    </div>
  </div>
);

export default TutorialModal;
