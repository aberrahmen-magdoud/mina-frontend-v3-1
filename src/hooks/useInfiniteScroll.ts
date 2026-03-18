// src/hooks/useInfiniteScroll.ts
// Dual-sentinel infinite scroll for profile grid.

import { useEffect, useRef } from "react";

export function useInfiniteScroll(opts: {
  itemCount: number;
  setVisibleCount: (fn: (c: number) => number) => void;
  sentinelRef: { current: HTMLDivElement | null };
  loadMoreRef: { current: HTMLDivElement | null };
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore?: () => void;
  getScrollParent: (el: HTMLElement) => HTMLElement | null;
}) {
  const loadingMoreFlag = useRef(false);

  useEffect(() => { loadingMoreFlag.current = opts.loadingMore; }, [opts.loadingMore]);

  // Sentinel — load more from local buffer
  useEffect(() => {
    const el = opts.sentinelRef.current;
    if (!el) return;
    const root = opts.getScrollParent(el);
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        opts.setVisibleCount((c: number) => Math.min(opts.itemCount, c + 24));
      },
      { root, rootMargin: root ? "900px 0px 900px 0px" : "1400px 0px 1400px 0px", threshold: 0.01 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [opts.itemCount]);

  // Load-more — fetch from server
  useEffect(() => {
    if (!opts.hasMore || !opts.onLoadMore) return;
    const el = opts.loadMoreRef.current;
    if (!el) return;
    const root = opts.getScrollParent(el);
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (!opts.hasMore) return;
        if (loadingMoreFlag.current) return;
        loadingMoreFlag.current = true;
        opts.onLoadMore!();
      },
      { root: root || null, rootMargin: root ? "1200px 0px 1200px 0px" : "1400px 0px 1400px 0px", threshold: 0.01 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [opts.hasMore, opts.onLoadMore]);
}
