import React, { useEffect, useRef, useState } from 'react';
import { AudioWaveform, Play, Plus, Shuffle, Trash2, Volume2, X } from 'lucide-react';
import { generateSfxWavDataUrl, renderSfxPcm, SFX_PRESETS, SfxParams } from '../engine/sfxSynth';
import { AudioAsset } from '../engine/types';
import { uid } from './helpers';

interface SfxStudioModalProps {
  audioAssets: AudioAsset[];
  onClose: () => void;
  onAddAsset: (asset: AudioAsset) => void;
  onDeleteAsset: (id: string) => void;
}

const WAVEFORMS: { id: SfxParams['waveform']; label: string }[] = [
  { id: 'square', label: 'Square' },
  { id: 'sawtooth', label: 'Sawtooth' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'sine', label: 'Sine' },
  { id: 'noise', label: 'Noise' },
];

export const SfxStudioModal: React.FC<SfxStudioModalProps> = ({
  audioAssets,
  onClose,
  onAddAsset,
  onDeleteAsset,
}) => {
  const [params, setParams] = useState<SfxParams>(() => SFX_PRESETS.coin());
  const [assetName, setAssetName] = useState(() => `sfx_${audioAssets.length + 1}`);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const canvas = waveCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pcm = renderSfxPcm(params, 22050);
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0f1218';
    ctx.fillRect(0, 0, w, h);

    // Center line
    ctx.strokeStyle = 'rgba(148,163,184,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.5);
    ctx.lineTo(w, h * 0.5);
    ctx.stroke();

    // Waveform envelope
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const step = Math.max(1, Math.floor(pcm.length / w));
    for (let x = 0; x < w; x++) {
      const idx = Math.min(pcm.length - 1, x * step);
      const y = h * 0.5 - pcm[idx] * (h * 0.44);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [params]);

  const getAudioContext = (): AudioContext | null => {
    if (!audioCtxRef.current) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) audioCtxRef.current = new Ctx();
    }
    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  };

  const handlePlay = (overrideParams?: SfxParams) => {
    const ctx = getAudioContext();
    if (!ctx) return;
    const p = overrideParams || params;
    const pcm = renderSfxPcm(p, ctx.sampleRate);
    const buffer = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
    buffer.getChannelData(0).set(pcm);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start();
  };

  const handlePlaySavedAsset = async (asset: AudioAsset) => {
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const res = await fetch(asset.dataUrl);
      const arr = await res.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arr);
      const src = ctx.createBufferSource();
      src.buffer = decoded;
      src.connect(ctx.destination);
      src.start();
    } catch {
      // ignore invalid buffer
    }
  };

  const handlePreset = (key: string) => {
    const next = SFX_PRESETS[key]();
    setParams(next);
    setAssetName(`${key}_${audioAssets.length + 1}`);
    handlePlay(next);
  };

  const handleRandomize = () => {
    const waves: SfxParams['waveform'][] = ['square', 'sawtooth', 'triangle', 'sine', 'noise'];
    const next: SfxParams = {
      waveform: waves[Math.floor(Math.random() * waves.length)],
      baseFreq: Math.round(120 + Math.random() * 1100),
      freqSlide: Math.round((Math.random() * 2 - 1) * 1200),
      dutyCycle: Number((0.15 + Math.random() * 0.7).toFixed(2)),
      attackTime: Number((0.005 + Math.random() * 0.05).toFixed(3)),
      sustainTime: Number((0.02 + Math.random() * 0.16).toFixed(2)),
      decayTime: Number((0.06 + Math.random() * 0.35).toFixed(2)),
      vibratoSpeed: Math.random() > 0.6 ? Math.round(Math.random() * 24) : 0,
      vibratoDepth: Math.random() > 0.6 ? Math.round(Math.random() * 60) : 0,
      volume: 0.65,
    };
    setParams(next);
    handlePlay(next);
  };

  const handleSaveAsset = () => {
    const cleanName = assetName.trim().replace(/[^a-zA-Z0-9_-]/g, '') || `sfx_${audioAssets.length + 1}`;
    const dataUrl = generateSfxWavDataUrl(params);
    onAddAsset({
      id: uid('sfx'),
      name: cleanName,
      dataUrl,
    });
    setAssetName(`sfx_${audioAssets.length + 2}`);
    setSavedNotice(`Saved "${cleanName}" (use Audio -> Play audio asset)`);
    window.setTimeout(() => setSavedNotice(null), 2600);
  };

  const renderSlider = (
    label: string,
    key: keyof SfxParams,
    min: number,
    max: number,
    step: number,
    unit = ''
  ) => (
    <div key={key} className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-slate-400">{label}</span>
        <span className="font-mono text-cyan-300 tabular-nums">
          {params[key]}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Number(params[key])}
        onChange={(e) => setParams((p) => ({ ...p, [key]: Number(e.target.value) }))}
        className="w-full accent-cyan-400 cursor-pointer"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="w-full max-w-4xl bg-[#1a1d24] border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-[#21252e]">
          <div className="flex items-center gap-2.5">
            <AudioWaveform className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-slate-100">8-Bit SFX Studio</h2>
            <span className="text-xs text-slate-400">Procedural Chiptune Synthesizer &amp; WAV Exporter</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-100 rounded-md hover:bg-slate-700/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-800 overflow-y-auto">
          {/* Left: Presets + Saved Project Audio */}
          <div className="md:col-span-4 p-4 space-y-5 bg-[#181a20]">
            <div>
              <div className="text-xs font-semibold text-slate-300 mb-2">Retro Presets</div>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.keys(SFX_PRESETS).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handlePreset(key)}
                    className="px-2.5 py-1.5 text-xs font-medium capitalize text-left rounded-lg bg-[#14161b] border border-slate-800 hover:border-cyan-500/60 text-slate-200 hover:text-cyan-300 transition-colors"
                  >
                    {key}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleRandomize}
                  className="flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-indigo-500/15 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/25"
                >
                  <Shuffle className="w-3 h-3" /> Random
                </button>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800">
              <div className="text-xs font-semibold text-slate-300 mb-2">
                Project Audio Assets ({audioAssets.length})
              </div>
              {audioAssets.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No custom WAV assets saved yet. Save a sound to use it in Event Sheets.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {audioAssets.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-[#14161b] border border-slate-800 text-xs"
                    >
                      <span className="font-mono text-slate-200 truncate">{a.name}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handlePlaySavedAsset(a)}
                          className="p-1 text-cyan-400 hover:text-cyan-300"
                          title="Play Asset"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteAsset(a.id)}
                          className="p-1 text-slate-500 hover:text-rose-400"
                          title="Delete Asset"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Waveform + Parameters */}
          <div className="md:col-span-8 p-5 space-y-5">
            <div className="rounded-lg border border-slate-800 bg-[#0f1218] p-3">
              <canvas ref={waveCanvasRef} width={520} height={88} className="w-full h-22 block" />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400 mr-1">Waveform:</span>
              {WAVEFORMS.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setParams((p) => ({ ...p, waveform: w.id }))}
                  className={`px-3 py-1 text-xs font-medium rounded-lg border transition-colors ${
                    params.waveform === w.id
                      ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-300'
                      : 'bg-[#14161b] border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              {renderSlider('Base Frequency', 'baseFreq', 40, 2000, 10, ' Hz')}
              {renderSlider('Frequency Slide', 'freqSlide', -1500, 1500, 25, ' Hz/s')}
              {renderSlider('Square Duty Cycle', 'dutyCycle', 0.1, 0.9, 0.05)}
              {renderSlider('Master Volume', 'volume', 0.1, 1.0, 0.05)}
              {renderSlider('Attack Time', 'attackTime', 0.002, 0.25, 0.005, ' s')}
              {renderSlider('Sustain Time', 'sustainTime', 0.01, 0.5, 0.01, ' s')}
              {renderSlider('Decay Time', 'decayTime', 0.02, 1.0, 0.02, ' s')}
              {renderSlider('Vibrato Speed', 'vibratoSpeed', 0, 30, 1, ' Hz')}
              {renderSlider('Vibrato Depth', 'vibratoDepth', 0, 100, 2, ' Hz')}
            </div>

            <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => handlePlay()}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg"
              >
                <Play className="w-3.5 h-3.5 fill-current" /> Audition Sound
              </button>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={assetName}
                  onChange={(e) => setAssetName(e.target.value)}
                  placeholder="sfx_name"
                  className="w-40 px-3 py-1.5 text-xs font-mono bg-[#14161b] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                />
                <button
                  type="button"
                  onClick={handleSaveAsset}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-lg"
                >
                  <Plus className="w-3.5 h-3.5" /> Save to Project
                </button>
              </div>
            </div>
            {savedNotice && <p className="text-xs text-emerald-400">{savedNotice}</p>}
          </div>
        </div>
      </div>
    </div>
  );
};
