import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioWaveform,
  Download,
  FileCode2,
  FilePlus2,
  FolderUp,
  Gamepad2,
  Map as MapIcon,
  PackageOpen,
  Play,
  Redo2,
  RotateCcw,
  Save,
  Undo2,
} from 'lucide-react';
import { AddObjectModal } from './editor/AddObjectModal';
import { EventSheetView } from './editor/EventSheetView';
import {
  cloneProject,
  loadProjectFromLocalStorage,
  normalizeLoadedProject,
  saveProjectToLocalStorage,
  uid,
} from './editor/helpers';
import { ImportC3Modal } from './editor/ImportC3Modal';
import { LayoutView } from './editor/LayoutView';
import { PreviewModal } from './editor/PreviewModal';
import { ProjectSidebar } from './editor/ProjectSidebar';
import { PropertiesBar } from './editor/PropertiesBar';
import { SfxStudioModal } from './editor/SfxStudioModal';
import { SpriteEditorModal } from './editor/SpriteEditorModal';
import {
  importConstruct3Archive,
  importConstruct3Json,
  isConstruct3Json,
} from './engine/c3Importer';
import { createBlankProject, createDemoProject } from './engine/demoProject';
import { buildSingleHtmlExport } from './engine/exporter';
import {
  EventSheetData,
  GlobalVariable,
  InstanceData,
  LayerData,
  LayoutData,
  ObjectType,
  ProjectData,
} from './engine/types';

export default function App() {
  const [project, setProject] = useState<ProjectData>(() => {
    return loadProjectFromLocalStorage() || createDemoProject();
  });

  const [historyPast, setHistoryPast] = useState<ProjectData[]>([]);
  const [historyFuture, setHistoryFuture] = useState<ProjectData[]>([]);

  const [activeTab, setActiveTab] = useState<'layout' | 'eventsheet'>('layout');
  const [activeLayoutId, setActiveLayoutId] = useState<string>(() => project.startupLayoutId || project.layouts[0]?.id);
  const [activeEventSheetId, setActiveEventSheetId] = useState<string>(() => project.eventSheets[0]?.id || '');
  const [activeLayerId, setActiveLayerId] = useState<string>(
    () => project.layouts[0]?.layers[0]?.id || ''
  );

  const [selectedInstanceUids, setSelectedInstanceUids] = useState<number[]>([]);
  const [selectedObjectTypeId, setSelectedObjectTypeId] = useState<string | null>(null);
  const [inspectorMode, setInspectorMode] = useState<'project' | 'layout' | 'layer' | 'object' | 'instance'>('layout');

  const [showAddObjectModal, setShowAddObjectModal] = useState(false);
  const [showImportC3, setShowImportC3] = useState(false);
  const [showSfxStudio, setShowSfxStudio] = useState(false);
  const [editingSpriteOt, setEditingSpriteOt] = useState<ObjectType | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeLayout = useMemo(
    () => project.layouts.find((l) => l.id === activeLayoutId) || project.layouts[0],
    [project.layouts, activeLayoutId]
  );

  const activeEventSheet = useMemo(
    () => project.eventSheets.find((s) => s.id === activeEventSheetId) || project.eventSheets[0],
    [project.eventSheets, activeEventSheetId]
  );

  const activeLayer = useMemo(
    () => activeLayout?.layers.find((l) => l.id === activeLayerId) || activeLayout?.layers[0],
    [activeLayout, activeLayerId]
  );

  const selectedInstances = useMemo(() => {
    if (!activeLayout || selectedInstanceUids.length === 0) return [];
    const list: InstanceData[] = [];
    for (const layer of activeLayout.layers) {
      for (const inst of layer.instances) {
        if (selectedInstanceUids.includes(inst.uid)) list.push(inst);
      }
    }
    return list;
  }, [activeLayout, selectedInstanceUids]);

  const selectedObjectType = useMemo(
    () => project.objectTypes.find((o) => o.id === selectedObjectTypeId),
    [project.objectTypes, selectedObjectTypeId]
  );

  // Persist to localStorage (debounced)
  useEffect(() => {
    const t = window.setTimeout(() => {
      saveProjectToLocalStorage(project);
    }, 450);
    return () => window.clearTimeout(t);
  }, [project]);

  const showToast = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 2600);
  };

  // Push history mutation helper
  const commitProject = useCallback((updater: (prev: ProjectData) => ProjectData, recordHistory = true) => {
    setProject((prev) => {
      const next = updater(prev);
      if (next === prev) return prev;
      if (recordHistory) {
        setHistoryPast((past) => [...past.slice(-39), cloneProject(prev)]);
        setHistoryFuture([]);
      }
      return next;
    });
  }, []);

  const handleUndo = useCallback(() => {
    setHistoryPast((past) => {
      if (past.length === 0) return past;
      const previous = past[past.length - 1];
      setProject((current) => {
        setHistoryFuture((fut) => [cloneProject(current), ...fut.slice(0, 39)]);
        return previous;
      });
      return past.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setHistoryFuture((fut) => {
      if (fut.length === 0) return fut;
      const next = fut[0];
      setProject((current) => {
        setHistoryPast((past) => [...past.slice(-39), cloneProject(current)]);
        return next;
      });
      return fut.slice(1);
    });
  }, []);

  // Global Undo/Redo keyboard shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  // Handlers
  const handleSelectLayout = (layoutId: string) => {
    const lay = project.layouts.find((l) => l.id === layoutId);
    setActiveLayoutId(layoutId);
    if (lay) {
      setActiveLayerId(lay.layers[0]?.id || '');
      if (lay.eventSheetId) setActiveEventSheetId(lay.eventSheetId);
    }
    setSelectedInstanceUids([]);
    setInspectorMode('layout');
    setActiveTab('layout');
  };

  const handleAddLayout = () => {
    const sheetId = uid('es');
    const layId = uid('layout');
    const layerId = uid('layer');
    const num = project.layouts.length + 1;
    commitProject((p) => ({
      ...p,
      eventSheets: [...p.eventSheets, { id: sheetId, name: `Events ${num}`, items: [] }],
      layouts: [
        ...p.layouts,
        {
          id: layId,
          name: `Layout ${num}`,
          width: p.viewportWidth * 2,
          height: p.viewportHeight,
          backgroundColor: '#0f172a',
          eventSheetId: sheetId,
          layers: [
            {
              id: layerId,
              name: 'Layer 0',
              visible: true,
              locked: false,
              opacity: 100,
              parallaxX: 100,
              parallaxY: 100,
              transparent: true,
              instances: [],
            },
          ],
        },
      ],
    }));
    setActiveLayoutId(layId);
    setActiveLayerId(layerId);
    setActiveEventSheetId(sheetId);
    setActiveTab('layout');
  };

  const handleDeleteLayout = (layoutId: string) => {
    if (project.layouts.length <= 1) return;
    commitProject((p) => {
      const remaining = p.layouts.filter((l) => l.id !== layoutId);
      return {
        ...p,
        startupLayoutId: p.startupLayoutId === layoutId ? remaining[0].id : p.startupLayoutId,
        layouts: remaining,
      };
    });
    if (activeLayoutId === layoutId) {
      const fallback = project.layouts.find((l) => l.id !== layoutId);
      if (fallback) handleSelectLayout(fallback.id);
    }
  };

  const handleAddEventSheet = () => {
    const id = uid('es');
    const name = `Event sheet ${project.eventSheets.length + 1}`;
    commitProject((p) => ({
      ...p,
      eventSheets: [...p.eventSheets, { id, name, items: [] }],
    }));
    setActiveEventSheetId(id);
    setActiveTab('eventsheet');
  };

  const handleUpdateEventSheet = (updated: EventSheetData) => {
    commitProject((p) => ({
      ...p,
      eventSheets: p.eventSheets.map((s) => (s.id === updated.id ? updated : s)),
    }));
  };

  const handleDropNewObject = (objectTypeId: string, x: number, y: number) => {
    const ot = project.objectTypes.find((o) => o.id === objectTypeId);
    if (!ot || !activeLayout) return;
    const targetLayerId = activeLayer?.id || activeLayout.layers[0]?.id;
    if (!targetLayerId) return;

    const instVars: Record<string, string | number | boolean> = {};
    for (const iv of ot.instVarDefs) {
      instVars[iv.name] = iv.initialValue;
    }

    const newUid = project.nextUid;
    const isTilemap = ot.plugin === 'Tilemap' && ot.tilemapConfig;
    const cols = isTilemap ? ot.tilemapConfig!.columns || 16 : undefined;
    const rows = isTilemap ? ot.tilemapConfig!.rows || 12 : undefined;
    const newInst: InstanceData = {
      uid: newUid,
      objectTypeId: ot.id,
      x,
      y,
      width: isTilemap ? cols! * (ot.tilemapConfig!.tileWidth || 32) : ot.defaultWidth,
      height: isTilemap ? rows! * (ot.tilemapConfig!.tileHeight || 32) : ot.defaultHeight,
      angle: 0,
      opacity: 100,
      visible: true,
      instVars,
      behaviorProps: {},
      ...(isTilemap
        ? {
            mapWidth: cols,
            mapHeight: rows,
            tileData: new Array(cols! * rows!).fill(-1),
          }
        : {}),
    };

    commitProject((p) => ({
      ...p,
      nextUid: newUid + 1,
      layouts: p.layouts.map((l) =>
        l.id !== activeLayout.id
          ? l
          : {
              ...l,
              layers: l.layers.map((layer) =>
                layer.id === targetLayerId ? { ...layer, instances: [...layer.instances, newInst] } : layer
              ),
            }
      ),
    }));
    setSelectedInstanceUids([newUid]);
    setInspectorMode('instance');
  };

  const handleUpdateInstances = (
    updater: (instances: InstanceData[], layerId: string) => InstanceData[],
    specificLayerId?: string
  ) => {
    if (!activeLayout) return;
    commitProject(
      (p) => ({
        ...p,
        layouts: p.layouts.map((l) =>
          l.id !== activeLayout.id
            ? l
            : {
                ...l,
                layers: l.layers.map((layer) =>
                  !specificLayerId || layer.id === specificLayerId
                    ? { ...layer, instances: updater(layer.instances, layer.id) }
                    : layer
                ),
              }
        ),
      }),
      false
    );
  };

  const handleDuplicateSelected = () => {
    if (!activeLayout || selectedInstanceUids.length === 0) return;
    let nextUid = project.nextUid;
    const newUids: number[] = [];

    commitProject((p) => ({
      ...p,
      layouts: p.layouts.map((l) =>
        l.id !== activeLayout.id
          ? l
          : {
              ...l,
              layers: l.layers.map((layer) => {
                const extras: InstanceData[] = [];
                for (const inst of layer.instances) {
                  if (selectedInstanceUids.includes(inst.uid)) {
                    const cloned: InstanceData = JSON.parse(JSON.stringify(inst));
                    cloned.uid = nextUid++;
                    cloned.x += 16;
                    cloned.y += 16;
                    newUids.push(cloned.uid);
                    extras.push(cloned);
                  }
                }
                return extras.length > 0 ? { ...layer, instances: [...layer.instances, ...extras] } : layer;
              }),
            }
      ),
      nextUid,
    }));
    if (newUids.length > 0) setSelectedInstanceUids(newUids);
  };

  const handleDeleteSelected = () => {
    if (!activeLayout || selectedInstanceUids.length === 0) return;
    commitProject((p) => ({
      ...p,
      layouts: p.layouts.map((l) =>
        l.id !== activeLayout.id
          ? l
          : {
              ...l,
              layers: l.layers.map((layer) => ({
                ...layer,
                instances: layer.instances.filter((i) => !selectedInstanceUids.includes(i.uid)),
              })),
            }
      ),
    }));
    setSelectedInstanceUids([]);
    setInspectorMode('layout');
  };

  const handleExportHtml = () => {
    const html = buildSingleHtmlExport(project);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (project.name || 'my-game').toLowerCase().replace(/[^a-z0-9-_]+/g, '-');
    a.href = url;
    a.download = `${safeName}.html`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${safeName}.html`);
  };

  const handleSaveJson = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (project.name || 'project').toLowerCase().replace(/[^a-z0-9-_]+/g, '-');
    a.href = url;
    a.download = `${safeName}.destruct.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Saved ${safeName}.destruct.json`);
  };

  const applyLoadedProject = (parsed: ProjectData, toastText: string) => {
    const startLayout =
      parsed.layouts.find((l) => l.id === parsed.startupLayoutId) || parsed.layouts[0];
    setProject(parsed);
    setHistoryPast([]);
    setHistoryFuture([]);
    setActiveLayoutId(startLayout?.id || '');
    setActiveLayerId(startLayout?.layers[0]?.id || '');
    setActiveEventSheetId(startLayout?.eventSheetId || parsed.eventSheets[0]?.id || '');
    setSelectedInstanceUids([]);
    setSelectedObjectTypeId(null);
    setInspectorMode('layout');
    showToast(toastText);
  };

  const handleLoadJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const lower = file.name.toLowerCase();
    try {
      if (lower.endsWith('.c3p') || lower.endsWith('.zip')) {
        showToast('Importing Construct 3 archive...');
        const res = await importConstruct3Archive(file);
        const parsed = normalizeLoadedProject(res.project);
        applyLoadedProject(
          parsed,
          `Imported C3 "${res.report.projectName}" (${res.report.objectCount} objects)`
        );
        return;
      }

      const text = await file.text();
      const rawParsed = JSON.parse(text) as unknown;

      if (lower.endsWith('.c3proj') || isConstruct3Json(rawParsed)) {
        const res = await importConstruct3Json(text, file.name);
        const parsed = normalizeLoadedProject(res.project);
        applyLoadedProject(parsed, `Imported C3 "${res.report.projectName}"`);
        return;
      }

      const destructParsed = rawParsed as ProjectData;
      if (!destructParsed.layouts || !destructParsed.objectTypes || !destructParsed.eventSheets) {
        throw new Error('Invalid project file');
      }
      const parsed = normalizeLoadedProject(destructParsed);
      applyLoadedProject(parsed, `Loaded "${parsed.name}"`);
    } catch {
      showToast('Could not parse project file (.json, .c3p, or .c3proj)');
    }
  };

  const handleResetDemo = () => {
    const demo = createDemoProject();
    setProject(demo);
    setHistoryPast([]);
    setHistoryFuture([]);
    setActiveLayoutId(demo.startupLayoutId);
    setActiveLayerId(demo.layouts[0].layers[0].id);
    setActiveEventSheetId(demo.eventSheets[0].id);
    setSelectedInstanceUids([]);
    setInspectorMode('layout');
    showToast('Reset to Destruct Mega Sandbox');
  };

  const handleNewBlankProject = () => {
    const blank = createBlankProject();
    setProject(blank);
    setHistoryPast([]);
    setHistoryFuture([]);
    setActiveLayoutId(blank.startupLayoutId);
    setActiveLayerId(blank.layouts[0].layers[0].id);
    setActiveEventSheetId(blank.eventSheets[0].id);
    setSelectedInstanceUids([]);
    setInspectorMode('layout');
    showToast('Created blank project');
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#14161b] text-slate-100 overflow-hidden">
      {/* Top IDE Bar */}
      <header className="h-12 px-4 border-b border-slate-800 bg-[#181a20] flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center">
              <Gamepad2 className="w-4 h-4 text-cyan-400" />
            </div>
            <span className="font-display font-bold text-sm tracking-tight text-white whitespace-nowrap">
              Destruct
            </span>
          </div>

          <span className="text-slate-700">/</span>

          <input
            type="text"
            value={project.name}
            onChange={(e) => commitProject((p) => ({ ...p, name: e.target.value }))}
            aria-label="Project Name"
            className="w-40 px-2 py-1 text-xs font-medium bg-[#14161b] border border-slate-800 hover:border-slate-700 focus:border-cyan-500 rounded text-slate-200 focus:outline-none truncate"
          />

          <div className="flex items-center gap-1 ml-1">
            <button
              type="button"
              disabled={historyPast.length === 0}
              onClick={handleUndo}
              title="Undo (Ctrl+Z)"
              className="p-1.5 rounded hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:pointer-events-none"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={historyFuture.length === 0}
              onClick={handleRedo}
              title="Redo (Ctrl+Y)"
              className="p-1.5 rounded hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:pointer-events-none"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {notice && (
            <span className="text-xs text-cyan-300 mr-2 font-medium whitespace-nowrap">{notice}</span>
          )}

          <button
            type="button"
            onClick={() => setShowSfxStudio(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/40 text-indigo-300 rounded-lg whitespace-nowrap shrink-0 transition-colors"
            title="Open 8-Bit Sound Generator"
          >
            <AudioWaveform className="w-3.5 h-3.5" /> SFX Studio
          </button>

          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg whitespace-nowrap shrink-0 transition-colors"
          >
            <Play className="w-3.5 h-3.5 fill-current" /> Preview
          </button>

          <button
            type="button"
            onClick={handleExportHtml}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 rounded-lg whitespace-nowrap shrink-0 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Export HTML
          </button>

          <div className="h-5 w-px bg-slate-800 mx-0.5" />

          <button
            type="button"
            onClick={handleSaveJson}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-[#21252e] hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg whitespace-nowrap shrink-0"
            title="Save Project (.json)"
          >
            <Save className="w-3.5 h-3.5" /> Save JSON
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-[#21252e] hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg whitespace-nowrap shrink-0"
            title="Load Project (.json, .c3p, .c3proj)"
          >
            <FolderUp className="w-3.5 h-3.5" /> Load
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.destruct.json,.c3p,.c3proj,application/json"
            onChange={handleLoadJson}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => setShowImportC3(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 rounded-lg whitespace-nowrap shrink-0 transition-colors"
            title="Import Construct 3 Project (.c3p, .c3proj, or Folder)"
          >
            <PackageOpen className="w-3.5 h-3.5" /> Import C3
          </button>

          <button
            type="button"
            onClick={handleNewBlankProject}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-[#21252e] hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg whitespace-nowrap shrink-0"
            title="New Blank Project"
          >
            <FilePlus2 className="w-3.5 h-3.5" /> New
          </button>

          <button
            type="button"
            onClick={handleResetDemo}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-[#21252e] hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg whitespace-nowrap shrink-0"
            title="Reset to Destruct Mega Sandbox"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset Demo
          </button>
        </div>
      </header>

      {/* Main 3-Column IDE Workspace */}
      <div className="flex flex-1 min-h-0">
        {/* Left Project & Layers Sidebar */}
        {activeLayout && (
          <ProjectSidebar
            project={project}
            activeLayout={activeLayout}
            activeEventSheetId={activeEventSheet?.id || ''}
            activeLayerId={activeLayer?.id || ''}
            selectedObjectTypeId={selectedObjectTypeId}
            inspectorMode={inspectorMode}
            onSelectLayout={handleSelectLayout}
            onAddLayout={handleAddLayout}
            onDeleteLayout={handleDeleteLayout}
            onSelectEventSheet={(sid) => {
              setActiveEventSheetId(sid);
              setActiveTab('eventsheet');
            }}
            onAddEventSheet={handleAddEventSheet}
            onSelectObjectType={(otId) => {
              setSelectedObjectTypeId(otId);
              setSelectedInstanceUids([]);
              setInspectorMode('object');
            }}
            onOpenAddObjectModal={() => setShowAddObjectModal(true)}
            onDoubleClickSprite={(ot) => setEditingSpriteOt(ot)}
            onDeleteObjectType={(otId) => {
              commitProject((p) => ({
                ...p,
                objectTypes: p.objectTypes.filter((o) => o.id !== otId),
                layouts: p.layouts.map((l) => ({
                  ...l,
                  layers: l.layers.map((lay) => ({
                    ...lay,
                    instances: lay.instances.filter((i) => i.objectTypeId !== otId),
                  })),
                })),
              }));
              setSelectedInstanceUids([]);
              setInspectorMode('layout');
            }}
            onSelectProjectRoot={() => {
              setSelectedInstanceUids([]);
              setInspectorMode('project');
            }}
            onAddGlobalVar={(gv: GlobalVariable) =>
              commitProject((p) => ({ ...p, globalVariables: [...p.globalVariables, gv] }))
            }
            onUpdateGlobalVar={(gv: GlobalVariable) =>
              commitProject((p) => ({
                ...p,
                globalVariables: p.globalVariables.map((v) => (v.id === gv.id ? gv : v)),
              }))
            }
            onDeleteGlobalVar={(id) =>
              commitProject((p) => ({
                ...p,
                globalVariables: p.globalVariables.filter((v) => v.id !== id),
              }))
            }
            onSelectLayer={(lid) => {
              setActiveLayerId(lid);
              setSelectedInstanceUids([]);
              setInspectorMode('layer');
            }}
            onAddLayer={() => {
              const newLayId = uid('layer');
              commitProject((p) => ({
                ...p,
                layouts: p.layouts.map((l) =>
                  l.id !== activeLayout.id
                    ? l
                    : {
                        ...l,
                        layers: [
                          ...l.layers,
                          {
                            id: newLayId,
                            name: `Layer ${l.layers.length}`,
                            visible: true,
                            locked: false,
                            opacity: 100,
                            parallaxX: 100,
                            parallaxY: 100,
                            transparent: true,
                            instances: [],
                          },
                        ],
                      }
                ),
              }));
              setActiveLayerId(newLayId);
            }}
            onDeleteLayer={(lid) => {
              if (activeLayout.layers.length <= 1) return;
              commitProject((p) => ({
                ...p,
                layouts: p.layouts.map((l) =>
                  l.id !== activeLayout.id
                    ? l
                    : { ...l, layers: l.layers.filter((lay) => lay.id !== lid) }
                ),
              }));
            }}
            onMoveLayer={(lid, dir) => {
              commitProject((p) => ({
                ...p,
                layouts: p.layouts.map((l) => {
                  if (l.id !== activeLayout.id) return l;
                  const idx = l.layers.findIndex((lay) => lay.id === lid);
                  const nextIdx = idx + dir;
                  if (idx < 0 || nextIdx < 0 || nextIdx >= l.layers.length) return l;
                  const copy = [...l.layers];
                  const [moved] = copy.splice(idx, 1);
                  copy.splice(nextIdx, 0, moved);
                  return { ...l, layers: copy };
                }),
              }));
            }}
            onToggleLayerProp={(lid, prop) => {
              commitProject((p) => ({
                ...p,
                layouts: p.layouts.map((l) =>
                  l.id !== activeLayout.id
                    ? l
                    : {
                        ...l,
                        layers: l.layers.map((lay) =>
                          lay.id === lid ? { ...lay, [prop]: !lay[prop] } : lay
                        ),
                      }
                ),
              }));
            }}
          />
        )}

        {/* Center Workspace Tabs & Canvas / Event Sheet */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0">
          <div className="h-9 px-3 border-b border-slate-800 bg-[#181a20] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('layout')}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-t border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'layout'
                    ? 'border-cyan-400 text-cyan-300 bg-[#14161b]'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <MapIcon className="w-3.5 h-3.5" />
                Layout: {activeLayout?.name}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('eventsheet')}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-t border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'eventsheet'
                    ? 'border-indigo-400 text-indigo-300 bg-[#14161b]'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileCode2 className="w-3.5 h-3.5" />
                Event Sheet: {activeEventSheet?.name}
              </button>
            </div>

            <div className="text-[11px] font-mono text-slate-500 tabular-nums">
              Viewport: {project.viewportWidth}×{project.viewportHeight}
            </div>
          </div>

          <div className="flex-1 min-h-0">
            {activeTab === 'layout' && activeLayout && (
              <LayoutView
                project={project}
                layout={activeLayout}
                activeLayerId={activeLayer?.id || ''}
                selectedInstanceUids={selectedInstanceUids}
                onSelectInstances={(uids) => {
                  setSelectedInstanceUids(uids);
                  if (uids.length > 0) setInspectorMode('instance');
                  else setInspectorMode('layout');
                }}
                onUpdateInstances={handleUpdateInstances}
                onUpdateObjectType={(ot) =>
                  commitProject((p) => ({
                    ...p,
                    objectTypes: p.objectTypes.map((o) => (o.id === ot.id ? ot : o)),
                  }))
                }
                onDropNewObject={handleDropNewObject}
                onDuplicateSelected={handleDuplicateSelected}
                onDeleteSelected={handleDeleteSelected}
                onDoubleClickSprite={(ot) => setEditingSpriteOt(ot)}
              />
            )}

            {activeTab === 'eventsheet' && activeEventSheet && (
              <EventSheetView
                project={project}
                sheet={activeEventSheet}
                onUpdateSheet={handleUpdateEventSheet}
              />
            )}
          </div>
        </main>

        {/* Right Properties Inspector */}
        {activeLayout && (
          <PropertiesBar
            project={project}
            activeLayout={activeLayout}
            activeLayer={activeLayer}
            selectedObjectType={selectedObjectType}
            selectedInstances={selectedInstances}
            inspectorMode={inspectorMode}
            onUpdateProjectMeta={(patch) => commitProject((p) => ({ ...p, ...patch }))}
            onUpdateLayout={(patch: Partial<LayoutData>) =>
              commitProject((p) => ({
                ...p,
                layouts: p.layouts.map((l) => (l.id === activeLayout.id ? { ...l, ...patch } : l)),
              }))
            }
            onUpdateLayer={(layerId: string, patch: Partial<LayerData>) =>
              commitProject((p) => ({
                ...p,
                layouts: p.layouts.map((l) =>
                  l.id !== activeLayout.id
                    ? l
                    : { ...l, layers: l.layers.map((lay) => (lay.id === layerId ? { ...lay, ...patch } : lay)) }
                ),
              }))
            }
            onUpdateObjectType={(ot) =>
              commitProject((p) => ({
                ...p,
                objectTypes: p.objectTypes.map((o) => (o.id === ot.id ? ot : o)),
              }))
            }
            onUpdateSelectedInstances={(updater) =>
              handleUpdateInstances((list) =>
                list.map((inst) => (selectedInstanceUids.includes(inst.uid) ? updater(inst) : inst))
              )
            }
            onMoveInstancesToLayer={(uids, targetLayerId) => {
              commitProject((p) => ({
                ...p,
                layouts: p.layouts.map((l) => {
                  if (l.id !== activeLayout.id) return l;
                  const moving: InstanceData[] = [];
                  const stripped = l.layers.map((lay) => {
                    const keep: InstanceData[] = [];
                    for (const i of lay.instances) {
                      if (uids.includes(i.uid)) moving.push(i);
                      else keep.push(i);
                    }
                    return { ...lay, instances: keep };
                  });
                  return {
                    ...l,
                    layers: stripped.map((lay) =>
                      lay.id === targetLayerId ? { ...lay, instances: [...lay.instances, ...moving] } : lay
                    ),
                  };
                }),
              }));
            }}
            onOpenSpriteEditor={(ot) => setEditingSpriteOt(ot)}
          />
        )}
      </div>

      {/* Modals */}
      {showAddObjectModal && (
        <AddObjectModal
          existingNames={project.objectTypes.map((o) => o.name)}
          onClose={() => setShowAddObjectModal(false)}
          onAdd={(ot) => {
            commitProject((p) => ({ ...p, objectTypes: [...p.objectTypes, ot] }));
            setSelectedObjectTypeId(ot.id);
            setSelectedInstanceUids([]);
            setInspectorMode('object');
            if (ot.plugin === 'Sprite') {
              setEditingSpriteOt(ot);
            }
          }}
        />
      )}

      {editingSpriteOt && (
        <SpriteEditorModal
          objectType={editingSpriteOt}
          onClose={() => setEditingSpriteOt(null)}
          onSave={(updated) => {
            commitProject((p) => ({
              ...p,
              objectTypes: p.objectTypes.map((o) => (o.id === updated.id ? updated : o)),
            }));
            setEditingSpriteOt(null);
          }}
        />
      )}

      {showSfxStudio && (
        <SfxStudioModal
          audioAssets={project.audioAssets || []}
          onClose={() => setShowSfxStudio(false)}
          onAddAsset={(asset) =>
            commitProject((p) => ({
              ...p,
              audioAssets: [...(p.audioAssets || []), asset],
            }))
          }
          onDeleteAsset={(id) =>
            commitProject((p) => ({
              ...p,
              audioAssets: (p.audioAssets || []).filter((a) => a.id !== id),
            }))
          }
        />
      )}

      {showImportC3 && (
        <ImportC3Modal
          onClose={() => setShowImportC3(false)}
          onImportProject={(imported, toastMsg) => applyLoadedProject(imported, toastMsg)}
        />
      )}

      {showPreview && (
        <PreviewModal
          project={project}
          startLayoutId={activeLayout?.id}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  );
}
