import React, { useState } from 'react';
import { Pencil, Plus, Settings2, Trash2 } from 'lucide-react';
import { BEHAVIOR_CATALOG } from '../engine/catalog';
import {
  BehaviorDef,
  InstanceData,
  LayerData,
  LayoutData,
  ObjectType,
  ProjectData,
  VarValueType,
} from '../engine/types';
import { AddBehaviorModal } from './AddBehaviorModal';
import { uid } from './helpers';

interface PropertiesBarProps {
  project: ProjectData;
  activeLayout: LayoutData;
  activeLayer: LayerData | undefined;
  selectedObjectType: ObjectType | undefined;
  selectedInstances: InstanceData[];
  inspectorMode: 'project' | 'layout' | 'layer' | 'object' | 'instance';
  onUpdateProjectMeta: (patch: Partial<ProjectData>) => void;
  onUpdateLayout: (patch: Partial<LayoutData>) => void;
  onUpdateLayer: (layerId: string, patch: Partial<LayerData>) => void;
  onUpdateObjectType: (ot: ObjectType) => void;
  onUpdateSelectedInstances: (updater: (inst: InstanceData) => InstanceData) => void;
  onMoveInstancesToLayer: (uids: number[], targetLayerId: string) => void;
  onOpenSpriteEditor: (ot: ObjectType) => void;
}

export const PropertiesBar: React.FC<PropertiesBarProps> = ({
  project,
  activeLayout,
  activeLayer,
  selectedObjectType,
  selectedInstances,
  inspectorMode,
  onUpdateProjectMeta,
  onUpdateLayout,
  onUpdateLayer,
  onUpdateObjectType,
  onUpdateSelectedInstances,
  onMoveInstancesToLayer,
  onOpenSpriteEditor,
}) => {
  const [showAddBehavior, setShowAddBehavior] = useState(false);
  const [addingInstVar, setAddingInstVar] = useState(false);
  const [ivName, setIvName] = useState('Health');
  const [ivType, setIvType] = useState<VarValueType>('number');
  const [ivVal, setIvVal] = useState('100');

  const firstInst = selectedInstances[0];
  const instOt = firstInst ? project.objectTypes.find((o) => o.id === firstInst.objectTypeId) : undefined;
  const activeOt = inspectorMode === 'instance' ? instOt : selectedObjectType;

  const handleAddBehavior = (beh: BehaviorDef) => {
    if (!activeOt) return;
    onUpdateObjectType({
      ...activeOt,
      behaviorDefs: [...activeOt.behaviorDefs, beh],
    });
  };

  const handleRemoveBehavior = (behId: string) => {
    if (!activeOt) return;
    onUpdateObjectType({
      ...activeOt,
      behaviorDefs: activeOt.behaviorDefs.filter((b) => b.id !== behId),
    });
  };

  const handleCreateInstVar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOt) return;
    const clean = ivName.trim().replace(/[^a-zA-Z0-9_]/g, '') || 'Var';
    const parsed =
      ivType === 'number' ? Number(ivVal) || 0 : ivType === 'boolean' ? ivVal === 'true' : ivVal;
    onUpdateObjectType({
      ...activeOt,
      instVarDefs: [
        ...activeOt.instVarDefs,
        { id: uid('iv'), name: clean, type: ivType, initialValue: parsed },
      ],
    });
    setAddingInstVar(false);
    setIvName(`Var${activeOt.instVarDefs.length + 2}`);
  };

  const renderBehaviorPropInputs = (
    bDef: BehaviorDef,
    values: Record<string, string | number | boolean>,
    onChangeProp: (key: string, val: string | number | boolean) => void
  ) => {
    const schema = BEHAVIOR_CATALOG[bDef.type];
    if (!schema || schema.properties.length === 0) {
      return <div className="text-[11px] text-slate-500">No configurable properties</div>;
    }
    return (
      <div className="space-y-1.5">
        {schema.properties.map((p) => {
          const val = values[p.key] ?? p.defaultValue;
          return (
            <div key={p.key} className="flex items-center justify-between gap-2">
              <label className="text-[11px] text-slate-400 truncate">{p.label}</label>
              {p.type === 'boolean' ? (
                <input
                  type="checkbox"
                  checked={Boolean(val)}
                  onChange={(e) => onChangeProp(p.key, e.target.checked)}
                  className="rounded border-slate-600 bg-[#14161b] text-cyan-400"
                />
              ) : p.type === 'select' && p.options ? (
                <select
                  value={String(val)}
                  onChange={(e) => onChangeProp(p.key, e.target.value)}
                  className="w-28 px-1.5 py-0.5 text-[11px] bg-[#14161b] border border-slate-700 rounded text-slate-200"
                >
                  {p.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={p.type === 'number' ? 'number' : 'text'}
                  step={p.step ?? 'any'}
                  min={p.min}
                  value={String(val)}
                  onChange={(e) =>
                    onChangeProp(p.key, p.type === 'number' ? Number(e.target.value) : e.target.value)
                  }
                  className="w-24 px-2 py-0.5 text-right font-mono text-[11px] bg-[#14161b] border border-slate-700 rounded text-slate-100 tabular-nums"
                />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <aside className="w-72 bg-[#181a20] border-l border-slate-800 flex flex-col h-full shrink-0">
      <div className="px-3.5 py-2.5 border-b border-slate-800 flex items-center gap-2 text-xs font-semibold text-slate-200">
        <Settings2 className="w-4 h-4 text-cyan-400" />
        <span>
          Properties ·{' '}
          {inspectorMode === 'instance' && firstInst
            ? `${instOt?.name || 'Instance'} (#${firstInst.uid})`
            : inspectorMode === 'object' && activeOt
            ? activeOt.name
            : inspectorMode === 'layer' && activeLayer
            ? `Layer: ${activeLayer.name}`
            : inspectorMode === 'project'
            ? 'Project Settings'
            : `Layout: ${activeLayout.name}`}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 space-y-5 text-xs">
        {/* PROJECT SETTINGS */}
        {inspectorMode === 'project' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Project Name</label>
              <input
                type="text"
                value={project.name}
                onChange={(e) => onUpdateProjectMeta({ name: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-[#14161b] border border-slate-700 rounded text-slate-100"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Viewport Width</label>
                <input
                  type="number"
                  value={project.viewportWidth}
                  onChange={(e) => onUpdateProjectMeta({ viewportWidth: Math.max(160, Number(e.target.value)) })}
                  className="w-full px-2 py-1 font-mono bg-[#14161b] border border-slate-700 rounded text-slate-100 tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Viewport Height</label>
                <input
                  type="number"
                  value={project.viewportHeight}
                  onChange={(e) => onUpdateProjectMeta({ viewportHeight: Math.max(120, Number(e.target.value)) })}
                  className="w-full px-2 py-1 font-mono bg-[#14161b] border border-slate-700 rounded text-slate-100 tabular-nums"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Startup Layout</label>
              <select
                value={project.startupLayoutId}
                onChange={(e) => onUpdateProjectMeta({ startupLayoutId: e.target.value })}
                className="w-full px-2 py-1.5 bg-[#14161b] border border-slate-700 rounded text-slate-100"
              >
                {project.layouts.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Fullscreen Scaling</label>
              <select
                value={project.fullscreenScaling}
                onChange={(e) =>
                  onUpdateProjectMeta({
                    fullscreenScaling: e.target.value as ProjectData['fullscreenScaling'],
                  })
                }
                className="w-full px-2 py-1.5 bg-[#14161b] border border-slate-700 rounded text-slate-100"
              >
                <option value="letterbox-scale">Letterbox Scale</option>
                <option value="letterbox-integer">Letterbox Integer Scale</option>
                <option value="scale-outer">Scale Outer</option>
                <option value="scale-inner">Scale Inner</option>
                <option value="off">Off</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={project.pixelRounding}
                onChange={(e) => onUpdateProjectMeta({ pixelRounding: e.target.checked })}
              />
              Pixel rounding (crisp pixel art)
            </label>

            {/* WebGL Post-Processing Shaders */}
            <div className="pt-3 border-t border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-cyan-300">WebGL2 Shaders</span>
                <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(project.postProcessSettings?.enabled)}
                    onChange={(e) =>
                      onUpdateProjectMeta({
                        postProcessSettings: {
                          enabled: e.target.checked,
                          bloom: project.postProcessSettings?.bloom ?? false,
                          bloomIntensity: project.postProcessSettings?.bloomIntensity ?? 0.85,
                          crtScanlines: project.postProcessSettings?.crtScanlines ?? false,
                          crtCurvature: project.postProcessSettings?.crtCurvature ?? 0.25,
                          vignette: project.postProcessSettings?.vignette ?? false,
                          vignetteStrength: project.postProcessSettings?.vignetteStrength ?? 0.35,
                          chromaticAberration: project.postProcessSettings?.chromaticAberration ?? false,
                          chromaticOffset: project.postProcessSettings?.chromaticOffset ?? 2,
                          pixelate: project.postProcessSettings?.pixelate ?? 1,
                        },
                      })
                    }
                  />
                  Enabled
                </label>
              </div>

              {(() => {
                const pp = project.postProcessSettings || {
                  enabled: false,
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
                const patchPp = (patch: Partial<typeof pp>) =>
                  onUpdateProjectMeta({ postProcessSettings: { ...pp, ...patch } });

                return (
                  <div className="space-y-2 pl-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={pp.bloom}
                          onChange={(e) => patchPp({ bloom: e.target.checked })}
                        />
                        Bloom Glow
                      </label>
                      <input
                        type="number"
                        step={0.1}
                        min={0}
                        max={2}
                        value={pp.bloomIntensity}
                        onChange={(e) => patchPp({ bloomIntensity: Number(e.target.value) || 0 })}
                        className="w-16 px-1.5 py-0.5 text-right font-mono bg-[#14161b] border border-slate-700 rounded text-slate-200 tabular-nums"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={pp.crtScanlines}
                          onChange={(e) => patchPp({ crtScanlines: e.target.checked })}
                        />
                        CRT Scanlines
                      </label>
                      <input
                        type="number"
                        step={0.05}
                        min={0}
                        max={1}
                        value={pp.crtCurvature}
                        onChange={(e) => patchPp({ crtCurvature: Number(e.target.value) || 0 })}
                        className="w-16 px-1.5 py-0.5 text-right font-mono bg-[#14161b] border border-slate-700 rounded text-slate-200 tabular-nums"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={pp.vignette}
                          onChange={(e) => patchPp({ vignette: e.target.checked })}
                        />
                        Vignette
                      </label>
                      <input
                        type="number"
                        step={0.05}
                        min={0}
                        max={1}
                        value={pp.vignetteStrength}
                        onChange={(e) => patchPp({ vignetteStrength: Number(e.target.value) || 0 })}
                        className="w-16 px-1.5 py-0.5 text-right font-mono bg-[#14161b] border border-slate-700 rounded text-slate-200 tabular-nums"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={pp.chromaticAberration}
                          onChange={(e) => patchPp({ chromaticAberration: e.target.checked })}
                        />
                        Chromatic
                      </label>
                      <input
                        type="number"
                        step={0.5}
                        min={0}
                        max={10}
                        value={pp.chromaticOffset}
                        onChange={(e) => patchPp({ chromaticOffset: Number(e.target.value) || 0 })}
                        className="w-16 px-1.5 py-0.5 text-right font-mono bg-[#14161b] border border-slate-700 rounded text-slate-200 tabular-nums"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-400">Pixelate</span>
                      <select
                        value={pp.pixelate}
                        onChange={(e) => patchPp({ pixelate: Number(e.target.value) || 1 })}
                        className="w-20 px-1.5 py-0.5 bg-[#14161b] border border-slate-700 rounded text-slate-200"
                      >
                        <option value={1}>1x (Off)</option>
                        <option value={2}>2x</option>
                        <option value={4}>4x</option>
                        <option value={8}>8x</option>
                      </select>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Virtual Touch Controls */}
            <div className="pt-3 border-t border-slate-800 space-y-2.5">
              {(() => {
                const vj = project.virtualJoystickSettings || {
                  enabled: false,
                  deadzone: 0.15,
                  size: 54,
                  showActionButtons: true,
                };
                const patchVj = (patch: Partial<typeof vj>) =>
                  onUpdateProjectMeta({ virtualJoystickSettings: { ...vj, ...patch } });

                return (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-indigo-300">Virtual Touch Pad</span>
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={vj.enabled}
                          onChange={(e) => patchVj({ enabled: e.target.checked })}
                        />
                        Show Overlay
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-slate-400">Stick Radius</label>
                        <input
                          type="number"
                          min={28}
                          max={120}
                          value={vj.size}
                          onChange={(e) => patchVj({ size: Math.max(28, Number(e.target.value) || 54) })}
                          className="w-full px-2 py-0.5 font-mono bg-[#14161b] border border-slate-700 rounded text-slate-200 tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400">Deadzone</label>
                        <input
                          type="number"
                          step={0.05}
                          min={0}
                          max={0.6}
                          value={vj.deadzone}
                          onChange={(e) => patchVj({ deadzone: Math.max(0, Number(e.target.value) || 0) })}
                          className="w-full px-2 py-0.5 font-mono bg-[#14161b] border border-slate-700 rounded text-slate-200 tabular-nums"
                        />
                      </div>
                    </div>
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={vj.showActionButtons}
                        onChange={(e) => patchVj({ showActionButtons: e.target.checked })}
                      />
                      Show A / B Action Buttons
                    </label>
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* LAYOUT SETTINGS */}
        {inspectorMode === 'layout' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Layout Name</label>
              <input
                type="text"
                value={activeLayout.name}
                onChange={(e) => onUpdateLayout({ name: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-[#14161b] border border-slate-700 rounded text-slate-100"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Width (px)</label>
                <input
                  type="number"
                  value={activeLayout.width}
                  onChange={(e) => onUpdateLayout({ width: Math.max(100, Number(e.target.value)) })}
                  className="w-full px-2 py-1 font-mono bg-[#14161b] border border-slate-700 rounded text-slate-100 tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Height (px)</label>
                <input
                  type="number"
                  value={activeLayout.height}
                  onChange={(e) => onUpdateLayout({ height: Math.max(100, Number(e.target.value)) })}
                  className="w-full px-2 py-1 font-mono bg-[#14161b] border border-slate-700 rounded text-slate-100 tabular-nums"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Event Sheet</label>
              <select
                value={activeLayout.eventSheetId}
                onChange={(e) => onUpdateLayout({ eventSheetId: e.target.value })}
                className="w-full px-2 py-1.5 bg-[#14161b] border border-slate-700 rounded text-slate-100"
              >
                {project.eventSheets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Background Color</label>
              <div className="flex items-center gap-2 px-2 py-1 bg-[#14161b] border border-slate-700 rounded">
                <input
                  type="color"
                  value={activeLayout.backgroundColor}
                  onChange={(e) => onUpdateLayout({ backgroundColor: e.target.value })}
                  className="w-6 h-6 bg-transparent border-0 cursor-pointer"
                />
                <span className="font-mono text-slate-300">{activeLayout.backgroundColor}</span>
              </div>
            </div>
          </div>
        )}

        {/* LAYER SETTINGS */}
        {inspectorMode === 'layer' && activeLayer && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Layer Name</label>
              <input
                type="text"
                value={activeLayer.name}
                onChange={(e) => onUpdateLayer(activeLayer.id, { name: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-[#14161b] border border-slate-700 rounded text-slate-100"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Parallax X (%)</label>
                <input
                  type="number"
                  value={activeLayer.parallaxX}
                  onChange={(e) => onUpdateLayer(activeLayer.id, { parallaxX: Number(e.target.value) })}
                  className="w-full px-2 py-1 font-mono bg-[#14161b] border border-slate-700 rounded text-slate-100 tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Parallax Y (%)</label>
                <input
                  type="number"
                  value={activeLayer.parallaxY}
                  onChange={(e) => onUpdateLayer(activeLayer.id, { parallaxY: Number(e.target.value) })}
                  className="w-full px-2 py-1 font-mono bg-[#14161b] border border-slate-700 rounded text-slate-100 tabular-nums"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Opacity (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={activeLayer.opacity}
                onChange={(e) =>
                  onUpdateLayer(activeLayer.id, {
                    opacity: Math.max(0, Math.min(100, Number(e.target.value))),
                  })
                }
                className="w-full px-2 py-1 font-mono bg-[#14161b] border border-slate-700 rounded text-slate-100 tabular-nums"
              />
            </div>
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={activeLayer.visible}
                onChange={(e) => onUpdateLayer(activeLayer.id, { visible: e.target.checked })}
              />
              Initially visible
            </label>
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={activeLayer.locked}
                onChange={(e) => onUpdateLayer(activeLayer.id, { locked: e.target.checked })}
              />
              Locked in editor
            </label>
          </div>
        )}

        {/* SELECTED INSTANCE */}
        {inspectorMode === 'instance' && firstInst && instOt && (
          <div className="space-y-4">
            {selectedInstances.length > 1 && (
              <div className="px-2.5 py-1.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-[11px]">
                {selectedInstances.length} instances selected
              </div>
            )}

            <div className="space-y-2.5">
              <div className="text-[11px] font-semibold text-slate-400">Transform &amp; Appearance</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-0.5">X</label>
                  <input
                    type="number"
                    value={Math.round(firstInst.x)}
                    onChange={(e) =>
                      onUpdateSelectedInstances((i) => ({ ...i, x: Number(e.target.value) }))
                    }
                    className="w-full px-2 py-1 font-mono bg-[#14161b] border border-slate-700 rounded text-slate-100 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-0.5">Y</label>
                  <input
                    type="number"
                    value={Math.round(firstInst.y)}
                    onChange={(e) =>
                      onUpdateSelectedInstances((i) => ({ ...i, y: Number(e.target.value) }))
                    }
                    className="w-full px-2 py-1 font-mono bg-[#14161b] border border-slate-700 rounded text-slate-100 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-0.5">Width</label>
                  <input
                    type="number"
                    min={1}
                    value={Math.round(firstInst.width)}
                    onChange={(e) =>
                      onUpdateSelectedInstances((i) => ({ ...i, width: Math.max(1, Number(e.target.value)) }))
                    }
                    className="w-full px-2 py-1 font-mono bg-[#14161b] border border-slate-700 rounded text-slate-100 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-0.5">Height</label>
                  <input
                    type="number"
                    min={1}
                    value={Math.round(firstInst.height)}
                    onChange={(e) =>
                      onUpdateSelectedInstances((i) => ({ ...i, height: Math.max(1, Number(e.target.value)) }))
                    }
                    className="w-full px-2 py-1 font-mono bg-[#14161b] border border-slate-700 rounded text-slate-100 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-0.5">Angle (°)</label>
                  <input
                    type="number"
                    value={Math.round(firstInst.angle)}
                    onChange={(e) =>
                      onUpdateSelectedInstances((i) => ({ ...i, angle: Number(e.target.value) }))
                    }
                    className="w-full px-2 py-1 font-mono bg-[#14161b] border border-slate-700 rounded text-slate-100 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-0.5">Opacity (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={firstInst.opacity}
                    onChange={(e) =>
                      onUpdateSelectedInstances((i) => ({
                        ...i,
                        opacity: Math.max(0, Math.min(100, Number(e.target.value))),
                      }))
                    }
                    className="w-full px-2 py-1 font-mono bg-[#14161b] border border-slate-700 rounded text-slate-100 tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-0.5">Layer</label>
                <select
                  value={activeLayout.layers.find((l) => l.instances.some((i) => i.uid === firstInst.uid))?.id || ''}
                  onChange={(e) =>
                    onMoveInstancesToLayer(
                      selectedInstances.map((s) => s.uid),
                      e.target.value
                    )
                  }
                  className="w-full px-2 py-1 bg-[#14161b] border border-slate-700 rounded text-slate-200"
                >
                  {activeLayout.layers.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={firstInst.visible}
                    onChange={(e) => onUpdateSelectedInstances((i) => ({ ...i, visible: e.target.checked }))}
                  />
                  Visible
                </label>
                {instOt.plugin === 'Sprite' && (
                  <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(firstInst.mirrored)}
                      onChange={(e) => onUpdateSelectedInstances((i) => ({ ...i, mirrored: e.target.checked }))}
                    />
                    Mirrored
                  </label>
                )}
              </div>

              {(instOt.plugin === 'Text' || instOt.plugin === 'Button') && (
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    {instOt.plugin === 'Button' ? 'Button Label Override' : 'Instance Text Override'}
                  </label>
                  <textarea
                    rows={2}
                    value={
                      firstInst.textOverride ??
                      (instOt.plugin === 'Button'
                        ? instOt.buttonConfig?.text ?? 'Button'
                        : instOt.textConfig?.initialText ?? '')
                    }
                    onChange={(e) =>
                      onUpdateSelectedInstances((i) => ({ ...i, textOverride: e.target.value }))
                    }
                    className="w-full px-2 py-1 text-xs bg-[#14161b] border border-slate-700 rounded text-slate-100"
                  />
                </div>
              )}

              {instOt.plugin === 'Tilemap' && instOt.tilemapConfig && (
                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <div className="text-[11px] font-semibold text-lime-300">Tilemap Grid Size (Tiles)</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-400">Columns</label>
                      <input
                        type="number"
                        min={1}
                        max={200}
                        value={firstInst.mapWidth ?? instOt.tilemapConfig.columns}
                        onChange={(e) => {
                          const newCols = Math.max(1, Math.min(200, Math.trunc(Number(e.target.value) || 1)));
                          const tw = instOt.tilemapConfig?.tileWidth || 32;
                          onUpdateSelectedInstances((inst) => {
                            const oldCols = inst.mapWidth ?? instOt.tilemapConfig?.columns ?? 16;
                            const rows = inst.mapHeight ?? instOt.tilemapConfig?.rows ?? 12;
                            const oldData = inst.tileData || [];
                            const nextData = new Array(newCols * rows).fill(-1);
                            for (let r = 0; r < rows; r++) {
                              for (let c = 0; c < Math.min(oldCols, newCols); c++) {
                                nextData[r * newCols + c] = oldData[r * oldCols + c] ?? -1;
                              }
                            }
                            return { ...inst, mapWidth: newCols, width: newCols * tw, tileData: nextData };
                          });
                        }}
                        className="w-full px-2 py-1 font-mono bg-[#14161b] border border-slate-700 rounded text-slate-100 tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400">Rows</label>
                      <input
                        type="number"
                        min={1}
                        max={200}
                        value={firstInst.mapHeight ?? instOt.tilemapConfig.rows}
                        onChange={(e) => {
                          const newRows = Math.max(1, Math.min(200, Math.trunc(Number(e.target.value) || 1)));
                          const th = instOt.tilemapConfig?.tileHeight || 32;
                          onUpdateSelectedInstances((inst) => {
                            const cols = inst.mapWidth ?? instOt.tilemapConfig?.columns ?? 16;
                            const oldRows = inst.mapHeight ?? instOt.tilemapConfig?.rows ?? 12;
                            const oldData = inst.tileData || [];
                            const nextData = new Array(cols * newRows).fill(-1);
                            for (let r = 0; r < Math.min(oldRows, newRows); r++) {
                              for (let c = 0; c < cols; c++) {
                                nextData[r * cols + c] = oldData[r * cols + c] ?? -1;
                              }
                            }
                            return { ...inst, mapHeight: newRows, height: newRows * th, tileData: nextData };
                          });
                        }}
                        className="w-full px-2 py-1 font-mono bg-[#14161b] border border-slate-700 rounded text-slate-100 tabular-nums"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Use the floating Tilemap Painter overlay on the canvas to paint tiles and toggle Solid collisions.
                  </p>
                </div>
              )}
            </div>

            {/* Instance Variables Values */}
            {instOt.instVarDefs.length > 0 && (
              <div className="pt-3 border-t border-slate-800 space-y-2">
                <div className="text-[11px] font-semibold text-slate-400">Instance Variables</div>
                {instOt.instVarDefs.map((def) => {
                  const val = firstInst.instVars[def.name] ?? def.initialValue;
                  return (
                    <div key={def.id} className="flex items-center justify-between gap-2">
                      <span className="text-slate-300 truncate">{def.name}</span>
                      <input
                        type="text"
                        value={String(val)}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const parsed =
                            def.type === 'number'
                              ? Number(raw) || 0
                              : def.type === 'boolean'
                              ? raw === 'true'
                              : raw;
                          onUpdateSelectedInstances((i) => ({
                            ...i,
                            instVars: { ...i.instVars, [def.name]: parsed },
                          }));
                        }}
                        className="w-24 px-2 py-0.5 text-right font-mono bg-[#14161b] border border-slate-700 rounded text-cyan-300"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* OBJECT TYPE INSPECTOR (shared for both 'object' and bottom of 'instance') */}
        {activeOt && (inspectorMode === 'object' || inspectorMode === 'instance') && (
          <div className="space-y-4 pt-3 border-t border-slate-800">
            {inspectorMode === 'object' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Object Name</label>
                  <input
                    type="text"
                    value={activeOt.name}
                    onChange={(e) => onUpdateObjectType({ ...activeOt, name: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-[#14161b] border border-slate-700 rounded text-slate-100"
                  />
                </div>

                {activeOt.plugin === 'Sprite' && (
                  <button
                    type="button"
                    onClick={() => onOpenSpriteEditor(activeOt)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Open Sprite Editor
                  </button>
                )}

                {activeOt.plugin === 'Text' && activeOt.textConfig && (
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <div className="text-[11px] font-semibold text-slate-400">Text Settings</div>
                    <textarea
                      rows={3}
                      value={activeOt.textConfig.initialText}
                      onChange={(e) =>
                        onUpdateObjectType({
                          ...activeOt,
                          textConfig: { ...activeOt.textConfig!, initialText: e.target.value },
                        })
                      }
                      className="w-full px-2 py-1 bg-[#14161b] border border-slate-700 rounded text-slate-100"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-slate-400">Font Size</label>
                        <input
                          type="number"
                          value={activeOt.textConfig.fontSize}
                          onChange={(e) =>
                            onUpdateObjectType({
                              ...activeOt,
                              textConfig: { ...activeOt.textConfig!, fontSize: Number(e.target.value) || 16 },
                            })
                          }
                          className="w-full px-2 py-1 font-mono bg-[#14161b] border border-slate-700 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400">Color</label>
                        <input
                          type="color"
                          value={activeOt.textConfig.color}
                          onChange={(e) =>
                            onUpdateObjectType({
                              ...activeOt,
                              textConfig: { ...activeOt.textConfig!, color: e.target.value },
                            })
                          }
                          className="w-full h-7 bg-[#14161b] border border-slate-700 rounded cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {activeOt.plugin === 'Particles' && activeOt.particlesConfig && (
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <div className="text-[11px] font-semibold text-slate-400">Particles Emitter</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-slate-400">Type</label>
                        <select
                          value={activeOt.particlesConfig.type}
                          onChange={(e) =>
                            onUpdateObjectType({
                              ...activeOt,
                              particlesConfig: {
                                ...activeOt.particlesConfig!,
                                type: e.target.value as 'continuous' | 'one-shot',
                              },
                            })
                          }
                          className="w-full px-1.5 py-1 bg-[#14161b] border border-slate-700 rounded"
                        >
                          <option value="continuous">Continuous</option>
                          <option value="one-shot">One-shot</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400">Rate / Count</label>
                        <input
                          type="number"
                          value={activeOt.particlesConfig.rate}
                          onChange={(e) =>
                            onUpdateObjectType({
                              ...activeOt,
                              particlesConfig: { ...activeOt.particlesConfig!, rate: Number(e.target.value) },
                            })
                          }
                          className="w-full px-2 py-1 font-mono bg-[#14161b] border border-slate-700 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400">Speed</label>
                        <input
                          type="number"
                          value={activeOt.particlesConfig.speed}
                          onChange={(e) =>
                            onUpdateObjectType({
                              ...activeOt,
                              particlesConfig: { ...activeOt.particlesConfig!, speed: Number(e.target.value) },
                            })
                          }
                          className="w-full px-2 py-1 font-mono bg-[#14161b] border border-slate-700 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400">Cone (°)</label>
                        <input
                          type="number"
                          value={activeOt.particlesConfig.sprayCone}
                          onChange={(e) =>
                            onUpdateObjectType({
                              ...activeOt,
                              particlesConfig: { ...activeOt.particlesConfig!, sprayCone: Number(e.target.value) },
                            })
                          }
                          className="w-full px-2 py-1 font-mono bg-[#14161b] border border-slate-700 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400">Lifetime (s)</label>
                        <input
                          type="number"
                          step={0.1}
                          value={activeOt.particlesConfig.lifetime}
                          onChange={(e) =>
                            onUpdateObjectType({
                              ...activeOt,
                              particlesConfig: { ...activeOt.particlesConfig!, lifetime: Number(e.target.value) },
                            })
                          }
                          className="w-full px-2 py-1 font-mono bg-[#14161b] border border-slate-700 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400">Color</label>
                        <input
                          type="color"
                          value={activeOt.particlesConfig.color}
                          onChange={(e) =>
                            onUpdateObjectType({
                              ...activeOt,
                              particlesConfig: { ...activeOt.particlesConfig!, color: e.target.value },
                            })
                          }
                          className="w-full h-7 bg-[#14161b] border border-slate-700 rounded cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {activeOt.plugin === 'Tilemap' && activeOt.tilemapConfig && (
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <div className="text-[11px] font-semibold text-lime-300">Tilemap Defaults</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-slate-400">Tile Width</label>
                        <input
                          type="number"
                          min={8}
                          value={activeOt.tilemapConfig.tileWidth}
                          onChange={(e) =>
                            onUpdateObjectType({
                              ...activeOt,
                              tilemapConfig: {
                                ...activeOt.tilemapConfig!,
                                tileWidth: Math.max(8, Number(e.target.value) || 32),
                              },
                            })
                          }
                          className="w-full px-2 py-1 font-mono bg-[#14161b] border border-slate-700 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400">Tile Height</label>
                        <input
                          type="number"
                          min={8}
                          value={activeOt.tilemapConfig.tileHeight}
                          onChange={(e) =>
                            onUpdateObjectType({
                              ...activeOt,
                              tilemapConfig: {
                                ...activeOt.tilemapConfig!,
                                tileHeight: Math.max(8, Number(e.target.value) || 32),
                              },
                            })
                          }
                          className="w-full px-2 py-1 font-mono bg-[#14161b] border border-slate-700 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400">Default Cols</label>
                        <input
                          type="number"
                          min={1}
                          value={activeOt.tilemapConfig.columns}
                          onChange={(e) =>
                            onUpdateObjectType({
                              ...activeOt,
                              tilemapConfig: {
                                ...activeOt.tilemapConfig!,
                                columns: Math.max(1, Number(e.target.value) || 16),
                              },
                            })
                          }
                          className="w-full px-2 py-1 font-mono bg-[#14161b] border border-slate-700 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400">Default Rows</label>
                        <input
                          type="number"
                          min={1}
                          value={activeOt.tilemapConfig.rows}
                          onChange={(e) =>
                            onUpdateObjectType({
                              ...activeOt,
                              tilemapConfig: {
                                ...activeOt.tilemapConfig!,
                                rows: Math.max(1, Number(e.target.value) || 12),
                              },
                            })
                          }
                          className="w-full px-2 py-1 font-mono bg-[#14161b] border border-slate-700 rounded"
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Select a Tilemap instance on the Layout canvas to open the interactive Tilemap Painter.
                    </p>
                  </div>
                )}

                {activeOt.plugin === 'Button' && activeOt.buttonConfig && (
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <div className="text-[11px] font-semibold text-sky-300">Button Style</div>
                    <div>
                      <label className="block text-[10px] text-slate-400">Label Text</label>
                      <input
                        type="text"
                        value={activeOt.buttonConfig.text}
                        onChange={(e) =>
                          onUpdateObjectType({
                            ...activeOt,
                            buttonConfig: { ...activeOt.buttonConfig!, text: e.target.value },
                          })
                        }
                        className="w-full px-2 py-1 bg-[#14161b] border border-slate-700 rounded text-slate-100"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-slate-400">Font Size</label>
                        <input
                          type="number"
                          min={8}
                          value={activeOt.buttonConfig.fontSize}
                          onChange={(e) =>
                            onUpdateObjectType({
                              ...activeOt,
                              buttonConfig: {
                                ...activeOt.buttonConfig!,
                                fontSize: Math.max(8, Number(e.target.value) || 13),
                              },
                            })
                          }
                          className="w-full px-2 py-1 font-mono bg-[#14161b] border border-slate-700 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400">Corner Radius</label>
                        <input
                          type="number"
                          min={0}
                          value={activeOt.buttonConfig.borderRadius}
                          onChange={(e) =>
                            onUpdateObjectType({
                              ...activeOt,
                              buttonConfig: {
                                ...activeOt.buttonConfig!,
                                borderRadius: Math.max(0, Number(e.target.value) || 0),
                              },
                            })
                          }
                          className="w-full px-2 py-1 font-mono bg-[#14161b] border border-slate-700 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400">Background</label>
                        <input
                          type="color"
                          value={activeOt.buttonConfig.bgColor}
                          onChange={(e) =>
                            onUpdateObjectType({
                              ...activeOt,
                              buttonConfig: { ...activeOt.buttonConfig!, bgColor: e.target.value },
                            })
                          }
                          className="w-full h-7 bg-[#14161b] border border-slate-700 rounded cursor-pointer"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400">Text Color</label>
                        <input
                          type="color"
                          value={activeOt.buttonConfig.textColor}
                          onChange={(e) =>
                            onUpdateObjectType({
                              ...activeOt,
                              buttonConfig: { ...activeOt.buttonConfig!, textColor: e.target.value },
                            })
                          }
                          className="w-full h-7 bg-[#14161b] border border-slate-700 rounded cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {activeOt.plugin === 'Slider' && activeOt.sliderConfig && (
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <div className="text-[11px] font-semibold text-violet-300">Slider Range &amp; Style</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-slate-400">Min</label>
                        <input
                          type="number"
                          step="any"
                          value={activeOt.sliderConfig.min}
                          onChange={(e) =>
                            onUpdateObjectType({
                              ...activeOt,
                              sliderConfig: { ...activeOt.sliderConfig!, min: Number(e.target.value) || 0 },
                            })
                          }
                          className="w-full px-2 py-1 font-mono bg-[#14161b] border border-slate-700 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400">Max</label>
                        <input
                          type="number"
                          step="any"
                          value={activeOt.sliderConfig.max}
                          onChange={(e) =>
                            onUpdateObjectType({
                              ...activeOt,
                              sliderConfig: { ...activeOt.sliderConfig!, max: Number(e.target.value) || 100 },
                            })
                          }
                          className="w-full px-2 py-1 font-mono bg-[#14161b] border border-slate-700 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400">Step</label>
                        <input
                          type="number"
                          step="any"
                          value={activeOt.sliderConfig.step}
                          onChange={(e) =>
                            onUpdateObjectType({
                              ...activeOt,
                              sliderConfig: { ...activeOt.sliderConfig!, step: Number(e.target.value) || 1 },
                            })
                          }
                          className="w-full px-2 py-1 font-mono bg-[#14161b] border border-slate-700 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400">Initial Value</label>
                        <input
                          type="number"
                          step="any"
                          value={activeOt.sliderConfig.initialValue}
                          onChange={(e) =>
                            onUpdateObjectType({
                              ...activeOt,
                              sliderConfig: { ...activeOt.sliderConfig!, initialValue: Number(e.target.value) || 0 },
                            })
                          }
                          className="w-full px-2 py-1 font-mono bg-[#14161b] border border-slate-700 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400">Fill Color</label>
                        <input
                          type="color"
                          value={activeOt.sliderConfig.fillColor}
                          onChange={(e) =>
                            onUpdateObjectType({
                              ...activeOt,
                              sliderConfig: { ...activeOt.sliderConfig!, fillColor: e.target.value },
                            })
                          }
                          className="w-full h-7 bg-[#14161b] border border-slate-700 rounded cursor-pointer"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400">Track Color</label>
                        <input
                          type="color"
                          value={activeOt.sliderConfig.trackColor}
                          onChange={(e) =>
                            onUpdateObjectType({
                              ...activeOt,
                              sliderConfig: { ...activeOt.sliderConfig!, trackColor: e.target.value },
                            })
                          }
                          className="w-full h-7 bg-[#14161b] border border-slate-700 rounded cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {activeOt.plugin === 'ProgressBar' && activeOt.progressBarConfig && (
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <div className="text-[11px] font-semibold text-rose-300">Progress Bar Style</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-slate-400">Initial %</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={activeOt.progressBarConfig.initialProgress}
                          onChange={(e) =>
                            onUpdateObjectType({
                              ...activeOt,
                              progressBarConfig: {
                                ...activeOt.progressBarConfig!,
                                initialProgress: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                              },
                            })
                          }
                          className="w-full px-2 py-1 font-mono bg-[#14161b] border border-slate-700 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400">Radius</label>
                        <input
                          type="number"
                          min={0}
                          value={activeOt.progressBarConfig.borderRadius}
                          onChange={(e) =>
                            onUpdateObjectType({
                              ...activeOt,
                              progressBarConfig: {
                                ...activeOt.progressBarConfig!,
                                borderRadius: Math.max(0, Number(e.target.value) || 0),
                              },
                            })
                          }
                          className="w-full px-2 py-1 font-mono bg-[#14161b] border border-slate-700 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400">Fill Color</label>
                        <input
                          type="color"
                          value={activeOt.progressBarConfig.fillColor}
                          onChange={(e) =>
                            onUpdateObjectType({
                              ...activeOt,
                              progressBarConfig: { ...activeOt.progressBarConfig!, fillColor: e.target.value },
                            })
                          }
                          className="w-full h-7 bg-[#14161b] border border-slate-700 rounded cursor-pointer"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400">Bg Color</label>
                        <input
                          type="color"
                          value={activeOt.progressBarConfig.bgColor}
                          onChange={(e) =>
                            onUpdateObjectType({
                              ...activeOt,
                              progressBarConfig: { ...activeOt.progressBarConfig!, bgColor: e.target.value },
                            })
                          }
                          className="w-full h-7 bg-[#14161b] border border-slate-700 rounded cursor-pointer"
                        />
                      </div>
                    </div>
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={activeOt.progressBarConfig.showText}
                        onChange={(e) =>
                          onUpdateObjectType({
                            ...activeOt,
                            progressBarConfig: { ...activeOt.progressBarConfig!, showText: e.target.checked },
                          })
                        }
                      />
                      Show Percentage Text
                    </label>
                  </div>
                )}

                {/* Instance Variable Definitions */}
                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-400">Instance Variables</span>
                    <button
                      type="button"
                      onClick={() => setAddingInstVar((v) => !v)}
                      className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5"
                    >
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  </div>
                  {addingInstVar && (
                    <form onSubmit={handleCreateInstVar} className="p-2 rounded bg-[#14161b] border border-slate-700 space-y-1.5">
                      <input
                        type="text"
                        value={ivName}
                        onChange={(e) => setIvName(e.target.value)}
                        placeholder="Var name"
                        className="w-full px-2 py-1 bg-[#181a20] border border-slate-700 rounded"
                      />
                      <div className="flex gap-1">
                        <select
                          value={ivType}
                          onChange={(e) => setIvType(e.target.value as VarValueType)}
                          className="px-1.5 py-1 bg-[#181a20] border border-slate-700 rounded"
                        >
                          <option value="number">Number</option>
                          <option value="string">String</option>
                          <option value="boolean">Boolean</option>
                        </select>
                        <input
                          type="text"
                          value={ivVal}
                          onChange={(e) => setIvVal(e.target.value)}
                          placeholder="Default"
                          className="flex-1 min-w-0 px-2 py-1 font-mono bg-[#181a20] border border-slate-700 rounded"
                        />
                      </div>
                      <button type="submit" className="w-full py-1 bg-cyan-400 text-slate-950 font-semibold rounded">
                        Create Variable
                      </button>
                    </form>
                  )}
                  {activeOt.instVarDefs.map((def) => (
                    <div
                      key={def.id}
                      className="flex items-center justify-between px-2 py-1 rounded bg-[#14161b] border border-slate-800"
                    >
                      <span className="text-slate-200">{def.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-slate-400">{String(def.initialValue)}</span>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateObjectType({
                              ...activeOt,
                              instVarDefs: activeOt.instVarDefs.filter((v) => v.id !== def.id),
                            })
                          }
                          className="text-slate-500 hover:text-rose-400"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Behaviors Section */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-400">
                  Behaviors ({activeOt.name})
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddBehavior(true)}
                  className="flex items-center gap-0.5 px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 text-[11px] font-medium"
                >
                  <Plus className="w-3 h-3" /> Add Behavior
                </button>
              </div>

              {activeOt.behaviorDefs.length === 0 ? (
                <div className="text-[11px] text-slate-500">No behaviors attached.</div>
              ) : (
                <div className="space-y-2.5">
                  {activeOt.behaviorDefs.map((bDef) => {
                    const values =
                      inspectorMode === 'instance' && firstInst
                        ? { ...bDef.properties, ...(firstInst.behaviorProps[bDef.id] || {}) }
                        : bDef.properties;

                    return (
                      <div
                        key={bDef.id}
                        className="p-2.5 rounded-lg bg-[#1c2029] border border-slate-800 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-cyan-300">
                            {BEHAVIOR_CATALOG[bDef.type]?.name || bDef.type}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveBehavior(bDef.id)}
                            className="text-slate-500 hover:text-rose-400"
                            title="Remove Behavior"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {renderBehaviorPropInputs(bDef, values, (key, val) => {
                          if (inspectorMode === 'instance' && firstInst) {
                            onUpdateSelectedInstances((inst) => ({
                              ...inst,
                              behaviorProps: {
                                ...inst.behaviorProps,
                                [bDef.id]: { ...(inst.behaviorProps[bDef.id] || {}), [key]: val },
                              },
                            }));
                          } else {
                            onUpdateObjectType({
                              ...activeOt,
                              behaviorDefs: activeOt.behaviorDefs.map((b) =>
                                b.id === bDef.id
                                  ? { ...b, properties: { ...b.properties, [key]: val } }
                                  : b
                              ),
                            });
                          }
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showAddBehavior && activeOt && (
        <AddBehaviorModal
          existingBehaviors={activeOt.behaviorDefs}
          onClose={() => setShowAddBehavior(false)}
          onAdd={handleAddBehavior}
        />
      )}
    </aside>
  );
};
