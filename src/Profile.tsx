// =============================================================
// FILE: src/Profile.tsx
// Mina — Profile (Render-only, data comes from MinaApp)
// =============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./Profile.css";
import TopLoadingBar from "./components/TopLoadingBar";
import MatchaQtyModal from "./components/MatchaQtyModal";
import { downloadMinaAsset } from "./lib/minaDownload";
import { cfInput1080 } from "./lib/cfInput1080";
import { isVideoUrl, isAudioUrl } from "./lib/mediaHelpers";
import type { Row } from "./lib/profileHelpers";
import {
  safeString, asStrOrNull, pick, cfThumb, cfInput2048,
  tryParseJson, isImageUrl, normalizeMediaUrl,
  AUDIO_THUMB_URL, canonicalAssetUrl, getScrollParent,
  fmtDate, fmtDateTime, downloadMedia,
  ASPECT_OPTIONS, normalizeAspectRatio,
  looksLikeSystemPrompt, sanitizeUserBrief,
  isLikeEventRow, findLikeUrl, findLikedGenerationId,
  extractInputsForDisplay,
} from "./lib/profileHelpers";
import { useProfileDragSelect } from "./hooks/useProfileDragSelect";
import { useProfileLightbox } from "./hooks/useProfileLightbox";
import { useVideoAutoplay } from "./hooks/useVideoAutoplay";
import { useMatchaCheckout } from "./hooks/useMatchaCheckout";
import { useInfiniteScroll } from "./hooks/useInfiniteScroll";
import { useDeleteFlow } from "./hooks/useDeleteFlow";
import { computeProfileItems } from "./lib/profileItems";
import type { ProfileItem } from "./lib/profileItems";

type RecreateDraft = {
  mode: "still" | "motion";
  brief: string;
  settings: {
    aspect_ratio?: string;
    minaVisionEnabled?: boolean;
    stylePresetKeys?: string[];
    motion_duration_sec?: 5 | 10;
    generate_audio?: boolean;
  };
  assets: {
    productImageUrl?: string;
    logoImageUrl?: string;
    styleImageUrls?: string[];
    kling_start_image_url?: string;
    kling_end_image_url?: string;
    frame2_audio_url?: string;
    frame2_video_url?: string;
  };
};

type ProfileProps = {
  email?: string;
  credits?: number | null;
  expiresAt?: string | null;
  generations?: Row[];
  feedbacks?: Row[];
  loading?: boolean;
  error?: string | null;
  onBackToStudio?: () => void;
  onLogout?: () => void;
  matchaUrl?: string;
  matcha5000Url?: string;
  onConfirmCheckout?: (qty: number) => void;
  onRefresh?: () => void;
  onDelete?: (id: string) => Promise<void> | void;
  onRecreate?: (draft: RecreateDraft) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
};

export default function Profile({
  email = "",
  credits = null,
  expiresAt = null,
  generations = [],
  feedbacks = [],
  loading = false,
  error = null,
  onBackToStudio,
  onLogout,
  onDelete,
  onRecreate,
  onLoadMore,
  hasMore = false,
  loadingMore = false,
  matchaUrl = "https://www.faltastudio.com/cart/43328351928403:1",
  matcha5000Url = "https://www.faltastudio.com/cart/44184397283411:1",
  onConfirmCheckout,
}: ProfileProps) {
  // Date range filter
  const [dateRange, setDateRange] = useState<"all" | "today" | "7d" | "30d">("all");
  const cycleDateRange = useCallback(() => {
    setDateRange((prev) => prev === "all" ? "today" : prev === "today" ? "7d" : prev === "7d" ? "30d" : "all");
  }, []);
  const dateRangeLabel = dateRange === "all" ? "All time" : dateRange === "today" ? "Today" : dateRange === "7d" ? "7 days" : "30 days";

  // Delete state
  const {
    deletingIds, removingIds, removedIds, ghostIds, deleteErrors, confirmDeleteIds, setConfirmDeleteIds,
    askDelete, cancelDeleteAll, deleteByIds, deleteItem, deleteAllConfirmed,
  } = useDeleteFlow(onDelete);

  // Drag-select hook
  const gridRef = useRef<HTMLDivElement>(null);
  const {
    dragRect, dragSelectedIds, isSelectMode, confirmCount,
    onGridMouseDown, onGridMouseMove, onGridMouseUp,
    onGridTouchStart, onGridTouchMove, onGridTouchEnd,
  } = useProfileDragSelect(
    gridRef, confirmDeleteIds, removedIds, ghostIds,
    deleteByIds, cancelDeleteAll, setConfirmDeleteIds,
  );

  // Filters
  const [motion, setMotion] = useState<"all" | "still" | "motion">("all");
  const cycleMotion = () => setMotion((prev) => (prev === "all" ? "motion" : prev === "motion" ? "still" : "all"));
  const motionLabel = motion === "all" ? "Show all" : motion === "motion" ? "Motion" : "Still";

  const [aspectFilterStep, setAspectFilterStep] = useState(0);
  const activeAspectFilter = aspectFilterStep === 0 ? null : ASPECT_OPTIONS[aspectFilterStep - 1];
  const cycleAspectFilter = () => setAspectFilterStep((prev) => (prev + 1) % (ASPECT_OPTIONS.length + 1));
  const aspectFilterLabel = activeAspectFilter ? activeAspectFilter.label : "Ratio";

  const [expandedPromptIds, setExpandedPromptIds] = useState<Record<string, boolean>>({});
  const SCENE_PROMPT =
    "Replace my product in the scene, keep my scene, composition, tone, aesthetic, highlights, and vibe style exactly the same";

  // Pagination
  const [visibleCount, setVisibleCount] = useState(20);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Video refs
  const videoElsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const hoveredVideoIdRef = useRef<string | null>(null);

  const registerVideoEl = useCallback((id: string, el: HTMLVideoElement | null) => {
    const m = videoElsRef.current;
    if (el) { el.dataset.minaId = id; m.set(id, el); } else m.delete(id);
  }, []);

  const setVideoHover = useCallback((id: string, hovering: boolean) => {
    const el = videoElsRef.current.get(id);
    if (!el) return;
    hoveredVideoIdRef.current = hovering ? id : hoveredVideoIdRef.current === id ? null : hoveredVideoIdRef.current;
    try { el.muted = !hovering; el.volume = 1; if (hovering) el.play().catch(() => {}); } catch {}
  }, []);

  const hoverAudioRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  const setAudioHover = useCallback((url: string, hovering: boolean) => {
    if (!url) return;
    const cache = hoverAudioRef.current;
    let audio = cache.get(url);
    if (!audio) { audio = new Audio(url); audio.loop = true; cache.set(url, audio); }
    if (hovering) {
      try { audio.currentTime = 0; } catch {}
      const p = audio.play();
      if (p && typeof (p as Promise<void>).catch === "function") (p as Promise<void>).catch(() => {});
      return;
    }
    audio.pause();
    try { audio.currentTime = 0; } catch {}
  }, []);

  // Matcha quantity popup
  const { matchaQtyOpen, matchaQty, setMatchaQty, setMatchaQtyOpen, openMatchaQty, confirmMatchaQty, clampQty } =
    useMatchaCheckout({ matchaUrl, matcha5000Url, onConfirmCheckout });

  // Likes set (by canonical URL)
  const likedUrlSet = useMemo(() => {
    const s = new Set<string>();
    for (const f of feedbacks) {
      const likeUrl = canonicalAssetUrl(findLikeUrl(f));
      if (likeUrl) s.add(likeUrl);
    }
    return s;
  }, [feedbacks]);

  const sizeClassForIndex = useCallback((idx: number) => {
    if (idx % 13 === 0) return "profile-card--hero";
    if (idx % 9 === 0) return "profile-card--wide";
    if (idx % 7 === 0) return "profile-card--mini";
    return "profile-card--tall";
  }, []);

  // Items computation (extracted to computeProfileItems)
  const { items, activeCount, totalMatchas } = useMemo(() =>
    computeProfileItems({
      generations, feedbacks, likedUrlSet, dateRange, motion,
      activeAspectFilter, removedIds, ghostIds, deletingIds,
      confirmDeleteIds, dragSelectedIds: dragSelectedIds.current,
      deleteErrors, onRecreate, sizeClassForIndex,
    }),
    [generations, feedbacks, likedUrlSet, motion, activeAspectFilter, dateRange, onRecreate, removedIds, sizeClassForIndex],
  );

  // Lightbox hook
  const {
    lightbox, lbZoomed, lbZoomOrigin, lbHintVisible, lightboxJustSwipedRef,
    openLightbox, closeLightbox, prefetchImage,
    handleLbMediaClick, handleLbMediaDblClick, handleLbMediaEnter, handleLbMediaLeave,
    onLightboxPointerDown, onLightboxPointerMove, onLightboxPointerUp,
  } = useProfileLightbox(items);

  // Reset visible count on filter change
  useEffect(() => { setVisibleCount(20); }, [motion, activeAspectFilter]);
  useEffect(() => { setVisibleCount((c) => Math.min(c, items.length)); }, [items.length]);

  // Infinite scroll + server pagination
  useInfiniteScroll({
    itemCount: items.length, setVisibleCount, sentinelRef, loadMoreRef,
    hasMore, loadingMore, onLoadMore, getScrollParent,
  });

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);
  const showInitialSkeletons = loading && items.length === 0;
  const skeletonCount = 12;

  // Video autoplay hook
  useVideoAutoplay(items, visibleItems, videoElsRef, hoveredVideoIdRef);

  const onTogglePrompt = (id: string) =>
    setExpandedPromptIds((prev) => (prev[id] ? {} : { [id]: true }));

  const openPrompt = useCallback((id: string) => {
    setExpandedPromptIds((prev) => (prev[id] && Object.keys(prev).length === 1 ? prev : { [id]: true }));
  }, []);

  return (
    <>
      <TopLoadingBar active={loading} />
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
      {lightbox ? (
        <>
          {/* Backdrop — click to close */}
          <div
            className="profile-lightbox-backdrop"
            onClick={() => {
              if (lightboxJustSwipedRef.current) {
                lightboxJustSwipedRef.current = false;
                return;
              }
              closeLightbox();
            }}
          />
          <div
            className="profile-lightbox"
            role="dialog"
            aria-modal="true"
            onPointerDown={onLightboxPointerDown}
            onPointerMove={onLightboxPointerMove}
            onPointerUp={onLightboxPointerUp}
            onPointerCancel={onLightboxPointerUp}
          >
            {/* Back button top-right (desktop) */}
            <button
              className="profile-lightbox-close"
              type="button"
              onClick={closeLightbox}
              aria-label="Back"
            >
              Back
            </button>
            <div
              className={`profile-lightbox-media${lbZoomed ? " is-zoomed" : ""}`}
              style={lbZoomed ? { transformOrigin: lbZoomOrigin } : undefined}
              onClick={(e) => {
                // Click on the container (not media) → close
                if (e.target === e.currentTarget) {
                  closeLightbox();
                }
              }}
            >
              {lightbox.isMotion ? (
                <video
                  className="profile-lightbox-video"
                  src={lightbox.url}
                  autoPlay
                  loop
                  muted
                  playsInline
                  controls={false}
                  disablePictureInPicture
                  controlsList="nodownload noplaybackrate noremoteplayback"
                  onClick={handleLbMediaClick}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    handleLbMediaDblClick(lightbox.url, true);
                  }}
                  onMouseEnter={handleLbMediaEnter}
                  onMouseLeave={handleLbMediaLeave}
                />
              ) : (
                <img
                  className="profile-lightbox-img"
                  src={lightbox.url}
                  alt=""
                  loading="eager"
                  decoding="async"
                  fetchPriority="high"
                  draggable={false}
                  style={lbZoomed ? { transformOrigin: lbZoomOrigin } : undefined}
                  onClick={handleLbMediaClick}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    handleLbMediaDblClick(lightbox.url, false);
                  }}
                  onMouseEnter={handleLbMediaEnter}
                  onMouseLeave={handleLbMediaLeave}
                />
              )}
            </div>
            <div className={`profile-lightbox-hint${lbHintVisible ? " is-visible" : ""}`}>
              double-click to download
            </div>
          </div>
        </>
      ) : null}
      <div className="profile-shell">
        <div className="profile-header-fixed">
          <div className="profile-topbar">
            <div />
            <div className="profile-topbar-right">
              {onBackToStudio ? (
                <button className="profile-toplink" type="button" onClick={onBackToStudio}>
                  Back to studio
                </button>
              ) : (
                <a className="profile-toplink" href="/studio">
                  Back to studio
                </a>
              )}
              <span className="profile-topsep">|</span>
              <button className="profile-toplink" type="button" onClick={openMatchaQty}>
                Get more Matchas
              </button>
            </div>
          </div>
          <div className="profile-meta-strip">
            <div className="profile-kv">
              <span className="profile-k">Email</span>
              <span className="profile-v">{email || "—"}</span>
            </div>
            <div className="profile-kv">
              <span className="profile-k">Matchas</span>
              <span className="profile-v">{credits === null ? "—" : credits}</span>
            </div>
            <div className="profile-kv">
              <span className="profile-k">Best before</span>
              <span className="profile-v">{expiresAt ? fmtDate(expiresAt) : "—"}</span>
            </div>
            <div className="profile-kv">
              <button className="profile-logout-meta" onClick={onLogout} type="button">
                Logout
              </button>
            </div>
          </div>
          <div className="profile-archive-head">
            <div>
              <div className="profile-archive-title">Archive</div>
              <div className="profile-archive-sub">
                {error ? (
                  <span className="profile-error">{error}</span>
                ) : loading ? (
                  "Loading…"
                ) : items.length ? (
                  <>
                    {activeCount} creation{activeCount === 1 ? "" : "s"}
                    {totalMatchas > 0 ? <span className="profile-cost-badge">{totalMatchas} matchas</span> : null}
                  </>
                ) : (
                  "No creations yet."
                )}
              </div>
            </div>
            <div className="profile-filters">
              <button
                type="button"
                className={`profile-filter-pill ${dateRange !== "all" ? "active" : ""}`}
                onClick={cycleDateRange}
              >
                {dateRangeLabel}
              </button>
              <button
                type="button"
                className={`profile-filter-pill ${motion !== "all" ? "active" : ""}`}
                onClick={cycleMotion}
              >
                {motionLabel}
              </button>
              <button
                type="button"
                className={`profile-filter-pill ${activeAspectFilter ? "active" : ""}`}
                onClick={cycleAspectFilter}
              >
                {aspectFilterLabel}
              </button>
            </div>
          </div>
        </div>
        <div
          ref={gridRef}
          className="profile-grid"
          style={isSelectMode ? { userSelect: "none" } : undefined}
          onMouseDown={onGridMouseDown}
          onMouseMove={onGridMouseMove}
          onMouseUp={onGridMouseUp}
          onMouseLeave={onGridMouseUp}
          onTouchStart={onGridTouchStart}
          onTouchMove={onGridTouchMove}
          onTouchEnd={onGridTouchEnd}
          onTouchCancel={onGridTouchEnd}
        >
          {/* Drag-select rectangle overlay */}
          {dragRect && (dragRect.w !== 0 || dragRect.h !== 0) && (
            <div
              className="profile-drag-rect"
              style={{
                position: "fixed",
                left: Math.min(dragRect.x, dragRect.x + dragRect.w),
                top: Math.min(dragRect.y, dragRect.y + dragRect.h),
                width: Math.abs(dragRect.w),
                height: Math.abs(dragRect.h),
              }}
            />
          )}
          {showInitialSkeletons
            ? Array.from({ length: skeletonCount }).map((_, i) => (
                <div key={`sk_${i}`} className={`profile-card ${sizeClassForIndex(i)} profile-card--skeleton`}>
                  <div className="profile-card-top">
                    <div className="profile-skel-line" style={{ width: 90 }} />
                    <div className="profile-skel-line" style={{ width: 24 }} />
                  </div>
                  <div className="profile-skel-media" />
                  <div className="profile-card-promptline">
                    <div className="profile-skel-line" style={{ width: "70%" }} />
                  </div>
                </div>
              ))
            : visibleItems.map((it) => {
                const expanded = Boolean(expandedPromptIds[it.id]);
                const showViewMore = (it.prompt || "").length > 90 || it.canRecreate;
                const deleting = Boolean(deletingIds[it.id]);
                const removing = Boolean(removingIds[it.id]);
                const deleteErr = deleteErrors[it.id];
                const confirming = Boolean(confirmDeleteIds[it.id]);
                const inputs = it.inputs || null;
                const sceneImageUrl = canonicalAssetUrl(it.url);
                const canScene = !!onRecreate && !it.isMotion && isImageUrl(sceneImageUrl);
                const canAnimate = !!it.draft && !it.isMotion && isImageUrl(sceneImageUrl);
                const canAnimateBtn = !!onRecreate && canAnimate && !!it.draft;
                const canRecreateBtn = !!onRecreate && !!it.draft && it.canRecreate;
                const showActionsRow = !!inputs && (canScene || canAnimateBtn || canRecreateBtn);
                return (
                  <div
                    key={it.id}
                    data-card-id={it.id}
                    className={`profile-card ${it.sizeClass} ${removing ? "is-removing" : ""} ${
                      ghostIds[it.id] ? "is-ghost" : ""
                    } ${confirming ? "is-bulk-selected" : ""}`}
                  >
                    <div className="profile-card-top">
                      <button
                        className="profile-card-show"
                        type="button"
                        onClick={() => downloadMedia(it.url, it.prompt || "", it.isMotion)}
                        disabled={!it.url}
                      >
                        Download
                      </button>
                      <div className="profile-card-top-right">
                        {confirming ? (
                          <div className="profile-card-confirm" role="group" aria-label="Confirm delete">
                            <button
                              className="profile-card-confirm-yes profile-card-confirm-yes--red"
                              type="button"
                              onClick={() => {
                                if (confirmCount > 1) {
                                  deleteAllConfirmed();
                                } else {
                                  deleteItem(it.id);
                                }
                              }}
                              disabled={deleting || !onDelete}
                            >
                              {confirmCount > 1 ? "delete all" : "delete"}
                            </button>
                            <button
                              className="profile-card-confirm-no"
                              type="button"
                              onClick={cancelDeleteAll}
                            >
                              cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            className="profile-card-delete"
                            type="button"
                            onClick={() => askDelete(it.id)}
                            disabled={deleting || !onDelete}
                            title="Delete"
                            aria-label="Delete"
                          >
                            −
                          </button>
                        )}
                      </div>
                    </div>
                    {deleteErr ? <div className="profile-error profile-card-deleteerr">{deleteErr}</div> : null}
                    <div
                      className="profile-card-media"
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (isSelectMode) {
                          askDelete(it.id);
                          return;
                        }
                        const big = it.isMotion ? it.url : cfInput2048(it.url, "product");
                        if (!it.isMotion) prefetchImage(big);
                        openLightbox(big, it.isMotion);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          if (isSelectMode) {
                            askDelete(it.id);
                            return;
                          }
                          const big = it.isMotion ? it.url : cfInput2048(it.url, "product");
                          if (!it.isMotion) prefetchImage(big);
                          openLightbox(big, it.isMotion);
                        }
                      }}
                    >
                      {it.url ? (
                        it.isMotion ? (
                          <video
                            ref={(el) => registerVideoEl(it.id, el)}
                            src={it.url}
                            loop
                            playsInline
                            preload="auto"
                            autoPlay
                            muted
                            onMouseEnter={() => setVideoHover(it.id, true)}
                            onMouseLeave={() => setVideoHover(it.id, false)}
                            onCanPlay={(e) => e.currentTarget.classList.add("is-loaded")}
                          />
                        ) : (
                          (() => {
                            const w =
                              it.sizeClass === "profile-card--hero"
                                ? 1400
                                : it.sizeClass === "profile-card--wide"
                                  ? 1200
                                  : it.sizeClass === "profile-card--mini"
                                    ? 700
                                    : 900;
                            const thumb = cfThumb(it.url, w, 70);
                            return (
                              <img
                                src={thumb}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                onLoad={(e) => e.currentTarget.classList.add("is-loaded")}
                                onError={(e) => {
                                  const img = e.currentTarget as HTMLImageElement;
                                  img.src = it.url;
                                  img.classList.add("is-loaded");
                                }}
                              />
                            );
                          })()
                        )
                      ) : (
                        <div style={{ padding: 10, fontSize: 12, opacity: 0.6 }}>No media</div>
                      )}
                    </div>
                    <div className="profile-card-promptline">
                      <div className={`profile-card-prompt ${expanded ? "expanded" : ""}`}>
                        {it.prompt || "—"}
                        {expanded && inputs ? (
                          <div className="profile-card-details">
                            {/* Actions (right aligned): Scene (still) + Animate (still) + Re-create */}
                            {showActionsRow ? (
                              <div className="profile-card-detailrow profile-card-detailrow--actions">
                                <span className="k">Actions</span>
                                <span className="v profile-card-actionwrap">
                                  {canScene ? (
                                    <button
                                      type="button"
                                      className="profile-card-show profile-card-scene"
                                      // REPLACE the whole Scene button onClick handler with this:
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const scene = canonicalAssetUrl(sceneImageUrl);
                                        const draft: RecreateDraft = {
                                          mode: "still",
                                          brief: SCENE_PROMPT,
                                          settings: {
                                            aspect_ratio: inputs?.aspectRatio || undefined,
                                            minaVisionEnabled: inputs?.minaVisionEnabled,
                                            stylePresetKeys: inputs?.stylePresetKeys?.length
                                              ? inputs.stylePresetKeys
                                              : undefined,
                                          },
                                          assets: {
                                            // ✅ Scene pill (your wiring uses assets.product)
                                            productImageUrl: cfInput2048(scene, "product") || undefined,

                                            // ✅ Logo stays in logo slot (never falls into product/elements)
                                            ...(inputs?.logoImageUrl
                                              ? {
                                                  logoImageUrl: cfInput1080(
                                                    canonicalAssetUrl(inputs.logoImageUrl),
                                                    "logo"
                                                  ),
                                                }
                                              : {}),

                                            // ✅ Do NOT put anything into inspiration/elements
                                            styleImageUrls: [], // still force-clear
                                          },
                                        };
                                        onRecreate?.(draft);
                                        onBackToStudio?.();
                                      }}
                                    >
                                      Set scene
                                    </button>
                                  ) : null}
                                  {canAnimateBtn ? (
                                    <button
                                      type="button"
                                      className="profile-card-show profile-card-animate"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const motionDraft: RecreateDraft = {
                                          ...it.draft!,
                                          mode: "motion",
                                          assets: {
                                            ...it.draft!.assets,
                                          kling_start_image_url: sceneImageUrl,
                                          },
                                        };
                                        onRecreate?.(motionDraft);
                                        onBackToStudio?.();
                                      }}
                                    >
                                      Animate
                                    </button>
                                  ) : null}
                                   {canRecreateBtn ? (
                                    <button
                                      type="button"
                                      className="profile-card-show profile-card-recreate"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onRecreate?.(it.draft!);
                                        onBackToStudio?.();
                                      }}
                                    >
                                      Re-create
                                    </button>
                                  ) : null}
</span>
                              </div>
                            ) : null}

                            {/* Style (movement style / lane / presets) */}
                            {(() => {
                              const styleText =
                                (inputs.styleLabel || "").trim() ||
                                (inputs.stylePresetKeys?.length ? inputs.stylePresetKeys.join(", ") : "");
                              return styleText ? (
                                <div className="profile-card-detailrow">
                                  <span className="k">Style</span>
                                  <span className="v">{styleText}</span>
                                </div>
                              ) : null;
                            })()}

                            {/* Scene thumb (was "Product") */}
                            {inputs.productImageUrl ? (
                              <div className="profile-card-detailrow">
                                <span className="k">Scene</span>
                                <span className="v">
                                  <img
                                    className="profile-input-thumb"
                                    src={cfThumb(inputs.productImageUrl, 140, 70)}
                                    alt=""
                                    loading="lazy"
                                    decoding="async"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (it.draft) {
                                        onRecreate?.(it.draft);
                                        onBackToStudio?.();
                                        return;
                                      }
                                      prefetchImage(inputs.productImageUrl);
                                      openLightbox(inputs.productImageUrl, false);
                                    }}
                                  />
                                </span>
                              </div>
                            ) : null}

                            {/* Logo thumb */}
                            {inputs.logoImageUrl ? (
                              <div className="profile-card-detailrow">
                                <span className="k">Logo</span>
                                <span className="v">
                                  <img
                                    className="profile-input-thumb"
                                    src={cfThumb(inputs.logoImageUrl, 140, 70)}
                                    alt=""
                                    loading="lazy"
                                    decoding="async"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (it.draft) {
                                        onRecreate?.(it.draft);
                                        onBackToStudio?.();
                                        return;
                                      }
                                      prefetchImage(inputs.logoImageUrl);
                                      openLightbox(inputs.logoImageUrl, false);
                                    }}
                                  />
                                </span>
                              </div>
                            ) : null}

                            {/* Product & Elements thumbs (was "Inspo") — show all images */}
                            {inputs.styleImageUrls?.length ? (
                              <div className="profile-card-detailrow">
                                <span className="k">Product &amp; Elements</span>
                                <span className="v">
                                  <span className="profile-thumbrow">
                                    {inputs.styleImageUrls.map((url: string) => (
                                      <img
                                        key={url}
                                        className="profile-input-thumb"
                                        src={cfThumb(url, 140, 70)}
                                        alt=""
                                        loading="lazy"
                                        decoding="async"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (it.draft) {
                                            onRecreate?.(it.draft);
                                            onBackToStudio?.();
                                            return;
                                          }
                                          prefetchImage(url);
                                          openLightbox(url, false);
                                        }}
                                      />
                                    ))}
                                  </span>
                                </span>
                              </div>
                            ) : null}

                            {/* Motion frames (start/end + kling frames + ref video/audio if present) */}
                            {(() => {
                              const items: Array<{ kind: "image" | "video" | "audio"; url: string }> = [];
                              if (inputs.startImageUrl) items.push({ kind: "image", url: inputs.startImageUrl });
                              if (inputs.endImageUrl) items.push({ kind: "image", url: inputs.endImageUrl });
                              if (Array.isArray((inputs as any).klingFrameUrls)) {
                                for (const u of (inputs as any).klingFrameUrls as string[]) {
                                  if (u && !items.some((x) => x.url === u)) items.push({ kind: "image", url: u });
                                }
                              }
                              const refVideo = String((inputs as any).referenceVideoUrl || "").trim();
                              const refAudio = String((inputs as any).referenceAudioUrl || "").trim();
                              if (refVideo) items.push({ kind: "video", url: refVideo });
                              if (refAudio) items.push({ kind: "audio", url: refAudio });
                              const show = it.isMotion && items.length;
                              if (!show) return null;
                              return (
                                <div className="profile-card-detailrow">
                                  <span className="k">Frames</span>
                                  <span className="v">
                                    <span className="profile-thumbrow">
                                      {items.map((m) => {
                                        if (m.kind === "video") {
                                          return (
                                            <video
                                              key={m.url}
                                              className="profile-input-thumb profile-input-thumb--video"
                                              src={m.url}
                                              preload="metadata"
                                              playsInline
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
                                                  v.volume = 1;
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
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                if (it.draft) {
                                                  onRecreate?.(it.draft);
                                                  onBackToStudio?.();
                                                  return;
                                                }
                                                openLightbox(m.url, true);
                                              }}
                                              title="Reference video"
                                            />
                                          );
                                        }
                                        if (m.kind === "audio") {
                                          return (
                                            <button
                                              key={m.url}
                                              type="button"
                                              className="profile-input-thumb profile-input-thumb--audio"
                                              onMouseEnter={() => setAudioHover(m.url, true)}
                                              onMouseLeave={() => setAudioHover(m.url, false)}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                if (it.draft) {
                                                  onRecreate?.(it.draft);
                                                  onBackToStudio?.();
                                                  return;
                                                }
                                                window.open(m.url, "_blank", "noopener,noreferrer");
                                              }}
                                              title="Reference audio"
                                            >
                                              <img src={AUDIO_THUMB_URL} alt="" />
                                            </button>
                                          );
                                        }

                                        // image
                                        return (
                                          <img
                                            key={m.url}
                                            className="profile-input-thumb"
                                            src={cfThumb(m.url, 140, 70)}
                                            alt=""
                                            loading="lazy"
                                            decoding="async"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (it.draft) {
                                                onRecreate?.(it.draft);
                                                onBackToStudio?.();
                                                return;
                                              }
                                              prefetchImage(m.url);
                                              openLightbox(m.url, false);
                                            }}
                                          />
                                        );
                                      })}
                                    </span>
                                  </span>
                                </div>
                              );
                            })()}

                            {/* Aspect Ratio */}
                            {inputs.aspectRatio ? (
                              <div className="profile-card-detailrow">
                                <span className="k">Aspect Ratio</span>
                                <span className="v">{inputs.aspectRatio}</span>
                              </div>
                            ) : null}

                            {/* Duration (motion only) */}
                            {it.isMotion && inputs.motionDurationSec ? (
                              <div className="profile-card-detailrow">
                                <span className="k">Duration</span>
                                <span className="v">{inputs.motionDurationSec}s</span>
                              </div>
                            ) : null}

                            {/* Sound (motion only) */}
                            {it.isMotion && typeof inputs.generateAudio === "boolean" ? (
                              <div className="profile-card-detailrow">
                                <span className="k">Sound</span>
                                <span className="v">{inputs.generateAudio ? "Sound" : "Muted"}</span>
                              </div>
                            ) : null}

                            {/* Cost (matchas) */}
                            {it.matchasCost > 0 ? (
                              <div className="profile-card-detailrow">
                                <span className="k">Cost</span>
                                <span className="v">{it.matchasCost} matchas</span>
                              </div>
                            ) : null}

                            {/* Date & time */}
                            {it.createdAt ? (
                              <div className="profile-card-detailrow">
                                <span className="k">Created</span>
                                <span className="v">{fmtDateTime(it.createdAt)}</span>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      {showViewMore ? (
                        <button className="profile-card-viewmore" type="button" onClick={() => onTogglePrompt(it.id)}>
                          {expanded ? "less" : "more"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
          <div ref={sentinelRef} className="profile-grid-sentinel" />
          <div ref={loadMoreRef} style={{ height: 1 }} />
          {loadingMore
            ? Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={`sk_more_${i}`}
                  className={`profile-card ${sizeClassForIndex(visibleItems.length + i)} profile-card--skeleton`}
                >
                  <div className="profile-card-top">
                    <div className="profile-skel-line" style={{ width: 90 }} />
                    <div className="profile-skel-line" style={{ width: 24 }} />
                  </div>
                  <div className="profile-skel-media" />
                  <div className="profile-card-promptline">
                    <div className="profile-skel-line" style={{ width: "60%" }} />
                  </div>
                </div>
              ))
            : null}
        </div>
</div>
    </>
  );
}