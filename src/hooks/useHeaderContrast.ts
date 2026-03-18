// src/hooks/useHeaderContrast.ts
// Detects whether the header area of the current media is dark or light

import { useCallback, useEffect, useMemo, useState } from "react";
import { isHttpUrl } from "../lib/minaHelpers";

export function useHeaderContrast(headerSampleUrl: string) {
  const [headerIsDark, setHeaderIsDark] = useState<boolean | null>(null);

  const headerCorsHosts = useMemo(() => {
    const raw = String((import.meta as any).env?.VITE_CORS_IMAGE_HOSTS || "");
    const hosts = raw
      .split(",")
      .map((h: string) => h.trim().toLowerCase())
      .filter(Boolean);
    return new Set(hosts);
  }, []);

  const canSampleHeaderPixels = useCallback(
    (url: string) => {
      try {
        const u = new URL(url, window.location.href);
        if (u.origin === window.location.origin) return true;
        return headerCorsHosts.has(u.hostname.toLowerCase());
      } catch {
        return false;
      }
    },
    [headerCorsHosts]
  );

  const computeHeaderLuma = useCallback(
    async (url: string): Promise<number | null> => {
      try {
        if (!url || !isHttpUrl(url)) return null;
        if (!canSampleHeaderPixels(url)) return null;

        return await new Promise((resolve) => {
          const img = new Image();
          try {
            const u = new URL(url, window.location.href);
            if (u.origin !== window.location.origin) {
              img.crossOrigin = "anonymous";
            }
          } catch {}

          (img as any).decoding = "async";

          img.onload = () => {
            try {
              const W = 64;
              const H = 64;
              const canvas = document.createElement("canvas");
              canvas.width = W;
              canvas.height = H;
              const ctx = canvas.getContext("2d", { willReadFrequently: true } as any);
              if (!ctx) return resolve(null);
              ctx.drawImage(img, 0, 0, W, H);
              let data: Uint8ClampedArray;
              try {
                data = ctx.getImageData(0, 0, W, H).data;
              } catch {
                resolve(null);
                return;
              }
              const x0 = Math.floor(W * 0.55);
              const y0 = 0;
              const x1 = W;
              const y1 = Math.floor(H * 0.35);
              let sum = 0;
              let count = 0;
              for (let y = y0; y < y1; y++) {
                for (let x = x0; x < x1; x++) {
                  const i = (y * W + x) * 4;
                  sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
                  count++;
                }
              }
              resolve(count ? sum / count : null);
            } catch {
              resolve(null);
            }
          };

          img.onerror = () => resolve(null);
          img.src = url;
        });
      } catch {
        return null;
      }
    },
    [canSampleHeaderPixels]
  );

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const luma = await computeHeaderLuma(headerSampleUrl);
      if (cancelled) return;
      if (typeof luma !== "number") {
        setHeaderIsDark(false);
        return;
      }
      setHeaderIsDark(luma < 145);
    };
    void run();
    return () => { cancelled = true; };
  }, [headerSampleUrl, computeHeaderLuma]);

  const headerOverlayClass = headerIsDark === true ? "header-on-dark" : "header-on-light";

  return { headerIsDark, headerOverlayClass };
}
