// src/handlers/minaTweakFlow.ts
// Tweak (feedback) handler – still + motion.
// Extracted from MinaApp.tsx for module size.

import type {
  UploadPanelKey, UploadItem, StillItem, MotionItem, MmaStreamState,
} from "../lib/minaTypes";
import { isHttpUrl } from "../lib/minaHelpers";
import { pickMmaImageUrl, pickMmaVideoUrl, mmaWaitForFinal } from "../lib/minaApi";
import { humanizeMmaError, UI_ERROR_MESSAGES } from "../lib/mmaErrors";
import { REPLICATE_ASPECT_RATIO_MAP } from "../lib/minaConstants";

// Local type aliases (avoid React import for standalone TS files)
type SetState<T> = (value: T | ((prev: T) => T)) => void;
type MutableRef<T> = { current: T };

export interface TweakDeps {
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>;
  currentPassId: string;
  ensureSession: () => Promise<string | null>;
  sessionId: string | null;
  sessionTitle: string;
  mmaCreateAndWait: (path: string, body: any, onProgress?: (s: MmaStreamState) => void) => Promise<{ generationId: string }>;
  stopAllMmaUiNow: () => void;
  ensureOptimizedInputUrl: (url: string, kind: UploadPanelKey) => Promise<string>;
  ensureAssetsUrl: (url: string, kind: "generations" | "motions") => Promise<string>;
  fetchCredits: () => void;
  applyCreditsFromResponse: (resp?: any) => void;
  showMinaError: (err: any) => void;
  dismissMinaNotice: () => void;
  setMinaOverrideText: (t: string | null) => void;
  setMinaTone: (t: "thinking" | "error" | "info") => void;

  activeMediaKind: "still" | "motion" | null;
  currentStill: StillItem | null;
  currentMotion: MotionItem | null;
  uploads: Record<UploadPanelKey, UploadItem[]>;
  brief: string;
  stillBrief: string;
  motionTextTrimmed: string;
  motionDescription: string;
  motionReferenceImageUrl: string;
  effectiveAspectRatio: string;
  currentAspect: { platformKey: string };
  animateAspectOption: { platformKey: string };
  animateEffectiveAspectRatio: string;
  stylePresetKeys: string[];
  stylePresetKeysForApi: string[];
  primaryStyleKeyForApi: string;
  minaVisionEnabled: boolean;
  stillLane: string;
  effectiveStillResolution: string;

  setFeedbackSending: SetState<boolean>;
  setFeedbackError: SetState<string | null>;
  setFeedbackText: SetState<string>;
  setStillItems: SetState<StillItem[]>;
  setStillIndex: SetState<number>;
  setMotionItems: SetState<MotionItem[]>;
  setMotionIndex: SetState<number>;
  setActiveMediaKind: SetState<"still" | "motion" | null>;
  setLastStillPrompt: SetState<string>;

  historyDirtyRef: MutableRef<boolean>;
  creditsDirtyRef: MutableRef<boolean>;
}

export async function handleTweak(deps: TweakDeps, rawText: string) {
  const tweak = String(rawText || "").trim();
  if (!tweak) { deps.setFeedbackError(UI_ERROR_MESSAGES.tweakMissingText); deps.showMinaError(UI_ERROR_MESSAGES.tweakMissingText); return; }

  const isMotion = deps.activeMediaKind === "motion" && !!deps.currentMotion?.id;
  const parentId = isMotion ? String(deps.currentMotion?.id || "") : String(deps.currentStill?.id || "");
  if (!parentId) { deps.setFeedbackError(UI_ERROR_MESSAGES.tweakMissingMedia); deps.showMinaError(UI_ERROR_MESSAGES.tweakMissingMedia); return; }
  if (!deps.currentPassId) { deps.setFeedbackError(UI_ERROR_MESSAGES.missingPassId); deps.showMinaError(UI_ERROR_MESSAGES.missingPassId); return; }

  deps.setFeedbackSending(true);
  deps.setMinaOverrideText("got it, tweaking that now");
  deps.setFeedbackError(null);

  const onProgress = ({ status, scanLines }: MmaStreamState) => {
    const last = scanLines.slice(-1)[0] || status || "";
    if (last) deps.setMinaOverrideText(last);
  };

  try {
    const sid = await deps.ensureSession();
    const selectedMediaUrl = (isMotion ? deps.currentMotion?.url : deps.currentStill?.url) || "";
    const uiLogoUrl = isMotion ? "" : deps.uploads.logo?.[0]?.remoteUrl || deps.uploads.logo?.[0]?.url || "";
    const optimizedImageUrl = isHttpUrl(selectedMediaUrl) ? await deps.ensureOptimizedInputUrl(selectedMediaUrl as string, "product") : "";
    const optimizedLogoUrl = isHttpUrl(uiLogoUrl) ? await deps.ensureOptimizedInputUrl(uiLogoUrl, "logo") : "";

    if (!isMotion) {
      // ── Still tweak ──
      const parentAspectRaw = String(
        deps.currentStill?.aspectRatio || deps.currentStill?.draft?.settings?.aspect_ratio || deps.currentStill?.draft?.settings?.aspectRatio || ""
      ).trim().replace("/", ":");
      const preferredStillAspect = parentAspectRaw || deps.effectiveAspectRatio;
      const safeAspectRatio = REPLICATE_ASPECT_RATIO_MAP[preferredStillAspect] || preferredStillAspect || "2:3";

      const mmaBody = {
        passId: deps.currentPassId,
        assets: { image_url: optimizedImageUrl, logo_image_url: optimizedLogoUrl },
        inputs: {
          intent: "tweak", tweak, tweak_text: tweak, user_tweak: tweak,
          brief: (deps.stillBrief || deps.brief || "").trim(), prompt: (deps.stillBrief || deps.brief || "").trim(),
          platform: deps.currentAspect.platformKey, aspect_ratio: safeAspectRatio,
          stylePresetKeys: deps.stylePresetKeysForApi, stylePresetKey: deps.primaryStyleKeyForApi,
          minaVisionEnabled: deps.minaVisionEnabled, still_lane: deps.stillLane, lane: deps.stillLane,
          still_resolution: deps.effectiveStillResolution, resolution: deps.effectiveStillResolution,
        },
        settings: {},
        history: { sessionId: sid || deps.sessionId || null, sessionTitle: deps.sessionTitle || null },
        feedback: { comment: tweak, motion_feedback: tweak, still_feedback: tweak },
        prompts: {},
      };

      const { generationId } = await deps.mmaCreateAndWait(`/mma/still/${encodeURIComponent(parentId)}/tweak`, mmaBody, onProgress);
      const result = await mmaWaitForFinal(generationId, deps.apiFetch);
      if (result?.status === "error") throw new Error(String(result?.error?.message || result?.error?.code || UI_ERROR_MESSAGES.mmaTweakFailed));

      const rawUrl = pickMmaImageUrl(result);
      const url = rawUrl ? await deps.ensureAssetsUrl(rawUrl, "generations") : "";
      if (!url) throw new Error("That was too complicated, try simpler task.");
      deps.applyCreditsFromResponse(result?.credits);

      const tweakBrief = (deps.stillBrief || deps.brief || "").trim();
      const productUrl = deps.uploads.product[0]?.remoteUrl || deps.uploads.product[0]?.url || "";
      const logoUrl = deps.uploads.logo[0]?.remoteUrl || deps.uploads.logo[0]?.url || "";
      const insp = (deps.uploads.inspiration || []).map((u) => u.remoteUrl || u.url).filter((u) => isHttpUrl(u)).slice(0, 4);

      const item: StillItem = {
        id: generationId, url, createdAt: new Date().toISOString(), prompt: tweakBrief, aspectRatio: safeAspectRatio,
        draft: { mode: "still", brief: tweakBrief, assets: { product_image_url: isHttpUrl(productUrl) ? productUrl : "", logo_image_url: isHttpUrl(logoUrl) ? logoUrl : "", inspiration_image_urls: insp }, settings: { aspect_ratio: safeAspectRatio, stylePresetKeys: deps.stylePresetKeys, minaVisionEnabled: deps.minaVisionEnabled } },
      };
      deps.setStillItems((prev) => { const next = [item, ...prev]; deps.setStillIndex(0); return next; });
      deps.setActiveMediaKind("still");
      deps.setLastStillPrompt(item.prompt ?? "");
    } else {
      // ── Motion tweak ──
      const frame0 = deps.uploads.product[0]?.remoteUrl || deps.uploads.product[0]?.url || "";
      const frame1 = deps.uploads.product[1]?.remoteUrl || deps.uploads.product[1]?.url || "";
      const startFrame = isHttpUrl(frame0) ? frame0 : (deps.motionReferenceImageUrl || "");
      const endFrame = isHttpUrl(frame1) ? frame1 : "";

      const mmaBody = {
        passId: deps.currentPassId,
        assets: { video_url: isHttpUrl(selectedMediaUrl) ? selectedMediaUrl as string : "" },
        inputs: {
          intent: "tweak", tweak, tweak_text: tweak, user_tweak: tweak,
          motionDescription: (deps.motionTextTrimmed || deps.motionDescription || deps.brief || "").trim(),
          prompt: (deps.motionTextTrimmed || deps.motionDescription || deps.brief || "").trim(),
          platform: deps.animateAspectOption.platformKey, aspect_ratio: deps.animateEffectiveAspectRatio,
          stylePresetKeys: deps.stylePresetKeysForApi, stylePresetKey: deps.primaryStyleKeyForApi,
          minaVisionEnabled: deps.minaVisionEnabled,
        },
        settings: {},
        history: { sessionId: sid || deps.sessionId || null, sessionTitle: deps.sessionTitle || null },
        feedback: { comment: tweak, motion_feedback: tweak },
        prompts: {},
      };

      const { generationId } = await deps.mmaCreateAndWait(`/mma/video/${encodeURIComponent(parentId)}/tweak`, mmaBody, onProgress);
      const result = await mmaWaitForFinal(generationId, deps.apiFetch);
      if (result?.status === "error") throw new Error(String(result?.error?.message || result?.error?.code || UI_ERROR_MESSAGES.mmaTweakFailed));

      const rawUrlV = pickMmaVideoUrl(result);
      const urlV = rawUrlV ? await deps.ensureAssetsUrl(rawUrlV, "motions") : "";
      if (!urlV) throw new Error("That was too complicated, try simpler task.");
      deps.applyCreditsFromResponse(result?.credits);

      const tweakBrief = (deps.motionTextTrimmed || deps.motionDescription || deps.brief || "").trim();
      const insp = (deps.uploads.inspiration || []).map((u) => u.remoteUrl || u.url).filter((u) => isHttpUrl(u)).slice(0, 4);

      const item: MotionItem = {
        id: generationId, url: urlV, createdAt: new Date().toISOString(), prompt: tweakBrief,
        draft: { mode: "motion", brief: tweakBrief, assets: { start_image_url: startFrame, end_image_url: endFrame || "", inspiration_image_urls: insp }, settings: { aspect_ratio: deps.animateEffectiveAspectRatio, stylePresetKeys: deps.stylePresetKeys, minaVisionEnabled: deps.minaVisionEnabled } },
      };
      deps.setMotionItems((prev) => { const next = [item, ...prev]; deps.setMotionIndex(0); return next; });
      deps.setActiveMediaKind("motion");
    }

    deps.historyDirtyRef.current = true;
    deps.creditsDirtyRef.current = true;
    deps.fetchCredits();
    deps.setFeedbackText("");
  } catch (err: any) {
    deps.stopAllMmaUiNow();
    deps.setFeedbackError(humanizeMmaError(err));
  } finally {
    deps.setMinaOverrideText(null);
    deps.setFeedbackSending(false);
  }
}
