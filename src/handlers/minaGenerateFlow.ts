// src/handlers/minaGenerateFlow.ts
// Still + Motion generation handlers, motion suggest / type-for-me.
// Extracted from MinaApp.tsx for module size.

import type {
  UploadPanelKey, UploadItem, StillItem, MotionItem,
  MotionStyleKey, MmaStreamState,
} from "../lib/minaTypes";

import {
  isHttpUrl, stripSignedQuery, swapAspectRatio,
  normalizeNonExpiringUrl, roundUpTo5,
} from "../lib/minaHelpers";
import { isVideoUrl, isAudioUrl, isAssetsUrl, isMinaGeneratedAssetsUrl, inferMediaTypeFromUrl } from "../lib/mediaHelpers";
import { pickMmaImageUrl, pickMmaVideoUrl, mmaWaitForFinal } from "../lib/minaApi";
import {
  extractMmaErrorTextFromResult, humanizeMmaError, isTimeoutLikeStatus, UI_ERROR_MESSAGES,
} from "../lib/mmaErrors";
import { REPLICATE_ASPECT_RATIO_MAP, HISTORY_PAGE_LIMIT } from "../lib/minaConstants";

// Local type aliases (avoid React import for standalone TS files)
type SetState<T> = (value: T | ((prev: T) => T)) => void;
type MutableRef<T> = { current: T };

// ────────────────────────────────────────────────────────────────────
export interface GenerateDeps {
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>;
  currentPassId: string;

  // Session
  ensureSession: () => Promise<string | null>;
  sessionId: string | null;
  sessionTitle: string;

  // MMA SSE
  mmaCreateAndWait: (path: string, body: any, onProgress?: (s: MmaStreamState) => void) => Promise<{ generationId: string }>;
  stopAllMmaUiNow: () => void;

  // CDN
  ensureOptimizedInputUrl: (url: string, kind: UploadPanelKey) => Promise<string>;
  ensureAssetsUrl: (url: string, kind: "generations" | "motions") => Promise<string>;

  // Credits
  fetchCredits: () => void;
  applyCreditsFromResponse: (resp?: any) => void;

  // Mina notice
  showMinaError: (err: any) => void;
  showMinaInfo: (msg: string) => void;
  dismissMinaNotice: () => void;
  setMinaTone: (t: "thinking" | "error" | "info") => void;
  setMinaOverrideText: (t: string | null) => void;

  // Still state
  stillBrief: string;
  effectiveAspectRatio: string;
  currentAspect: { platformKey: string };
  tone: string;
  stylePresetKeys: string[];
  stylePresetKeysForApi: string[];
  primaryStyleKeyForApi: string;
  computedStylePresets: any[];
  customStyles: any[];
  minaVisionEnabled: boolean;
  stillLane: string;
  effectiveStillResolution: string;
  uploads: Record<UploadPanelKey, UploadItem[]>;

  setStillGenerating: SetState<boolean>;
  setStillError: SetState<string | null>;
  setStillItems: SetState<StillItem[]>;
  setStillIndex: SetState<number>;
  setActiveMediaKind: SetState<"still" | "motion" | null>;
  setLastStillPrompt: SetState<string>;

  // Motion state
  motionDescription: string;
  motionFinalPrompt: string;
  motionTextTrimmed: string;
  motionStyleKeys: MotionStyleKey[];
  motionDurationSec: 5 | 10 | 15;
  effectiveMotionAudioEnabled: boolean;
  motionReferenceImageUrl: string;
  hasFrame2Video: boolean;
  hasFrame2Audio: boolean;
  videoSec: number;
  audioSec: number;
  animateAspectOption: { platformKey: string; ratio: string };
  animateEffectiveAspectRatio: string;
  videoLane: "short" | "story";

  setMotionGenerating: SetState<boolean>;
  setMotionError: SetState<string | null>;
  setMotionItems: SetState<MotionItem[]>;
  setMotionIndex: SetState<number>;
  setMotionFinalPrompt: SetState<string>;
  setMotionDescription: SetState<string>;
  setMotionSuggesting: SetState<boolean>;
  setMotionSuggestTyping: SetState<boolean>;
  setBrief: SetState<string>;
  setShowDescribeMore: SetState<boolean>;
  describeMoreTimeoutRef: MutableRef<number | null>;

  brief: string;

  historyDirtyRef: MutableRef<boolean>;
  creditsDirtyRef: MutableRef<boolean>;
}

// ────────────────────────────────────────────────────────────────────
// Build MMA motion body
// ────────────────────────────────────────────────────────────────────
export function buildMmaMotionBody(opts: {
  brief: string;
  uploadsProduct: Array<{ remoteUrl?: string; url: string; mediaType?: string; durationSec?: number }>;
  motionDurationSec: 5 | 10 | 15;
  motionAudioEnabled: boolean;
  motionStyleKeys?: string[];
}) {
  const frame1 = opts.uploadsProduct?.[0];
  const frame2 = opts.uploadsProduct?.[1];
  const startUrl = String(frame1?.remoteUrl || "").trim();
  if (!startUrl) throw new Error("Missing frame 1 image");

  const frame2Url = String(frame2?.remoteUrl || "").trim();
  const frame2Kind = (frame2?.mediaType || "image") as string;
  const frame2DurationSec = Number(frame2?.durationSec || 0) || 0;

  const inputs: any = {
    motion_user_brief: opts.brief,
    motion_duration_sec: opts.motionDurationSec,
    generate_audio: opts.motionAudioEnabled !== false,
    frame2_kind: frame2 ? frame2Kind : null,
    frame2_url: frame2 ? frame2Url : "",
    frame2_duration_sec: frame2 ? frame2DurationSec : 0,
    motion_style_keys: Array.isArray(opts.motionStyleKeys) ? opts.motionStyleKeys : [],
  };

  const assets: any = { kling_start_image_url: startUrl };
  if (frame2 && frame2Kind === "image") assets.kling_end_image_url = frame2Url;
  return { mode: "video", inputs, assets };
}

export function applyMotionControlRules(rawPrompt: string, hasReferenceVideo: boolean) {
  const prompt = String(rawPrompt || "").trim();
  if (!hasReferenceVideo) return prompt;
  const rule = "Follow the reference video motion and timing. Preserve framing, subject, and lighting. No new objects.";
  return prompt ? `${prompt}\n\n${rule}` : rule;
}

// ────────────────────────────────────────────────────────────────────
// Collect style hero + inspiration URLs
// ────────────────────────────────────────────────────────────────────
function collectInspirationUrls(deps: GenerateDeps): string[] {
  const styleHeroUrls = (deps.stylePresetKeys || []).flatMap((k) => {
    const preset = (deps.computedStylePresets as any[])?.find((p) => String(p.key) === String(k));
    if (preset) {
      const hero = preset?.hero;
      if (Array.isArray(hero)) return hero.filter((u: any) => typeof u === "string" && isHttpUrl(u));
      if (typeof hero === "string" && hero.trim() && isHttpUrl(hero.trim())) return [hero.trim()];
      if (typeof preset?.thumb === "string" && preset.thumb.trim() && isHttpUrl(preset.thumb.trim())) return [preset.thumb.trim()];
    }
    const cs = (deps.customStyles || []).find((s: any) => String(s.key) === String(k));
    if (cs) {
      const arr = Array.isArray((cs as any).heroUrls) ? (cs as any).heroUrls : [];
      const fallback = typeof cs.thumbUrl === "string" ? [cs.thumbUrl] : [];
      return [...arr, ...fallback].filter((u: any) => typeof u === "string" && isHttpUrl(u)).slice(0, 3);
    }
    return [];
  }).filter((u) => isHttpUrl(u));

  const userInspirationUrls = (deps.uploads.inspiration || []).map((u) => u.remoteUrl || u.url).filter((u) => isHttpUrl(u));
  return Array.from(new Set([...styleHeroUrls, ...userInspirationUrls])).slice(0, 8);
}

// ────────────────────────────────────────────────────────────────────
// handleGenerateStill
// ────────────────────────────────────────────────────────────────────
export async function handleGenerateStill(deps: GenerateDeps) {
  const trimmed = deps.stillBrief.trim();
  if (trimmed.length < 20) return;
  if (!deps.currentPassId) { deps.setStillError(UI_ERROR_MESSAGES.missingPassIdMega); deps.showMinaError(UI_ERROR_MESSAGES.missingPassIdMega); return; }

  deps.setStillGenerating(true);
  deps.setStillError(null);
  deps.dismissMinaNotice();
  deps.setMinaTone("thinking");
  deps.setMinaOverrideText(null);

  try {
    const safeAspectRatio = REPLICATE_ASPECT_RATIO_MAP[deps.effectiveAspectRatio] || deps.effectiveAspectRatio || "2:3";
    const sid = await deps.ensureSession();

    const productIR = deps.uploads.product[0];
    const logoIR = deps.uploads.logo[0];
    const productUrl = isHttpUrl(productIR?.remoteUrl || productIR?.url || "") ? await deps.ensureOptimizedInputUrl(productIR?.remoteUrl || productIR?.url || "", "product") : "";
    const logoUrl = isHttpUrl(logoIR?.remoteUrl || logoIR?.url || "") ? await deps.ensureOptimizedInputUrl(logoIR?.remoteUrl || logoIR?.url || "", "logo") : "";

    const inspirationUrls = collectInspirationUrls(deps);
    const inspirationUrlsOptimized = await Promise.all(inspirationUrls.map((u) => isHttpUrl(u) ? deps.ensureOptimizedInputUrl(u, "inspiration") : Promise.resolve(u)));

    const mmaBody = {
      passId: deps.currentPassId,
      assets: { product_image_url: isHttpUrl(productUrl) ? productUrl : "", logo_image_url: isHttpUrl(logoUrl) ? logoUrl : "", inspiration_image_urls: inspirationUrlsOptimized },
      inputs: {
        brief: trimmed, prompt: trimmed, tone: deps.tone,
        platform: deps.currentAspect.platformKey, aspect_ratio: safeAspectRatio,
        stylePresetKeys: deps.stylePresetKeysForApi, stylePresetKey: deps.primaryStyleKeyForApi,
        minaVisionEnabled: deps.minaVisionEnabled, still_lane: deps.stillLane, lane: deps.stillLane,
        still_resolution: deps.effectiveStillResolution, resolution: deps.effectiveStillResolution,
      },
      settings: {},
      history: { sessionId: sid || deps.sessionId || null, sessionTitle: deps.sessionTitle || null },
      feedback: { still_feedback: trimmed },
      prompts: {},
    };

    const { generationId } = await deps.mmaCreateAndWait("/mma/still/create", mmaBody, ({ status, scanLines }) => {
      const last = scanLines.slice(-1)[0] || status || "";
      if (last) deps.setMinaOverrideText(last);
    });

    const result = await mmaWaitForFinal(generationId, deps.apiFetch, undefined, (snap: any) => {
      if (extractMmaErrorTextFromResult(snap)) deps.showMinaError(snap);
    });

    const status = String(result?.status || "").toLowerCase().trim();
    if (extractMmaErrorTextFromResult(result)) throw result;
    if (isTimeoutLikeStatus(status) || status === "queued" || status === "prompting" || status === "processing") {
      deps.showMinaInfo("Still generating in the background – open Profile and refresh in a minute.");
      deps.stopAllMmaUiNow(); return;
    }

    const rawUrl = pickMmaImageUrl(result);
    const url = rawUrl ? await deps.ensureAssetsUrl(rawUrl, "generations") : "";
    if (!url) {
      if (["prompting", "generating", "queued", "processing"].includes(status)) {
        deps.showMinaInfo("Still generating in the background – open Profile and refresh in a minute.");
        deps.stopAllMmaUiNow(); return;
      }
      throw new Error("Mina is on high demand right now — please try again in a moment.");
    }

    deps.historyDirtyRef.current = true;
    deps.creditsDirtyRef.current = true;
    deps.fetchCredits();
    deps.applyCreditsFromResponse(result?.credits);

    const item: StillItem = {
      id: generationId, url, createdAt: new Date().toISOString(), prompt: trimmed,
      aspectRatio: deps.effectiveAspectRatio,
      draft: {
        mode: "still", brief: trimmed, used_prompt: String(result?.prompt || "").trim() || undefined,
        assets: { product_image_url: isHttpUrl(productUrl) ? productUrl : "", logo_image_url: isHttpUrl(logoUrl) ? logoUrl : "", inspiration_image_urls: inspirationUrls },
        settings: { aspect_ratio: safeAspectRatio, stylePresetKeys: deps.stylePresetKeys, minaVisionEnabled: deps.minaVisionEnabled },
      },
    };

    deps.setStillItems((prev) => { const next = [item, ...prev]; deps.setStillIndex(0); return next; });
    deps.setActiveMediaKind("still");
    deps.setLastStillPrompt(item.prompt ?? "");
  } catch (err: any) {
    deps.stopAllMmaUiNow();
    const msg = humanizeMmaError(err, "create");
    deps.setStillError(msg);
    deps.showMinaError(msg);
  } finally {
    deps.setMinaOverrideText(null);
    deps.setStillGenerating(false);
  }
}

// ────────────────────────────────────────────────────────────────────
// Motion suggest helpers
// ────────────────────────────────────────────────────────────────────
export function chunkSuggestion(text: string) {
  const words = text.split(/\s+/).map((w) => w.trim()).filter(Boolean);
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += 4) lines.push(words.slice(i, i + 4).join(" "));
  return lines;
}

export async function applyMotionSuggestionText(
  text: string,
  deps: Pick<GenerateDeps, "setMotionDescription" | "setBrief" | "setMotionSuggestTyping" | "setShowDescribeMore" | "describeMoreTimeoutRef">,
) {
  if (!text) return;
  if (deps.describeMoreTimeoutRef.current !== null) { window.clearTimeout(deps.describeMoreTimeoutRef.current); deps.describeMoreTimeoutRef.current = null; }
  deps.setShowDescribeMore(false);
  deps.setMotionSuggestTyping(true);

  const lines = chunkSuggestion(text);
  let accumulated = "";
  for (const line of lines) {
    accumulated = accumulated ? `${accumulated}\n${line}` : line;
    deps.setMotionDescription(accumulated);
    deps.setBrief(accumulated);
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  deps.setMotionSuggestTyping(false);
}

// ────────────────────────────────────────────────────────────────────
// onTypeForMe
// ────────────────────────────────────────────────────────────────────
export async function handleTypeForMe(deps: GenerateDeps) {
  if (deps.hasFrame2Video || deps.hasFrame2Audio) return;
  if (!deps.currentPassId) return;

  const frame0 = deps.uploads.product?.[0]?.remoteUrl || deps.uploads.product?.[0]?.url || "";
  const frame1 = deps.uploads.product?.[1]?.remoteUrl || deps.uploads.product?.[1]?.url || "";
  const startFrame = isHttpUrl(frame0) ? frame0 : (deps.motionReferenceImageUrl || "");
  if (!startFrame) return;

  deps.setMotionSuggesting(true);
  try {
    const sid = await deps.ensureSession();
    const typedBrief = (deps.brief || deps.motionDescription || "").trim();
    const endFrame = isHttpUrl(frame1) ? frame1 : "";

    const mmaBody = {
      passId: deps.currentPassId,
      assets: { start_image_url: startFrame, end_image_url: endFrame || "", kling_image_urls: endFrame ? [startFrame, endFrame] : [startFrame] },
      inputs: {
        intent: "type_for_me", type_for_me: true, suggest_only: true,
        motion_user_brief: typedBrief, motionDescription: typedBrief, motion_description: typedBrief,
        selected_movement_style: (deps.motionStyleKeys?.[0] || "").trim(),
        platform: deps.animateAspectOption.platformKey, aspect_ratio: deps.animateEffectiveAspectRatio,
        stylePresetKeys: deps.stylePresetKeysForApi, stylePresetKey: deps.primaryStyleKeyForApi,
        minaVisionEnabled: deps.minaVisionEnabled,
      },
      settings: {},
      history: { sessionId: sid || deps.sessionId || null, sessionTitle: deps.sessionTitle || null },
      feedback: { motion_feedback: typedBrief, still_feedback: typedBrief },
      prompts: {},
    };

    const { generationId } = await deps.mmaCreateAndWait("/mma/video/animate", mmaBody, ({ status, scanLines }) => {
      const last = scanLines.slice(-1)[0] || status || "";
      if (last) deps.setMinaOverrideText(last);
    });

    const final = await mmaWaitForFinal(generationId, deps.apiFetch);
    const suggested = String(final?.mma_vars?.prompts?.suggested_prompt || final?.mma_vars?.prompts?.sugg_prompt || final?.mma_vars?.suggested_prompt || final?.prompt || (final as any)?.suggestion || "").trim();
    if (!suggested) throw new Error("MMA returned no suggestion.");
    deps.setMotionFinalPrompt(suggested);
    await applyMotionSuggestionText(suggested, deps);
  } catch (e) {
    console.error("type-for-me failed:", e);
  } finally {
    deps.setMinaOverrideText(null);
    deps.setMotionSuggesting(false);
  }
}

// ────────────────────────────────────────────────────────────────────
// handleGenerateMotion
// ────────────────────────────────────────────────────────────────────
export async function handleGenerateMotion(deps: GenerateDeps) {
  if (!deps.motionReferenceImageUrl) return;
  if (!deps.motionTextTrimmed && !deps.hasFrame2Video && !deps.hasFrame2Audio) return;
  if (!deps.currentPassId) { deps.setMotionError(UI_ERROR_MESSAGES.missingPassIdMega); deps.showMinaError(UI_ERROR_MESSAGES.missingPassIdMega); return; }

  deps.setMotionGenerating(true);
  deps.setMotionError(null);
  deps.dismissMinaNotice();
  deps.setMinaTone("thinking");
  deps.setMinaOverrideText(null);

  try {
    const sid = await deps.ensureSession();
    const rawUserPrompt = (deps.motionFinalPrompt || deps.motionTextTrimmed).trim();
    const usedMotionPrompt = applyMotionControlRules(rawUserPrompt, deps.hasFrame2Video);
    const inspirationUrls = collectInspirationUrls(deps);
    const wantAudio = deps.effectiveMotionAudioEnabled === true;

    const klingBaseBody = buildMmaMotionBody({
      brief: usedMotionPrompt,
      uploadsProduct: deps.uploads.product,
      motionDurationSec: deps.motionDurationSec,
      motionAudioEnabled: deps.effectiveMotionAudioEnabled,
      motionStyleKeys: deps.motionStyleKeys,
    });

    const startFrameRaw = String((klingBaseBody.assets as any)?.kling_start_image_url || "").trim();
    const endFrame = String((klingBaseBody.assets as any)?.kling_end_image_url || "").trim();
    const endIsMinaGenerated = isMinaGeneratedAssetsUrl(endFrame);

    const startFrameForModel = deps.hasFrame2Video ? await deps.ensureOptimizedInputUrl(startFrameRaw, "product") : startFrameRaw;
    const endFrameForModel = endFrame && !endIsMinaGenerated ? await deps.ensureOptimizedInputUrl(endFrame, "product") : endFrame;

    const baseBody = {
      passId: deps.currentPassId,
      assets: {
        start_image_url: startFrameForModel, end_image_url: endFrameForModel || "",
        kling_image_urls: endFrameForModel ? [startFrameForModel, endFrameForModel] : [startFrameForModel],
        inspiration_image_urls: inspirationUrls,
      },
      inputs: {
        motionDescription: usedMotionPrompt, prompt: usedMotionPrompt, tone: deps.tone,
        platform: deps.animateAspectOption.platformKey, aspect_ratio: deps.animateEffectiveAspectRatio,
        duration: deps.motionDurationSec, video_lane: deps.videoLane,
        generate_audio: wantAudio, generateAudio: wantAudio, audio_enabled: wantAudio,
        audioEnabled: wantAudio, with_audio: wantAudio, withAudio: wantAudio,
        mute: !wantAudio, muted: !wantAudio,
        stylePresetKeys: deps.stylePresetKeysForApi, stylePresetKey: deps.primaryStyleKeyForApi,
        minaVisionEnabled: deps.minaVisionEnabled,
      },
      settings: {},
      history: { sessionId: sid || deps.sessionId || null, sessionTitle: deps.sessionTitle || null },
      feedback: {}, prompts: {},
    };

    // Frame2 overrides
    const __f2 = deps.uploads.product?.[1];
    const __f2Url = String(__f2?.remoteUrl || __f2?.url || "").trim();
    const frame2Http = isHttpUrl(__f2Url) ? __f2Url : "";

    const mmaBody = (() => {
      if (deps.hasFrame2Video && frame2Http) {
        return {
          ...baseBody, mode: "video",
          assets: { ...(baseBody as any).assets, image: startFrameForModel, video: frame2Http },
          inputs: {
            ...(baseBody as any).inputs,
            provider_model: "kwaivgi/kling-v2.6-motion-control", model: "kwaivgi/kling-v2.6-motion-control",
            replicate_model: "kwaivgi/kling-v2.6-motion-control",
            frame2_kind: "video", frame2_url: frame2Http, frame2_duration_sec: deps.videoSec || 0,
            image: startFrameForModel, video: frame2Http, mode: "pro",
            character_orientation: "video",
            duration: Math.min(30, Math.max(3, roundUpTo5(deps.videoSec || 5))),
            generate_audio: deps.effectiveMotionAudioEnabled,
            keep_original_sound: deps.effectiveMotionAudioEnabled,
            motion_control: true, reference_video_url: frame2Http, prompt: usedMotionPrompt || "",
          },
        };
      }
      if (deps.hasFrame2Audio && frame2Http) {
        return {
          ...baseBody, mode: "video",
          assets: { ...(baseBody as any).assets, audio: frame2Http, audio_url: frame2Http, frame2_audio_url: frame2Http },
          inputs: {
            ...(baseBody as any).inputs,
            frame2_kind: "audio", frame2_url: frame2Http, frame2_duration_sec: deps.audioSec || null,
            audio: frame2Http, generate_audio: true,
            duration: Math.min(60, Math.max(3, deps.audioSec || deps.motionDurationSec)),
          },
        };
      }
      return baseBody;
    })();

    const { generationId } = await deps.mmaCreateAndWait("/mma/video/animate", mmaBody, ({ status, scanLines }) => {
      const last = scanLines.slice(-1)[0] || status || "";
      if (last) deps.setMinaOverrideText(last);
    });

    const result = await mmaWaitForFinal(generationId, deps.apiFetch, undefined, (snap: any) => {
      if (extractMmaErrorTextFromResult(snap)) deps.showMinaError(snap);
    });

    const status = String(result?.status || "").toLowerCase().trim();
    if (extractMmaErrorTextFromResult(result)) throw result;
    if (isTimeoutLikeStatus(status) || status === "queued" || status === "processing") {
      deps.showMinaInfo("Still generating in the background – open Profile and refresh in a minute.");
      deps.stopAllMmaUiNow(); return;
    }

    const rawUrl = pickMmaVideoUrl(result);
    const url = rawUrl ? await deps.ensureAssetsUrl(rawUrl, "motions") : "";
    if (!url) throw new Error("That was too complicated, try simpler task.");

    deps.historyDirtyRef.current = true;
    deps.creditsDirtyRef.current = true;
    deps.fetchCredits();
    deps.applyCreditsFromResponse(result?.credits);

    const item: MotionItem = {
      id: generationId, url, createdAt: new Date().toISOString(), prompt: usedMotionPrompt,
      draft: {
        mode: "motion", brief: usedMotionPrompt,
        used_prompt: String(result?.prompt || "").trim() || undefined,
        assets: { start_image_url: startFrameForModel, end_image_url: endFrame || "", inspiration_image_urls: inspirationUrls },
        settings: { aspect_ratio: deps.animateEffectiveAspectRatio, stylePresetKeys: deps.stylePresetKeys, minaVisionEnabled: deps.minaVisionEnabled },
      },
    };

    deps.setMotionItems((prev) => { const next = [item, ...prev]; deps.setMotionIndex(0); return next; });
    deps.setActiveMediaKind("motion");
  } catch (err: any) {
    deps.stopAllMmaUiNow();
    const msg = humanizeMmaError(err, "animate");
    deps.setMotionError(msg);
    deps.showMinaError(msg);
  } finally {
    deps.setMinaOverrideText(null);
    deps.setMotionGenerating(false);
  }
}
