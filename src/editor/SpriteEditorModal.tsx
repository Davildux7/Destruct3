import React, { useEffect, useRef, useState } from 'react';
import {
  Crosshair,
  Eraser,
  FlipHorizontal,
  FlipVertical,
  Minus,
  PaintBucket,
  Pencil,
  Pipette,
  Play,
  Plus,
  RotateCw,
  Square,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { ObjectType, SpriteAnimation, SpriteFrame } from '../engine/types';
import { uid } from './helpers';

interface SpriteEditorModalProps {
  objectType: ObjectType;
  onClose: () => void;
  onSave: (updated: ObjectType) => void;
}

type ToolType = 'pencil' | 'eraser' | 'bucket' | 'eyedropper' | 'line' | 'rect' | 'origin';

const PALETTE = [
  '#0f172a', '#1e293b', '#475569', '#94a3b8', '#f8fafc', '#ffffff',
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#10b981', '#14b8a6', '#06b6d4', '#22d3ee', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#78350f',
];

function hexToRgba(hex: string): [number, number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255, 255];
}

function rgbaToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

export const SpriteEditorModal: React.FC<SpriteEditorModalProps> = ({ objectType, onClose, onSave }) => {
  const initialAnims: SpriteAnimation[] = JSON.parse(
    JSON.stringify(
      objectType.spriteConfig?.animations || [
        {
          name: 'Default',
          speed: 6,
          loop: true,
          repeatCount: 1,
          pingPong: false,
          frames: [{ id: uid('f'), dataUrl: '', width: 32, height: 32, originX: 0.5, originY: 0.5 }],
        },
      ]
    )
  );

  const [animations, setAnimations] = useState<SpriteAnimation[]>(initialAnims);
  const [defaultAnimation, setDefaultAnimation] = useState(
    objectType.spriteConfig?.defaultAnimation || initialAnims[0]?.name || 'Default'
  );
  const [activeAnimIdx, setActiveAnimIdx] = useState(0);
  const [activeFrameIdx, setActiveFrameIdx] = useState(0);
  const [tool, setTool] = useState<ToolType>('pencil');
  const [color, setColor] = useState('#22d3ee');
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [previewFrameIdx, setPreviewFrameIdx] = useState(0);

  const activeAnim = animations[activeAnimIdx] || animations[0];
  const activeFrame = activeAnim?.frames[activeFrameIdx] || activeAnim?.frames[0];

  const bufferCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const shapeStartRef = useRef<{ x: number; y: number } | null>(null);
  const preShapeDataRef = useRef<ImageData | null>(null);

  const frameW = activeFrame?.width || 32;
  const frameH = activeFrame?.height || 32;

  // Load active frame into offscreen pixel buffer
  useEffect(() => {
    if (!activeFrame) return;
    if (!bufferCanvasRef.current) {
      bufferCanvasRef.current = document.createElement('canvas');
    }
    const buf = bufferCanvasRef.current;
    buf.width = activeFrame.width;
    buf.height = activeFrame.height;
    const bctx = buf.getContext('2d', { willReadFrequently: true });
    if (!bctx) return;

    bctx.clearRect(0, 0, buf.width, buf.height);
    if (activeFrame.dataUrl) {
      const img = new Image();
      img.onload = () => {
        bctx.clearRect(0, 0, buf.width, buf.height);
        bctx.drawImage(img, 0, 0, buf.width, buf.height);
        redrawDisplay();
      };
      img.src = activeFrame.dataUrl;
    } else {
      redrawDisplay();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAnimIdx, activeFrameIdx, activeFrame?.id, activeFrame?.width, activeFrame?.height]);

  const redrawDisplay = () => {
    const disp = displayCanvasRef.current;
    const buf = bufferCanvasRef.current;
    if (!disp || !buf || !activeFrame) return;
    const ctx = disp.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, disp.width, disp.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buf, 0, 0, disp.width, disp.height);

    // Subtle pixel grid when zoom is high enough
    const scaleX = disp.width / buf.width;
    const scaleY = disp.height / buf.height;
    if (scaleX >= 6) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= buf.width; x++) {
        ctx.beginPath();
        ctx.moveTo(x * scaleX, 0);
        ctx.lineTo(x * scaleX, disp.height);
        ctx.stroke();
      }
      for (let y = 0; y <= buf.height; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * scaleY);
        ctx.lineTo(disp.width, y * scaleY);
        ctx.stroke();
      }
    }

    // Draw Origin crosshair
    const ox = activeFrame.originX * disp.width;
    const oy = activeFrame.originY * disp.height;
    ctx.strokeStyle = '#fb7185';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ox - 8, oy);
    ctx.lineTo(ox + 8, oy);
    ctx.moveTo(ox, oy - 8);
    ctx.lineTo(ox, oy + 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ox, oy, 3.5, 0, Math.PI * 2);
    ctx.stroke();
  };

  useEffect(() => {
    redrawDisplay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFrame?.originX, activeFrame?.originY]);

  // Animation preview timer
  useEffect(() => {
    if (!activeAnim || activeAnim.frames.length === 0) return;
    if (!isPlayingPreview) {
      setPreviewFrameIdx(activeFrameIdx);
      return;
    }
    const fps = Math.max(1, activeAnim.speed || 6);
    const id = window.setInterval(() => {
      setPreviewFrameIdx((prev) => (prev + 1) % activeAnim.frames.length);
    }, 1000 / fps);
    return () => window.clearInterval(id);
  }, [isPlayingPreview, activeAnim, activeFrameIdx]);

  useEffect(() => {
    const pCanvas = previewCanvasRef.current;
    if (!pCanvas || !activeAnim) return;
    const pCtx = pCanvas.getContext('2d');
    if (!pCtx) return;
    const frame = activeAnim.frames[previewFrameIdx] || activeAnim.frames[0];
    pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);
    pCtx.imageSmoothingEnabled = false;
    if (frame?.dataUrl) {
      const img = new Image();
      img.onload = () => {
        pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);
        pCtx.drawImage(img, 0, 0, pCanvas.width, pCanvas.height);
      };
      img.src = frame.dataUrl;
    }
  }, [previewFrameIdx, activeAnim, animations]);

  const commitBufferToFrame = () => {
    const buf = bufferCanvasRef.current;
    if (!buf) return;
    const url = buf.toDataURL('image/png');
    setAnimations((prev) =>
      prev.map((anim, aIdx) => {
        if (aIdx !== activeAnimIdx) return anim;
        return {
          ...anim,
          frames: anim.frames.map((f, fIdx) => (fIdx === activeFrameIdx ? { ...f, dataUrl: url } : f)),
        };
      })
    );
  };

  const getPixelCoords = (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const disp = displayCanvasRef.current!;
    const rect = disp.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    return {
      x: Math.max(0, Math.min(frameW - 1, Math.floor(nx * frameW))),
      y: Math.max(0, Math.min(frameH - 1, Math.floor(ny * frameH))),
    };
  };

  const floodFill = (bctx: CanvasRenderingContext2D, startX: number, startY: number, fillHex: string) => {
    const imgData = bctx.getImageData(0, 0, frameW, frameH);
    const data = imgData.data;
    const idx0 = (startY * frameW + startX) * 4;
    const target = [data[idx0], data[idx0 + 1], data[idx0 + 2], data[idx0 + 3]];
    const replacement = hexToRgba(fillHex);
    if (
      target[0] === replacement[0] &&
      target[1] === replacement[1] &&
      target[2] === replacement[2] &&
      target[3] === replacement[3]
    ) {
      return;
    }
    const queue: [number, number][] = [[startX, startY]];
    const visited = new Uint8Array(frameW * frameH);
    while (queue.length > 0) {
      const [cx, cy] = queue.pop()!;
      const pIdx = cy * frameW + cx;
      if (visited[pIdx]) continue;
      visited[pIdx] = 1;
      const i = pIdx * 4;
      if (
        data[i] === target[0] &&
        data[i + 1] === target[1] &&
        data[i + 2] === target[2] &&
        data[i + 3] === target[3]
      ) {
        data[i] = replacement[0];
        data[i + 1] = replacement[1];
        data[i + 2] = replacement[2];
        data[i + 3] = replacement[3];
        if (cx > 0) queue.push([cx - 1, cy]);
        if (cx < frameW - 1) queue.push([cx + 1, cy]);
        if (cy > 0) queue.push([cx, cy - 1]);
        if (cy < frameH - 1) queue.push([cx, cy + 1]);
      }
    }
    bctx.putImageData(imgData, 0, 0);
  };

  const drawBresenhamLine = (
    bctx: CanvasRenderingContext2D,
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ) => {
    bctx.fillStyle = color;
    let dx = Math.abs(x1 - x0);
    let dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let cx = x0;
    let cy = y0;
    while (true) {
      bctx.fillRect(cx, cy, 1, 1);
      if (cx === x1 && cy === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        cx += sx;
      }
      if (e2 < dx) {
        err += dx;
        cy += sy;
      }
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const buf = bufferCanvasRef.current;
    const disp = displayCanvasRef.current;
    if (!buf || !disp || !activeFrame) return;
    const bctx = buf.getContext('2d', { willReadFrequently: true });
    if (!bctx) return;

    if (tool === 'origin') {
      const rect = disp.getBoundingClientRect();
      const ox = Math.max(0, Math.min(1, Number(((e.clientX - rect.left) / rect.width).toFixed(3))));
      const oy = Math.max(0, Math.min(1, Number(((e.clientY - rect.top) / rect.height).toFixed(3))));
      setAnimations((prev) =>
        prev.map((a, ai) =>
          ai === activeAnimIdx
            ? { ...a, frames: a.frames.map((f, fi) => (fi === activeFrameIdx ? { ...f, originX: ox, originY: oy } : f)) }
            : a
        )
      );
      return;
    }

    const { x, y } = getPixelCoords(e);
    if (tool === 'eyedropper') {
      const px = bctx.getImageData(x, y, 1, 1).data;
      if (px[3] > 0) setColor(rgbaToHex(px[0], px[1], px[2]));
      setTool('pencil');
      return;
    }
    if (tool === 'bucket') {
      floodFill(bctx, x, y, color);
      redrawDisplay();
      commitBufferToFrame();
      return;
    }

    isDrawingRef.current = true;
    if (tool === 'line' || tool === 'rect') {
      shapeStartRef.current = { x, y };
      preShapeDataRef.current = bctx.getImageData(0, 0, frameW, frameH);
    } else if (tool === 'pencil') {
      bctx.fillStyle = color;
      bctx.fillRect(x, y, 1, 1);
      redrawDisplay();
    } else if (tool === 'eraser') {
      bctx.clearRect(x, y, 1, 1);
      redrawDisplay();
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !bufferCanvasRef.current) return;
    const bctx = bufferCanvasRef.current.getContext('2d', { willReadFrequently: true });
    if (!bctx) return;
    const { x, y } = getPixelCoords(e);

    if (tool === 'pencil') {
      bctx.fillStyle = color;
      bctx.fillRect(x, y, 1, 1);
      redrawDisplay();
    } else if (tool === 'eraser') {
      bctx.clearRect(x, y, 1, 1);
      redrawDisplay();
    } else if ((tool === 'line' || tool === 'rect') && shapeStartRef.current && preShapeDataRef.current) {
      bctx.putImageData(preShapeDataRef.current, 0, 0);
      const sx = shapeStartRef.current.x;
      const sy = shapeStartRef.current.y;
      if (tool === 'line') {
        drawBresenhamLine(bctx, sx, sy, x, y);
      } else {
        bctx.fillStyle = color;
        const left = Math.min(sx, x);
        const top = Math.min(sy, y);
        const w = Math.abs(x - sx) + 1;
        const h = Math.abs(y - sy) + 1;
        bctx.fillRect(left, top, w, 1);
        bctx.fillRect(left, top + h - 1, w, 1);
        bctx.fillRect(left, top, 1, h);
        bctx.fillRect(left + w - 1, top, 1, h);
      }
      redrawDisplay();
    }
  };

  const handleCanvasMouseUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    shapeStartRef.current = null;
    preShapeDataRef.current = null;
    commitBufferToFrame();
  };

  const transformCanvas = (kind: 'clear' | 'flipH' | 'flipV' | 'rot90') => {
    const buf = bufferCanvasRef.current;
    if (!buf) return;
    const bctx = buf.getContext('2d');
    if (!bctx) return;
    if (kind === 'clear') {
      bctx.clearRect(0, 0, buf.width, buf.height);
    } else {
      const tmp = document.createElement('canvas');
      tmp.width = buf.width;
      tmp.height = buf.height;
      tmp.getContext('2d')?.drawImage(buf, 0, 0);
      bctx.clearRect(0, 0, buf.width, buf.height);
      bctx.save();
      if (kind === 'flipH') {
        bctx.translate(buf.width, 0);
        bctx.scale(-1, 1);
      } else if (kind === 'flipV') {
        bctx.translate(0, buf.height);
        bctx.scale(1, -1);
      } else if (kind === 'rot90') {
        bctx.translate(buf.width / 2, buf.height / 2);
        bctx.rotate(Math.PI / 2);
        bctx.translate(-buf.width / 2, -buf.height / 2);
      }
      bctx.drawImage(tmp, 0, 0);
      bctx.restore();
    }
    redrawDisplay();
    commitBufferToFrame();
  };

  const handleResizeFrame = (newSize: number) => {
    const buf = bufferCanvasRef.current;
    if (!buf) return;
    const tmp = document.createElement('canvas');
    tmp.width = newSize;
    tmp.height = newSize;
    const tctx = tmp.getContext('2d');
    if (tctx) {
      tctx.imageSmoothingEnabled = false;
      tctx.drawImage(buf, 0, 0, newSize, newSize);
    }
    const url = tmp.toDataURL('image/png');
    setAnimations((prev) =>
      prev.map((a, ai) =>
        ai === activeAnimIdx
          ? {
              ...a,
              frames: a.frames.map((f, fi) =>
                fi === activeFrameIdx ? { ...f, width: newSize, height: newSize, dataUrl: url } : f
              ),
            }
          : a
      )
    );
  };

  const handleImportPng = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const buf = bufferCanvasRef.current;
        if (!buf) return;
        const bctx = buf.getContext('2d');
        if (!bctx) return;
        bctx.clearRect(0, 0, buf.width, buf.height);
        bctx.drawImage(img, 0, 0, buf.width, buf.height);
        redrawDisplay();
        commitBufferToFrame();
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleAddAnimation = () => {
    const name = `Anim${animations.length + 1}`;
    const blank: SpriteFrame = { id: uid('f'), dataUrl: '', width: frameW, height: frameH, originX: 0.5, originY: 0.5 };
    setAnimations([...animations, { name, speed: 8, loop: true, repeatCount: 1, pingPong: false, frames: [blank] }]);
    setActiveAnimIdx(animations.length);
    setActiveFrameIdx(0);
  };

  const handleAddFrame = (duplicate = false) => {
    const newFrame: SpriteFrame = duplicate && activeFrame
      ? { ...activeFrame, id: uid('f') }
      : { id: uid('f'), dataUrl: '', width: frameW, height: frameH, originX: 0.5, originY: 0.5 };
    setAnimations((prev) =>
      prev.map((a, ai) => (ai === activeAnimIdx ? { ...a, frames: [...a.frames, newFrame] } : a))
    );
    setActiveFrameIdx(activeAnim.frames.length);
  };

  const handleDeleteFrame = (idx: number) => {
    if (!activeAnim || activeAnim.frames.length <= 1) return;
    setAnimations((prev) =>
      prev.map((a, ai) =>
        ai === activeAnimIdx ? { ...a, frames: a.frames.filter((_, fi) => fi !== idx) } : a
      )
    );
    setActiveFrameIdx(Math.max(0, idx - 1));
  };

  const handleSaveAndClose = () => {
    onSave({
      ...objectType,
      spriteConfig: {
        animations,
        defaultAnimation: animations.some((a) => a.name === defaultAnimation)
          ? defaultAnimation
          : animations[0]?.name || 'Default',
      },
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
      <div className="w-full max-w-5xl h-[86vh] bg-[#1a1d24] border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-[#21252e]">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-slate-100">Sprite Editor · {objectType.name}</h2>
            <span className="text-xs font-mono text-slate-400">
              {frameW}×{frameH}px
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white rounded-lg hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveAndClose}
              className="px-4 py-1.5 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg"
            >
              Save Sprite
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* Tools & Palette Left Bar */}
          <div className="w-56 border-r border-slate-800 bg-[#181a20] p-3 flex flex-col gap-4 overflow-y-auto">
            <div>
              <div className="text-[11px] font-medium text-slate-400 mb-2">Drawing Tools</div>
              <div className="grid grid-cols-4 gap-1.5">
                {(
                  [
                    { id: 'pencil', icon: Pencil, title: 'Pencil' },
                    { id: 'eraser', icon: Eraser, title: 'Eraser' },
                    { id: 'bucket', icon: PaintBucket, title: 'Fill Bucket' },
                    { id: 'eyedropper', icon: Pipette, title: 'Eyedropper' },
                    { id: 'line', icon: Minus, title: 'Line' },
                    { id: 'rect', icon: Square, title: 'Rectangle' },
                    { id: 'origin', icon: Crosshair, title: 'Set Origin Point' },
                  ] as const
                ).map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      title={item.title}
                      onClick={() => setTool(item.id)}
                      className={`p-2 rounded-lg flex items-center justify-center border transition-colors ${
                        tool === item.id
                          ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                          : 'bg-[#14161b] border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] font-medium text-slate-400 mb-2">
                <span>Color Palette</span>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-6 h-5 bg-transparent border-0 cursor-pointer"
                />
              </div>
              <div className="grid grid-cols-6 gap-1">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    style={{ backgroundColor: c }}
                    className={`w-7 h-7 rounded border ${
                      color.toLowerCase() === c ? 'border-white scale-105' : 'border-slate-700'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-medium text-slate-400 mb-2">Canvas &amp; Origin</div>
              <div className="grid grid-cols-2 gap-1.5 mb-2">
                <button
                  type="button"
                  onClick={() => transformCanvas('flipH')}
                  className="flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-[#14161b] border border-slate-800 rounded text-slate-300 hover:border-slate-600"
                >
                  <FlipHorizontal className="w-3.5 h-3.5" /> Flip H
                </button>
                <button
                  type="button"
                  onClick={() => transformCanvas('flipV')}
                  className="flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-[#14161b] border border-slate-800 rounded text-slate-300 hover:border-slate-600"
                >
                  <FlipVertical className="w-3.5 h-3.5" /> Flip V
                </button>
                <button
                  type="button"
                  onClick={() => transformCanvas('rot90')}
                  className="flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-[#14161b] border border-slate-800 rounded text-slate-300 hover:border-slate-600"
                >
                  <RotateCw className="w-3.5 h-3.5" /> Rot 90°
                </button>
                <button
                  type="button"
                  onClick={() => transformCanvas('clear')}
                  className="flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-[#14161b] border border-slate-800 rounded text-rose-300 hover:border-rose-500/60"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Clear
                </button>
              </div>
              <label className="block text-[11px] text-slate-400 mb-1">Resolution</label>
              <select
                value={frameW}
                onChange={(e) => handleResizeFrame(Number(e.target.value))}
                className="w-full px-2 py-1.5 text-xs bg-[#14161b] border border-slate-700 rounded text-slate-200 mb-2"
              >
                {[16, 24, 32, 48, 64].map((sz) => (
                  <option key={sz} value={sz}>
                    {sz} × {sz} px
                  </option>
                ))}
              </select>

              <label className="flex items-center justify-center gap-1.5 w-full px-2 py-1.5 text-xs bg-[#14161b] border border-slate-700 hover:border-cyan-500 rounded text-slate-200 cursor-pointer">
                <Upload className="w-3.5 h-3.5" /> Import PNG
                <input type="file" accept="image/png,image/webp,image/jpeg" onChange={handleImportPng} className="hidden" />
              </label>

              <div className="mt-2 flex gap-1">
                {[
                  { label: 'Center', x: 0.5, y: 0.5 },
                  { label: 'Bottom', x: 0.5, y: 1 },
                  { label: 'TopLeft', x: 0, y: 0 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() =>
                      setAnimations((prev) =>
                        prev.map((a, ai) =>
                          ai === activeAnimIdx
                            ? {
                                ...a,
                                frames: a.frames.map((f, fi) =>
                                  fi === activeFrameIdx ? { ...f, originX: preset.x, originY: preset.y } : f
                                ),
                              }
                            : a
                        )
                      )
                    }
                    className="flex-1 py-1 text-[10px] bg-[#14161b] border border-slate-800 hover:border-slate-600 rounded text-slate-300"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Center Pixel Canvas */}
          <div className="flex-1 flex flex-col bg-[#14161b] min-w-0">
            <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
              <div className="checkerboard-bg border border-slate-700 rounded shadow-xl">
                <canvas
                  ref={displayCanvasRef}
                  width={384}
                  height={384}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  onMouseLeave={handleCanvasMouseUp}
                  className="block cursor-crosshair"
                />
              </div>
            </div>

            {/* Bottom Frames Strip */}
            <div className="h-28 border-t border-slate-800 bg-[#181a20] px-4 py-2 flex items-center gap-3 overflow-x-auto">
              {activeAnim?.frames.map((f, idx) => (
                <div
                  key={f.id}
                  onClick={() => setActiveFrameIdx(idx)}
                  className={`relative group shrink-0 w-16 h-16 rounded-lg checkerboard-bg border-2 cursor-pointer flex items-center justify-center overflow-hidden ${
                    idx === activeFrameIdx ? 'border-cyan-400' : 'border-slate-700 hover:border-slate-500'
                  }`}
                >
                  {f.dataUrl && <img src={f.dataUrl} alt={`Frame ${idx}`} className="w-12 h-12 object-contain" />}
                  <span className="absolute bottom-0.5 left-1 text-[10px] font-mono text-slate-300 bg-black/60 px-1 rounded">
                    {idx}
                  </span>
                  {activeAnim.frames.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteFrame(idx);
                      }}
                      className="hidden group-hover:flex absolute top-0.5 right-0.5 w-4 h-4 items-center justify-center rounded bg-rose-600 text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => handleAddFrame(false)}
                className="shrink-0 h-16 px-3 rounded-lg border border-dashed border-slate-700 hover:border-cyan-400 text-xs text-slate-400 hover:text-cyan-300 flex flex-col items-center justify-center gap-1"
              >
                <Plus className="w-4 h-4" /> Frame
              </button>
              <button
                type="button"
                onClick={() => handleAddFrame(true)}
                className="shrink-0 h-16 px-3 rounded-lg border border-dashed border-slate-700 hover:border-indigo-400 text-xs text-slate-400 hover:text-indigo-300 flex flex-col items-center justify-center gap-1"
              >
                <Plus className="w-4 h-4" /> Clone
              </button>
            </div>
          </div>

          {/* Right Animations & Live Preview Sidebar */}
          <div className="w-64 border-l border-slate-800 bg-[#181a20] p-3 flex flex-col gap-4 overflow-y-auto">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-medium text-slate-400">Animation Preview</span>
                <button
                  type="button"
                  onClick={() => setIsPlayingPreview((v) => !v)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                    isPlayingPreview ? 'bg-amber-500/20 text-amber-300' : 'bg-cyan-500/20 text-cyan-300'
                  }`}
                >
                  <Play className="w-3 h-3" /> {isPlayingPreview ? 'Stop' : 'Play'}
                </button>
              </div>
              <div className="h-24 rounded-lg checkerboard-bg border border-slate-800 flex items-center justify-center">
                <canvas ref={previewCanvasRef} width={64} height={64} className="w-16 h-16" />
              </div>
            </div>

            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-medium text-slate-400">Animations</span>
                <button
                  type="button"
                  onClick={handleAddAnimation}
                  className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
              <div className="space-y-1.5">
                {animations.map((anim, idx) => (
                  <div
                    key={`${anim.name}_${idx}`}
                    onClick={() => {
                      setActiveAnimIdx(idx);
                      setActiveFrameIdx(0);
                    }}
                    className={`px-2.5 py-2 rounded-lg border cursor-pointer flex items-center justify-between ${
                      idx === activeAnimIdx
                        ? 'bg-cyan-500/15 border-cyan-500/60 text-slate-100'
                        : 'bg-[#14161b] border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="text"
                      value={anim.name}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const nextName = e.target.value;
                        setAnimations((prev) => prev.map((a, i) => (i === idx ? { ...a, name: nextName } : a)));
                      }}
                      className="bg-transparent text-xs font-medium w-28 focus:outline-none focus:text-cyan-300"
                    />
                    <span className="text-[11px] font-mono text-slate-400">{anim.frames.length}f</span>
                  </div>
                ))}
              </div>
            </div>

            {activeAnim && (
              <div className="pt-3 border-t border-slate-800 space-y-2.5">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Speed (FPS)</label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={activeAnim.speed}
                    onChange={(e) => {
                      const spd = Math.max(0, Number(e.target.value));
                      setAnimations((prev) =>
                        prev.map((a, i) => (i === activeAnimIdx ? { ...a, speed: spd } : a))
                      );
                    }}
                    className="w-full px-2.5 py-1 text-xs font-mono bg-[#14161b] border border-slate-700 rounded text-slate-100"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activeAnim.loop}
                    onChange={(e) =>
                      setAnimations((prev) =>
                        prev.map((a, i) => (i === activeAnimIdx ? { ...a, loop: e.target.checked } : a))
                      )
                    }
                  />
                  Loop animation
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activeAnim.pingPong}
                    onChange={(e) =>
                      setAnimations((prev) =>
                        prev.map((a, i) => (i === activeAnimIdx ? { ...a, pingPong: e.target.checked } : a))
                      )
                    }
                  />
                  Ping-pong
                </label>
                <button
                  type="button"
                  onClick={() => setDefaultAnimation(activeAnim.name)}
                  className={`w-full py-1.5 text-xs rounded border ${
                    defaultAnimation === activeAnim.name
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                      : 'bg-[#14161b] border-slate-700 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {defaultAnimation === activeAnim.name ? 'Default Animation' : 'Set as Default'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
