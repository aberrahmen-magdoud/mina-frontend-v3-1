// src/lib/useUndoRedo.ts
// Global undo/redo system for destructive actions.
//
// Usage:
//   const undo = useUndoRedo();
//   undo.push({ label: "Delete image", undo: () => restore(), redo: () => remove() });
//   // Cmd+Z → calls undo fn, Cmd+Shift+Z → calls redo fn

import { useCallback, useEffect, useRef, useState } from "react";

export type UndoEntry = {
  label: string;
  undo: () => void | Promise<void>;
  redo: () => void | Promise<void>;
};

const MAX_STACK = 50;

export function useUndoRedo() {
  const undoStack = useRef<UndoEntry[]>([]);
  const redoStack = useRef<UndoEntry[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  }, []);

  const push = useCallback((entry: UndoEntry) => {
    undoStack.current.push(entry);
    if (undoStack.current.length > MAX_STACK) undoStack.current.shift();
    // New action clears redo stack
    redoStack.current = [];
  }, []);

  const performUndo = useCallback(async () => {
    const entry = undoStack.current.pop();
    if (!entry) return;
    try {
      await entry.undo();
      redoStack.current.push(entry);
      showToast(`Undone: ${entry.label}`);
    } catch (e) {
      console.warn("[undo] failed:", e);
      showToast("Undo failed");
    }
  }, [showToast]);

  const performRedo = useCallback(async () => {
    const entry = redoStack.current.pop();
    if (!entry) return;
    try {
      await entry.redo();
      undoStack.current.push(entry);
      showToast(`Redone: ${entry.label}`);
    } catch (e) {
      console.warn("[redo] failed:", e);
      showToast("Redo failed");
    }
  }, [showToast]);

  // Global keyboard listener: Cmd+Z / Ctrl+Z = undo, Cmd+Shift+Z / Ctrl+Shift+Z = redo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== "z") return;

      // Don't hijack undo inside text inputs — let the browser handle those
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      // contentEditable
      if ((e.target as HTMLElement)?.isContentEditable) return;

      e.preventDefault();

      if (e.shiftKey) {
        performRedo();
      } else {
        performUndo();
      }
    };

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [performUndo, performRedo]);

  return { push, performUndo, performRedo, toast, undoStack, redoStack };
}
