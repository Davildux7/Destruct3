import React, { useMemo } from 'react';
import { Eraser, Paintbrush, ShieldAlert, Trash2, X } from 'lucide-react';
import { generateDefaultTilesetDataUrl } from '../engine/tilemap';
import { ObjectType } from '../engine/types';

interface TilemapPainterProps {
  objectType: ObjectType;
  paintMode: boolean;
  selectedTileIndex: number;
  onTogglePaintMode: (active: boolean) => void;
  onSelectTile: (tileIndex: number) => void;
  onUpdateObjectType: (ot: ObjectType) => void;
  onClearMap: () => void;
}

const DEFAULT_TILE_LABELS = [
  'Empty',
  'Grass',
  'Dirt',
  'Stone',
  'Tech Metal',
  'Spikes',
  'Coin',
  'Ladder',
];

export const TilemapPainter: React.FC<TilemapPainterProps> = ({
  objectType,
  paintMode,
  selectedTileIndex,
  onTogglePaintMode,
  onSelectTile,
  onUpdateObjectType,
  onClearMap,
}) => {
  const cfg = objectType.tilemapConfig;
  const tilesetUrl = useMemo(
    () => cfg?.tilesetDataUrl || generateDefaultTilesetDataUrl(),
    [cfg?.tilesetDataUrl]
  );

  const solidSet = useMemo(() => new Set(cfg?.solidTiles || [1, 2, 3, 4]), [cfg?.solidTiles]);

  const toggleSolidTile = (idx: number) => {
    if (!cfg) return;
    const next = new Set(solidSet);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    onUpdateObjectType({
      ...objectType,
      tilemapConfig: {
        ...cfg,
        solidTiles: Array.from(next).sort((a, b) => a - b),
      },
    });
  };

  return (
    <div className="absolute top-3 left-3 z-20 w-64 bg-[#181a20]/95 backdrop-blur-xs border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden text-xs select-none">
      <div className="px-3 py-2 border-b border-slate-800 bg-[#21252e] flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-semibold text-slate-100">
          <Paintbrush className="w-3.5 h-3.5 text-cyan-400" />
          <span className="truncate">Tilemap: {objectType.name}</span>
        </div>
        <button
          type="button"
          onClick={() => onTogglePaintMode(!paintMode)}
          className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
            paintMode
              ? 'bg-emerald-500 text-slate-950'
              : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
          }`}
        >
          {paintMode ? 'Painting ON' : 'Paint Tiles'}
        </button>
      </div>

      {paintMode && (
        <div className="p-2.5 space-y-2.5">
          <div className="flex items-center justify-between gap-1.5">
            <button
              type="button"
              onClick={() => onSelectTile(-1)}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded border font-medium ${
                selectedTileIndex === -1
                  ? 'bg-rose-500/20 border-rose-500/60 text-rose-300'
                  : 'bg-[#14161b] border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <Eraser className="w-3.5 h-3.5" /> Eraser
            </button>
            <button
              type="button"
              onClick={onClearMap}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#14161b] border border-slate-800 hover:border-rose-500/60 text-slate-400 hover:text-rose-300"
              title="Clear All Tiles"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear
            </button>
            <button
              type="button"
              onClick={() => onTogglePaintMode(false)}
              className="p-1.5 rounded bg-[#14161b] border border-slate-800 text-slate-400 hover:text-white"
              title="Exit Paint Mode"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7].map((tileIdx) => {
              const active = selectedTileIndex === tileIdx;
              const isSolid = solidSet.has(tileIdx);
              return (
                <div key={tileIdx} className="flex flex-col items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onSelectTile(tileIdx)}
                    title={`${DEFAULT_TILE_LABELS[tileIdx] || `Tile ${tileIdx}`}`}
                    className={`w-full aspect-square rounded border flex items-center justify-center bg-[#0f1218] overflow-hidden relative ${
                      active
                        ? 'border-cyan-400 ring-2 ring-cyan-500/40'
                        : 'border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        backgroundImage: `url(${tilesetUrl})`,
                        backgroundSize: '256px 32px',
                        backgroundPosition: `-${tileIdx * 32}px 0px`,
                        imageRendering: 'pixelated',
                      }}
                    />
                    {isSolid && (
                      <span
                        className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-amber-400"
                        title="Solid tile"
                      />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleSolidTile(tileIdx)}
                    className={`w-full text-[10px] py-0.5 rounded truncate border ${
                      isSolid
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                        : 'bg-[#14161b] border-slate-800 text-slate-500'
                    }`}
                    title="Click to toggle Solid collision for this tile"
                  >
                    {DEFAULT_TILE_LABELS[tileIdx] || `#${tileIdx}`}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 pt-1 border-t border-slate-800/80">
            <ShieldAlert className="w-3 h-3 text-amber-400 shrink-0" />
            <span>Click canvas to paint · Right-click to erase · Click tile labels to toggle Solid</span>
          </div>
        </div>
      )}
    </div>
  );
};
