// src/lib/minaConstants.ts
// ============================================================================
// All shared constants for the Mina app
// ============================================================================

import type { AspectKey, AspectOption } from "./minaTypes";

const normalizeBase = (raw?: string | null) => {
  if (!raw) return "";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
};

export const MATCHA_URL = "https://www.faltastudio.com/cart/43328351928403:1";
export const MATCHA_5000_URL = "https://www.faltastudio.com/cart/44184397283411:1";

export const API_BASE_URL = (() => {
  const envBase = normalizeBase(
    (import.meta as any).env?.VITE_MINA_API_BASE_URL ||
      (import.meta as any).env?.VITE_API_BASE_URL ||
      (import.meta as any).env?.VITE_BACKEND_URL
  );
  return envBase || "https://mina-editorial-ai-api.onrender.com";
})();

export const LIKE_STORAGE_KEY = "minaLikedMap";
export const RECREATE_DRAFT_KEY = "mina_recreate_draft_v1";
export const STILL_LANE_LS_KEY = "mina_still_lane_v2";
export const STILL_RESOLUTION = "4k" as const;
export const CUSTOM_STYLES_LS_KEY = "minaCustomStyles_v1";
export const WELCOME_CLAIMED_KEY = "mina_welcome_claimed";

export const MOTION_FRAME2_VIDEO_MIN_SEC = 0;
export const MOTION_FRAME2_VIDEO_MAX_SEC = 30;
export const FABRIC_AUDIO_MIN_SEC = 0;
export const FABRIC_AUDIO_MAX_SEC = 60;

export const ASPECT_OPTIONS: AspectOption[] = [
  { key: "9-16", ratio: "9:16", label: "9:16", subtitle: "Tiktok/Reel", platformKey: "tiktok" },
  { key: "3-4", ratio: "3:4", label: "3:4", subtitle: "Post", platformKey: "instagram-post" },
  { key: "2-3", ratio: "2:3", label: "2:3", subtitle: "Printing", platformKey: "print" },
  { key: "1-1", ratio: "1:1", label: "1:1", subtitle: "Square", platformKey: "square" },
];

export const ASPECT_ICON_URLS: Record<AspectKey, string> = {
  "9-16":
    "https://cdn.shopify.com/s/files/1/0678/9254/3571/files/tiktokreels_icon_e116174c-afc7-4174-9cf0-f24a07c8517b.svg?v=1765425956",
  "3-4":
    "https://cdn.shopify.com/s/files/1/0678/9254/3571/files/post_icon_f646fcb5-03be-4cf5-b25c-b1ec38f6794e.svg?v=1765425956",
  "2-3":
    "https://cdn.shopify.com/s/files/1/0678/9254/3571/files/Printing_icon_c7252c7d-863e-4efb-89c4-669261119d61.svg?v=1765425956",
  "1-1":
    "https://cdn.shopify.com/s/files/1/0678/9254/3571/files/square_icon_901d47a8-44a8-4ab9-b412-2224e97fd9d9.svg?v=1765425956",
};

export const REPLICATE_ASPECT_RATIO_MAP: Record<string, string> = {
  "9:16": "9:16",
  "3:4": "3:4",
  "2:3": "2:3",
  "1:1": "1:1",
};

export const STYLE_PRESETS = [
  {
    key: "vintage",
    label: "Vintage",
    thumb: "https://assets.faltastudio.com/Website%20Assets/Vintage.jpg",
    hero: [
      "https://assets.faltastudio.com/mma/still/8167b69f-048f-49d3-a45d-669303cefc70.png",
    ],
  },
  {
    key: "gradient",
    label: "Luxury",
    thumb: "https://assets.faltastudio.com/Website%20Assets/Luxury.jpg",
    hero: [
      "https://assets.faltastudio.com/mma/still/8a098823-1373-4caf-8851-63ad2d7edb95.png",
    ],
  },
  {
    key: "back-light",
    label: "Minimal",
    thumb: "https://assets.faltastudio.com/Website%20Assets/Minimal.jpg",
    hero: [
      "https://assets.faltastudio.com/mma/still/e213a6c9-7705-426d-a057-84af20a05e60.png",
      "",
    ],
  },
] as const;

// Premium reveal timing
export const PILL_INITIAL_DELAY_MS = 260;
export const PILL_STAGGER_MS = 90;
export const PILL_SLIDE_DURATION_MS = 320;
export const PANEL_REVEAL_DELAY_MS = PILL_INITIAL_DELAY_MS;
export const CONTROLS_REVEAL_DELAY_MS = 0;
export const GROUP_FADE_DURATION_MS = 420;
export const MAX_BRIEF_CHARS = 1000;
export const TYPING_HIDE_DELAY_MS = 400000;
export const TYPING_REVEAL_DELAY_MS = 320;
export const TEXTAREA_FLOAT_DISTANCE_PX = 12;

// Upload limits
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const ALLOWED_EXTS = new Set(["png", "jpg", "jpeg", "webp"]);
export const ALLOWED_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);

export const ALLOWED_VIDEO_EXTS = new Set(["mp4", "mov"]);
export const ALLOWED_VIDEO_MIMES = new Set(["video/mp4", "video/quicktime"]);

export const FABRIC_AUDIO_EXTS = new Set(["mp3", "wav", "m4a", "aac"]);
export const FABRIC_AUDIO_MIMES = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/aac",
]);

export const OPT_MAX_DIM = 1080;
export const OPT_INITIAL_QUALITY = 0.8;

export const MOTION_FRAME1_MAX_BYTES = 10 * 1024 * 1024;
export const MOTION_FRAME1_MAX_DIM = 3840;
export const MOTION_FRAME2_VIDEO_MAX_BYTES = 100 * 1024 * 1024;
export const FABRIC_AUDIO_MAX_BYTES = 10 * 1024 * 1024;

export const MOTION_FRAME1_SEND_WIDTH = 2048;

export const ASSETS_HOST = "assets.faltastudio.com";

export const HISTORY_PAGE_LIMIT = 200;

// Fingertips labels & phrases
export const FT_LABELS: Record<string, string> = {
  remove_bg: "removing background",
  upscale: "enhancing image",
  expand: "expanding canvas",
  vectorize: "vectorizing",
  flux_fill: "generating fill",
  eraser: "erasing selection",
};

export const FT_ERROR_PHRASES = [
  "ooh that didn't work out — give it another try, sometimes it just needs a second chance",
  "hmm something went sideways — try again or maybe use a smaller image, that usually helps",
  "oops i stumbled on that one — mina might be in high demand right now, try again in a moment",
  "that one slipped through my fingers — try reducing the image size or give it another go",
  "oh no that didn't land — it happens when things are busy, one more try should do it",
];

export const FT_PHRASES: Record<string, string[]> = {
  remove_bg: [
    "tracing edges like a careful surgeon with invisible scissors",
    "separating subject from background like oil from water",
    "finding every hair strand because precision is not optional",
    "background dissolving like morning fog clearing",
    "peeling layers apart with the gentleness of a museum restorer",
    "teaching pixels which ones belong to you and which do not",
    "every edge matters and i am treating them all with respect",
    "the background had a good run but its time is up",
    "isolating your subject like it deserves its own spotlight",
    "mapping boundaries between what stays and what disappears",
    "this is the part where your image learns to float",
    "cutting cleaner than a laser through butter",
    "background removal is an art and i take it seriously",
    "scanning every pixel border like a very focused detective",
    "almost there just polishing the edges to perfection",
    "making your subject stand alone like a main character moment",
    "separating foreground with the precision of a diamond cutter",
    "removing the noise so your subject can breathe",
    "transparency incoming like a magic trick in slow motion",
    "your subject is about to be free from its background prison",
  ],
  upscale: [
    "zooming in and adding detail that was not there before",
    "teaching each pixel to be four pixels with a purpose",
    "enhancing textures like a jeweler polishing a rough stone",
    "upscaling is just imagination with a math degree",
    "finding hidden detail in every shadow and highlight",
    "making your image sharper than a fresh espresso shot",
    "adding resolution like stacking thin layers of clarity",
    "every pixel is getting a promotion right now",
    "refining details your camera wished it could have captured",
    "sharpening edges while keeping everything natural",
    "this is the glow up your image has been waiting for",
    "enhancing with care because more detail should not mean less soul",
    "turning good into crisp and crisp into stunning",
    "reconstructing detail like an archaeologist with a magnifying glass",
    "your image is learning what high definition really means",
    "adding clarity the way sunrise adds light to a landscape",
    "pixel by pixel this image is becoming its best self",
    "resolution is a state of mind and we are upgrading it",
    "sharpening without losing the warmth because that matters",
    "making every detail count like a master printer in a darkroom",
  ],
  expand: [
    "imagining what lies beyond the edges of your frame",
    "extending the canvas like unrolling a secret map",
    "painting beyond borders because your image deserves more room",
    "growing your composition outward like a garden in spring",
    "the edges of your image are no longer the end of the story",
    "expanding the world your image lives in one side at a time",
    "inventing new scenery that feels like it was always there",
    "stretching the frame while keeping the soul intact",
    "giving your image breathing room it did not know it needed",
    "continuing the visual narrative past the original crop",
    "filling new space with context that makes sense",
    "your image had boundaries and i am gently removing them",
    "extending light and shadow into uncharted territory",
    "the canvas grows and the story grows with it",
    "adding space like an architect extending a beautiful room",
    "pushing the frame outward like opening curtains wider",
    "imagining what the photographer would have seen turning slightly",
    "seamless expansion is an art and i am in my element",
    "new pixels new possibilities same beautiful energy",
    "your composition just got a lot more room to breathe",
  ],
  vectorize: [
    "converting curves into math that stays sharp at any size",
    "tracing paths like a calligrapher with infinite patience",
    "turning pixels into vectors is like translating poetry into sculpture",
    "finding clean lines in a world of tiny squares",
    "your image is learning to scale without ever getting blurry",
    "bezier curves forming like choreography for shapes",
    "translating raster chaos into vector elegance",
    "each shape is getting its own precise mathematical identity",
    "vectorizing with the care of a cartographer drawing coastlines",
    "infinite scalability is about to be your new reality",
    "simplifying complexity while keeping every important detail",
    "paths and anchors aligning like constellations in a clear sky",
    "your image is becoming resolution independent and that is powerful",
    "tracing outlines with surgical precision and artistic intent",
    "converting bitmap to vector like water turning into crystal",
    "making your art infinitely scalable one path at a time",
    "clean vectors emerging from pixel data like a butterfly from a cocoon",
    "building shapes that will look perfect on a billboard or a business card",
    "optimizing paths so your SVG is clean and lightweight",
    "your design is about to work at every size imaginable",
  ],
  flux_fill: [
    "reading your prompt and imagining exactly what belongs here",
    "blending new content into the existing image seamlessly",
    "painting inside the lines you drew with AI precision",
    "matching light and shadow so the fill looks natural",
    "generating content that respects the mood of your image",
    "filling the masked area like a restoration artist at work",
    "your prompt is becoming pixels that belong in this scene",
    "harmonizing new elements with existing textures and tones",
    "the masked region is getting its makeover right now",
    "creating visual coherence between old and new",
    "inpainting with awareness of every surrounding detail",
    "your edit is being rendered with care and context",
    "matching perspective and lighting like it was always there",
    "the AI brush is painting what you described with intention",
    "new content forming in the negative space you selected",
    "blending edges so no one will know where the edit starts",
    "your creative direction is being translated into pixels",
    "filling the gap between what was and what you imagined",
    "generating with respect for the original composition",
    "almost done crafting something that feels naturally placed",
  ],
  eraser: [
    "identifying the unwanted object and planning its removal",
    "erasing with context awareness so the background fills in naturally",
    "removing the selection like it was never there to begin with",
    "filling the void with what should have been behind it all along",
    "content aware removal is basically digital magic",
    "reconstructing the background where the object used to live",
    "erasing cleanly because sloppy removal is not an option",
    "the object you selected is fading into visual memory",
    "painting over the gap with intelligent background synthesis",
    "matching surrounding textures to fill the erased region",
    "your image is about to look like that object never existed",
    "removing with precision and replacing with coherence",
    "the eraser is working and it is smarter than a regular one",
    "seamless removal requires understanding what goes underneath",
    "dissolving the selection and rebuilding what was hidden",
    "cleaning up your image one carefully removed element at a time",
    "the gap is being filled with contextually appropriate content",
    "erasing is the art of making something look untouched",
    "reconstructing the scene as if the object took a permanent vacation",
    "almost done your image is about to be cleaner than ever",
  ],
};
