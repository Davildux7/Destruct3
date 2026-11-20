import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Grid, Magnet, Maximize2, Minus, Plus } from 'lucide-react';
import { parseBBCodeLines } from '../engine/runtime';
import { generateDefaultTilesetDataUrl } from '../engine/tilemap';
import { InstanceData, LayoutData, ObjectType, ProjectData } from '../engine/types';
import { TilemapPainter } from './TilemapPainter';

interface LayoutViewProps {
  project: ProjectData;
  layout: LayoutData;
  activeLayerId: string;
  selectedInstanceUids: number[];
  onSelectInstances: (uids: number[]) => void;
  onUpdateInstances: (updater: (instances: InstanceData[], layerId: string) => InstanceData[], layerId?: string) => void;
  onUpdateObjectType: (ot: ObjectType) => void;
  onDropNewObject: (objectTypeId: string, x: number, y: number) => void;
  onDuplicateSelected: () => void;
  onDeleteSelected: () => void;
  onDoubleClickSprite: (ot: ObjectType) => void;
}

type DragMode =
  | { kind: 'none' }
  | { kind: 'pan'; startX: number; startY: number; origCamX: number; origCamY: number }
  | { kind: 'move'; startWorldX: number; startWorldY: number; origPositions: Map<number, { x: number; y: number }> }
  | {
      kind: 'resize';
      handle: string;
      uid: number;
      startWorldX: number;
      startWorldY: number;
      origX: number;
      origY: number;
      origW: number;
      origH: number;
      originX: number;
      originY: number;
    }
  | { kind: 'rotate'; uid: number; cx: number; cy: number };

function getInstanceOrigin(inst: InstanceData, ot?: ObjectType): { ox: number; oy: number } {
  if (ot?.plugin === 'Sprite' && ot.spriteConfig?.animations.length) {
    const anim =
      ot.spriteConfig.animations.find((a) => a.name === ot.spriteConfig?.defaultAnimation) ||
      ot.spriteConfig.animations[0];
    const frame = anim?.frames[0];
    if (frame) return { ox: frame.originX, oy: frame.originY };
    return { ox: 0.5, oy: 0.5 };
  }
  return { ox: 0, oy: 0 };
}

function getInstanceBounds(inst: InstanceData, ot?: ObjectType) {
  const { ox, oy } = getInstanceOrigin(inst, ot);
  const left = inst.x - ox * inst.width;
  const top = inst.y - oy * inst.height;
  return { left, top, right: left + inst.width, bottom: top + inst.height, ox, oy };
}

export const LayoutView: React.FC<LayoutViewProps> = ({
  project,
  layout,
  activeLayerId,
  selectedInstanceUids,
  onSelectInstances,
  onUpdateInstances,
  onUpdateObjectType,
  onDropNewObject,
  onDuplicateSelected,
  onDeleteSelected,
  onDoubleClickSprite,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const defaultTilesetRef = useRef<string | null>(null);

  const [zoom, setZoom] = useState(1);
  const [camX, setCamX] = useState(layout.width * 0.25);
  const [camY, setCamY] = useState(layout.height * 0.5);
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [gridSize, setGridSize] = useState(16);
  const [spacePressed, setSpacePressed] = useState(false);
  const [cursorWorld, setCursorWorld] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [tilePaintMode, setTilePaintMode] = useState(false);
  const [selectedTileIndex, setSelectedTileIndex] = useState(1);

  const isPaintingTileRef = useRef(false);
  const paintTileValueRef = useRef(1);
  const dragRef = useRef<DragMode>({ kind: 'none' });
  const [, forceRender] = useState(0);

  const selectedTilemapInfo = useMemo(() => {
    if (selectedInstanceUids.length !== 1) return null;
    const uid = selectedInstanceUids[0];
    for (const layer of layout.layers) {
      const inst = layer.instances.find((i) => i.uid === uid);
      if (inst) {
        const ot = project.objectTypes.find((o) => o.id === inst.objectTypeId);
        if (ot?.plugin === 'Tilemap') {
          return { inst, ot, layerId: layer.id };
        }
        return null;
      }
    }
    return null;
  }, [layout.layers, project.objectTypes, selectedInstanceUids]);

  useEffect(() => {
    if (!selectedTilemapInfo) {
      setTilePaintMode(false);
    }
  }, [selectedTilemapInfo]);

  const fitView = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const pad = 64;
    const z = Math.max(
      0.25,
      Math.min(2, Math.min((el.clientWidth - pad) / layout.width, (el.clientHeight - pad) / layout.height))
    );
    setZoom(Number(z.toFixed(2)));
    setCamX(layout.width * 0.5);
    setCamY(layout.height * 0.5);
  }, [layout.width, layout.height]);

  useEffect(() => {
    fitView();
  }, [layout.id, fitView]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      if (e.code === 'Space') {
        setSpacePressed(true);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedInstanceUids.length > 0) {
        e.preventDefault();
        onDeleteSelected();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && selectedInstanceUids.length > 0) {
        e.preventDefault();
        onDuplicateSelected();
      } else if (
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) &&
        selectedInstanceUids.length > 0
      ) {
        e.preventDefault();
        const step = e.shiftKey ? gridSize : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        onUpdateInstances((list) =>
          list.map((inst) =>
            selectedInstanceUids.includes(inst.uid)
              ? { ...inst, x: inst.x + dx, y: inst.y + dy }
              : inst
          )
        );
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpacePressed(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [selectedInstanceUids, gridSize, onDeleteSelected, onDuplicateSelected, onUpdateInstances]);

  const screenToWorld = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return {
      x: (sx - canvas.width * 0.5) / zoom + camX,
      y: (sy - canvas.height * 0.5) / zoom + camY,
    };
  };

  const snapVal = (v: number) => (snapToGrid ? Math.round(v / gridSize) * gridSize : Math.round(v));

  // Find topmost unlocked instance at point
  const findInstanceAt = (wx: number, wy: number): { inst: InstanceData; layerId: string } | null => {
    for (let li = layout.layers.length - 1; li >= 0; li--) {
      const layer = layout.layers[li];
      if (!layer.visible || layer.locked) continue;
      for (let ii = layer.instances.length - 1; ii >= 0; ii--) {
        const inst = layer.instances[ii];
        const ot = project.objectTypes.find((o) => o.id === inst.objectTypeId);
        const b = getInstanceBounds(inst, ot);
        if (wx >= b.left && wx <= b.right && wy >= b.top && wy <= b.bottom) {
          return { inst, layerId: layer.id };
        }
      }
    }
    return null;
  };

  const findSelectedInstance = (): InstanceData | null => {
    if (selectedInstanceUids.length !== 1) return null;
    const uid = selectedInstanceUids[0];
    for (const layer of layout.layers) {
      const found = layer.instances.find((i) => i.uid === uid);
      if (found) return found;
    }
    return null;
  };

  const hitTestHandles = (wx: number, wy: number): { kind: 'resize' | 'rotate'; handle: string; inst: InstanceData } | null => {
    const inst = findSelectedInstance();
    if (!inst) return null;
    const ot = project.objectTypes.find((o) => o.id === inst.objectTypeId);
    const b = getInstanceBounds(inst, ot);
    const r = 7 / zoom;

    const rotX = (b.left + b.right) * 0.5;
    const rotY = b.top - 22 / zoom;
    if (Math.hypot(wx - rotX, wy - rotY) <= r * 1.4) {
      return { kind: 'rotate', handle: 'rot', inst };
    }

    const handles: [string, number, number][] = [
      ['nw', b.left, b.top],
      ['n', (b.left + b.right) * 0.5, b.top],
      ['ne', b.right, b.top],
      ['e', b.right, (b.top + b.bottom) * 0.5],
      ['se', b.right, b.bottom],
      ['s', (b.left + b.right) * 0.5, b.bottom],
      ['sw', b.left, b.bottom],
      ['w', b.left, (b.top + b.bottom) * 0.5],
    ];
    for (const [name, hx, hy] of handles) {
      if (Math.abs(wx - hx) <= r && Math.abs(wy - hy) <= r) {
        return { kind: 'resize', handle: name, inst };
      }
    }
    return null;
  };

  const paintTileAtWorld = (wx: number, wy: number, tileVal: number) => {
    if (!selectedTilemapInfo) return;
    const { inst, ot, layerId } = selectedTilemapInfo;
    const cfg = ot.tilemapConfig;
    if (!cfg) return;
    const tw = cfg.tileWidth || 32;
    const th = cfg.tileHeight || 32;
    const mw = inst.mapWidth || cfg.columns || 16;
    const mh = inst.mapHeight || cfg.rows || 12;
    const col = Math.floor((wx - inst.x) / tw);
    const row = Math.floor((wy - inst.y) / th);
    if (col < 0 || row < 0 || col >= mw || row >= mh) return;
    const idx = row * mw + col;
    const existing = inst.tileData?.[idx] ?? -1;
    if (existing === tileVal) return;

    onUpdateInstances(
      (list) =>
        list.map((item) => {
          if (item.uid !== inst.uid) return item;
          const nextData = item.tileData ? [...item.tileData] : new Array(mw * mh).fill(-1);
          nextData[idx] = tileVal;
          return { ...item, mapWidth: mw, mapHeight: mh, tileData: nextData };
        }),
      layerId
    );
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const world = screenToWorld(e.clientX, e.clientY);

    if (e.button === 1 || (e.button === 0 && spacePressed)) {
      e.preventDefault();
      dragRef.current = {
        kind: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        origCamX: camX,
        origCamY: camY,
      };
      return;
    }

    if (tilePaintMode && selectedTilemapInfo && (e.button === 0 || e.button === 2)) {
      e.preventDefault();
      const val = e.button === 2 ? -1 : selectedTileIndex;
      isPaintingTileRef.current = true;
      paintTileValueRef.current = val;
      paintTileAtWorld(world.x, world.y, val);
      return;
    }

    if (e.button !== 0) return;

    // Check resize / rotate handles first
    const handleHit = hitTestHandles(world.x, world.y);
    if (handleHit) {
      const ot = project.objectTypes.find((o) => o.id === handleHit.inst.objectTypeId);
      const b = getInstanceBounds(handleHit.inst, ot);
      if (handleHit.kind === 'rotate') {
        dragRef.current = {
          kind: 'rotate',
          uid: handleHit.inst.uid,
          cx: (b.left + b.right) * 0.5,
          cy: (b.top + b.bottom) * 0.5,
        };
      } else {
        dragRef.current = {
          kind: 'resize',
          handle: handleHit.handle,
          uid: handleHit.inst.uid,
          startWorldX: world.x,
          startWorldY: world.y,
          origX: handleHit.inst.x,
          origY: handleHit.inst.y,
          origW: handleHit.inst.width,
          origH: handleHit.inst.height,
          originX: b.ox,
          originY: b.oy,
        };
      }
      return;
    }

    const hit = findInstanceAt(world.x, world.y);
    if (hit) {
      let nextSelected = selectedInstanceUids;
      if (e.shiftKey) {
        nextSelected = selectedInstanceUids.includes(hit.inst.uid)
          ? selectedInstanceUids.filter((u) => u !== hit.inst.uid)
          : [...selectedInstanceUids, hit.inst.uid];
      } else if (!selectedInstanceUids.includes(hit.inst.uid)) {
        nextSelected = [hit.inst.uid];
      }
      onSelectInstances(nextSelected);

      const origPositions = new Map<number, { x: number; y: number }>();
      for (const layer of layout.layers) {
        for (const i of layer.instances) {
          if (nextSelected.includes(i.uid)) {
            origPositions.set(i.uid, { x: i.x, y: i.y });
          }
        }
      }
      dragRef.current = {
        kind: 'move',
        startWorldX: world.x,
        startWorldY: world.y,
        origPositions,
      };
    } else {
      onSelectInstances([]);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const world = screenToWorld(e.clientX, e.clientY);
    setCursorWorld({ x: Math.round(world.x), y: Math.round(world.y) });

    if (isPaintingTileRef.current && tilePaintMode && selectedTilemapInfo) {
      paintTileAtWorld(world.x, world.y, paintTileValueRef.current);
      return;
    }

    const d = dragRef.current;
    if (d.kind === 'none') return;

    if (d.kind === 'pan') {
      const dx = (e.clientX - d.startX) / zoom;
      const dy = (e.clientY - d.startY) / zoom;
      setCamX(d.origCamX - dx);
      setCamY(d.origCamY - dy);
    } else if (d.kind === 'move') {
      const dx = world.x - d.startWorldX;
      const dy = world.y - d.startWorldY;
      onUpdateInstances((list) =>
        list.map((inst) => {
          const orig = d.origPositions.get(inst.uid);
          if (!orig) return inst;
          return {
            ...inst,
            x: snapVal(orig.x + dx),
            y: snapVal(orig.y + dy),
          };
        })
      );
    } else if (d.kind === 'resize') {
      const dx = world.x - d.startWorldX;
      const dy = world.y - d.startWorldY;
      onUpdateInstances((list) =>
        list.map((inst) => {
          if (inst.uid !== d.uid) return inst;
          let nw = d.origW;
          let nh = d.origH;
          let nx = d.origX;
          let ny = d.origY;

          if (d.handle.includes('e')) {
            nw = Math.max(8, snapVal(d.origW + dx));
            nx = d.origX + (nw - d.origW) * d.originX;
          }
          if (d.handle.includes('w')) {
            const delta = snapVal(dx);
            nw = Math.max(8, d.origW - delta);
            nx = d.origX + (d.origW - nw) * (1 - d.originX);
          }
          if (d.handle.includes('s')) {
            nh = Math.max(8, snapVal(d.origH + dy));
            ny = d.origY + (nh - d.origH) * d.originY;
          }
          if (d.handle.includes('n')) {
            const delta = snapVal(dy);
            nh = Math.max(8, d.origH - delta);
            ny = d.origY + (d.origH - nh) * (1 - d.originY);
          }
          return { ...inst, x: Math.round(nx), y: Math.round(ny), width: nw, height: nh };
        })
      );
    } else if (d.kind === 'rotate') {
      const ang = ((Math.atan2(world.y - d.cy, world.x - d.cx) * 180) / Math.PI + 90 + 360) % 360;
      const snappedAng = e.shiftKey ? Math.round(ang / 15) * 15 : Math.round(ang);
      onUpdateInstances((list) =>
        list.map((inst) => (inst.uid === d.uid ? { ...inst, angle: snappedAng } : inst))
      );
    }
  };

  const handleMouseUp = () => {
    isPaintingTileRef.current = false;
    dragRef.current = { kind: 'none' };
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    setZoom((z) => Math.max(0.2, Math.min(4, Number((z * factor).toFixed(2)))));
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const world = screenToWorld(e.clientX, e.clientY);
    const hit = findInstanceAt(world.x, world.y);
    if (hit) {
      const ot = project.objectTypes.find((o) => o.id === hit.inst.objectTypeId);
      if (ot && ot.plugin === 'Sprite') {
        onDoubleClickSprite(ot);
      }
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const otId = e.dataTransfer.getData('application/x-openconstruct-object');
    if (!otId) return;
    const world = screenToWorld(e.clientX, e.clientY);
    onDropNewObject(otId, snapVal(world.x), snapVal(world.y));
  };

  // Canvas resize & render loop
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      draw();
    };

    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#0e1015';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.translate(canvas.width * 0.5, canvas.height * 0.5);
      ctx.scale(zoom, zoom);
      ctx.translate(-camX, -camY);

      // Layout background
      ctx.fillStyle = layout.backgroundColor || '#0b0f19';
      ctx.fillRect(0, 0, layout.width, layout.height);

      // Grid
      if (showGrid && gridSize * zoom >= 6) {
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
        ctx.lineWidth = 1 / zoom;
        for (let x = 0; x <= layout.width; x += gridSize) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, layout.height);
          ctx.stroke();
        }
        for (let y = 0; y <= layout.height; y += gridSize) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(layout.width, y);
          ctx.stroke();
        }
      }

      // Render layers
      for (const layer of layout.layers) {
        if (!layer.visible) continue;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity / 100));

        for (const inst of layer.instances) {
          const ot = project.objectTypes.find((o) => o.id === inst.objectTypeId);
          if (!ot) continue;
          const { ox, oy } = getInstanceOrigin(inst, ot);

          ctx.save();
          ctx.globalAlpha *= Math.max(0, Math.min(1, inst.opacity / 100)) * (inst.visible ? 1 : 0.35);
          ctx.translate(inst.x, inst.y);
          if (inst.angle !== 0) ctx.rotate((inst.angle * Math.PI) / 180);
          ctx.scale(inst.mirrored ? -1 : 1, inst.flipped ? -1 : 1);

          const drawX = -ox * inst.width;
          const drawY = -oy * inst.height;

          if (ot.plugin === 'Sprite') {
            const anim =
              ot.spriteConfig?.animations.find((a) => a.name === ot.spriteConfig?.defaultAnimation) ||
              ot.spriteConfig?.animations[0];
            const url = anim?.frames[0]?.dataUrl;
            if (url) {
              let img = imgCacheRef.current.get(url);
              if (!img) {
                img = new Image();
                img.onload = () => forceRender((n) => n + 1);
                img.src = url;
                imgCacheRef.current.set(url, img);
              }
              if (img.complete && img.naturalWidth > 0) {
                ctx.imageSmoothingEnabled = !project.pixelRounding;
                ctx.drawImage(img, drawX, drawY, inst.width, inst.height);
              } else {
                ctx.fillStyle = '#38bdf8';
                ctx.fillRect(drawX, drawY, inst.width, inst.height);
              }
            } else {
              ctx.fillStyle = 'rgba(34,211,238,0.25)';
              ctx.fillRect(drawX, drawY, inst.width, inst.height);
              ctx.strokeStyle = '#22d3ee';
              ctx.lineWidth = 1 / zoom;
              ctx.strokeRect(drawX, drawY, inst.width, inst.height);
            }
          } else if (ot.plugin === 'TiledBackground') {
            const url = ot.tiledBgConfig?.imageDataUrl;
            if (url) {
              let img = imgCacheRef.current.get(url);
              if (!img) {
                img = new Image();
                img.onload = () => forceRender((n) => n + 1);
                img.src = url;
                imgCacheRef.current.set(url, img);
              }
              if (img.complete && img.naturalWidth > 0) {
                const pat = ctx.createPattern(img, 'repeat');
                if (pat) {
                  ctx.fillStyle = pat;
                  ctx.fillRect(0, 0, inst.width, inst.height);
                }
              }
            } else {
              ctx.fillStyle = '#334155';
              ctx.fillRect(0, 0, inst.width, inst.height);
            }
          } else if (ot.plugin === 'Text') {
            const cfg = ot.textConfig;
            const fontSize = cfg?.fontSize ?? 16;
            const fontFamily = cfg?.fontFamily || 'Plus Jakarta Sans, sans-serif';
            const lines = parseBBCodeLines(
              inst.textOverride ?? cfg?.initialText ?? 'Text',
              cfg?.bold ?? false,
              cfg?.italic ?? false,
              cfg?.color ?? '#f8fafc'
            );
            ctx.textBaseline = 'top';
            let cy = 0;
            const lh = fontSize * (cfg?.lineHeight ?? 1.25);
            for (const segs of lines) {
              let cx = 0;
              let lw = 0;
              for (const s of segs) {
                ctx.font = `${s.italic ? 'italic ' : ''}${s.bold ? 'bold ' : ''}${fontSize}px ${fontFamily}`;
                lw += ctx.measureText(s.text).width;
              }
              if (cfg?.align === 'center') cx = (inst.width - lw) * 0.5;
              else if (cfg?.align === 'right') cx = inst.width - lw;
              for (const s of segs) {
                ctx.font = `${s.italic ? 'italic ' : ''}${s.bold ? 'bold ' : ''}${fontSize}px ${fontFamily}`;
                ctx.fillStyle = s.color;
                ctx.fillText(s.text, cx, cy);
                cx += ctx.measureText(s.text).width;
              }
              cy += lh;
            }
            ctx.strokeStyle = 'rgba(148,163,184,0.25)';
            ctx.setLineDash([4 / zoom, 3 / zoom]);
            ctx.strokeRect(0, 0, inst.width, inst.height);
            ctx.setLineDash([]);
          } else if (ot.plugin === 'Particles') {
            const pColor = ot.particlesConfig?.color || '#fbbf24';
            ctx.fillStyle = pColor;
            ctx.globalAlpha *= 0.35;
            ctx.fillRect(0, 0, inst.width, inst.height);
            ctx.globalAlpha = 1;
            ctx.strokeStyle = pColor;
            ctx.lineWidth = 1.5 / zoom;
            ctx.strokeRect(0, 0, inst.width, inst.height);
          } else if (ot.plugin === 'Tilemap') {
            const cfg = ot.tilemapConfig;
            const tileData = inst.tileData;
            if (cfg) {
              const tw = cfg.tileWidth || 32;
              const th = cfg.tileHeight || 32;
              const mw = inst.mapWidth || cfg.columns || 16;
              const mh = inst.mapHeight || cfg.rows || 12;
              if (!defaultTilesetRef.current) {
                defaultTilesetRef.current = generateDefaultTilesetDataUrl();
              }
              const url = cfg.tilesetDataUrl || defaultTilesetRef.current;
              let img = url ? imgCacheRef.current.get(url) : undefined;
              if (url && !img) {
                img = new Image();
                img.onload = () => forceRender((n) => n + 1);
                img.src = url;
                imgCacheRef.current.set(url, img);
              }
              ctx.imageSmoothingEnabled = false;
              const srcTileW = cfg.sourceTileWidth || 16;
              const srcTileH = cfg.sourceTileHeight || srcTileW;
              const minValidTile = cfg.allowZeroTile ? 0 : 1;
              if (tileData) {
                for (let r = 0; r < mh; r++) {
                  for (let c = 0; c < mw; c++) {
                    const tileId = tileData[r * mw + c];
                    if (tileId === undefined || tileId < minValidTile) continue;
                    const dx = c * tw;
                    const dy = r * th;
                    if (img && img.complete && img.naturalWidth > 0) {
                      const tilesPerRow = Math.max(1, Math.floor(img.naturalWidth / srcTileW));
                      const sx = (tileId % tilesPerRow) * srcTileW;
                      const sy = Math.floor(tileId / tilesPerRow) * srcTileH;
                      ctx.drawImage(img, sx, sy, srcTileW, srcTileH, dx, dy, tw, th);
                    } else {
                      ctx.fillStyle = '#475569';
                      ctx.fillRect(dx, dy, tw, th);
                    }
                  }
                }
              }
              // Faint tilemap outline/grid when selected or painting
              if (selectedInstanceUids.includes(inst.uid)) {
                ctx.strokeStyle = tilePaintMode ? 'rgba(132, 204, 22, 0.25)' : 'rgba(148, 163, 184, 0.2)';
                ctx.lineWidth = 1 / zoom;
                for (let c = 0; c <= mw; c++) {
                  ctx.beginPath();
                  ctx.moveTo(c * tw, 0);
                  ctx.lineTo(c * tw, mh * th);
                  ctx.stroke();
                }
                for (let r = 0; r <= mh; r++) {
                  ctx.beginPath();
                  ctx.moveTo(0, r * th);
                  ctx.lineTo(mw * tw, r * th);
                  ctx.stroke();
                }
              }
            }
          } else if (ot.plugin === 'Button') {
            const cfg = ot.buttonConfig;
            const radius = cfg?.borderRadius ?? 6;
            ctx.beginPath();
            ctx.roundRect(0, 0, inst.width, inst.height, radius);
            ctx.fillStyle = cfg?.bgColor || '#0369a1';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.22)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = cfg?.textColor || '#ffffff';
            ctx.font = `600 ${cfg?.fontSize ?? 13}px ${cfg?.fontFamily || 'sans-serif'}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(inst.textOverride ?? cfg?.text ?? 'Button', inst.width * 0.5, inst.height * 0.5);
          } else if (ot.plugin === 'Slider') {
            const cfg = ot.sliderConfig;
            const min = cfg?.min ?? 0;
            const max = cfg?.max ?? 100;
            const val = cfg?.initialValue ?? 50;
            const ratio = max > min ? Math.max(0, Math.min(1, (val - min) / (max - min))) : 0.5;
            const trackH = Math.max(6, inst.height * 0.32);
            const trackY = (inst.height - trackH) * 0.5;
            ctx.beginPath();
            ctx.roundRect(0, trackY, inst.width, trackH, trackH * 0.5);
            ctx.fillStyle = cfg?.trackColor || '#1e293b';
            ctx.fill();
            ctx.beginPath();
            ctx.roundRect(0, trackY, inst.width * ratio, trackH, trackH * 0.5);
            ctx.fillStyle = cfg?.fillColor || '#06b6d4';
            ctx.fill();
            const thumbR = Math.max(7, inst.height * 0.42);
            ctx.beginPath();
            ctx.arc(inst.width * ratio, inst.height * 0.5, thumbR, 0, Math.PI * 2);
            ctx.fillStyle = cfg?.thumbColor || '#f8fafc';
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = cfg?.fillColor || '#06b6d4';
            ctx.stroke();
          } else if (ot.plugin === 'ProgressBar') {
            const cfg = ot.progressBarConfig;
            const val = Math.max(0, Math.min(100, cfg?.initialProgress ?? 100));
            const radius = cfg?.borderRadius ?? 6;
            ctx.beginPath();
            ctx.roundRect(0, 0, inst.width, inst.height, radius);
            ctx.fillStyle = cfg?.bgColor || '#0f172a';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.15)';
            ctx.lineWidth = 1;
            ctx.stroke();
            if (val > 0) {
              ctx.beginPath();
              ctx.roundRect(
                2,
                2,
                Math.max(4, (inst.width - 4) * (val / 100)),
                Math.max(2, inst.height - 4),
                Math.max(2, radius - 2)
              );
              ctx.fillStyle = cfg?.fillColor || '#10b981';
              ctx.fill();
            }
            if (cfg?.showText !== false) {
              ctx.fillStyle = '#f8fafc';
              ctx.font = 'bold 11px sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(`${Math.round(val)}%`, inst.width * 0.5, inst.height * 0.5);
            }
          }

          ctx.restore();
        }
        ctx.restore();
      }

      // Tilemap Paint Cursor Highlight
      if (tilePaintMode && selectedTilemapInfo) {
        const { inst, ot } = selectedTilemapInfo;
        const cfg = ot.tilemapConfig;
        if (cfg) {
          const tw = cfg.tileWidth || 32;
          const th = cfg.tileHeight || 32;
          const mw = inst.mapWidth || cfg.columns || 16;
          const mh = inst.mapHeight || cfg.rows || 12;
          const col = Math.floor((cursorWorld.x - inst.x) / tw);
          const row = Math.floor((cursorWorld.y - inst.y) / th);
          if (col >= 0 && row >= 0 && col < mw && row < mh) {
            ctx.save();
            ctx.strokeStyle = selectedTileIndex === -1 ? '#f43f5e' : '#84cc16';
            ctx.fillStyle = selectedTileIndex === -1 ? 'rgba(244,63,94,0.2)' : 'rgba(132,204,22,0.22)';
            ctx.lineWidth = 2 / zoom;
            ctx.fillRect(inst.x + col * tw, inst.y + row * th, tw, th);
            ctx.strokeRect(inst.x + col * tw, inst.y + row * th, tw, th);
            ctx.restore();
          }
        }
      }

      // Layout border
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.5 / zoom;
      ctx.strokeRect(0, 0, layout.width, layout.height);

      // Dashed original Viewport outline
      ctx.save();
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.75)';
      ctx.lineWidth = 1.5 / zoom;
      ctx.setLineDash([6 / zoom, 5 / zoom]);
      ctx.strokeRect(0, 0, project.viewportWidth, project.viewportHeight);
      ctx.restore();

      // Selection gizmos & resize handles
      for (const layer of layout.layers) {
        for (const inst of layer.instances) {
          if (!selectedInstanceUids.includes(inst.uid)) continue;
          const ot = project.objectTypes.find((o) => o.id === inst.objectTypeId);
          const b = getInstanceBounds(inst, ot);

          ctx.save();
          ctx.strokeStyle = '#22d3ee';
          ctx.lineWidth = 1.5 / zoom;
          ctx.strokeRect(b.left, b.top, inst.width, inst.height);

          if (selectedInstanceUids.length === 1 && !tilePaintMode) {
            const hs = 6 / zoom;
            const pts: [number, number][] = [
              [b.left, b.top],
              [(b.left + b.right) * 0.5, b.top],
              [b.right, b.top],
              [b.right, (b.top + b.bottom) * 0.5],
              [b.right, b.bottom],
              [(b.left + b.right) * 0.5, b.bottom],
              [b.left, b.bottom],
              [b.left, (b.top + b.bottom) * 0.5],
            ];
            ctx.fillStyle = '#0f172a';
            for (const [hx, hy] of pts) {
              ctx.fillRect(hx - hs * 0.5, hy - hs * 0.5, hs, hs);
              ctx.strokeRect(hx - hs * 0.5, hy - hs * 0.5, hs, hs);
            }

            // Rotation handle
            const rx = (b.left + b.right) * 0.5;
            const ry = b.top - 22 / zoom;
            ctx.beginPath();
            ctx.moveTo(rx, b.top);
            ctx.lineTo(rx, ry);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(rx, ry, 4.5 / zoom, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      ctx.restore();
    };

    resize();
    const obs = new ResizeObserver(resize);
    obs.observe(container);
    return () => obs.disconnect();
  }, [
    project,
    layout,
    zoom,
    camX,
    camY,
    showGrid,
    gridSize,
    selectedInstanceUids,
    activeLayerId,
    tilePaintMode,
    selectedTileIndex,
    cursorWorld,
    selectedTilemapInfo,
  ]);

  return (
    <div className="flex flex-col h-full bg-[#14161b]">
      {/* Layout Toolbar */}
      <div className="h-10 px-3 border-b border-slate-800 bg-[#181a20] flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.2, Number((z - 0.15).toFixed(2))))}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-300"
            title="Zoom Out"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs font-mono text-slate-300 w-12 text-center tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(4, Number((z + 0.15).toFixed(2))))}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-300"
            title="Zoom In"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={fitView}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-slate-800 text-slate-300"
          >
            <Maximize2 className="w-3 h-3" /> Fit
          </button>

          <div className="h-4 w-px bg-slate-800 mx-1" />

          <button
            type="button"
            onClick={() => setShowGrid((v) => !v)}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded border ${
              showGrid
                ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Grid className="w-3.5 h-3.5" /> Grid
          </button>
          <button
            type="button"
            onClick={() => setSnapToGrid((v) => !v)}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded border ${
              snapToGrid
                ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Magnet className="w-3.5 h-3.5" /> Snap
          </button>
          <select
            value={gridSize}
            onChange={(e) => setGridSize(Number(e.target.value))}
            className="px-2 py-0.5 text-xs font-mono bg-[#14161b] border border-slate-700 rounded text-slate-300"
          >
            {[8, 16, 32, 64].map((g) => (
              <option key={g} value={g}>
                {g}px
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400 font-mono tabular-nums">
          <span>
            Cursor: {cursorWorld.x}, {cursorWorld.y}
          </span>
          <span>·</span>
          <span>Space+Drag to Pan · Drag Objects from Left Bar</span>
        </div>
      </div>

      {/* Canvas Container */}
      <div ref={containerRef} className="relative flex-1 min-h-0 overflow-hidden">
        {selectedTilemapInfo && (
          <TilemapPainter
            objectType={selectedTilemapInfo.ot}
            paintMode={tilePaintMode}
            selectedTileIndex={selectedTileIndex}
            onTogglePaintMode={setTilePaintMode}
            onSelectTile={setSelectedTileIndex}
            onUpdateObjectType={onUpdateObjectType}
            onClearMap={() => {
              const { inst, ot, layerId } = selectedTilemapInfo;
              const mw = inst.mapWidth || ot.tilemapConfig?.columns || 16;
              const mh = inst.mapHeight || ot.tilemapConfig?.rows || 12;
              onUpdateInstances(
                (list) =>
                  list.map((item) =>
                    item.uid === inst.uid
                      ? { ...item, tileData: new Array(mw * mh).fill(-1) }
                      : item
                  ),
                layerId
              );
            }}
          />
        )}
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onContextMenu={(e) => {
            if (tilePaintMode) e.preventDefault();
          }}
          onWheel={handleWheel}
          onDoubleClick={handleDoubleClick}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className={`block w-full h-full ${
            spacePressed ? 'cursor-grab' : tilePaintMode ? 'cursor-crosshair' : 'cursor-default'
          }`}
        />
      </div>
    </div>
  );
};
