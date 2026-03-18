// =============================================================
// Hook: useVideoAutoplay
// Grid video autoplay IntersectionObserver extracted from Profile.tsx
// =============================================================

import { useEffect } from "react";

type MutableRef<T> = { current: T };

export function useVideoAutoplay(
  items: any[],
  visibleItems: any[],
  videoElsRef: MutableRef<Map<string, HTMLVideoElement>>,
  hoveredVideoIdRef: MutableRef<string | null>,
) {
  // Grid video autoplay (muted) + hover audio (desktop)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("IntersectionObserver" in window)) return;

    const els = videoElsRef.current;
    const visible = new Map<HTMLVideoElement, number>();

    const pauseAll = () => {
      els.forEach((v) => {
        try {
          v.pause();
        } catch {}
      });
    };

    const playVisible = () => {
      els.forEach((v) => {
        const ratio = visible.get(v) ?? 0;
        const shouldPlay = ratio >= 0.35;

        try {
          const id = v.dataset?.minaId || "";
          const hovering = id && hoveredVideoIdRef.current === id;

          // autoplay must be muted; only unmute on hover
          v.muted = !hovering;

          if (shouldPlay) {
            if (v.paused) v.play().catch(() => {});
          } else {
            if (!v.paused) v.pause();
          }
        } catch {}
      });
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const v = e.target as HTMLVideoElement;
          const ratio = e.intersectionRatio || 0;
          if (e.isIntersecting && ratio >= 0.35) visible.set(v, ratio);
          else visible.delete(v);
        }
        playVisible();
      },
      {
        root: null,
        rootMargin: "200px 0px 200px 0px",
        threshold: [0, 0.35, 0.7, 1],
      },
    );

    els.forEach((v) => observer.observe(v));

    const onVis = () => {
      if (document.hidden) pauseAll();
      else playVisible();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      observer.disconnect();
      pauseAll();
    };
  }, [visibleItems.length, videoElsRef, hoveredVideoIdRef]);
}
