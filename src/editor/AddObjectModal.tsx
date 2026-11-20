import React, { useState } from 'react';
import { BarChart3, Box, Grid, Map as MapIcon, MousePointerClick, SlidersHorizontal, Sparkles, Type, X } from 'lucide-react';
import { generateDefaultTilesetDataUrl } from '../engine/tilemap';
import { ObjectType, PluginType } from '../engine/types';
import { uid } from './helpers';

interface AddObjectModalProps {
  existingNames: string[];
  onClose: () => void;
  onAdd: (ot: ObjectType) => void;
}

type VisualPluginOption =
  | 'Sprite'
  | 'TiledBackground'
  | 'Text'
  | 'Particles'
  | 'Tilemap'
  | 'Button'
  | 'Slider'
  | 'ProgressBar';

function makeStarterTexture(color: string, isTiled: boolean): string {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 32, 32);
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 30, 30);
  if (isTiled) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillRect(16, 16, 16, 16);
  }
  return canvas.toDataURL('image/png');
}

const VISUAL_PLUGINS: {
  plugin: VisualPluginOption;
  title: string;
  desc: string;
  icon: React.ReactNode;
}[] = [
  {
    plugin: 'Sprite',
    title: 'Sprite',
    desc: 'Animated 2D character, item, enemy, or projectile with custom pixel art and origins.',
    icon: <Box className="w-5 h-5 text-cyan-400" />,
  },
  {
    plugin: 'TiledBackground',
    title: 'Tiled Background',
    desc: 'Repeating textured surface for floors, walls, platforms, and backgrounds.',
    icon: <Grid className="w-5 h-5 text-indigo-400" />,
  },
  {
    plugin: 'Tilemap',
    title: 'Tilemap',
    desc: 'Grid-based level terrain with paintable tiles and per-tile Solid collisions.',
    icon: <MapIcon className="w-5 h-5 text-lime-400" />,
  },
  {
    plugin: 'Text',
    title: 'Text',
    desc: 'Dynamic text display with BBCode styling ([b], [i], [color=#...]).',
    icon: <Type className="w-5 h-5 text-emerald-400" />,
  },
  {
    plugin: 'Particles',
    title: 'Particles',
    desc: 'Configurable continuous or one-shot particle burst emitter.',
    icon: <Sparkles className="w-5 h-5 text-amber-400" />,
  },
  {
    plugin: 'Button',
    title: 'UI Button',
    desc: 'Interactive clickable GUI button with hover/pressed states and click trigger.',
    icon: <MousePointerClick className="w-5 h-5 text-sky-400" />,
  },
  {
    plugin: 'Slider',
    title: 'UI Slider',
    desc: 'Draggable range slider control for volume, speed, or time-scale tuning.',
    icon: <SlidersHorizontal className="w-5 h-5 text-violet-400" />,
  },
  {
    plugin: 'ProgressBar',
    title: 'Progress Bar',
    desc: 'Animated percentage bar for health, XP, stamina, or loading gauges.',
    icon: <BarChart3 className="w-5 h-5 text-rose-400" />,
  },
];

export const AddObjectModal: React.FC<AddObjectModalProps> = ({ existingNames, onClose, onAdd }) => {
  const [selectedPlugin, setSelectedPlugin] = useState<PluginType>('Sprite');
  const [name, setName] = useState(() => {
    let i = 1;
    while (existingNames.includes(`Sprite${i}`)) i++;
    return `Sprite${i}`;
  });
  const [color, setColor] = useState('#22d3ee');

  const handleSelectPlugin = (plugin: VisualPluginOption) => {
    setSelectedPlugin(plugin);
    let i = 1;
    const base = plugin === 'TiledBackground' ? 'TiledBg' : plugin;
    while (existingNames.includes(`${base}${i}`)) i++;
    setName(`${base}${i}`);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim().replace(/[^a-zA-Z0-9_]/g, '') || 'Object';
    const finalName = existingNames.includes(cleanName) ? `${cleanName}_${Date.now().toString().slice(-3)}` : cleanName;

    const id = uid('obj');
    if (selectedPlugin === 'Sprite') {
      const dataUrl = makeStarterTexture(color, false);
      onAdd({
        id,
        name: finalName,
        plugin: 'Sprite',
        defaultWidth: 32,
        defaultHeight: 32,
        instVarDefs: [],
        behaviorDefs: [],
        spriteConfig: {
          defaultAnimation: 'Default',
          animations: [
            {
              name: 'Default',
              speed: 6,
              loop: true,
              repeatCount: 1,
              pingPong: false,
              frames: [{ id: uid('f'), dataUrl, width: 32, height: 32, originX: 0.5, originY: 0.5 }],
            },
          ],
        },
      });
    } else if (selectedPlugin === 'TiledBackground') {
      const dataUrl = makeStarterTexture(color, true);
      onAdd({
        id,
        name: finalName,
        plugin: 'TiledBackground',
        defaultWidth: 160,
        defaultHeight: 32,
        instVarDefs: [],
        behaviorDefs: [],
        tiledBgConfig: { imageDataUrl: dataUrl, imageWidth: 32, imageHeight: 32 },
      });
    } else if (selectedPlugin === 'Tilemap') {
      onAdd({
        id,
        name: finalName,
        plugin: 'Tilemap',
        defaultWidth: 512,
        defaultHeight: 384,
        instVarDefs: [],
        behaviorDefs: [],
        tilemapConfig: {
          tilesetDataUrl: generateDefaultTilesetDataUrl(),
          tileWidth: 32,
          tileHeight: 32,
          columns: 16,
          rows: 12,
          solidTiles: [1, 2, 3, 4],
        },
      });
    } else if (selectedPlugin === 'Text') {
      onAdd({
        id,
        name: finalName,
        plugin: 'Text',
        defaultWidth: 200,
        defaultHeight: 36,
        instVarDefs: [],
        behaviorDefs: [],
        textConfig: {
          initialText: 'Text',
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          fontSize: 18,
          color: '#f8fafc',
          bold: false,
          italic: false,
          align: 'left',
          verticalAlign: 'top',
          lineHeight: 1.25,
        },
      });
    } else if (selectedPlugin === 'Button') {
      onAdd({
        id,
        name: finalName,
        plugin: 'Button',
        defaultWidth: 130,
        defaultHeight: 34,
        instVarDefs: [],
        behaviorDefs: [],
        buttonConfig: {
          text: finalName,
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          fontSize: 13,
          textColor: '#f8fafc',
          bgColor: color === '#22d3ee' ? '#0369a1' : color,
          hoverBgColor: '#0284c7',
          activeBgColor: '#075985',
          borderRadius: 6,
        },
      });
    } else if (selectedPlugin === 'Slider') {
      onAdd({
        id,
        name: finalName,
        plugin: 'Slider',
        defaultWidth: 150,
        defaultHeight: 24,
        instVarDefs: [],
        behaviorDefs: [],
        sliderConfig: {
          min: 0,
          max: 100,
          step: 1,
          initialValue: 50,
          trackColor: '#1e293b',
          fillColor: color,
          thumbColor: '#f8fafc',
        },
      });
    } else if (selectedPlugin === 'ProgressBar') {
      onAdd({
        id,
        name: finalName,
        plugin: 'ProgressBar',
        defaultWidth: 160,
        defaultHeight: 20,
        instVarDefs: [],
        behaviorDefs: [],
        progressBarConfig: {
          initialProgress: 100,
          bgColor: '#0f172a',
          fillColor: color === '#22d3ee' ? '#10b981' : color,
          borderRadius: 6,
          showText: true,
        },
      });
    } else {
      onAdd({
        id,
        name: finalName,
        plugin: 'Particles',
        defaultWidth: 32,
        defaultHeight: 32,
        instVarDefs: [],
        behaviorDefs: [],
        particlesConfig: {
          rate: 25,
          sprayCone: 60,
          type: 'continuous',
          speed: 120,
          size: 5,
          opacity: 100,
          lifetime: 0.7,
          acceleration: -50,
          gravity: 100,
          angleRandomiser: 0,
          speedRandomiser: 30,
          sizeRandomiser: 2,
          growRate: -4,
          color,
        },
      });
    }
    onClose();
  };

  const needsColor = !['Text', 'Tilemap'].includes(selectedPlugin);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <form
        onSubmit={handleCreate}
        className="w-full max-w-2xl bg-[#1a1d24] border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-[#21252e]">
          <h2 className="text-sm font-semibold text-slate-100">Create New Object Type</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-100 rounded-md hover:bg-slate-700/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {VISUAL_PLUGINS.map((item) => {
              const active = selectedPlugin === item.plugin;
              return (
                <button
                  key={item.plugin}
                  type="button"
                  onClick={() => handleSelectPlugin(item.plugin)}
                  className={`text-left p-3 rounded-lg border transition-colors ${
                    active
                      ? 'bg-cyan-500/10 border-cyan-500/70 text-slate-100'
                      : 'bg-[#14161b] border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5 mb-1">
                    {item.icon}
                    <span className="text-sm font-semibold">{item.title}</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{item.desc}</p>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-3 gap-3 pt-1">
            <div className={needsColor ? 'col-span-2' : 'col-span-3'}>
              <label className="block text-xs font-medium text-slate-400 mb-1">Object Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm bg-[#14161b] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                placeholder="e.g. Hero, Laser, LevelTiles, PlayBtn"
              />
            </div>
            {needsColor && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Base Color</label>
                <div className="flex items-center gap-2 px-2 py-1.5 bg-[#14161b] border border-slate-700 rounded-lg">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-6 h-6 bg-transparent border-0 cursor-pointer"
                  />
                  <span className="text-xs font-mono text-slate-300">{color}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-800 bg-[#181a20]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-slate-300 hover:text-white rounded-lg hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-1.5 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg"
          >
            Insert Object
          </button>
        </div>
      </form>
    </div>
  );
};
