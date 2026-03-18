// src/handlers/minaCustomStyleFlow.ts
// Custom style modal handlers (train, rename, delete).
// Extracted from MinaApp.tsx for module size.

import type { UploadPanelKey, CustomStyleImage, CustomStylePreset, CustomStyle } from "../lib/minaTypes";
import { isHttpUrl } from "../lib/minaHelpers";
import { loadCustomStyles, saveCustomStyles } from "../lib/minaHelpers";
import { UI_ERROR_MESSAGES } from "../lib/mmaErrors";

// Local type aliases (avoid React import for standalone TS files)
type SetState<T> = (value: T | ((prev: T) => T)) => void;

type ApiFetchFn = (path: string, init?: RequestInit) => Promise<Response>;

export interface CustomStyleDeps {
  apiFetch: ApiFetchFn;
  currentPassId: string;
  uploadFileToR2: (panel: UploadPanelKey, file: File) => Promise<string>;

  customStyleImages: CustomStyleImage[];
  customStyleHeroId: string | null;
  customStyles: CustomStyle[];

  setCustomStyleTraining: SetState<boolean>;
  setCustomStyleError: SetState<string | null>;
  setCustomStyles: SetState<CustomStyle[]>;
  setStylePresetKeys: SetState<string[]>;
  setCustomStyleImages: SetState<CustomStyleImage[]>;
  setCustomStyleHeroId: SetState<string | null>;
  setCustomStyleHeroThumb: SetState<string | null>;
  setCustomStylePanelOpen: SetState<boolean>;
}

export async function handleTrainCustomStyle(deps: CustomStyleDeps) {
  if (!deps.customStyleImages.length || !deps.customStyleHeroId) return;

  try {
    deps.setCustomStyleTraining(true);
    deps.setCustomStyleError(null);
    if (!deps.currentPassId) throw new Error(UI_ERROR_MESSAGES.missingPassId);

    const hero = deps.customStyleImages.find((x) => x.id === deps.customStyleHeroId);
    if (!hero?.file) throw new Error("Pick a hero image.");

    const others = deps.customStyleImages.filter((x) => x.id !== deps.customStyleHeroId).slice(0, 2);
    const trio = [hero, ...others];

    const allFiles = deps.customStyleImages.map((x) => x.file).filter(Boolean).slice(0, 10);
    const uploadedAll = await Promise.all(
      allFiles.map(async (file) => {
        const url = await deps.uploadFileToR2("inspiration", file);
        if (!isHttpUrl(url)) throw new Error("Style upload returned invalid URL.");
        return url;
      }),
    );

    const uploadedTrio = await Promise.all(
      trio.map(async (x) => {
        const url = await deps.uploadFileToR2("inspiration", x.file);
        if (!isHttpUrl(url)) throw new Error("Style upload returned invalid URL.");
        return url;
      }),
    );

    const heroUrls = uploadedTrio.slice(0, 3);
    const newKey = `custom-${Date.now()}`;
    const newStyle: CustomStyle = {
      id: newKey,
      key: newKey,
      label: `Style ${deps.customStyles.length + 1}`,
      thumbUrl: heroUrls[0],
      heroUrls,
      allUrls: uploadedAll,
      createdAt: new Date().toISOString(),
    };

    deps.setCustomStyles((prev) => [newStyle, ...prev]);
    deps.setStylePresetKeys([newKey]);

    try { deps.customStyleImages.forEach((x) => { if (x?.url?.startsWith("blob:")) URL.revokeObjectURL(x.url); }); } catch {}

    deps.setCustomStyleImages([]);
    deps.setCustomStyleHeroId(null);
    deps.setCustomStyleHeroThumb((prevThumb) => {
      try { if (prevThumb?.startsWith("blob:")) URL.revokeObjectURL(prevThumb); } catch {}
      return null;
    });
    deps.setCustomStylePanelOpen(false);
  } catch (err: any) {
    deps.setCustomStyleError(err?.message || "Unable to create style right now.");
  } finally {
    deps.setCustomStyleTraining(false);
  }
}

export function handleSelectCustomStyleHero(
  id: string,
  customStyleImages: CustomStyleImage[],
  setCustomStyleHeroId: SetState<string | null>,
  setCustomStyleHeroThumb: SetState<string | null>,
) {
  setCustomStyleHeroId(id);
  const img = customStyleImages.find((item) => item.id === id);
  if (img) {
    setCustomStyleHeroThumb((prevThumb) => {
      if (prevThumb?.startsWith("blob:")) URL.revokeObjectURL(prevThumb);
      return img.url;
    });
  }
}

export function handleCustomStyleFiles(
  files: FileList | null,
  customStyleImages: CustomStyleImage[],
  customStyleHeroId: string | null,
  setCustomStyleImages: SetState<CustomStyleImage[]>,
  setCustomStyleHeroId: SetState<string | null>,
  setCustomStyleHeroThumb: SetState<string | null>,
) {
  if (!files) return;
  const remainingSlots = Math.max(0, 10 - customStyleImages.length);
  if (!remainingSlots) return;
  const nextFiles = Array.from(files).slice(0, remainingSlots);
  const now = Date.now();
  const newItems: CustomStyleImage[] = nextFiles.map((file, index) => ({
    id: `${now}_${index}_${file.name}`,
    url: URL.createObjectURL(file),
    file,
  }));

  setCustomStyleImages((prev) => {
    const merged = [...prev, ...newItems];
    let nextHeroId = customStyleHeroId;
    if (!nextHeroId && merged.length) nextHeroId = merged[0].id;
    setCustomStyleHeroId(nextHeroId || null);
    const heroImage = merged.find((img) => img.id === nextHeroId) || merged[0];
    if (heroImage) setCustomStyleHeroThumb((pt) => { if (pt?.startsWith("blob:")) URL.revokeObjectURL(pt); return heroImage.url; });
    return merged;
  });
}

export function deleteCustomStyle(
  key: string,
  setCustomStyles: SetState<CustomStyle[]>,
  setStyleLabelOverrides: SetState<Record<string, string>>,
  setStylePresetKeys: SetState<string[]>,
  undoRedoPush: (entry: { label: string; undo: () => void; redo: () => void }) => void,
) {
  let snapStyle: CustomStyle | null = null;
  let snapLabel: string | undefined;
  let wasSelected = false;

  setCustomStyles((prev) => { snapStyle = prev.find((s) => s.key === key) || null; return prev.filter((s) => s.key !== key); });
  setStyleLabelOverrides((prev) => { snapLabel = prev[key]; const copy = { ...prev }; delete copy[key]; return copy; });
  setStylePresetKeys((prev) => { wasSelected = prev.includes(key); return prev.filter((k) => k !== key); });

  setTimeout(() => {
    if (!snapStyle) return;
    const ss = snapStyle;
    const sl = snapLabel;
    const ws = wasSelected;
    undoRedoPush({
      label: "Delete style",
      undo: () => {
        setCustomStyles((prev) => [...prev, ss]);
        if (sl !== undefined) setStyleLabelOverrides((prev) => ({ ...prev, [key]: sl }));
        if (ws) setStylePresetKeys((prev) => [...prev, key]);
      },
      redo: () => {
        setCustomStyles((prev) => prev.filter((s) => s.key !== key));
        setStyleLabelOverrides((prev) => { const c = { ...prev }; delete c[key]; return c; });
        setStylePresetKeys((prev) => prev.filter((k) => k !== key));
      },
    });
  }, 0);
}

export function handleRenameCustomPreset(
  key: string,
  customPresets: CustomStylePreset[],
  setCustomPresets: SetState<CustomStylePreset[]>,
) {
  const preset = customPresets.find((p) => p.key === key);
  if (!preset) return;
  const next = window.prompt("Rename style", preset.label);
  if (!next) return;
  const updated = customPresets.map((p) => (p.key === key ? { ...p, label: next.trim() || p.label } : p));
  setCustomPresets(updated);
  saveCustomStyles(updated);
}

export function handleDeleteCustomPreset(
  key: string,
  customPresets: CustomStylePreset[],
  setCustomPresets: SetState<CustomStylePreset[]>,
  setStylePresetKeys: SetState<string[]>,
) {
  const preset = customPresets.find((p) => p.key === key);
  if (!preset) return;
  const ok = window.confirm(`Delete "${preset.label}"?`);
  if (!ok) return;
  const updated = customPresets.filter((p) => p.key !== key);
  setCustomPresets(updated);
  saveCustomStyles(updated);
  setStylePresetKeys((prev) => prev.filter((k) => k !== key));
}
