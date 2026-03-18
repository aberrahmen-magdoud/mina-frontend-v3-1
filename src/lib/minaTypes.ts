// src/lib/minaTypes.ts
// ============================================================================
// All shared TypeScript types for the Mina app
// ============================================================================

export type HealthState = {
  ok: boolean;
  message?: string;
};

export type CreditsMeta = {
  imageCost: number;
  motionCost: number;
  expiresAt?: string | null;
};

export type CreditsState = {
  balance: number;
  meta?: CreditsMeta;
};

export type GptMeta = {
  userMessage?: string;
  imageTexts?: string[];
  input?: string;
  output?: string;
  model?: string;
};

export type GenerationRecord = {
  id: string;
  type: string;
  sessionId: string;
  passId: string;
  platform: string;
  prompt: string;
  outputUrl: string;
  createdAt: string;
  meta?: {
    tone?: string;
    platform?: string;
    minaVisionEnabled?: boolean;
    stylePresetKey?: string;
    stylePresetKeys?: string[];
    productImageUrl?: string;
    styleImageUrls?: string[];
    aspectRatio?: string;
    [key: string]: unknown;
  } | null;
};

export type FeedbackRecord = {
  id: string;
  passId: string;
  resultType: string;
  platform: string;
  prompt: string;
  comment: string;
  imageUrl?: string;
  videoUrl?: string;
  createdAt: string;
};

export type HistoryResponse = {
  ok: boolean;
  passId: string;
  credits: {
    balance: number;
    expiresAt?: string | null;
    history?: {
      id: string;
      amount: number;
      reason: string;
      createdAt: string;
    }[];
  };
  page?: {
    limit?: number;
    cursor?: string | null;
    nextCursor?: string | null;
    hasMore?: boolean;
    returned?: number;
  };
  generations: GenerationRecord[];
  feedbacks: FeedbackRecord[];
};

export type StillItem = {
  id: string;
  url: string;
  createdAt?: string;
  prompt?: string;
  aspectRatio?: string;
  draft?: any;
};

export type MotionItem = {
  id: string;
  url: string;
  createdAt?: string;
  prompt?: string;
  draft?: any;
};

export type MmaCreateResponse = {
  generation_id: string;
  status: string;
  sse_url: string;
  credits_cost?: number;
  parent_generation_id?: string | null;
};

export type MmaGenerationResponse = {
  generation_id: string;
  status: string;
  mode?: string;
  mma_vars?: any;
  outputs?: {
    nanobanana_image_url?: string;
    seedream_image_url?: string;
    kling_video_url?: string;
    image_url?: string;
    video_url?: string;
  };
  prompt?: string | null;
  error?: any;
  credits?: { balance: any; cost?: any };
};

export type MotionStyleKey =
  | "melt"
  | "drop"
  | "expand"
  | "satisfying"
  | "slow_motion"
  | "fix_camera"
  | "loop";

export type CustomStyleImage = {
  id: string;
  url: string;
  file: File;
};

export type CustomStylePreset = {
  key: string;
  label: string;
  thumbDataUrl: string;
};

export type UploadKind = "file" | "url";

export type UploadItem = {
  id: string;
  kind: UploadKind;
  url: string;
  remoteUrl?: string;
  file?: File;
  uploading?: boolean;
  error?: string;
  mediaType?: "image" | "video" | "audio";
  durationSec?: number;
};

export type UploadPanelKey = "product" | "logo" | "inspiration";

export type AspectKey = "9-16" | "3-4" | "2-3" | "1-1";

export type StillLane = "main" | "niche";

export type AspectOption = {
  key: AspectKey;
  ratio: string;
  label: string;
  subtitle: string;
  platformKey: string;
};

export type MinaAppProps = Record<string, never>;

export type StylePreset = {
  key: string;
  label: string;
  thumb: string;
  hero?: string;
};

export type AspectOptionLike = {
  key: string;
  label: string;
  subtitle: string;
  ratio?: string;
  platformKey?: string;
};

export type PanelKey = "product" | "logo" | "inspiration" | "style" | null;

export type CustomStyle = {
  id: string;
  key: string;
  label: string;
  thumbUrl: string;
  heroUrls: string[];
  allUrls?: string[];
  createdAt: string;
};

export type MinaNoticeTone = "thinking" | "error" | "info";

export type MmaStreamState = { status: string; scanLines: string[] };

// Fingertips types (used by StudioRight)
export type FtMode = null | "toolbar" | "prompt" | "mask";
export type FtModelKey = "remove_bg" | "upscale" | "expand" | "flux_fill" | "eraser" | "vectorize";

export type FingertipsResult = {
  generation_id: string;
  status: string;
  output_url?: string | null;
  output?: any;
  error?: string;
};
