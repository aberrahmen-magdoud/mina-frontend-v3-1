// =============================================================
// Hook: useProfileLightbox
// Lightbox state + handlers extracted from Profile.tsx
// =============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { downloadMedia } from "../lib/profileHelpers";

type MutableRef<T> = { current: T };

export function useProfileLightbox(items: any[]) {
  const [lightbox, setLightbox] = useState<{ url: string; isMotion: boolean } | null>(null);
  const [lbZoomed, setLbZoomed] = useState(false);
  const [lbZoomOrigin, setLbZoomOrigin] = useState("center center");
  const [lbHintVisible, setLbHintVisible] = useState(false);
  const lbClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lbHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preloadedRef = useRef<Set<string>>(new Set());

  // Lightbox swipe-to-close refs
  const lightboxSwipeRef = useRef<{
    active: boolean;
    pointerId: number;
    startX: number;
    startY: number;
    startedAt: number;
    pointerType: string;
  }>({
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    startedAt: 0,
    pointerType: "",
  });

  const lightboxJustSwipedRef = useRef(false);

  const SWIPE_CLOSE_PX = 70;
  const SWIPE_MAX_MS = 900;

  const openLightbox = useCallback((url: string | null, isMotion: boolean) => {
    if (!url) return;
    setLightbox({ url, isMotion });
    setLbZoomed(false);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightbox(null);
    setLbZoomed(false);
  }, []);

  const prefetchImage = useCallback((url: string) => {
    if (!url) return;
    if (preloadedRef.current.has(url)) return;
    preloadedRef.current.add(url);

    const img = new Image();
    try {
      (img as any).decoding = "async";
    } catch {}
    img.src = url;
  }, []);

  const handleLbMediaClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    // Compute click position as percentage for zoom origin
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    setLbZoomOrigin(`${xPct}% ${yPct}%`);

    // Delay single-click to allow double-click detection
    if (lbClickTimer.current) clearTimeout(lbClickTimer.current);
    lbClickTimer.current = setTimeout(() => {
      setLbZoomed((z: boolean) => !z);
      lbClickTimer.current = null;
    }, 250);
  }, []);

  const handleLbMediaDblClick = useCallback((url: string, isMotion: boolean) => {
    // Cancel the pending single-click zoom toggle
    if (lbClickTimer.current) {
      clearTimeout(lbClickTimer.current);
      lbClickTimer.current = null;
    }
    downloadMedia(url, "", isMotion);
  }, []);

  // Show "double-click to download" hint after 1s hover, hide on leave
  const handleLbMediaEnter = useCallback(() => {
    if (lbHintTimer.current) clearTimeout(lbHintTimer.current);
    lbHintTimer.current = setTimeout(() => setLbHintVisible(true), 1000);
  }, []);

  const handleLbMediaLeave = useCallback(() => {
    if (lbHintTimer.current) clearTimeout(lbHintTimer.current);
    lbHintTimer.current = null;
    setLbHintVisible(false);
  }, []);

  // Lightbox close: swipe any direction (mobile) + click/esc (desktop)
  const onLightboxPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!lightbox) return;

      const pt = String((e as any).pointerType || "");
      if (pt === "mouse") return;

      lightboxSwipeRef.current = {
        active: true,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startedAt: Date.now(),
        pointerType: pt,
      };

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}

      e.preventDefault();
    },
    [lightbox],
  );

  const onLightboxPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const st = lightboxSwipeRef.current;
      if (!lightbox) return;
      if (!st.active) return;
      if (st.pointerId !== e.pointerId) return;

      const dx = e.clientX - st.startX;
      const dy = e.clientY - st.startY;
      const dist = Math.hypot(dx, dy);
      const age = Date.now() - st.startedAt;

      if (dist >= SWIPE_CLOSE_PX && age <= SWIPE_MAX_MS) {
        lightboxJustSwipedRef.current = true;
        st.active = false;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {}
        closeLightbox();
        e.preventDefault();
      }
    },
    [lightbox, closeLightbox],
  );

  const onLightboxPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const st = lightboxSwipeRef.current;
    if (st.pointerId !== e.pointerId) return;
    st.active = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  }, []);

  // Keyboard: Esc/Backspace closes lightbox
  useEffect(() => {
    if (!lightbox) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        closeLightbox();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightbox, closeLightbox]);

  return {
    lightbox,
    lbZoomed,
    lbZoomOrigin,
    lbHintVisible,
    lightboxJustSwipedRef,
    openLightbox,
    closeLightbox,
    prefetchImage,
    handleLbMediaClick,
    handleLbMediaDblClick,
    handleLbMediaEnter,
    handleLbMediaLeave,
    onLightboxPointerDown,
    onLightboxPointerMove,
    onLightboxPointerUp,
  };
}
