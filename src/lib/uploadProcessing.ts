// src/lib/uploadProcessing.ts
// ============================================================================
// Image normalization / optimization pipeline for uploads
// ============================================================================

import type { UploadPanelKey } from "./minaTypes";
import {
  ALLOWED_EXTS,
  ALLOWED_MIMES,
  MAX_UPLOAD_BYTES,
  OPT_MAX_DIM,
  OPT_INITIAL_QUALITY,
} from "./minaConstants";
import { getFileExt } from "./minaHelpers";

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
        type,
        quality as any
      );
    } catch (e) {
      reject(e);
    }
  });
}

export async function decodeToBitmap(file: Blob): Promise<ImageBitmap | null> {
  try {
    const AnyImageDecoder = (window as any).ImageDecoder;
    if (typeof AnyImageDecoder === "function") {
      const type = (file as any).type || "";
      if (!type || (await AnyImageDecoder.isTypeSupported?.(type))) {
        const data = await file.arrayBuffer();
        const decoder = new AnyImageDecoder({ data, type: type || undefined });
        const frame = await decoder.decode({ frameIndex: 0 });
        const bmp = frame?.image;
        if (bmp) return bmp as ImageBitmap;
      }
    }
  } catch {}

  try {
    // @ts-ignore
    if (typeof createImageBitmap === "function") return await createImageBitmap(file);
  } catch {}

  try {
    const url = URL.createObjectURL(file);
    const bmp = await new Promise<ImageBitmap>((resolve, reject) => {
      const img = new Image();
      (img as any).decoding = "async";
      img.onload = async () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth || 1;
          canvas.height = img.naturalHeight || 1;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("No canvas");
          ctx.drawImage(img, 0, 0);
          try {
            // @ts-ignore
            if (typeof createImageBitmap === "function") {
              const b = await createImageBitmap(canvas);
              return resolve(b);
            }
          } catch {}
          resolve({ width: canvas.width, height: canvas.height, close: () => {}, _canvas: canvas } as any);
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error("Image decode failed"));
      img.src = url;
    });
    try { URL.revokeObjectURL(url); } catch {}
    return bmp;
  } catch {
    return null;
  }
}

export async function normalizeImageForUpload(
  file: File,
  panel: UploadPanelKey,
  opts?: { forceJpeg?: boolean; maxDim?: number; maxBytes?: number }
): Promise<{ file: File; previewUrl?: string; changed: boolean }> {
  const ext = getFileExt(file.name);
  const mime = String(file.type || "").toLowerCase();

  const isHeicLike =
    ext === "heic" ||
    ext === "heif" ||
    mime === "image/heic" ||
    mime === "image/heif" ||
    mime === "image/heic-sequence" ||
    mime === "image/heif-sequence";

  const extAllowed = ext ? ALLOWED_EXTS.has(ext) : false;
  const mimeAllowed = mime ? ALLOWED_MIMES.has(mime) : false;
  const isAllowed = extAllowed || mimeAllowed;

  const forceJpeg = !!opts?.forceJpeg;
  const maxDim = Math.max(340, Math.min(3850, Number(opts?.maxDim ?? OPT_MAX_DIM)));
  const maxBytes = Math.max(1024 * 1024, Number(opts?.maxBytes ?? MAX_UPLOAD_BYTES));

  const tooBig = file.size > maxBytes;
  const shouldOptimize = forceJpeg || !isAllowed || tooBig || file.size > 18 * 1024 * 1024;

  if (!shouldOptimize) return { file, changed: false };

  const bmp = await decodeToBitmap(file);
  if (!bmp) {
    throw new Error(!isAllowed || isHeicLike ? "UNSUPPORTED" : "BROKEN");
  }

  const srcW = (bmp as any).width || 0;
  const srcH = (bmp as any).height || 0;
  if (!srcW || !srcH) {
    try { (bmp as any).close?.(); } catch {}
    throw new Error("BROKEN");
  }

  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const outW = Math.max(1, Math.round(srcW * scale));
  const outH = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;

  const ctx = canvas.getContext("2d", { willReadFrequently: false } as any) as CanvasRenderingContext2D | null;
  if (!ctx) {
    try { (bmp as any).close?.(); } catch {}
    throw new Error("BROKEN");
  }

  const drawSource = (bmp as any)._canvas || bmp;
  ctx.drawImage(drawSource as any, 0, 0, outW, outH);
  try { (bmp as any).close?.(); } catch {}

  const outType = forceJpeg
    ? "image/jpeg"
    : panel === "logo" || file.type === "image/png"
      ? "image/png"
      : "image/jpeg";

  const quality = outType === "image/jpeg" ? OPT_INITIAL_QUALITY : undefined;

  let q = quality ?? OPT_INITIAL_QUALITY;
  let blob: Blob | null = null;

  for (let i = 0; i < 8; i++) {
    blob = await canvasToBlob(canvas, outType, q).catch(() => null);
    if (blob && blob.size <= maxBytes) break;
    q = Math.max(0.5, q - 0.08);
  }

  if (!blob) throw new Error("BROKEN");
  if (blob.size > maxBytes) throw new Error("TOO_BIG");

  const baseName = file.name.replace(/\.[^.]+$/i, "") || "upload";
  const newExt = outType === "image/png" ? "png" : "jpg";
  const newName = `${baseName}.${newExt}`;
  const newFile = new File([blob], newName, { type: outType });

  const previewUrl = URL.createObjectURL(newFile);
  return { file: newFile, previewUrl, changed: true };
}
