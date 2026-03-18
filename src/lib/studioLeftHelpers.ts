// src/lib/studioLeftHelpers.ts
// Helpers and constants specific to StudioLeft

import type { UploadItem, MotionStyleKey } from "./minaTypes";
import { isVideoUrl, isAudioUrl } from "./mediaHelpers";

export const AUDIO_THUMB_URL =
  "https://assets.faltastudio.com/Website%20Assets/audio-mina-icon.gif";

export const TYPE_FOR_ME_ICON =
  "https://assets.faltastudio.com/Website%20Assets/icon-type-for-me.svg";

export const MOTION_STYLES: Array<{
  key: MotionStyleKey;
  label: string;
  seed: string;
  thumb: string;
}> = [
  {
    key: "expand",
    label: "Expand",
    seed: "Subtle expansion, calm luxury vibe.",
    thumb: "https://assets.faltastudio.com/Website%20Assets/Movement%20styles/expand.png",
  },
  {
    key: "melt",
    label: "Melt",
    seed: "Slow, asmr, melting motion\u2014soft drips, luxury macro feel.",
    thumb: "https://assets.faltastudio.com/Website%20Assets/Movement%20styles/melt.png",
  },
  {
    key: "drop",
    label: "Drop",
    seed: "Falling in slow rhythm\u2014minimal, ASMR, drops.",
    thumb: "https://assets.faltastudio.com/Website%20Assets/Movement%20styles/drop.png",
  },
  {
    key: "satisfying",
    label: "Satisfying",
    seed: "Slime video, satisfying, smooth, satisfying, motion loop\u2014micro movements, clean, premium.",
    thumb: "https://assets.faltastudio.com/Website%20Assets/Movement%20styles/satisfying.png",
  },
  {
    key: "slow_motion",
    label: "Slow motion",
    seed: "Ultra slow motion, 1000fps, asmr, premium calm.",
    thumb: "https://assets.faltastudio.com/Website%20Assets/Movement%20styles/slow-motion.png",
  },
  {
    key: "fix_camera",
    label: "Still camera",
    seed: "fix camera",
    thumb: "https://assets.faltastudio.com/Website%20Assets/Movement%20styles/fix-camera.png",
  },
  {
    key: "loop",
    label: "Perfect loop",
    seed: "perfect loop",
    thumb: "https://assets.faltastudio.com/Website%20Assets/Movement%20styles/perfect-look.png",
  },
];

export function inferMediaTypeFromItem(
  it: UploadItem | null | undefined
): "image" | "video" | "audio" | null {
  if (!it) return null;

  const mt = (it as any).mediaType;
  if (mt === "image" || mt === "video" || mt === "audio") return mt;

  const ft = String(it.file?.type || "").toLowerCase();
  if (ft.startsWith("video/")) return "video";
  if (ft.startsWith("audio/")) return "audio";
  if (ft.startsWith("image/")) return "image";

  const u = String(it.remoteUrl || it.url || "").toLowerCase();
  if (isVideoUrl(u)) return "video";
  if (isAudioUrl(u)) return "audio";
  if (u) return "image";

  return null;
}
