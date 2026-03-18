import type {
  UploadPanelKey, PanelKey, UploadItem,
  StylePreset, CustomStyle, AspectOptionLike, MotionStyleKey,
} from "./minaTypes";

export type StudioLeftProps = {
  globalDragging: boolean;
  typingHidden: boolean;

  showPills: boolean;
  showPanels: boolean;
  showControls: boolean;
  uiStage: 0 | 1 | 2 | 3;

  brief: string;
  briefHintVisible: boolean;
  briefShellRef: React.RefObject<HTMLDivElement>;
  onBriefScroll: () => void;
  onBriefChange: (value: string) => void;

  activePanel: PanelKey;
  openPanel: (key: PanelKey) => void;

  pillInitialDelayMs: number;
  pillStaggerMs: number;
  panelRevealDelayMs: number;

  currentAspect: AspectOptionLike;
  currentAspectIconUrl: string;
  onCycleAspect: () => void;
  aspectLandscape?: boolean;
  onToggleAspectLandscape?: () => void;

  animateAspect?: AspectOptionLike;
  animateAspectIconUrl?: string;
  animateAspectIconRotated?: boolean;

  uploads: Record<UploadPanelKey, UploadItem[]>;
  uploadsPending: boolean;

  removeUploadItem: (panel: UploadPanelKey, id: string) => void;
  moveUploadItem: (panel: UploadPanelKey, from: number, to: number) => void;
  triggerPick: (panel: UploadPanelKey) => void;

  onFilesPicked: (panel: UploadPanelKey, files: FileList) => void;

  productInputRef: React.RefObject<HTMLInputElement>;
  logoInputRef: React.RefObject<HTMLInputElement>;
  inspirationInputRef: React.RefObject<HTMLInputElement>;

  stylePresetKeys: string[];
  setStylePresetKeys: (k: string[]) => void;

  stylePresets: readonly StylePreset[];
  customStyles: CustomStyle[];

  getStyleLabel: (key: string, fallback: string) => string;

  deleteCustomStyle: (key: string) => void;
  onOpenCustomStylePanel: () => void;

  onImageUrlPasted?: (url: string) => void;

  minaVisionEnabled: boolean;
  onToggleVision: () => void;

  stillGenerating: boolean;
  stillError: string | null;
  onCreateStill: () => void;

  animateMode?: boolean;
  onToggleAnimateMode?: (next: boolean) => void;

  motionDurationSec?: 5 | 10 | 15;
  motionCostLabel?: string;
  onToggleMotionDuration?: () => void;

  sessionMatchasSpent?: number;
  sessionStartTime?: string;

  motionAudioEnabled?: boolean;
  motionAudioLocked?: boolean;
  effectiveMotionAudioEnabled?: boolean;
  onToggleMotionAudio?: () => void;

  motionStyleKeys?: MotionStyleKey[];
  setMotionStyleKeys?: (k: MotionStyleKey[]) => void;

  motionSuggesting?: boolean;
  canCreateMotion?: boolean;
  motionHasImage?: boolean;
  motionCreditsOk?: boolean;
  motionBlockReason?: string | null;

  imageCreditsOk?: boolean;
  credits?: number;
  matchaUrl: string;
  matcha5000Url?: string;
  onConfirmCheckout?: (qty: number) => void;

  motionGenerating?: boolean;
  motionError?: string | null;
  onCreateMotion?: () => void;
  onTypeForMe?: () => void;

  minaMessage?: string;
  minaTalking?: boolean;
  minaTone?: "thinking" | "error" | "info";
  onDismissMinaNotice?: () => void;
  onBriefFocus?: () => void;
  minaError?: string | null;
  onClearMinaError?: () => void;

  stillLane: "main" | "niche";
  onToggleStillLane: () => void;
  stillLaneDisabled?: boolean;

  videoLane: "short" | "story";
  onToggleVideoLane: () => void;

  timingVars?: React.CSSProperties;

  onGoProfile: () => void;

  feedbackSending?: boolean;
};
