import React, { useEffect, useRef, useState } from 'react';
import {
  Bug,
  Gamepad2,
  Pause,
  Play,
  RotateCcw,
  Sliders,
  Sparkles,
  StepForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { GameRuntime } from '../engine/runtime';
import { ProjectData, VarValue } from '../engine/types';

interface PreviewModalProps {
  project: ProjectData;
  startLayoutId?: string;
  onClose: () => void;
}

type DebuggerSnapshot = ReturnType<GameRuntime['getDebuggerState']>;

export const PreviewModal: React.FC<PreviewModalProps> = ({ project, startLayoutId, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<GameRuntime | null>(null);

  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showDebugger, setShowDebugger] = useState(true);
  const [debugTab, setDebugTab] = useState<'vars' | 'instances' | 'shaders'>('vars');
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [instanceQuery, setInstanceQuery] = useState('');
  const [, forceRefresh] = useState(0);

  const [dbg, setDbg] = useState<DebuggerSnapshot>({
    fps: 60,
    objectCount: 0,
    tickCount: 0,
    gameTime: 0,
    timeScale: 1,
    paused: false,
    layoutName: '',
    scrollX: 0,
    scrollY: 0,
    globalVars: {},
    instances: [],
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const previewProject: ProjectData = startLayoutId
      ? { ...project, startupLayoutId: startLayoutId }
      : project;

    const runtime = new GameRuntime(previewProject, canvas);
    runtimeRef.current = runtime;
    runtime.start();
    canvas.focus();

    const statsInterval = window.setInterval(() => {
      setDbg(runtime.getDebuggerState());
    }, 120);

    return () => {
      window.clearInterval(statsInterval);
      runtime.destroy();
      runtimeRef.current = null;
    };
  }, [project, startLayoutId]);

  const togglePause = () => {
    const rt = runtimeRef.current;
    if (!rt) return;
    const next = !paused;
    rt.setPaused(next);
    setPaused(next);
    setDbg(rt.getDebuggerState());
  };

  const handleStepFrame = () => {
    const rt = runtimeRef.current;
    if (!rt) return;
    if (!rt.isPaused()) {
      rt.pause();
      setPaused(true);
    }
    rt.stepSingleFrame();
    setDbg(rt.getDebuggerState());
  };

  const toggleMute = () => {
    const rt = runtimeRef.current;
    if (!rt) return;
    const next = !muted;
    rt.audio.setMuted(next);
    setMuted(next);
  };

  const handleRestart = () => {
    runtimeRef.current?.restartLayout();
    canvasRef.current?.focus();
  };

  const pp = runtimeRef.current?.project.postProcessSettings || project.postProcessSettings;
  const vj = runtimeRef.current?.project.virtualJoystickSettings || project.virtualJoystickSettings;

  const updateLivePostProcess = (
    key: 'enabled' | 'bloom' | 'crtScanlines' | 'vignette' | 'chromaticAberration',
    val: boolean
  ) => {
    const rt = runtimeRef.current;
    if (!rt) return;
    if (!rt.project.postProcessSettings) {
      rt.project.postProcessSettings = {
        enabled: true,
        bloom: false,
        bloomIntensity: 0.85,
        crtScanlines: false,
        crtCurvature: 0.25,
        vignette: false,
        vignetteStrength: 0.35,
        chromaticAberration: false,
        chromaticOffset: 2,
        pixelate: 1,
      };
    }
    rt.project.postProcessSettings[key] = val;
    if (key !== 'enabled' && val) {
      rt.project.postProcessSettings.enabled = true;
    }
    forceRefresh((n) => n + 1);
  };

  const updateLiveJoystick = (enabled: boolean) => {
    const rt = runtimeRef.current;
    if (!rt) return;
    if (!rt.project.virtualJoystickSettings) {
      rt.project.virtualJoystickSettings = {
        enabled,
        deadzone: 0.15,
        size: 54,
        showActionButtons: true,
      };
    } else {
      rt.project.virtualJoystickSettings.enabled = enabled;
    }
    forceRefresh((n) => n + 1);
  };

  const filteredInstances = dbg.instances.filter((i) => {
    if (!instanceQuery.trim()) return true;
    const q = instanceQuery.toLowerCase();
    return i.name.toLowerCase().includes(q) || String(i.uid).includes(q) || i.plugin.toLowerCase().includes(q);
  });

  const activeInst = dbg.instances.find((i) => i.uid === selectedUid) || null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0d0f14]/95 backdrop-blur-xs">
      {/* Top Preview Control Bar */}
      <div className="h-12 px-4 border-b border-slate-800 bg-[#181a20] flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <span className="text-sm font-semibold text-slate-100 truncate">
            Preview · {project.name}
          </span>
          <div className="flex items-center gap-2.5 text-xs font-mono text-slate-400 tabular-nums">
            <span>FPS: <strong className="text-emerald-400">{dbg.fps}</strong></span>
            <span>·</span>
            <span>Objects: <strong className="text-cyan-300">{dbg.objectCount}</strong></span>
            <span>·</span>
            <span>Ticks: <strong className="text-slate-200">{dbg.tickCount}</strong></span>
            <span>·</span>
            <span>Time: <strong className="text-slate-200">{dbg.gameTime.toFixed(1)}s</strong></span>
            <span>·</span>
            <span>Scale: <strong className="text-amber-300">{dbg.timeScale.toFixed(2)}x</strong></span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={togglePause}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#21252e] hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-200"
          >
            {paused ? <Play className="w-3.5 h-3.5 text-emerald-400" /> : <Pause className="w-3.5 h-3.5 text-amber-400" />}
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button
            type="button"
            onClick={handleStepFrame}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-[#21252e] hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-200"
            title="Step Single Frame"
          >
            <StepForward className="w-3.5 h-3.5 text-cyan-400" /> Step
          </button>
          <button
            type="button"
            onClick={handleRestart}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#21252e] hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-200"
          >
            <RotateCcw className="w-3.5 h-3.5 text-cyan-400" /> Restart
          </button>
          <button
            type="button"
            onClick={toggleMute}
            className="p-1.5 bg-[#21252e] hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-200"
            title={muted ? 'Unmute Audio' : 'Mute Audio'}
          >
            {muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
          </button>
          <button
            type="button"
            onClick={() => setShowDebugger((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg ${
              showDebugger
                ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                : 'bg-[#21252e] border-slate-700 text-slate-300'
            }`}
          >
            <Bug className="w-3.5 h-3.5" /> Debugger
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 rounded-lg"
          >
            <X className="w-3.5 h-3.5" /> Close
          </button>
        </div>
      </div>

      {/* Main Viewport + Live Debugger */}
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 flex items-center justify-center p-6 overflow-hidden">
          <canvas
            ref={canvasRef}
            tabIndex={0}
            style={{
              aspectRatio: `${project.viewportWidth} / ${project.viewportHeight}`,
              maxWidth: '100%',
              maxHeight: '100%',
              imageRendering: project.pixelRounding ? 'pixelated' : 'auto',
            }}
            className="bg-black rounded-lg border border-slate-800 shadow-2xl focus:outline-none focus:ring-2 focus:ring-cyan-500/60"
          />
        </div>

        {showDebugger && (
          <aside className="w-80 border-l border-slate-800 bg-[#181a20] flex flex-col shrink-0 min-h-0">
            {/* Debugger Tabs */}
            <div className="grid grid-cols-3 border-b border-slate-800 bg-[#14161b] text-xs font-medium">
              <button
                type="button"
                onClick={() => setDebugTab('vars')}
                className={`py-2 flex items-center justify-center gap-1 border-b-2 transition-colors ${
                  debugTab === 'vars'
                    ? 'border-cyan-400 text-cyan-300 bg-[#181a20]'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" /> Watch
              </button>
              <button
                type="button"
                onClick={() => setDebugTab('instances')}
                className={`py-2 flex items-center justify-center gap-1 border-b-2 transition-colors ${
                  debugTab === 'instances'
                    ? 'border-indigo-400 text-indigo-300 bg-[#181a20]'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Bug className="w-3.5 h-3.5" /> Inspect ({dbg.instances.length})
              </button>
              <button
                type="button"
                onClick={() => setDebugTab('shaders')}
                className={`py-2 flex items-center justify-center gap-1 border-b-2 transition-colors ${
                  debugTab === 'shaders'
                    ? 'border-emerald-400 text-emerald-300 bg-[#181a20]'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" /> FX &amp; Pad
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
              {debugTab === 'vars' && (
                <>
                  <div>
                    <h3 className="text-xs font-semibold text-slate-300 mb-2">Live Global Variables</h3>
                    {Object.keys(dbg.globalVars).length === 0 ? (
                      <p className="text-xs text-slate-500">No global variables in project.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {Object.entries(dbg.globalVars).map(([name, val]) => (
                          <div
                            key={name}
                            className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-[#14161b] border border-slate-800 text-xs"
                          >
                            <span className="text-slate-300 truncate">{name}</span>
                            <input
                              type="text"
                              value={String(val)}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const def = project.globalVariables.find((g) => g.name === name);
                                const parsed =
                                  def?.type === 'number'
                                    ? Number(raw) || 0
                                    : def?.type === 'boolean'
                                    ? raw === 'true'
                                    : raw;
                                runtimeRef.current?.setGlobalVar(name, parsed);
                                if (runtimeRef.current) setDbg(runtimeRef.current.getDebuggerState());
                              }}
                              className="w-24 px-1.5 py-0.5 text-right font-mono bg-[#181a20] border border-slate-700 rounded text-cyan-300 tabular-nums"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-800 text-xs space-y-1 font-mono text-slate-400 tabular-nums">
                    <div className="font-sans font-semibold text-slate-300 mb-1">Camera &amp; Layout</div>
                    <div className="flex justify-between">
                      <span>Layout:</span>
                      <span className="text-slate-200">{dbg.layoutName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Scroll:</span>
                      <span className="text-slate-200">{dbg.scrollX}, {dbg.scrollY}</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800 text-xs text-slate-400 space-y-1.5">
                    <div className="font-semibold text-slate-300">Controls</div>
                    <p>Click the game canvas to focus keyboard input.</p>
                    <p className="font-mono text-[11px] text-slate-400">
                      Move: Arrow Keys / WASD<br />
                      Jump: Space / Up / W<br />
                      Drag Physics Crates with Mouse
                    </p>
                  </div>
                </>
              )}

              {debugTab === 'instances' && (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={instanceQuery}
                    onChange={(e) => setInstanceQuery(e.target.value)}
                    placeholder="Filter instances by name or #uid..."
                    className="w-full px-2.5 py-1.5 text-xs bg-[#14161b] border border-slate-700 rounded text-slate-100 focus:outline-none focus:border-cyan-500"
                  />

                  <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
                    {filteredInstances.map((inst) => {
                      const active = inst.uid === selectedUid;
                      return (
                        <button
                          key={inst.uid}
                          type="button"
                          onClick={() => setSelectedUid(inst.uid)}
                          className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs border text-left ${
                            active
                              ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-200'
                              : 'bg-[#14161b] border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <span className="truncate font-medium">
                            #{inst.uid} {inst.name}
                          </span>
                          <span className="font-mono text-[10px] text-slate-400 shrink-0 tabular-nums">
                            {Math.round(inst.x)},{Math.round(inst.y)}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {activeInst && (
                    <div className="pt-3 border-t border-slate-800 space-y-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-cyan-300">
                          #{activeInst.uid} {activeInst.name}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">{activeInst.plugin}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {(
                          [
                            ['x', activeInst.x],
                            ['y', activeInst.y],
                            ['angle', activeInst.angle],
                            ['opacity', activeInst.opacity],
                          ] as [string, number][]
                        ).map(([prop, val]) => (
                          <div key={prop}>
                            <label className="block text-[10px] text-slate-400 uppercase">{prop}</label>
                            <input
                              type="number"
                              value={val}
                              onChange={(e) => {
                                runtimeRef.current?.setInstanceProp(activeInst.uid, prop, Number(e.target.value) || 0);
                                if (runtimeRef.current) setDbg(runtimeRef.current.getDebuggerState());
                              }}
                              className="w-full px-2 py-1 font-mono bg-[#14161b] border border-slate-700 rounded text-slate-100 tabular-nums"
                            />
                          </div>
                        ))}
                      </div>

                      <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={activeInst.visible}
                          onChange={(e) => {
                            runtimeRef.current?.setInstanceProp(activeInst.uid, 'visible', e.target.checked);
                            if (runtimeRef.current) setDbg(runtimeRef.current.getDebuggerState());
                          }}
                        />
                        Visible
                      </label>

                      {activeInst.behaviors.length > 0 && (
                        <div className="text-[11px] text-slate-400">
                          Behaviors:{' '}
                          <span className="text-slate-200 font-mono">{activeInst.behaviors.join(', ')}</span>
                        </div>
                      )}

                      {Object.keys(activeInst.instVars).length > 0 && (
                        <div className="space-y-1.5 pt-2 border-t border-slate-800">
                          <div className="text-[11px] font-semibold text-slate-400">Instance Variables</div>
                          {Object.entries(activeInst.instVars).map(([k, v]) => (
                            <div key={k} className="flex items-center justify-between gap-2">
                              <span className="text-slate-300 truncate">{k}</span>
                              <input
                                type="text"
                                value={String(v)}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  let parsed: VarValue = raw;
                                  if (typeof v === 'number') parsed = Number(raw) || 0;
                                  else if (typeof v === 'boolean') parsed = raw === 'true';
                                  runtimeRef.current?.setInstanceProp(activeInst.uid, k, parsed);
                                  if (runtimeRef.current) setDbg(runtimeRef.current.getDebuggerState());
                                }}
                                className="w-24 px-1.5 py-0.5 text-right font-mono bg-[#14161b] border border-slate-700 rounded text-cyan-300"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {debugTab === 'shaders' && (
                <div className="space-y-4 text-xs">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-cyan-300 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" /> WebGL2 Shaders (Live)
                      </span>
                      <input
                        type="checkbox"
                        checked={Boolean(pp?.enabled)}
                        onChange={(e) => updateLivePostProcess('enabled', e.target.checked)}
                      />
                    </div>
                    {(
                      [
                        ['bloom', 'Bloom Glow'],
                        ['crtScanlines', 'CRT Scanlines & Curvature'],
                        ['vignette', 'Cinematic Vignette'],
                        ['chromaticAberration', 'Chromatic Aberration'],
                      ] as const
                    ).map(([key, label]) => (
                      <label
                        key={key}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded bg-[#14161b] border border-slate-800 text-slate-200 cursor-pointer"
                      >
                        <span>{label}</span>
                        <input
                          type="checkbox"
                          checked={Boolean(pp?.[key])}
                          onChange={(e) => updateLivePostProcess(key, e.target.checked)}
                        />
                      </label>
                    ))}
                  </div>

                  <div className="pt-3 border-t border-slate-800 space-y-2">
                    <div className="font-semibold text-indigo-300 flex items-center gap-1.5">
                      <Gamepad2 className="w-3.5 h-3.5" /> On-Screen Touch Pad
                    </div>
                    <label className="flex items-center justify-between px-2.5 py-1.5 rounded bg-[#14161b] border border-slate-800 text-slate-200 cursor-pointer">
                      <span>Show Virtual Joystick</span>
                      <input
                        type="checkbox"
                        checked={Boolean(vj?.enabled)}
                        onChange={(e) => updateLiveJoystick(e.target.checked)}
                      />
                    </label>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Hardware Gamepads (Xbox/PS/Generic) are also auto-detected whenever a button or stick is moved.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
