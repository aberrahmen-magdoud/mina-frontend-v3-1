// src/ui.tsx
// Shared UI components consolidated into one module.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { sendClientError, getSceneLibraryRawFromViteEnv, parseSceneLibraryEnv, type SceneLibraryItem } from "./services";

// =============================================================================
// Top loading bar
// =============================================================================
type TopLoadingBarProps = {
  active: boolean;
};

export function TopLoadingBar({ active }: TopLoadingBarProps) {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const decayTimer = useRef<number | null>(null);
  const rampTimer = useRef<number | null>(null);

  useEffect(() => {
    if (active) {
      setVisible(true);

      if (rampTimer.current) window.clearInterval(rampTimer.current);
      rampTimer.current = window.setInterval(() => {
        setProgress((prev) => {
          const safeStart = prev === 0 ? 12 : prev;
          const target = 90;
          const delta = Math.max(1, (target - safeStart) * 0.12);
          const next = safeStart + delta;
          return next >= target ? target : next;
        });
      }, 160);

      if (decayTimer.current) {
        window.clearTimeout(decayTimer.current);
        decayTimer.current = null;
      }
    } else if (visible) {
      if (rampTimer.current) window.clearInterval(rampTimer.current);
      setProgress(100);

      decayTimer.current = window.setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 350);
    }

    return () => {
      if (rampTimer.current) window.clearInterval(rampTimer.current);
      if (decayTimer.current) {
        window.clearTimeout(decayTimer.current);
        decayTimer.current = null;
      }
    };
  }, [active, visible]);

  if (!visible && progress === 0) return null;

  return (
    <div
      className="mina-top-loading"
      role="progressbar"
      aria-label="Loading"
      aria-busy={active}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress)}
    >
      <div className="mina-top-loading__bar" style={{ width: `${progress}%` }} />
    </div>
  );
}

// =============================================================================
// Error boundary
// =============================================================================
type ErrorBoundaryState = {
  hasError: boolean;
};

export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    sendClientError({
      emoji: "🖥️",
      code: "REACT_RENDER_ERROR",
      message: error?.message || "React render error",
      stack: error?.stack || null,
      extra: { componentStack: info.componentStack },
    });
  }

  render() {
    if (this.state.hasError) {
      return <div>Something went wrong. Please refresh.</div>;
    }

    return this.props.children;
  }
}

// =============================================================================
// Matcha quantity modal
// =============================================================================
type Pack = { units: number };

type MatchaQtyModalProps = {
  open: boolean;
  qty: number;
  setQty: (n: number) => void;
  onClose: () => void;
  onConfirm: (qty: number) => void;
  subtitle?: string;
  rulesLine?: string;
  baseCredits?: number;
  basePrice?: number;
  currencySymbol?: string;
  defaultUnitsOnOpen?: number;
  transparencyTitle?: string;
  transparencyLine?: string;
};

const clampInt = (v: number, min: number, max: number) => {
  const n = Math.floor(Number(v || 0));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
};

const TOP_TITLE = "Airpot of Matcha Lattes";

export function MatchaQtyModal({
  open,
  qty,
  setQty,
  onClose,
  onConfirm,
  subtitle = "Mina uses matchas to create and animate your images.",
  rulesLine = "1 Image = 1 Matcha – 5s Animation = 5 Matchas",
  baseCredits = 50,
  basePrice = 15,
  currencySymbol = "£",
  defaultUnitsOnOpen = 2,
  transparencyTitle = "Price Transparency",
  transparencyLine = "Cost £8 • New features £3 • Marketing & Branding £3 • Profit £1",
}: MatchaQtyModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const [showTransparency, setShowTransparency] = useState(false);

  const packList: Pack[] = useMemo(
    () => [
      { units: 1 },
      { units: 2 },
      { units: 10 },
      { units: 20 },
    ],
    []
  );

  const minUnits = 1;
  const maxUnits = 20;

  const safeQtyRaw = clampInt(qty, minUnits, maxUnits);
  const onScale = packList.some((p) => p.units === safeQtyRaw);
  const safeQty = onScale ? safeQtyRaw : defaultUnitsOnOpen;

  const activeIndex = Math.max(0, packList.findIndex((p) => p.units === safeQty));
  const fillPct = (activeIndex / (packList.length - 1)) * 100;

  const creditsFor = (units: number) => units * baseCredits;
  const priceFor = (units: number) => units * basePrice;

  useEffect(() => {
    if (!open) return;
    const now = clampInt(qty, minUnits, maxUnits);
    const nowOnScale = packList.some((p) => p.units === now);
    const desired = clampInt(defaultUnitsOnOpen, minUnits, maxUnits);
    const desiredOnScale = packList.some((p) => p.units === desired) ? desired : 2;

    if (now === 1 || !nowOnScale) setQty(desiredOnScale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => panelRef.current?.focus(), 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter") onConfirm(clampInt(safeQty, minUnits, maxUnits));
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, onConfirm, safeQty]);

  useEffect(() => {
    if (open) setShowTransparency(false);
  }, [open]);

  if (!open) return null;

  const onBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = barRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    const idx = Math.round(ratio * (packList.length - 1));
    const next = packList[Math.max(0, Math.min(packList.length - 1, idx))]?.units;
    if (next != null) setQty(next);
  };

  return (
    <div className="mina-modal-backdrop" onClick={onClose}>
      <div
        className="mina-modal mina-matcha-modal"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mina-matcha-topbar">
          <div className="mina-matcha-topbar-left">{TOP_TITLE}</div>
          <button
            type="button"
            className="mina-modal-close mina-matcha-close"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            —
          </button>
        </div>

        <div className="mina-matcha-body">
          <div className="mina-matcha-subtitle">{subtitle}</div>
          <div className="mina-matcha-rules">{rulesLine}</div>

          <div className="mina-matcha-scale">
            <div className="mina-matcha-scale-top" aria-hidden="true">
              {packList.map((p, i) => {
                const on = i <= activeIndex;
                const pct = (i / (packList.length - 1)) * 100;
                const edge = i === 0 ? "is-first" : i === packList.length - 1 ? "is-last" : "";
                return (
                  <div
                    key={p.units}
                    className={`mina-matcha-scale-item mina-matcha-label ${on ? "is-on" : "is-off"} ${edge}`}
                    style={{ left: `${pct}%` }}
                  >
                    {creditsFor(p.units)}
                  </div>
                );
              })}
            </div>

            <div
              className="mina-matcha-bar"
              ref={barRef}
              onClick={onBarClick}
              role="presentation"
              style={{ ["--fillPct" as any]: `${fillPct}%` }}
            >
              <div className="mina-matcha-track" aria-hidden="true" />
              <div className="mina-matcha-fill" aria-hidden="true" />

              {packList.map((p, i) => {
                const on = i <= activeIndex;
                const leftPct = (i / (packList.length - 1)) * 100;

                return (
                  <button
                    key={p.units}
                    type="button"
                    className={`mina-matcha-node ${on ? "is-on" : ""}`}
                    style={{ left: `${leftPct}%` }}
                    onClick={() => setQty(p.units)}
                    aria-label={`${creditsFor(p.units)} Matchas`}
                  >
                    <span className="mina-matcha-dot" aria-hidden="true" />
                  </button>
                );
              })}
            </div>

            <div className="mina-matcha-scale-bottom" aria-hidden="true">
              {packList.map((p, i) => {
                const on = i <= activeIndex;
                const pct = (i / (packList.length - 1)) * 100;
                const edge = i === 0 ? "is-first" : i === packList.length - 1 ? "is-last" : "";
                return (
                  <div
                    key={p.units}
                    className={`mina-matcha-scale-item mina-matcha-price ${on ? "is-on" : "is-off"} ${edge}`}
                    style={{ left: `${pct}%` }}
                  >
                    {currencySymbol}
                    {priceFor(p.units).toLocaleString()}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mina-matcha-footer">
          <div className="mina-matcha-transparency">
            <button
              type="button"
              className="mina-matcha-transparency-toggle"
              onClick={() => setShowTransparency((s) => !s)}
              aria-expanded={showTransparency}
            >
              {transparencyTitle}
            </button>

            {showTransparency ? (
              <div className="mina-matcha-transparency-details">{transparencyLine}</div>
            ) : null}
          </div>

          <button
            type="button"
            className="mina-matcha-purchase"
            onClick={() => onConfirm(clampInt(safeQty, minUnits, maxUnits))}
          >
            Purchase
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Scene library modal
// =============================================================================
function cfThumb(url: string, width = 700, quality = 75) {
  if (!url) return url;
  if (!url.includes("assets.faltastudio.com/")) return url;
  if (url.includes("/cdn-cgi/image/")) return url;

  const opts = `width=${width},fit=cover,quality=${quality},format=jpeg,onerror=redirect`;

  return `https://assets.faltastudio.com/cdn-cgi/image/${opts}/${url.replace(
    "https://assets.faltastudio.com/",
    ""
  )}`;
}

function cfInput1080(url: string) {
  if (!url) return url;
  if (!url.includes("assets.faltastudio.com/")) return url;
  if (url.includes("/cdn-cgi/image/")) return url;

  const opts = `width=1080,fit=scale-down,quality=85,format=jpeg,onerror=redirect`;

  return `https://assets.faltastudio.com/cdn-cgi/image/${opts}/${url.replace(
    "https://assets.faltastudio.com/",
    ""
  )}`;
}

export function SceneLibraryModal({
  open,
  onClose,
  onSetScene,
}: {
  open: boolean;
  onClose: () => void;
  onSetScene: (url: string) => void;
}) {
  const [q, setQ] = useState("");
  const [hoverId, setHoverId] = useState<string>("");

  const items: SceneLibraryItem[] = useMemo(() => {
    const raw = getSceneLibraryRawFromViteEnv();
    return parseSceneLibraryEnv(raw);
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((it) => {
      const hay = `${it.title} ${it.keywords.join(" ")}`.toLowerCase();
      return hay.includes(s);
    });
  }, [items, q]);

  const active = useMemo(() => {
    const byHover = hoverId ? filtered.find((x) => x.id === hoverId) : null;
    if (byHover) return byHover;
    return filtered[0] ?? null;
  }, [filtered, hoverId]);

  if (!open) return null;

  return (
    <div className="scene-lib-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="scene-lib-modal" onClick={(e) => e.stopPropagation()}>
        <div className="scene-lib-head">
          <div className="scene-lib-title">Commercial-friendly Library</div>
          <button className="scene-lib-close" type="button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="scene-lib-toolbar">
          <input
            className="scene-lib-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
          />
          <div className="scene-lib-count">{filtered.length} scenes</div>
        </div>

        <div className="scene-lib-body">
          <div className="scene-lib-left">
            {filtered.length ? (
              <div className="scene-lib-grid">
                {filtered.map((it) => (
                  <div
                    key={it.id}
                    className="scene-lib-card"
                    onMouseEnter={() => setHoverId(it.id)}
                    onFocus={() => setHoverId(it.id)}
                    tabIndex={0}
                  >
                    <div
                      className="scene-lib-thumb"
                      onClick={() => {
                        onSetScene(cfInput1080(it.url));
                        onClose();
                      }}
                    >
                      <img src={cfThumb(it.url, 800, 75)} alt="" draggable={false} />
                    </div>

                    <div className="scene-lib-meta">
                      <button
                        className="scene-lib-set"
                        type="button"
                        title={it.title}
                        onClick={() => {
                          onSetScene(cfInput1080(it.url));
                          onClose();
                        }}
                      >
                        Set scene
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="scene-lib-empty">No scenes yet.</div>
            )}
          </div>

          <div className="scene-lib-right">
            {active ? (
              <img
                className="scene-lib-preview-img"
                src={cfThumb(active.url, 2600, 85)}
                alt=""
                draggable={false}
                onClick={() => {
                  onSetScene(cfInput1080(active.url));
                  onClose();
                }}
              />
            ) : (
              <div className="scene-lib-empty">No preview</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
