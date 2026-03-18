// =============================================================
// Hook: useProfileDragSelect
// Drag-select + keyboard shortcuts extracted from Profile.tsx
// =============================================================

import { useCallback, useEffect, useRef, useState } from "react";

type SetState<T> = (value: T | ((prev: T) => T)) => void;
type MutableRef<T> = { current: T };

export function useProfileDragSelect(
  gridRef: MutableRef<HTMLDivElement | null>,
  confirmDeleteIds: Record<string, boolean>,
  removedIds: Record<string, boolean>,
  ghostIds: Record<string, boolean>,
  askDelete: (ids: string[]) => void,
  cancelDeleteAll: () => void,
  setConfirmDeleteIds: SetState<Record<string, boolean>>,
) {
  const confirmCount = Object.values(confirmDeleteIds).filter(Boolean).length;
  const isSelectMode = confirmCount > 0;

  // Drag-select rectangle (desktop + touch)
  const [dragRect, setDragRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const dragState = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    scrollTop: number;
    touch: boolean;
    longPressTimer: ReturnType<typeof setTimeout> | null;
  }>({ active: false, startX: 0, startY: 0, scrollTop: 0, touch: false, longPressTimer: null });

  // IDs selected live while the drag-rect is being drawn (applied on release)
  const dragSelectedIds = useRef<Set<string>>(new Set());

  // Stable ref so keyboard effect always sees latest confirmDeleteIds
  const confirmDeleteIdsRef = useRef(confirmDeleteIds);
  confirmDeleteIdsRef.current = confirmDeleteIds;

  // Get all card elements and their IDs that intersect a rect
  const getCardsInRect = useCallback((rect: { x: number; y: number; w: number; h: number }) => {
    if (!gridRef.current) return [];
    const cards = gridRef.current.querySelectorAll<HTMLElement>("[data-card-id]");
    const result: string[] = [];
    const rx1 = Math.min(rect.x, rect.x + rect.w);
    const ry1 = Math.min(rect.y, rect.y + rect.h);
    const rx2 = Math.max(rect.x, rect.x + rect.w);
    const ry2 = Math.max(rect.y, rect.y + rect.h);

    cards.forEach((card) => {
      const cr = card.getBoundingClientRect();
      // Check overlap
      if (cr.left < rx2 && cr.right > rx1 && cr.top < ry2 && cr.bottom > ry1) {
        const id = card.getAttribute("data-card-id");
        if (id) result.push(id);
      }
    });
    return result;
  }, [gridRef]);

  // --- Desktop drag-select ---
  const onGridMouseDown = useCallback((e: React.MouseEvent) => {
    // Only left-click
    if (e.button !== 0) return;
    // Only if already in select mode (at least one card confirmed)
    if (!isSelectMode) return;

    // Don't start drag immediately — wait for movement (threshold in mousemove)
    dragState.current = {
      active: false,
      startX: e.clientX,
      startY: e.clientY,
      scrollTop: 0,
      touch: false,
      longPressTimer: null,
    };
    dragSelectedIds.current.clear();
  }, [isSelectMode]);

  const onGridMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragState.current.touch) return;
    const { startX, startY } = dragState.current;
    const dist = Math.hypot(e.clientX - startX, e.clientY - startY);

    // Activate drag only after moving ≥ 5px
    if (!dragState.current.active) {
      if (startX === 0 && startY === 0) return; // no mousedown tracked
      if (dist < 5) return;
      dragState.current.active = true;
      setDragRect({ x: startX, y: startY, w: 0, h: 0 });
    }

    const rect = { x: startX, y: startY, w: e.clientX - startX, h: e.clientY - startY };
    setDragRect(rect);

    // Live-select: apply selections as the rect sweeps over cards
    const ids = getCardsInRect(rect);
    const newIds = new Set<string>(ids);
    const prev = dragSelectedIds.current;

    // Only update if the set changed
    if (newIds.size !== prev.size || ids.some((id: string) => !prev.has(id))) {
      dragSelectedIds.current = newIds;
      setConfirmDeleteIds((cur: Record<string, boolean>) => {
        const next = { ...cur };
        prev.forEach((id: string) => { if (!newIds.has(id)) delete next[id]; });
        newIds.forEach((id: string) => { next[id] = true; });
        return next;
      });
    }
  }, [getCardsInRect, setConfirmDeleteIds]);

  const onGridMouseUp = useCallback(() => {
    const wasDragging = dragState.current.active;
    dragState.current.active = false;
    dragState.current.startX = 0;
    dragState.current.startY = 0;
    dragSelectedIds.current.clear();
    if (wasDragging) {
      // Selection already applied live — just clear the visual rect
      setDragRect(null);
    }
  }, []);

  // --- Touch drag-select (long-press to start, drag to sweep) ---
  const onGridTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isSelectMode) return;
    const tag = (e.target as HTMLElement).tagName.toLowerCase();
    if (tag === "button" || tag === "input" || tag === "a") return;

    const touch = e.touches[0];
    const st = dragState.current;
    st.startX = touch.clientX;
    st.startY = touch.clientY;
    st.touch = true;
    st.active = false;

    // Long-press: 400ms to start drag-select
    if (st.longPressTimer) clearTimeout(st.longPressTimer);
    st.longPressTimer = setTimeout(() => {
      st.active = true;
      setDragRect({ x: touch.clientX, y: touch.clientY, w: 0, h: 0 });
    }, 400);
  }, [isSelectMode]);

  const onGridTouchMove = useCallback((e: React.TouchEvent) => {
    const st = dragState.current;
    if (!st.touch) return;

    const touch = e.touches[0];
    const dist = Math.hypot(touch.clientX - st.startX, touch.clientY - st.startY);

    // If moved before long-press fires, cancel it (normal scroll)
    if (!st.active && dist > 10) {
      if (st.longPressTimer) {
        clearTimeout(st.longPressTimer);
        st.longPressTimer = null;
      }
      return;
    }

    if (!st.active) return;

    e.preventDefault(); // prevent scroll while dragging
    const rect = { x: st.startX, y: st.startY, w: touch.clientX - st.startX, h: touch.clientY - st.startY };
    setDragRect(rect);

    // Live-select: apply selections as the rect sweeps over cards
    const ids = getCardsInRect(rect);
    const newIds = new Set<string>(ids);
    const prev = dragSelectedIds.current;

    if (newIds.size !== prev.size || ids.some((id: string) => !prev.has(id))) {
      dragSelectedIds.current = newIds;
      setConfirmDeleteIds((cur: Record<string, boolean>) => {
        const next = { ...cur };
        prev.forEach((id: string) => { if (!newIds.has(id)) delete next[id]; });
        newIds.forEach((id: string) => { next[id] = true; });
        return next;
      });
    }
  }, [getCardsInRect, setConfirmDeleteIds]);

  const onGridTouchEnd = useCallback(() => {
    const st = dragState.current;
    if (st.longPressTimer) {
      clearTimeout(st.longPressTimer);
      st.longPressTimer = null;
    }
    if (!st.active || !st.touch) {
      st.touch = false;
      return;
    }
    st.active = false;
    st.touch = false;
    dragSelectedIds.current.clear();
    // Selection already applied live — just clear the visual rect
    setDragRect(null);
  }, []);

  // Keyboard shortcuts: Delete/Backspace → delete selected, Escape → cancel
  useEffect(() => {
    if (!isSelectMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelDeleteAll();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        // Don't trigger if user is typing in an input
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag === "input" || tag === "textarea") return;
        e.preventDefault();
        const ids = Object.keys(confirmDeleteIdsRef.current).filter(
          (id) => confirmDeleteIdsRef.current[id],
        );
        if (ids.length) askDelete(ids);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isSelectMode, confirmDeleteIds, askDelete, cancelDeleteAll]);

  return {
    dragRect,
    dragSelectedIds,
    isSelectMode,
    confirmCount,
    onGridMouseDown,
    onGridMouseMove,
    onGridMouseUp,
    onGridTouchStart,
    onGridTouchMove,
    onGridTouchEnd,
  };
}
