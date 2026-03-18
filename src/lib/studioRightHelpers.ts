// src/lib/studioRightHelpers.ts
// Constants and helpers specific to StudioRight

import type { FtModelKey } from "./minaTypes";

export const MASK_MODELS = new Set<FtModelKey>(["eraser", "flux_fill"]);
export const PROMPT_MODELS = new Set<FtModelKey>(["flux_fill"]);

export const FT_INITIAL_DELAY = 260;
export const FT_STAGGER = 90;
