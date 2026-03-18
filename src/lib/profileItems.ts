// =============================================================
// Pure function: computeProfileItems
// Giant useMemo items computation extracted from Profile.tsx
// =============================================================

import type { Row } from "./profileHelpers";
import {
  safeString,
  pick,
  tryParseJson,
  isImageUrl,
  normalizeMediaUrl,
  canonicalAssetUrl,
  normalizeAspectRatio,
  findLikedGenerationId,
  extractInputsForDisplay,
  ASPECT_OPTIONS,
} from "./profileHelpers";

type RecreateDraft = {
  mode: "still" | "motion";
  brief: string;
  settings: {
    aspect_ratio?: string;
    minaVisionEnabled?: boolean;
    stylePresetKeys?: string[];
    motion_duration_sec?: 5 | 10;
    generate_audio?: boolean;
  };
  assets: {
    productImageUrl?: string;
    logoImageUrl?: string;
    styleImageUrls?: string[];
    kling_start_image_url?: string;
    kling_end_image_url?: string;
    frame2_audio_url?: string;
    frame2_video_url?: string;
  };
};

export type ProfileItem = {
  id: string;
  createdAt: string;
  prompt: string;
  url: string;
  liked: boolean;
  isMotion: boolean;
  aspectRatio: string;
  source: "generation";
  sourceRank: number;
  inputs: ReturnType<typeof extractInputsForDisplay>;
  canRecreate: boolean;
  draft: RecreateDraft | null;
  matchasCost: number;
  sizeClass: string;
};

export function computeProfileItems(opts: {
  generations: Row[];
  feedbacks: Row[];
  likedUrlSet: Set<string>;
  dateRange: "all" | "today" | "7d" | "30d";
  motion: "all" | "still" | "motion";
  activeAspectFilter: { key: string; ratio: string; label: string } | null;
  removedIds: Record<string, boolean>;
  ghostIds: Record<string, boolean>;
  deletingIds: Record<string, boolean>;
  confirmDeleteIds: Record<string, boolean>;
  dragSelectedIds: Set<string>;
  deleteErrors: Record<string, string>;
  onRecreate: ((draft: RecreateDraft) => void) | undefined;
  sizeClassForIndex: (idx: number) => string;
}): { items: ProfileItem[]; activeCount: number; totalMatchas: number } {
  const {
    generations,
    feedbacks,
    likedUrlSet,
    dateRange,
    motion,
    activeAspectFilter,
    removedIds,
    onRecreate,
    sizeClassForIndex,
  } = opts;

  // liked generation ids from feedback events
  const likedGenIdSet = new Set<string>();
  for (const f of feedbacks) {
    const gid = findLikedGenerationId(f);
    if (gid) likedGenIdSet.add(gid);
  }

  const baseRows: Array<{ row: Row; source: "generation" }> = generations.map((g) => ({
    row: g,
    source: "generation" as const,
  }));

  let base = baseRows
    .map(({ row: g, source }, idx) => {
      const payloadRaw: any = (g as any)?.mg_payload ?? (g as any)?.payload ?? null;
      const metaRaw: any = (g as any)?.mg_meta ?? (g as any)?.meta ?? null;
      const payload: any = tryParseJson<any>(payloadRaw) ?? payloadRaw ?? null;
      const meta: any = tryParseJson<any>(metaRaw) ?? metaRaw ?? null;

      const generationId = safeString(pick(g, ["mg_generation_id", "generation_id", "generationId", "id"]), "").trim();
      const id = generationId || safeString(pick(g, ["mg_id", "id"]), `row_${idx}`).trim();

      if (removedIds[id]) return null;

      const createdAt = safeString(pick(g, ["createdAt", "created_at", "mg_created_at", "ts", "timestamp"]), "").trim();

      const outUrl = pick(g, ["mg_output_url", "outputUrl", "output_url"], "").trim();
      const imgUrl = pick(g, ["mg_image_url", "imageUrl", "image_url"], "").trim();
      const vidUrl = pick(g, ["mg_video_url", "videoUrl", "video_url"], "").trim();

      const aspectRaw =
        pick(g, ["mg_aspect_ratio", "aspect_ratio", "aspectRatio"], "") ||
        pick(meta, ["aspectRatio", "aspect_ratio"], "") ||
        pick(payload, ["aspect_ratio", "aspectRatio"], "") ||
        pick(payload?.inputs, ["aspect_ratio", "aspectRatio"], "");

      const contentType = pick(g, ["mg_content_type", "contentType"], "").toLowerCase();
      const kindHint = String(pick(g, ["mg_result_type", "resultType", "mg_type", "type"], "")).toLowerCase();

      const looksVideoMeta = contentType.includes("video") || kindHint.includes("motion") || kindHint.includes("video");
      const looksImage = isImageUrl(outUrl) || isImageUrl(imgUrl);

      const videoUrl = vidUrl || (isImageUrl(outUrl) ? "" : looksVideoMeta && !looksImage ? outUrl : "");
      const imageUrl = imgUrl || (!videoUrl ? outUrl : "");
      const url = (videoUrl || imageUrl || outUrl).trim();
      const isMotion = Boolean(videoUrl);

      const inputs = extractInputsForDisplay(g, isMotion || looksVideoMeta);

      const aspectRatio =
        inputs.aspectRatio ||
        normalizeAspectRatio(aspectRaw) ||
        normalizeAspectRatio(
          typeof payload?.aspect_ratio === "string"
            ? payload.aspect_ratio
            : typeof payload?.aspectRatio === "string"
            ? payload.aspectRatio
            : "",
        );

      const liked =
        (generationId && likedGenIdSet.has(generationId)) ||
        (url ? likedUrlSet.has(canonicalAssetUrl(url)) : false);

      const prompt = (inputs.brief || "").trim();

      // Detect fingertips generations
      const mmaMode = String(pick(g, ["mg_mma_mode"], "")).toLowerCase();
      const isFingertips = mmaMode === "fingertips";

      const hasRefMedia =
        !!inputs.referenceAudioUrl ||
        !!inputs.referenceVideoUrl ||
        !!inputs.startImageUrl ||
        !!inputs.endImageUrl ||
        (Array.isArray(inputs.klingFrameUrls) && inputs.klingFrameUrls.length > 0);

      const canRecreate = source === "generation" && !!onRecreate && (!!prompt || hasRefMedia || isFingertips);

      const draft: RecreateDraft | null = canRecreate
        ? {
            mode: isMotion ? "motion" : "still",
            brief: prompt,
            settings: {
              aspect_ratio: inputs.aspectRatio || undefined,
              minaVisionEnabled: inputs.minaVisionEnabled,
              stylePresetKeys: inputs.stylePresetKeys.length ? inputs.stylePresetKeys : undefined,
              ...(isMotion && inputs.motionDurationSec
                ? { motion_duration_sec: inputs.motionDurationSec }
                : {}),
              ...(isMotion
                ? {
                    generate_audio: inputs.endImageUrl
                      ? false
                      : typeof inputs.generateAudio === "boolean"
                      ? inputs.generateAudio
                      : undefined,
                  }
                : {}),
            },
            assets: {
              productImageUrl: inputs.productImageUrl || (isFingertips && url ? url : undefined),
              logoImageUrl: inputs.logoImageUrl || undefined,
              styleImageUrls: inputs.styleImageUrls.length ? inputs.styleImageUrls : undefined,
              ...(isMotion && inputs.startImageUrl ? { kling_start_image_url: inputs.startImageUrl } : {}),
              ...(isMotion && inputs.endImageUrl ? { kling_end_image_url: inputs.endImageUrl } : {}),
              ...(isMotion && inputs.referenceAudioUrl ? { frame2_audio_url: inputs.referenceAudioUrl } : {}),
              ...(isMotion && inputs.referenceVideoUrl ? { frame2_video_url: inputs.referenceVideoUrl } : {}),
            },
          }
        : null;

      // Extract cost (matchas charged) from generation record
      const matchasCost =
        Number(
          pick(g, ["mg_credits_cost", "credits_cost", "matchas_charged", "cost"], "") ||
          pick(meta, ["credits_cost", "matchas_charged", "cost"], "") ||
          pick(payload, ["credits_cost", "matchas_charged"], ""),
        ) || 0;

      return {
        id,
        createdAt,
        prompt,
        url,
        liked,
        isMotion,
        aspectRatio,
        source,
        sourceRank: source === "generation" ? 2 : 1,
        inputs,
        canRecreate,
        draft,
        matchasCost,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x && x.url));

  base.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  // Merge duplicates by canonical URL
  const merged = new Map<string, (typeof base)[number]>();
  for (const it of base) {
    const key = canonicalAssetUrl(it.url);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, it);
      continue;
    }

    const preferred = existing.sourceRank >= it.sourceRank ? existing : it;
    const other = preferred === existing ? it : existing;

    const next = { ...preferred };
    if (other.liked && !next.liked) next.liked = true;
    if (!next.aspectRatio && other.aspectRatio) next.aspectRatio = other.aspectRatio;

    merged.set(key, next);
  }

  const deduped = Array.from(merged.values());

  // ✅ ACTUAL FILTERING (not just dimming)
  const now = Date.now();
  const dateThreshold =
    dateRange === "today"
      ? now - 86400000
      : dateRange === "7d"
      ? now - 7 * 86400000
      : dateRange === "30d"
      ? now - 30 * 86400000
      : 0;

  const filtered = deduped.filter((it) => {
    const matchesMotion = motion === "all" ? true : motion === "motion" ? it.isMotion : !it.isMotion;
    const matchesAspect = !activeAspectFilter || it.aspectRatio === activeAspectFilter.ratio;
    const matchesDate = dateRange === "all" || (it.createdAt && new Date(it.createdAt).getTime() >= dateThreshold);
    return matchesMotion && matchesAspect && matchesDate;
  });

  // Compute total matchas for the filtered set
  const totalMatchas = filtered.reduce((sum, it) => sum + (it.matchasCost || 0), 0);

  const out = filtered.map((it, idx) => ({
    ...it,
    sizeClass: sizeClassForIndex(idx),
  })) as ProfileItem[];

  return { items: out, activeCount: out.length, totalMatchas };
}
