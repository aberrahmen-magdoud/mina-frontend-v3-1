// src/hooks/useMatchaCheckout.ts
// Shared matcha quantity modal state used by StudioLeft and Profile.

import { useState } from "react";

export function clampQty(n: number) {
  return Math.max(1, Math.min(100, Math.floor(Number(n || 1))));
}

export function buildMatchaCheckoutUrl(base: string, qty: number) {
  const q = clampQty(qty);
  try {
    const u = new URL(String(base || ""));
    const m = u.pathname.match(/\/cart\/(\d+)(?::(\d+))?/);
    if (m?.[1]) { u.pathname = `/cart/${m[1]}:${q}`; return u.toString(); }
    if (u.pathname.includes("/cart/add")) { u.searchParams.set("quantity", String(q)); return u.toString(); }
    u.searchParams.set("quantity", String(q));
    return u.toString();
  } catch { return String(base || ""); }
}

export function useMatchaCheckout(opts: {
  matchaUrl: string;
  matcha5000Url?: string;
  onConfirmCheckout?: (qty: number) => void;
}) {
  const [matchaQtyOpen, setMatchaQtyOpen] = useState(false);
  const [matchaQty, setMatchaQty] = useState(1);

  const openMatchaQty = () => { setMatchaQty(1); setMatchaQtyOpen(true); };

  const confirmMatchaQty = (qty: number) => {
    setMatchaQtyOpen(false);
    if (opts.onConfirmCheckout) {
      opts.onConfirmCheckout(qty);
    } else {
      const is5000 = qty === 100 && opts.matcha5000Url;
      const url = is5000 ? opts.matcha5000Url! : buildMatchaCheckoutUrl(opts.matchaUrl, qty);
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return { matchaQtyOpen, matchaQty, setMatchaQty, setMatchaQtyOpen, openMatchaQty, confirmMatchaQty, clampQty };
}
