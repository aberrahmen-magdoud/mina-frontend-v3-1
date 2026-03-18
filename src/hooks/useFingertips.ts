// src/hooks/useFingertips.ts
// Fingertips state: toolbar, mask-lasso drawing, prompt, and model dispatch.

import { useCallback, useEffect, useRef, useState } from "react";
import type { FtMode, FtModelKey, FingertipsResult } from "../lib/minaTypes";
import { MASK_MODELS, PROMPT_MODELS, FT_INITIAL_DELAY, FT_STAGGER } from "../lib/studioRightHelpers";

export interface UseFingertipsOpts {
  safeStillUrl: string;
  currentAspect?: string;
  onFingertipsGenerate?: (args: { modelKey: FtModelKey; inputs: Record<string, any> }) => Promise<FingertipsResult | null>;
}

export function useFingertips({ safeStillUrl, currentAspect, onFingertipsGenerate }: UseFingertipsOpts) {
  // ── Toolbar state ──
  const [ftMode, setFtMode] = useState<FtMode>(null);
  const [ftActiveModel, setFtActiveModel] = useState<FtModelKey | null>(null);
  const [ftPrompt, setFtPrompt] = useState("");
  const [ftError, setFtError] = useState<string | null>(null);
  const [ftBtnVisible, setFtBtnVisible] = useState(false);
  const [ftProcessing, setFtProcessing] = useState(false);

  // ── Mask / lasso refs ──
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCursorRef = useRef<HTMLDivElement | null>(null);
  const [maskDrawing, setMaskDrawing] = useState(false);
  const maskLastPosRef = useRef<{ x: number; y: number } | null>(null);
  const maskOverlayRef = useRef<HTMLDivElement | null>(null);
  const maskZoomRef = useRef({ scale: 1, x: 0, y: 0 });
  const [maskPanning, setMaskPanning] = useState(false);
  const maskPanStartRef = useRef<{ x: number; y: number; zx: number; zy: number } | null>(null);
  const maskImgDimsRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const lassoPointsRef = useRef<{ x: number; y: number }[]>([]);
  const closedPathRef = useRef<{ x: number; y: number }[] | null>(null);
  const lassoSvgRef = useRef<SVGSVGElement | null>(null);
  const marchingAntsRef = useRef<number | null>(null);
  const [eraseAnimating, setEraseAnimating] = useState(false);
  const eraseClipPathRef = useRef<string>("");
  const [cursorInZone, setCursorInZone] = useState(false);

  // ── Exit fingertips ──
  const exitFingertips = useCallback(() => {
    setFtMode(null);
    setFtActiveModel(null);
    setFtPrompt("");
    setFtError(null);
    setFtBtnVisible(false);
    setFtProcessing(false);
    setEraseAnimating(false);
    setCursorInZone(false);
    lassoPointsRef.current = [];
    closedPathRef.current = null;
  }, []);

  // Stagger buttons in on toolbar show
  useEffect(() => {
    if (ftMode === "toolbar" || ftMode === "prompt" || ftMode === "mask") {
      const t = setTimeout(() => setFtBtnVisible(true), 50);
      return () => clearTimeout(t);
    }
    setFtBtnVisible(false);
  }, [ftMode]);

  // ── Geometry helpers ──
  const smoothPoints = useCallback((pts: { x: number; y: number }[], tension = 0.4): { x: number; y: number }[] => {
    if (pts.length < 3) return pts;
    const result: { x: number; y: number }[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[(i - 1 + pts.length) % pts.length];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % pts.length];
      const p3 = pts[(i + 2) % pts.length];
      const segments = 6;
      for (let t = 0; t < segments; t++) {
        const s = t / segments;
        const s2 = s * s;
        const s3 = s2 * s;
        const x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * s * tension +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * s2 * tension +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * s3 * tension);
        const y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * s * tension +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * s2 * tension +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * s3 * tension);
        result.push({ x, y });
      }
    }
    return result;
  }, []);

  const simplifyPoints = useCallback((pts: { x: number; y: number }[], minDist = 4): { x: number; y: number }[] => {
    if (pts.length < 2) return pts;
    const result = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const last = result[result.length - 1];
      const dx = pts[i].x - last.x;
      const dy = pts[i].y - last.y;
      if (dx * dx + dy * dy >= minDist * minDist) result.push(pts[i]);
    }
    return result;
  }, []);

  const screenToImageCoords = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const overlay = maskOverlayRef.current;
    if (!overlay) return null;
    const rect = overlay.getBoundingClientRect();
    const z = maskZoomRef.current;
    return { x: (clientX - rect.left - z.x) / z.scale, y: (clientY - rect.top - z.y) / z.scale };
  }, []);

  const buildSvgPath = useCallback((pts: { x: number; y: number }[], closed: boolean): string => {
    if (pts.length < 2) return "";
    const smoothed = smoothPoints(simplifyPoints(pts, 3));
    if (smoothed.length < 2) return "";
    let d = `M ${smoothed[0].x} ${smoothed[0].y}`;
    for (let i = 1; i < smoothed.length; i++) {
      d += ` L ${smoothed[i].x} ${smoothed[i].y}`;
    }
    if (closed) d += " Z";
    return d;
  }, [smoothPoints, simplifyPoints]);

  // ── Render lasso paths into SVG overlay ──
  const renderLassoPaths = useCallback(() => {
    const svg = lassoSvgRef.current;
    if (!svg) return;
    const existing = svg.querySelectorAll(".lasso-path-group");
    existing.forEach((el: Element) => el.remove());
    const overlay = maskOverlayRef.current;
    if (!overlay) return;

    const closed = closedPathRef.current;
    if (closed && closed.length > 2) {
      const d = buildSvgPath(closed, true);
      if (d) {
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.classList.add("lasso-path-group");
        const fill = document.createElementNS("http://www.w3.org/2000/svg", "path");
        fill.setAttribute("d", d);
        fill.setAttribute("class", "lasso-fill");
        g.appendChild(fill);
        const stroke = document.createElementNS("http://www.w3.org/2000/svg", "path");
        stroke.setAttribute("d", d);
        stroke.setAttribute("class", "lasso-stroke");
        g.appendChild(stroke);
        svg.appendChild(g);
      }
    }

    const currentPoints = lassoPointsRef.current;
    if (currentPoints.length > 1) {
      const isClosed = currentPoints.length >= 3;
      const d = buildSvgPath(currentPoints, isClosed);
      if (d) {
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.classList.add("lasso-path-group");
        if (isClosed) {
          const fill = document.createElementNS("http://www.w3.org/2000/svg", "path");
          fill.setAttribute("d", d);
          fill.setAttribute("class", "lasso-fill");
          g.appendChild(fill);
        }
        const stroke = document.createElementNS("http://www.w3.org/2000/svg", "path");
        stroke.setAttribute("d", d);
        stroke.setAttribute("class", "lasso-stroke lasso-stroke--drawing");
        g.appendChild(stroke);
        svg.appendChild(g);
      }
    }
  }, [buildSvgPath]);

  // ── Canvas init ──
  const applyMaskZoom = useCallback(() => {
    const { scale, x, y } = maskZoomRef.current;
    const transform = `translate(${x}px, ${y}px) scale(${scale})`;
    const underlay = maskOverlayRef.current?.querySelector(".ft-mask-underlay") as HTMLElement | null;
    const canvas = maskCanvasRef.current;
    const svg = lassoSvgRef.current;
    const eraseSvg = maskOverlayRef.current?.querySelector(".ft-erase-svg") as HTMLElement | null;
    if (underlay) underlay.style.transform = transform;
    if (canvas) canvas.style.transform = transform;
    if (svg) svg.style.transform = transform;
    if (eraseSvg) eraseSvg.style.transform = transform;
  }, []);

  const initMaskCanvas = useCallback(() => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    if (safeStillUrl) {
      const img = new Image();
      img.onload = () => {
        maskImgDimsRef.current = { w: img.naturalWidth, h: img.naturalHeight };
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      };
      img.onerror = () => {
        const parent = canvas.parentElement;
        if (!parent) return;
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        maskImgDimsRef.current = { w: canvas.width, h: canvas.height };
      };
      img.src = safeStillUrl;
    }
    maskZoomRef.current = { scale: 1, x: 0, y: 0 };
    lassoPointsRef.current = [];
    closedPathRef.current = null;
    applyMaskZoom();
  }, [safeStillUrl, applyMaskZoom]);

  useEffect(() => {
    if (ftMode === "mask") {
      const t = setTimeout(initMaskCanvas, 50);
      return () => clearTimeout(t);
    }
  }, [ftMode, initMaskCanvas]);

  // Prevent page scroll/zoom when mask overlay is active
  useEffect(() => {
    if (ftMode !== "mask") return;
    const overlay = maskOverlayRef.current;
    if (!overlay) return;
    const wheelHandler = (e: WheelEvent) => { e.preventDefault(); };
    const touchHandler = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };
    const gestureHandler = (e: Event) => {
      e.preventDefault();
      const ge = e as any;
      if (ge.scale != null) {
        const z = maskZoomRef.current;
        const newScale = Math.max(0.5, Math.min(5, z.scale * ge.scale));
        z.scale = newScale;
        applyMaskZoom();
      }
    };
    overlay.addEventListener("wheel", wheelHandler, { passive: false });
    overlay.addEventListener("touchmove", touchHandler, { passive: false });
    overlay.addEventListener("gesturestart", gestureHandler as EventListener, { passive: false });
    overlay.addEventListener("gesturechange", gestureHandler as EventListener, { passive: false });
    return () => {
      overlay.removeEventListener("wheel", wheelHandler);
      overlay.removeEventListener("touchmove", touchHandler);
      overlay.removeEventListener("gesturestart", gestureHandler as EventListener);
      overlay.removeEventListener("gesturechange", gestureHandler as EventListener);
    };
  }, [ftMode, applyMaskZoom]);

  // Marching ants animation
  useEffect(() => {
    if (ftMode !== "mask") {
      if (marchingAntsRef.current) cancelAnimationFrame(marchingAntsRef.current);
      return;
    }
    let offset = 0;
    const animate = () => {
      offset = (offset + 0.3) % 200;
      const strokes = document.querySelectorAll(".lasso-stroke");
      strokes.forEach((s) => (s as SVGPathElement).style.strokeDashoffset = `${offset}`);
      marchingAntsRef.current = requestAnimationFrame(animate);
    };
    marchingAntsRef.current = requestAnimationFrame(animate);
    return () => { if (marchingAntsRef.current) cancelAnimationFrame(marchingAntsRef.current); };
  }, [ftMode]);

  // Spacebar = pan mode
  useEffect(() => {
    if (ftMode !== "mask") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) { e.preventDefault(); setMaskPanning(true); }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") { e.preventDefault(); setMaskPanning(false); maskPanStartRef.current = null; }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, [ftMode]);

  // ── Pointer handlers for lasso drawing ──
  const handleMaskPointerDown = useCallback((e: { clientX: number; clientY: number; pointerId: number; target: EventTarget | null }) => {
    const pt = screenToImageCoords(e.clientX, e.clientY);
    if (!pt) return;
    closedPathRef.current = null;
    const canvas = maskCanvasRef.current;
    if (canvas) { const ctx = canvas.getContext("2d"); if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height); }
    renderLassoPaths();
    setMaskDrawing(true);
    lassoPointsRef.current = [pt];
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [screenToImageCoords, renderLassoPaths]);

  const handleMaskPointerMove = useCallback((e: { clientX: number; clientY: number }) => {
    if (maskCursorRef.current) {
      maskCursorRef.current.style.left = `${e.clientX}px`;
      maskCursorRef.current.style.top = `${e.clientY}px`;
    }
    if (!maskDrawing) return;
    const pt = screenToImageCoords(e.clientX, e.clientY);
    if (!pt) return;
    lassoPointsRef.current.push(pt);
    renderLassoPaths();
  }, [maskDrawing, screenToImageCoords, renderLassoPaths]);

  const handleMaskPointerUp = useCallback(() => {
    if (!maskDrawing) return;
    setMaskDrawing(false);
    const pts = lassoPointsRef.current;
    if (pts.length >= 3) {
      closedPathRef.current = [...pts];
      const canvas = maskCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const overlay = maskOverlayRef.current;
          if (overlay) {
            const smoothed = smoothPoints(simplifyPoints(pts, 3));
            const scaleX = canvas.width / overlay.clientWidth;
            const scaleY = canvas.height / overlay.clientHeight;
            ctx.save();
            ctx.beginPath();
            if (smoothed.length > 0) {
              ctx.moveTo(smoothed[0].x * scaleX, smoothed[0].y * scaleY);
              for (let i = 1; i < smoothed.length; i++) ctx.lineTo(smoothed[i].x * scaleX, smoothed[i].y * scaleY);
            }
            ctx.closePath();
            ctx.filter = "blur(4px)";
            ctx.fillStyle = "rgba(80, 130, 255, 0.85)";
            ctx.fill();
            ctx.filter = "none";
            ctx.restore();
          }
        }
      }
    }
    lassoPointsRef.current = [];
    renderLassoPaths();
  }, [maskDrawing, smoothPoints, simplifyPoints, renderLassoPaths]);

  // ── Extract mask as black/white data URL ──
  const extractMaskDataUrl = useCallback((): string | null => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return null;
    const w = canvas.width;
    const h = canvas.height;
    if (w === 0 || h === 0) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const imageData = ctx.getImageData(0, 0, w, h);
    const pixels = imageData.data;
    let hasDrawn = false;
    for (let i = 3; i < pixels.length; i += 4) { if (pixels[i] > 5) { hasDrawn = true; break; } }
    if (!hasDrawn) return null;
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = w;
    maskCanvas.height = h;
    const maskCtx = maskCanvas.getContext("2d")!;
    maskCtx.fillStyle = "#000000";
    maskCtx.fillRect(0, 0, w, h);
    const maskData = maskCtx.getImageData(0, 0, w, h);
    const mp = maskData.data;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] > 5) { mp[i] = 255; mp[i + 1] = 255; mp[i + 2] = 255; mp[i + 3] = 255; }
    }
    maskCtx.putImageData(maskData, 0, 0);
    return maskCanvas.toDataURL("image/png");
  }, []);

  // ── Fingertips action dispatchers ──
  const handleFtModel = useCallback(async (modelKey: FtModelKey) => {
    if (!onFingertipsGenerate || !safeStillUrl) return;
    setFtActiveModel(modelKey);
    setFtError(null);

    if (MASK_MODELS.has(modelKey)) { setFtMode("mask"); return; }
    if (PROMPT_MODELS.has(modelKey)) { setFtMode("prompt"); return; }

    setFtProcessing(true);
    try {
      let inputs: Record<string, any> = { image: safeStillUrl };

      if (modelKey === "upscale") {
        inputs.scale_factor = 2;
      } else if (modelKey === "expand") {
        let realAspect = currentAspect || "9:16";
        try {
          const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
            img.onerror = reject;
            img.src = safeStillUrl;
          });
          const ratio = dims.w / dims.h;
          if (Math.abs(ratio - 9 / 16) < 0.08) realAspect = "9:16";
          else if (Math.abs(ratio - 16 / 9) < 0.08) realAspect = "16:9";
          else if (Math.abs(ratio - 3 / 4) < 0.08) realAspect = "3:4";
          else if (Math.abs(ratio - 4 / 3) < 0.08) realAspect = "4:3";
          else if (Math.abs(ratio - 2 / 3) < 0.08) realAspect = "2:3";
          else if (Math.abs(ratio - 3 / 2) < 0.08) realAspect = "3:2";
          else if (Math.abs(ratio - 1) < 0.08) realAspect = "1:1";
        } catch { /* fallback to currentAspect */ }

        const FLIP: Record<string, string> = {
          "9:16": "16:9", "16:9": "9:16", "3:4": "4:3", "4:3": "3:4",
          "2:3": "3:2", "3:2": "2:3", "9_16": "16:9", "16_9": "9:16",
          "3_4": "4:3", "4_3": "3:4", "2_3": "3:2", "3_2": "2:3",
        };
        inputs.aspect_ratio = FLIP[realAspect] || "4:3";
      }

      const result = await onFingertipsGenerate({ modelKey, inputs });
      if (result?.output_url || result?.output) exitFingertips();
      else if (result?.error) setFtError(result.error);
    } catch (err: any) {
      setFtError(err?.message || "Generation failed");
    } finally { setFtProcessing(false); }
  }, [onFingertipsGenerate, safeStillUrl, currentAspect, exitFingertips]);

  const handleMaskSubmit = useCallback(async () => {
    if (!onFingertipsGenerate || !safeStillUrl || !ftActiveModel) return;
    const maskDataUrl = extractMaskDataUrl();
    if (!maskDataUrl) { setFtError("Draw a selection on the area first"); return; }
    const contour = closedPathRef.current;
    if (contour && contour.length > 2) {
      const smoothed = smoothPoints(simplifyPoints(contour, 3));
      eraseClipPathRef.current = buildSvgPath(smoothed, true) || "";
    }
    setEraseAnimating(true);
    setFtProcessing(true);
    setFtError(null);
    try {
      const inputs: Record<string, any> = { image: safeStillUrl };
      if (ftActiveModel === "eraser") {
        inputs.mask_image = maskDataUrl;
      } else if (ftActiveModel === "flux_fill") {
        inputs.mask = maskDataUrl;
        inputs.prompt = ftPrompt || "";
        inputs.mask_type = "manual";
        inputs.sync = true;
        inputs.preserve_alpha = true;
      }
      const result = await onFingertipsGenerate({ modelKey: ftActiveModel, inputs });
      if (result?.output_url || result?.output) exitFingertips();
      else if (result?.error) setFtError(result.error);
    } catch (err: any) {
      setFtError(err?.message || "Generation failed");
    } finally { setFtProcessing(false); setEraseAnimating(false); }
  }, [onFingertipsGenerate, safeStillUrl, ftActiveModel, ftPrompt, extractMaskDataUrl, exitFingertips, smoothPoints, simplifyPoints, buildSvgPath]);

  const handlePromptSubmit = useCallback(async () => {
    if (!onFingertipsGenerate || !safeStillUrl || !ftActiveModel) return;
    if (MASK_MODELS.has(ftActiveModel)) { setFtMode("mask"); return; }
    setFtProcessing(true);
    setFtError(null);
    try {
      const inputs: Record<string, any> = { image: safeStillUrl, prompt: ftPrompt };
      const result = await onFingertipsGenerate({ modelKey: ftActiveModel, inputs });
      if (result?.output_url || result?.output) exitFingertips();
      else if (result?.error) setFtError(result.error);
    } catch (err: any) {
      setFtError(err?.message || "Generation failed");
    } finally { setFtProcessing(false); }
  }, [onFingertipsGenerate, safeStillUrl, ftActiveModel, ftPrompt, exitFingertips]);

  const handleFluxFill = useCallback(() => {
    setFtActiveModel("flux_fill");
    setFtError(null);
    setFtPrompt("");
    setFtMode("prompt");
  }, []);

  const clearMaskCanvas = useCallback(() => {
    closedPathRef.current = null;
    lassoPointsRef.current = [];
    renderLassoPaths();
    const canvas = maskCanvasRef.current;
    if (canvas) { const ctx = canvas.getContext("2d"); if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height); }
  }, [renderLassoPaths]);

  return {
    // state
    ftMode, setFtMode, ftActiveModel, setFtActiveModel, ftPrompt, setFtPrompt,
    ftError, ftBtnVisible, ftProcessing,
    // mask state
    maskCanvasRef, maskCursorRef, maskOverlayRef, lassoSvgRef,
    maskPanning, maskPanStartRef, maskZoomRef,
    eraseAnimating, eraseClipPathRef, cursorInZone, setCursorInZone,
    // actions
    exitFingertips, handleFtModel, handleMaskSubmit, handlePromptSubmit, handleFluxFill,
    applyMaskZoom, clearMaskCanvas,
    // pointer handlers (mask)
    handleMaskPointerDown, handleMaskPointerMove, handleMaskPointerUp,
  };
}
