import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  FileCode2,
  FolderOpen,
  Layers,
  Lock,
  Map as MapIcon,
  Plus,
  Trash2,
  Unlock,
  Variable,
} from 'lucide-react';
import { GlobalVariable, LayoutData, ObjectType, ProjectData, VarValueType } from '../engine/types';
import { getObjectThumbnail, uid } from './helpers';

interface ProjectSidebarProps {
  project: ProjectData;
  activeLayout: LayoutData;
  activeEventSheetId: string;
  activeLayerId: string;
  selectedObjectTypeId: string | null;
  inspectorMode: 'project' | 'layout' | 'layer' | 'object' | 'instance';
  onSelectLayout: (layoutId: string) => void;
  onAddLayout: () => void;
  onDeleteLayout: (layoutId: string) => void;
  onSelectEventSheet: (sheetId: string) => void;
  onAddEventSheet: () => void;
  onSelectObjectType: (otId: string) => void;
  onOpenAddObjectModal: () => void;
  onDoubleClickSprite: (ot: ObjectType) => void;
  onDeleteObjectType: (otId: string) => void;
  onSelectProjectRoot: () => void;
  onAddGlobalVar: (gv: GlobalVariable) => void;
  onUpdateGlobalVar: (gv: GlobalVariable) => void;
  onDeleteGlobalVar: (id: string) => void;
  onSelectLayer: (layerId: string) => void;
  onAddLayer: () => void;
  onDeleteLayer: (layerId: string) => void;
  onMoveLayer: (layerId: string, dir: -1 | 1) => void;
  onToggleLayerProp: (layerId: string, prop: 'visible' | 'locked') => void;
}

export const ProjectSidebar: React.FC<ProjectSidebarProps> = ({
  project,
  activeLayout,
  activeEventSheetId,
  activeLayerId,
  selectedObjectTypeId,
  inspectorMode,
  onSelectLayout,
  onAddLayout,
  onDeleteLayout,
  onSelectEventSheet,
  onAddEventSheet,
  onSelectObjectType,
  onOpenAddObjectModal,
  onDoubleClickSprite,
  onDeleteObjectType,
  onSelectProjectRoot,
  onAddGlobalVar,
  onUpdateGlobalVar,
  onDeleteGlobalVar,
  onSelectLayer,
  onAddLayer,
  onDeleteLayer,
  onMoveLayer,
  onToggleLayerProp,
}) => {
  const [openSections, setOpenSections] = useState({
    layouts: true,
    sheets: true,
    objects: true,
    globals: true,
  });
  const [addingVar, setAddingVar] = useState(false);
  const [newVarName, setNewVarName] = useState('NewVar');
  const [newVarType, setNewVarType] = useState<VarValueType>('number');
  const [newVarVal, setNewVarVal] = useState('0');

  const visualObjects = project.objectTypes.filter((o) => !o.isGlobalPlugin);

  const toggle = (key: keyof typeof openSections) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleCreateGlobalVar = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newVarName.trim().replace(/[^a-zA-Z0-9_]/g, '') || 'Var';
    const parsedVal =
      newVarType === 'number'
        ? Number(newVarVal) || 0
        : newVarType === 'boolean'
        ? newVarVal === 'true'
        : newVarVal;
    onAddGlobalVar({
      id: uid('gv'),
      name: clean,
      type: newVarType,
      initialValue: parsedVal,
    });
    setAddingVar(false);
    setNewVarName(`Var${project.globalVariables.length + 2}`);
    setNewVarVal('0');
  };

  return (
    <aside className="w-64 bg-[#181a20] border-r border-slate-800 flex flex-col h-full shrink-0 select-none">
      {/* Project Tree */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div
          onClick={onSelectProjectRoot}
          className={`px-3 py-2.5 border-b border-slate-800 flex items-center justify-between cursor-pointer ${
            inspectorMode === 'project' ? 'bg-cyan-500/10 text-cyan-300' : 'hover:bg-[#1e222b] text-slate-200'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <FolderOpen className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="text-xs font-semibold truncate">{project.name}</span>
          </div>
          <span className="text-[10px] font-mono text-slate-500">Project</span>
        </div>

        {/* Layouts */}
        <div className="border-b border-slate-800/70">
          <div className="px-3 py-1.5 flex items-center justify-between text-xs font-medium text-slate-400">
            <button
              type="button"
              onClick={() => toggle('layouts')}
              className="flex items-center gap-1 hover:text-slate-200"
            >
              {openSections.layouts ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <span>Layouts</span>
            </button>
            <button
              type="button"
              onClick={onAddLayout}
              className="p-0.5 text-slate-400 hover:text-cyan-400"
              title="Add Layout"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          {openSections.layouts && (
            <div className="pb-1.5 px-1.5 space-y-0.5">
              {project.layouts.map((l) => {
                const active = l.id === activeLayout.id;
                return (
                  <div
                    key={l.id}
                    onClick={() => onSelectLayout(l.id)}
                    className={`group flex items-center justify-between px-2 py-1 rounded text-xs cursor-pointer ${
                      active ? 'bg-cyan-500/15 text-cyan-300 font-medium' : 'text-slate-300 hover:bg-[#21252e]'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <MapIcon className="w-3.5 h-3.5 shrink-0 opacity-75" />
                      <span className="truncate">{l.name}</span>
                    </div>
                    {project.layouts.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteLayout(l.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-500 hover:text-rose-400"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Event Sheets */}
        <div className="border-b border-slate-800/70">
          <div className="px-3 py-1.5 flex items-center justify-between text-xs font-medium text-slate-400">
            <button
              type="button"
              onClick={() => toggle('sheets')}
              className="flex items-center gap-1 hover:text-slate-200"
            >
              {openSections.sheets ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <span>Event Sheets</span>
            </button>
            <button
              type="button"
              onClick={onAddEventSheet}
              className="p-0.5 text-slate-400 hover:text-cyan-400"
              title="Add Event Sheet"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          {openSections.sheets && (
            <div className="pb-1.5 px-1.5 space-y-0.5">
              {project.eventSheets.map((s) => {
                const active = s.id === activeEventSheetId;
                return (
                  <div
                    key={s.id}
                    onClick={() => onSelectEventSheet(s.id)}
                    className={`flex items-center gap-2 px-2 py-1 rounded text-xs cursor-pointer ${
                      active ? 'bg-indigo-500/15 text-indigo-300 font-medium' : 'text-slate-300 hover:bg-[#21252e]'
                    }`}
                  >
                    <FileCode2 className="w-3.5 h-3.5 shrink-0 opacity-75" />
                    <span className="truncate">{s.name}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Object Types */}
        <div className="border-b border-slate-800/70">
          <div className="px-3 py-1.5 flex items-center justify-between text-xs font-medium text-slate-400">
            <button
              type="button"
              onClick={() => toggle('objects')}
              className="flex items-center gap-1 hover:text-slate-200"
            >
              {openSections.objects ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <span>Object Types</span>
            </button>
            <button
              type="button"
              onClick={onOpenAddObjectModal}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 text-[11px]"
              title="Add Object Type"
            >
              <Plus className="w-3 h-3" /> Add
            </button>
          </div>
          {openSections.objects && (
            <div className="pb-2 px-1.5 space-y-0.5">
              {visualObjects.length === 0 && (
                <div className="px-2 py-2 text-[11px] text-slate-500">Click + Add to create a Sprite or Text object</div>
              )}
              {visualObjects.map((ot) => {
                const thumb = getObjectThumbnail(ot);
                const selected = selectedObjectTypeId === ot.id && inspectorMode === 'object';
                return (
                  <div
                    key={ot.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/x-openconstruct-object', ot.id);
                    }}
                    onClick={() => onSelectObjectType(ot.id)}
                    onDoubleClick={() => {
                      if (ot.plugin === 'Sprite') onDoubleClickSprite(ot);
                    }}
                    title={
                      ot.plugin === 'Sprite'
                        ? 'Drag onto layout to spawn · Double-click to edit Sprite'
                        : 'Drag onto layout to spawn'
                    }
                    className={`group flex items-center justify-between px-2 py-1 rounded text-xs cursor-grab active:cursor-grabbing ${
                      selected ? 'bg-cyan-500/15 text-cyan-300 font-medium' : 'text-slate-300 hover:bg-[#21252e]'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-4 h-4 rounded-xs bg-slate-800 flex items-center justify-center shrink-0 overflow-hidden">
                        {thumb ? (
                          <img src={thumb} alt={ot.name} className="w-4 h-4 object-contain" />
                        ) : (
                          <span className="text-[9px] font-mono text-cyan-400">{ot.plugin.slice(0, 2)}</span>
                        )}
                      </div>
                      <span className="truncate">{ot.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteObjectType(ot.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-500 hover:text-rose-400"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Global Variables */}
        <div>
          <div className="px-3 py-1.5 flex items-center justify-between text-xs font-medium text-slate-400">
            <button
              type="button"
              onClick={() => toggle('globals')}
              className="flex items-center gap-1 hover:text-slate-200"
            >
              {openSections.globals ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <span>Global Variables</span>
            </button>
            <button
              type="button"
              onClick={() => setAddingVar((v) => !v)}
              className="p-0.5 text-slate-400 hover:text-cyan-400"
              title="Add Global Variable"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {openSections.globals && (
            <div className="pb-2 px-2 space-y-1">
              {addingVar && (
                <form onSubmit={handleCreateGlobalVar} className="p-2 rounded bg-[#14161b] border border-slate-700 space-y-1.5 mb-1.5">
                  <input
                    type="text"
                    value={newVarName}
                    onChange={(e) => setNewVarName(e.target.value)}
                    placeholder="Name"
                    className="w-full px-2 py-1 text-xs bg-[#181a20] border border-slate-700 rounded text-slate-100"
                  />
                  <div className="flex gap-1">
                    <select
                      value={newVarType}
                      onChange={(e) => setNewVarType(e.target.value as VarValueType)}
                      className="px-1.5 py-1 text-xs bg-[#181a20] border border-slate-700 rounded text-slate-200"
                    >
                      <option value="number">Number</option>
                      <option value="string">String</option>
                      <option value="boolean">Boolean</option>
                    </select>
                    <input
                      type="text"
                      value={newVarVal}
                      onChange={(e) => setNewVarVal(e.target.value)}
                      placeholder="Initial"
                      className="flex-1 min-w-0 px-2 py-1 text-xs font-mono bg-[#181a20] border border-slate-700 rounded text-slate-100"
                    />
                  </div>
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => setAddingVar(false)}
                      className="px-2 py-0.5 text-[11px] text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-2 py-0.5 text-[11px] font-semibold bg-cyan-400 text-slate-950 rounded"
                    >
                      Add
                    </button>
                  </div>
                </form>
              )}

              {project.globalVariables.map((gv) => (
                <div
                  key={gv.id}
                  className="group flex items-center justify-between gap-1.5 px-2 py-1 rounded bg-[#14161b] border border-slate-800/80 text-xs"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Variable className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span className="truncate text-slate-200 font-medium">{gv.name}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="text"
                      value={String(gv.initialValue)}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const val =
                          gv.type === 'number'
                            ? Number(raw) || 0
                            : gv.type === 'boolean'
                            ? raw === 'true'
                            : raw;
                        onUpdateGlobalVar({ ...gv, initialValue: val });
                      }}
                      className="w-14 px-1 py-0.5 text-right font-mono text-[11px] bg-[#181a20] border border-slate-800 rounded text-cyan-300 tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => onDeleteGlobalVar(gv.id)}
                      className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Layers Panel */}
      <div className="h-56 border-t border-slate-800 flex flex-col bg-[#16181e]">
        <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>Layers ({activeLayout.name})</span>
          </div>
          <button
            type="button"
            onClick={onAddLayer}
            className="p-0.5 text-slate-400 hover:text-cyan-400"
            title="Add Layer"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
          {[...activeLayout.layers].reverse().map((layer, revIdx) => {
            const realIdx = activeLayout.layers.length - 1 - revIdx;
            const active = layer.id === activeLayerId;
            return (
              <div
                key={layer.id}
                onClick={() => onSelectLayer(layer.id)}
                className={`group flex items-center justify-between px-2 py-1.5 rounded text-xs cursor-pointer border ${
                  active
                    ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200'
                    : 'bg-[#1a1d24] border-slate-800/80 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[10px] font-mono text-slate-500 w-4 tabular-nums">{realIdx}</span>
                  <span className="truncate font-medium">{layer.name}</span>
                  <span className="text-[10px] font-mono text-slate-500 tabular-nums">
                    {layer.parallaxX}%
                  </span>
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveLayer(layer.id, 1);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-white text-[10px]"
                    title="Move Layer Up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveLayer(layer.id, -1);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-white text-[10px]"
                    title="Move Layer Down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleLayerProp(layer.id, 'visible');
                    }}
                    className="p-1 text-slate-400 hover:text-white"
                    title="Toggle Visibility"
                  >
                    {layer.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 text-slate-600" />}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleLayerProp(layer.id, 'locked');
                    }}
                    className="p-1 text-slate-400 hover:text-white"
                    title="Toggle Lock"
                  >
                    {layer.locked ? <Lock className="w-3 h-3 text-amber-400" /> : <Unlock className="w-3 h-3" />}
                  </button>
                  {activeLayout.layers.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteLayer(layer.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-500 hover:text-rose-400"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
};
