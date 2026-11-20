import { AABB, CollidableRect } from './collision';
import { RuntimeInstance } from './runtimeTypes';

/**
 * Creates a default procedural 8-tile retro 16x16 pixel-art tileset as DataURL:
 * 0: Empty/Air
 * 1: Grass Top (green on dirt)
 * 2: Dirt Block (brown earth)
 * 3: Stone / Cobblestone (grey pattern)
 * 4: Tech Metal / Steel Plate (cyan borders)
 * 5: Hazard Spikes (red/orange warning)
 * 6: Gold Coin / Gem (yellow shimmer)
 * 7: Wooden Ladder (brown rungs)
 */
export function generateDefaultTilesetDataUrl(): string {
  const tileSize = 16;
  const numTiles = 8;
  const canvas = document.createElement('canvas');
  canvas.width = tileSize * numTiles;
  canvas.height = tileSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.imageSmoothingEnabled = false;

  for (let idx = 0; idx < numTiles; idx++) {
    const x = idx * tileSize;
    if (idx === 0) {
      // Empty / transparent
      continue;
    } else if (idx === 1) {
      // Grass top
      ctx.fillStyle = '#65a30d'; // grass
      ctx.fillRect(x, 0, tileSize, 5);
      ctx.fillStyle = '#84cc16'; // grass highlight
      ctx.fillRect(x, 0, tileSize, 2);
      ctx.fillStyle = '#78350f'; // dirt body
      ctx.fillRect(x, 5, tileSize, 11);
      ctx.fillStyle = '#92400e'; // dirt pebble
      ctx.fillRect(x + 4, 8, 3, 3);
      ctx.fillRect(x + 10, 11, 2, 2);
    } else if (idx === 2) {
      // Dirt block
      ctx.fillStyle = '#78350f';
      ctx.fillRect(x, 0, tileSize, tileSize);
      ctx.fillStyle = '#92400e';
      ctx.fillRect(x + 2, 2, 4, 3);
      ctx.fillRect(x + 9, 7, 5, 4);
      ctx.fillRect(x + 3, 11, 3, 3);
      ctx.fillStyle = '#451a03';
      ctx.fillRect(x + 8, 2, 2, 2);
      ctx.fillRect(x + 1, 8, 2, 2);
    } else if (idx === 3) {
      // Stone
      ctx.fillStyle = '#475569';
      ctx.fillRect(x, 0, tileSize, tileSize);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(x + 1, 1, 6, 6);
      ctx.fillRect(x + 8, 1, 7, 6);
      ctx.fillRect(x + 1, 8, 7, 7);
      ctx.fillRect(x + 9, 8, 6, 7);
      ctx.fillStyle = '#1e293b';
      ctx.strokeRect(x + 0.5, 0.5, tileSize - 1, tileSize - 1);
    } else if (idx === 4) {
      // Tech Metal
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(x, 0, tileSize, tileSize);
      ctx.fillStyle = '#06b6d4';
      ctx.fillRect(x + 1, 1, tileSize - 2, tileSize - 2);
      ctx.fillStyle = '#083344';
      ctx.fillRect(x + 3, 3, tileSize - 6, tileSize - 6);
      ctx.fillStyle = '#22d3ee';
      ctx.fillRect(x + 2, 2, 2, 2);
      ctx.fillRect(x + tileSize - 4, tileSize - 4, 2, 2);
    } else if (idx === 5) {
      // Hazard Spikes
      ctx.fillStyle = '#00000000';
      ctx.clearRect(x, 0, tileSize, tileSize);
      ctx.fillStyle = '#ef4444';
      // 3 spikes
      for (let s = 0; s < 3; s++) {
        const sx = x + s * 5;
        ctx.beginPath();
        ctx.moveTo(sx, 16);
        ctx.lineTo(sx + 2.5, 3);
        ctx.lineTo(sx + 5, 16);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = '#f87171';
      for (let s = 0; s < 3; s++) {
        const sx = x + s * 5;
        ctx.fillRect(sx + 2, 4, 1, 5);
      }
    } else if (idx === 6) {
      // Gold Coin
      ctx.fillStyle = '#00000000';
      ctx.clearRect(x, 0, tileSize, tileSize);
      ctx.fillStyle = '#eab308';
      ctx.beginPath();
      ctx.arc(x + 8, 8, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(x + 7, 7, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#a16207';
      ctx.strokeRect(x + 6, 5, 4, 6);
    } else if (idx === 7) {
      // Wooden Ladder
      ctx.fillStyle = '#00000000';
      ctx.clearRect(x, 0, tileSize, tileSize);
      ctx.fillStyle = '#b45309';
      ctx.fillRect(x + 2, 0, 3, tileSize);
      ctx.fillRect(x + 11, 0, 3, tileSize);
      ctx.fillStyle = '#d97706';
      ctx.fillRect(x + 4, 3, 8, 2);
      ctx.fillRect(x + 4, 8, 8, 2);
      ctx.fillRect(x + 4, 13, 8, 2);
    }
  }

  return canvas.toDataURL('image/png');
}

export function getTilemapSolidRects(inst: RuntimeInstance): CollidableRect[] {
  const cfg = inst.objectType.tilemapConfig;
  const tileData = inst.tileData;
  if (!cfg || !tileData || tileData.length === 0) return [];

  const mapCols = inst.mapWidth || Math.max(1, Math.floor(inst.width / cfg.tileWidth));
  const mapRows = inst.mapHeight || Math.max(1, Math.floor(inst.height / cfg.tileHeight));
  const solidSet = new Set(cfg.solidTiles || [1, 2, 3, 4, 5]);
  const minValid = cfg.allowZeroTile ? 0 : 1;

  const rects: CollidableRect[] = [];
  for (let r = 0; r < mapRows; r++) {
    for (let c = 0; c < mapCols; c++) {
      const idx = r * mapCols + c;
      const tileId = tileData[idx];
      if (tileId !== undefined && tileId >= minValid && solidSet.has(tileId)) {
        rects.push({
          x: inst.x + c * cfg.tileWidth,
          y: inst.y + r * cfg.tileHeight,
          width: cfg.tileWidth,
          height: cfg.tileHeight,
          angle: 0,
          originX: 0,
          originY: 0,
        });
      }
    }
  }
  return rects;
}

export function getTilemapSolidAABBs(inst: RuntimeInstance): AABB[] {
  const cfg = inst.objectType.tilemapConfig;
  const tileData = inst.tileData;
  if (!cfg || !tileData || tileData.length === 0) return [];

  const mapCols = inst.mapWidth || Math.max(1, Math.floor(inst.width / cfg.tileWidth));
  const mapRows = inst.mapHeight || Math.max(1, Math.floor(inst.height / cfg.tileHeight));
  const solidSet = new Set(cfg.solidTiles || [1, 2, 3, 4, 5]);
  const minValid = cfg.allowZeroTile ? 0 : 1;

  const boxes: AABB[] = [];
  for (let r = 0; r < mapRows; r++) {
    for (let c = 0; c < mapCols; c++) {
      const idx = r * mapCols + c;
      const tileId = tileData[idx];
      if (tileId !== undefined && tileId >= minValid && solidSet.has(tileId)) {
        const left = inst.x + c * cfg.tileWidth;
        const top = inst.y + r * cfg.tileHeight;
        boxes.push({
          left,
          top,
          right: left + cfg.tileWidth,
          bottom: top + cfg.tileHeight,
        });
      }
    }
  }
  return boxes;
}
