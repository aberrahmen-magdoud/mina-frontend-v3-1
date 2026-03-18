// src/hooks/useMinaNotice.ts
// Mina "talking" animation — phrases cycle char-by-char while busy

import { useCallback, useEffect, useState } from "react";
import type { MinaNoticeTone } from "../lib/minaTypes";
import { humanizeMmaError } from "../lib/mmaErrors";

export function useMinaNotice(
  minaBusy: boolean,
  personalityThinking: string[],
  personalityFiller: string[]
) {
  const [minaMessage, setMinaMessage] = useState("");
  const [minaTalking, setMinaTalking] = useState(false);
  const [minaOverrideText, setMinaOverrideText] = useState<string | null>(null);
  const [minaTone, setMinaTone] = useState<MinaNoticeTone>("thinking");

  const dismissMinaNotice = useCallback(() => {
    if (minaTone === "thinking") return;
    setMinaTalking(false);
    setMinaMessage("");
    setMinaOverrideText(null);
    setMinaTone("thinking");
  }, [minaTone]);

  const showMinaError = useCallback((err: any) => {
    const msg = humanizeMmaError(err);
    setMinaTone("error");
    setMinaTalking(true);
    setMinaOverrideText(null);
    setMinaMessage(msg);
  }, []);

  const showMinaInfo = useCallback((msg: string) => {
    setMinaTone("info");
    setMinaTalking(true);
    setMinaOverrideText(null);
    setMinaMessage(msg);
  }, []);

  const clearMinaError = useCallback(() => {
    if (minaTone !== "error") return;
    dismissMinaNotice();
  }, [dismissMinaNotice, minaTone]);

  // Char-by-char phrase cycling while busy
  useEffect(() => {
    if (minaTone !== "thinking") return;
    if (!minaBusy) return;
    if (minaOverrideText) return;

    setMinaTalking(true);

    const phrases = [...personalityThinking, ...personalityFiller].filter(Boolean);
    let phraseIndex = 0;
    let charIndex = 0;
    let t: number | null = null;

    const CHAR_MS = 35;
    const END_PAUSE_MS = 160;

    const tick = () => {
      const phrase = phrases[phraseIndex % phrases.length] || "";
      const nextChar = charIndex + 1;
      const nextSlice = phrase.slice(0, Math.min(nextChar, phrase.length));
      setMinaMessage(nextSlice || "typing\u2026");
      const reachedEnd = nextChar > phrase.length;
      charIndex = reachedEnd ? 0 : nextChar;
      if (reachedEnd) phraseIndex += 1;
      t = window.setTimeout(tick, reachedEnd ? END_PAUSE_MS : CHAR_MS);
    };

    t = window.setTimeout(tick, CHAR_MS);
    return () => { if (t !== null) window.clearTimeout(t); };
  }, [minaBusy, minaOverrideText, minaTone, personalityThinking, personalityFiller]);

  // Override text char-by-char
  useEffect(() => {
    if (minaTone !== "thinking") return;
    if (!minaOverrideText) return;

    setMinaTalking(true);
    setMinaMessage("");

    let cancelled = false;
    let i = 0;
    let t: number | null = null;
    const text = minaOverrideText;
    const CHAR_MS = 6;

    const tick = () => {
      if (cancelled) return;
      i += 1;
      setMinaMessage(text.slice(0, i));
      if (i < text.length) t = window.setTimeout(tick, CHAR_MS);
    };

    t = window.setTimeout(tick, CHAR_MS);
    return () => { cancelled = true; if (t !== null) window.clearTimeout(t); };
  }, [minaOverrideText, minaTone]);

  // Clear when no longer busy
  useEffect(() => {
    if (minaBusy) return;
    if (minaOverrideText) return;
    if (minaTone !== "thinking") return;
    setMinaTalking(false);
    setMinaMessage("");
  }, [minaBusy, minaOverrideText, minaTone]);

  return {
    minaMessage, setMinaMessage,
    minaTalking, setMinaTalking,
    minaOverrideText, setMinaOverrideText,
    minaTone, setMinaTone,
    dismissMinaNotice, showMinaError, showMinaInfo, clearMinaError,
  };
}
