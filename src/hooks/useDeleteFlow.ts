// src/hooks/useDeleteFlow.ts
// Profile delete state + batch-delete logic.

import { useCallback, useState } from "react";

type Rec = Record<string, boolean>;
type RecS = Record<string, string>;

export function useDeleteFlow(onDelete?: (id: string) => Promise<void> | void) {
  const [deletingIds, setDeletingIds] = useState<Rec>({});
  const [removingIds, setRemovingIds] = useState<Rec>({});
  const [removedIds, setRemovedIds] = useState<Rec>({});
  const [ghostIds, setGhostIds] = useState<Rec>({});
  const [deleteErrors, setDeleteErrors] = useState<RecS>({});
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<Rec>({});

  const askDelete = (id: string) => {
    setDeleteErrors((prev: RecS) => ({ ...prev, [id]: "" }));
    setConfirmDeleteIds((prev: Rec) => {
      if (prev[id]) { const next = { ...prev }; delete next[id]; return next; }
      return { ...prev, [id]: true };
    });
  };

  const cancelDeleteAll = () => setConfirmDeleteIds({});

  const deleteByIds = useCallback(async (ids: string[]) => {
    if (!ids.length || !onDelete) return;
    setConfirmDeleteIds({});
    for (const id of ids) {
      setRemovingIds((p: Rec) => ({ ...p, [id]: true }));
      setDeletingIds((p: Rec) => ({ ...p, [id]: true }));
    }
    for (const id of ids) {
      try {
        await onDelete(id);
        setGhostIds((p: Rec) => ({ ...p, [id]: true }));
        setTimeout(() => {
          setRemovedIds((p: Rec) => ({ ...p, [id]: true }));
          setGhostIds((p: Rec) => { const n = { ...p }; delete n[id]; return n; });
        }, 260);
      } catch (e: any) {
        const msg = typeof e?.message === "string" ? e.message : "Delete failed.";
        setDeleteErrors((p: RecS) => ({ ...p, [id]: msg }));
      }
      setRemovingIds((p: Rec) => { const n = { ...p }; delete n[id]; return n; });
      setDeletingIds((p: Rec) => { const n = { ...p }; delete n[id]; return n; });
    }
  }, [onDelete]);

  const deleteItem = (id: string) => deleteByIds([id]);
  const deleteAllConfirmed = () => {
    const ids = Object.keys(confirmDeleteIds).filter((id) => confirmDeleteIds[id]);
    deleteByIds(ids);
  };

  return {
    deletingIds, removingIds, removedIds, ghostIds, deleteErrors, confirmDeleteIds, setConfirmDeleteIds,
    askDelete, cancelDeleteAll, deleteByIds, deleteItem, deleteAllConfirmed,
  };
}
