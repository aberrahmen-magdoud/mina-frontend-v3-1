import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./SceneLibraryModal.css";
import {
  parseSceneLibraryEnv,
  SceneLibraryItem,
  getSceneLibraryRawFromViteEnv,
} from "../lib/sceneLibrary";

function cfThumb(url: string, width = 700, quality = 75) {
  if (!url) return url;
  if (!url.includes("assets.faltastudio.com/")) return url;
  if (url.includes("/cdn-cgi/image/")) return url;
  const opts = `width=${width},fit=cover,quality=${quality},format=jpeg`;
  return `https://assets.faltastudio.com/cdn-cgi/image/${opts}/${url.replace(
    "https://assets.faltastudio.com/",
    ""
  )}`;
}

function cfInput1080(url: string) {
  if (!url) return url;
  if (!url.includes("assets.faltastudio.com/")) return url;
  if (url.includes("/cdn-cgi/image/")) return url;
  const opts = `width=1080,fit=scale-down,quality=85,format=jpeg`;
  return `https://assets.faltastudio.com/cdn-cgi/image/${opts}/${url.replace(
    "https://assets.faltastudio.com/",
    ""
  )}`;
}

// ── Tag categories for filter pills ──
const TAG_CATEGORIES: { label: string; match: string[] }[] = [
  { label: "Perfumery", match: ["industry perfumery", "perfume", "fragrance"] },
  { label: "Beauty", match: ["industry beauty", "skincare", "cosmetics", "beauty"] },
  { label: "Fashion", match: ["industry fashion", "fashion"] },
  { label: "Jewelry", match: ["industry jewelry", "jewelry", "earrings", "necklace", "bracelet", "ring"] },
  { label: "Lifestyle", match: ["industry lifestyle", "lifestyle", "ugc"] },
  { label: "Food & Drink", match: ["food styling", "food", "drink", "beverage", "cocktail", "wine", "coffee"] },
  { label: "Editorial", match: ["editorial"] },
  { label: "Surreal", match: ["surreal", "artistic"] },
  { label: "Minimal", match: ["minimal"] },
  { label: "Portrait", match: ["portrait", "model", "woman", "man"] },
  { label: "Dark", match: ["background black", "dark luxury", "dark gradient", "moody"] },
  { label: "Light", match: ["soft light", "natural light", "warm light", "bright"] },
];

// ── Masonry height classes for visual variety ──
function pickSizeClass(item: SceneLibraryItem, index: number): string {
  const kw = item.keywords.join(" ").toLowerCase();
  if (kw.includes("portrait") || kw.includes("model")) return "scene-lib-card--tall";
  if (kw.includes("landscape") || kw.includes("wide")) return "scene-lib-card--wide";
  // Deterministic variety based on index
  if (index % 7 === 0) return "scene-lib-card--tall";
  if (index % 11 === 0) return "scene-lib-card--wide";
  return "";
}

// ── Lazy image with IntersectionObserver ──
function LazyImage({ src, alt, onClick }: { src: string; alt: string; onClick: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { rootMargin: "300px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className={`scene-lib-thumb ${loaded ? "is-loaded" : ""}`} onClick={onClick}>
      {visible && (
        <img
          src={src}
          alt={alt}
          draggable={false}
          loading="lazy"
          onLoad={() => setLoaded(true)}
        />
      )}
    </div>
  );
}

export default function SceneLibraryModal({
  open,
  onClose,
  onSetScene,
}: {
  open: boolean;
  onClose: () => void;
  onSetScene: (url: string) => void;
}) {
  const [q, setQ] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const items: SceneLibraryItem[] = useMemo(() => {
    const raw = getSceneLibraryRawFromViteEnv();
    return parseSceneLibraryEnv(raw);
  }, []);

  // Available tag categories (only show tags that match at least one item)
  const availableTags = useMemo(() => {
    return TAG_CATEGORIES.filter((cat) =>
      items.some((it) => {
        const kw = it.keywords.join(" ").toLowerCase();
        return cat.match.some((m) => kw.includes(m));
      })
    );
  }, [items]);

  const filtered = useMemo(() => {
    let list = items;

    // Tag filter
    if (activeTag) {
      const cat = TAG_CATEGORIES.find((c) => c.label === activeTag);
      if (cat) {
        list = list.filter((it) => {
          const kw = it.keywords.join(" ").toLowerCase();
          return cat.match.some((m) => kw.includes(m));
        });
      }
    }

    // Text search
    const s = q.trim().toLowerCase();
    if (s) {
      list = list.filter((it) => {
        const hay = `${it.title} ${it.keywords.join(" ")}`.toLowerCase();
        return hay.includes(s);
      });
    }

    return list;
  }, [items, q, activeTag]);

  const handleSelect = useCallback(
    (url: string) => {
      onSetScene(cfInput1080(url));
      onClose();
    },
    [onSetScene, onClose]
  );

  const toggleTag = useCallback((label: string) => {
    setActiveTag((prev) => (prev === label ? null : label));
  }, []);

  if (!open) return null;

  return (
    <div className="scene-lib-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="scene-lib-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="scene-lib-head">
          <div className="scene-lib-title">Scene Library</div>
          <button className="scene-lib-close" type="button" onClick={onClose}>
            ×
          </button>
        </div>

        {/* Search + Tags Bar */}
        <div className="scene-lib-toolbar">
          <input
            className="scene-lib-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search scenes…"
          />
          <div className="scene-lib-count">{filtered.length} scenes</div>
        </div>

        {/* Tag Pills */}
        {availableTags.length > 0 && (
          <div className="scene-lib-tags">
            {availableTags.map((cat) => (
              <button
                key={cat.label}
                type="button"
                className={`scene-lib-tag ${activeTag === cat.label ? "is-active" : ""}`}
                onClick={() => toggleTag(cat.label)}
              >
                {cat.label}
              </button>
            ))}
          </div>
        )}

        {/* Pinterest-style masonry grid */}
        <div className="scene-lib-body">
          {filtered.length ? (
            <div className="scene-lib-masonry">
              {filtered.map((it, idx) => (
                <div
                  key={it.id}
                  className={`scene-lib-card ${pickSizeClass(it, idx)}`}
                >
                  <LazyImage
                    src={cfThumb(it.url, 800, 75)}
                    alt={it.title}
                    onClick={() => handleSelect(it.url)}
                  />
                  <div className="scene-lib-overlay">
                    <div className="scene-lib-overlay-title">{it.title}</div>
                    <div className="scene-lib-overlay-kw">
                      {it.keywords
                        .filter((k) => !k.startsWith("industry ") && !k.startsWith("background "))
                        .slice(0, 5)
                        .map((k) => (
                          <span key={k} className="scene-lib-kw">{k}</span>
                        ))}
                    </div>
                    <button
                      className="scene-lib-set"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(it.url);
                      }}
                    >
                      Set scene
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="scene-lib-empty">No scenes match your search.</div>
          )}
        </div>
      </div>
    </div>
  );
}
