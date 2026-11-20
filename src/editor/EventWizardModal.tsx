import React, { useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Code2, Search, X, Zap } from 'lucide-react';
import {
  ActionSchema,
  BEHAVIOR_CATALOG,
  COMPARISON_OPTIONS,
  ConditionSchema,
  KEY_OPTIONS,
  ParamSchema,
  PLUGIN_CATALOG,
} from '../engine/catalog';
import { validateExpressionSyntax } from '../engine/expressionParser';
import { ActionItem, ConditionItem, ObjectType, ProjectData } from '../engine/types';
import { getObjectThumbnail, uid } from './helpers';

interface EventWizardModalProps {
  mode: 'condition' | 'action';
  project: ProjectData;
  initialCondition?: ConditionItem;
  initialAction?: ActionItem;
  onClose: () => void;
  onSaveCondition?: (cond: ConditionItem) => void;
  onSaveAction?: (action: ActionItem) => void;
}

interface ItemChoice {
  key: string;
  behaviorId?: string;
  groupLabel: string;
  schema: ConditionSchema | ActionSchema;
}

const MATH_SYSTEM_SNIPPETS = [
  { label: 'dt', snippet: 'dt', desc: 'Delta time (s)' },
  { label: 'time', snippet: 'time', desc: 'Game time (s)' },
  { label: 'random(a, b)', snippet: 'random(0, 100)', desc: 'Random float' },
  { label: 'choose(...)', snippet: 'choose(1, 2, 3)', desc: 'Random choice' },
  { label: 'clamp(x, min, max)', snippet: 'clamp(0, 0, 100)', desc: 'Clamp value' },
  { label: 'lerp(a, b, t)', snippet: 'lerp(0, 100, 0.5)', desc: 'Linear interp' },
  { label: 'distance(x1,y1,x2,y2)', snippet: 'distance(0, 0, 100, 100)', desc: '2D distance' },
  { label: 'angle(x1,y1,x2,y2)', snippet: 'angle(0, 0, 100, 100)', desc: 'Angle (deg)' },
  { label: 'sin(deg)', snippet: 'sin(0)', desc: 'Sine (degrees)' },
  { label: 'cos(deg)', snippet: 'cos(0)', desc: 'Cosine (degrees)' },
  { label: 'round(x)', snippet: 'round(0)', desc: 'Round integer' },
  { label: 'rgbEx255(r,g,b)', snippet: 'rgbEx255(34, 211, 238)', desc: 'RGB color string' },
  { label: 'Mouse.X / Mouse.Y', snippet: 'Mouse.X', desc: 'Cursor world X' },
  { label: 'newline', snippet: 'newline', desc: 'Line break' },
];

export const EventWizardModal: React.FC<EventWizardModalProps> = ({
  mode,
  project,
  initialCondition,
  initialAction,
  onClose,
  onSaveCondition,
  onSaveAction,
}) => {
  const initialItem = initialCondition || initialAction;
  const [step, setStep] = useState<1 | 2 | 3>(initialItem ? 3 : 1);
  const [selectedObjId, setSelectedObjId] = useState<string>(initialItem?.objectTypeId || '');
  const [selectedBehaviorId, setSelectedBehaviorId] = useState<string | undefined>(initialItem?.behaviorId);
  const [selectedSchemaId, setSelectedSchemaId] = useState<string>(
    initialCondition?.conditionId || initialAction?.actionId || ''
  );
  const [params, setParams] = useState<Record<string, string>>(initialItem?.params || {});
  const [inverted, setInverted] = useState<boolean>(Boolean(initialCondition?.inverted));
  const [searchQuery, setSearchQuery] = useState('');
  const [activeExprParam, setActiveExprParam] = useState<string | null>(null);

  const selectedObj = useMemo(
    () => project.objectTypes.find((o) => o.id === selectedObjId),
    [project.objectTypes, selectedObjId]
  );

  const availableChoices: ItemChoice[] = useMemo(() => {
    if (!selectedObj) return [];
    const pluginEntry = PLUGIN_CATALOG[selectedObj.plugin];
    if (!pluginEntry) return [];

    const list: ItemChoice[] = [];
    const schemas = mode === 'condition' ? pluginEntry.conditions : pluginEntry.actions;
    for (const s of schemas) {
      list.push({
        key: `plugin:${s.id}`,
        groupLabel: pluginEntry.name,
        schema: s,
      });
    }

    for (const bDef of selectedObj.behaviorDefs) {
      const bEntry = BEHAVIOR_CATALOG[bDef.type];
      if (!bEntry) continue;
      const bSchemas = mode === 'condition' ? bEntry.conditions : bEntry.actions;
      for (const s of bSchemas) {
        list.push({
          key: `beh:${bDef.id}:${s.id}`,
          behaviorId: bDef.id,
          groupLabel: `Behavior: ${bEntry.name}`,
          schema: s,
        });
      }
    }
    return list;
  }, [selectedObj, mode]);

  const selectedChoice = useMemo(
    () =>
      availableChoices.find(
        (c) => c.schema.id === selectedSchemaId && (c.behaviorId || undefined) === (selectedBehaviorId || undefined)
      ),
    [availableChoices, selectedSchemaId, selectedBehaviorId]
  );

  const visualObjects = useMemo(
    () => project.objectTypes.filter((o) => !o.isGlobalPlugin),
    [project.objectTypes]
  );
  const globalObjects = useMemo(
    () =>
      project.objectTypes.filter((o) => {
        if (!o.isGlobalPlugin) return false;
        const entry = PLUGIN_CATALOG[o.plugin];
        if (!entry) return false;
        return mode === 'condition' ? entry.conditions.length > 0 : entry.actions.length > 0;
      }),
    [project.objectTypes, mode]
  );

  const handleSelectObject = (ot: ObjectType) => {
    setSelectedObjId(ot.id);
    setSelectedBehaviorId(undefined);
    setSelectedSchemaId('');
    setSearchQuery('');
    setStep(2);
  };

  const handleSelectChoice = (choice: ItemChoice) => {
    setSelectedBehaviorId(choice.behaviorId);
    setSelectedSchemaId(choice.schema.id);
    const defaults: Record<string, string> = {};
    for (const p of choice.schema.params) {
      if (p.type === 'globalVar') {
        defaults[p.id] = project.globalVariables[0]?.name || '';
      } else if (p.type === 'instVar') {
        defaults[p.id] = selectedObj?.instVarDefs[0]?.name || '';
      } else if (p.type === 'object') {
        defaults[p.id] = visualObjects.find((o) => o.id !== selectedObjId)?.id || visualObjects[0]?.id || '';
      } else if (p.type === 'layout') {
        defaults[p.id] = project.layouts[0]?.id || '';
      } else {
        defaults[p.id] = p.defaultValue;
      }
    }
    setParams(defaults);
    setActiveExprParam(choice.schema.params.find((p) => p.type === 'expression')?.id || null);

    // If no parameters needed, allow instant save or review in step 3
    if (choice.schema.params.length === 0) {
      commitSelection(selectedObjId, choice.behaviorId, choice.schema.id, defaults);
    } else {
      setStep(3);
    }
  };

  const commitSelection = (
    objId: string,
    behId: string | undefined,
    schemaId: string,
    finalParams: Record<string, string>
  ) => {
    if (mode === 'condition' && onSaveCondition) {
      onSaveCondition({
        id: initialCondition?.id || uid('cond'),
        objectTypeId: objId,
        behaviorId: behId,
        conditionId: schemaId,
        inverted,
        params: finalParams,
      });
    } else if (mode === 'action' && onSaveAction) {
      onSaveAction({
        id: initialAction?.id || uid('act'),
        objectTypeId: objId,
        behaviorId: behId,
        actionId: schemaId,
        params: finalParams,
      });
    }
    onClose();
  };

  const insertSnippet = (snippet: string) => {
    if (!activeExprParam) return;
    setParams((prev) => {
      const cur = prev[activeExprParam] ?? '';
      const next = cur.trim() === '' || cur === '0' || cur === '""' ? snippet : `${cur}${snippet}`;
      return { ...prev, [activeExprParam]: next };
    });
  };

  const filteredChoices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return availableChoices;
    return availableChoices.filter(
      (c) =>
        c.schema.name.toLowerCase().includes(q) ||
        c.schema.description.toLowerCase().includes(q) ||
        c.groupLabel.toLowerCase().includes(q)
    );
  }, [availableChoices, searchQuery]);

  const groupedChoices = useMemo(() => {
    const map = new Map<string, ItemChoice[]>();
    for (const c of filteredChoices) {
      const arr = map.get(c.groupLabel) || [];
      arr.push(c);
      map.set(c.groupLabel, arr);
    }
    return Array.from(map.entries());
  }, [filteredChoices]);

  const exprSuggestions = useMemo(() => {
    const items: { label: string; snippet: string; desc: string }[] = [];
    for (const gv of project.globalVariables) {
      items.push({ label: gv.name, snippet: gv.name, desc: `Global (${gv.type})` });
    }
    for (const vo of visualObjects) {
      items.push({ label: `${vo.name}.X`, snippet: `${vo.name}.X`, desc: 'X coordinate' });
      items.push({ label: `${vo.name}.Y`, snippet: `${vo.name}.Y`, desc: 'Y coordinate' });
      for (const iv of vo.instVarDefs) {
        items.push({ label: `${vo.name}.${iv.name}`, snippet: `${vo.name}.${iv.name}`, desc: 'Instance var' });
      }
      for (const b of vo.behaviorDefs) {
        const bEntry = BEHAVIOR_CATALOG[b.type];
        for (const exp of bEntry?.expressions || []) {
          const bPrefix = b.type === 'EightDirection' ? 'EightDir' : b.type;
          const snippet = exp.syntax
            ? exp.syntax.replace(/^Obj\./, `${vo.name}.`)
            : `${vo.name}.${bPrefix}.${exp.name}`;
          items.push({
            label: `${vo.name}.${bPrefix}.${exp.name}`,
            snippet,
            desc: exp.description,
          });
        }
      }
    }
    return [...items, ...MATH_SYSTEM_SNIPPETS];
  }, [project.globalVariables, visualObjects]);

  const renderParamInput = (p: ParamSchema) => {
    const val = params[p.id] ?? p.defaultValue;

    if (p.type === 'comparison') {
      return (
        <select
          value={val}
          onChange={(e) => setParams({ ...params, [p.id]: e.target.value })}
          className="w-full px-3 py-2 text-sm bg-[#14161b] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
        >
          {COMPARISON_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    }

    if (p.type === 'key') {
      return (
        <select
          value={val}
          onChange={(e) => setParams({ ...params, [p.id]: e.target.value })}
          className="w-full px-3 py-2 text-sm bg-[#14161b] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
        >
          {KEY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    }

    if (p.type === 'select' && p.options) {
      return (
        <select
          value={val}
          onChange={(e) => setParams({ ...params, [p.id]: e.target.value })}
          className="w-full px-3 py-2 text-sm bg-[#14161b] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
        >
          {p.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    }

    if (p.type === 'globalVar') {
      return (
        <select
          value={val}
          onChange={(e) => setParams({ ...params, [p.id]: e.target.value })}
          className="w-full px-3 py-2 text-sm bg-[#14161b] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
        >
          {project.globalVariables.length === 0 && <option value="">No global variables defined</option>}
          {project.globalVariables.map((gv) => (
            <option key={gv.id} value={gv.name}>
              {gv.name} ({gv.type})
            </option>
          ))}
        </select>
      );
    }

    if (p.type === 'instVar') {
      const vars = selectedObj?.instVarDefs || [];
      return (
        <select
          value={val}
          onChange={(e) => setParams({ ...params, [p.id]: e.target.value })}
          className="w-full px-3 py-2 text-sm bg-[#14161b] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
        >
          {vars.length === 0 && <option value="">No instance variables on {selectedObj?.name}</option>}
          {vars.map((iv) => (
            <option key={iv.id} value={iv.name}>
              {iv.name} ({iv.type})
            </option>
          ))}
        </select>
      );
    }

    if (p.type === 'object') {
      return (
        <select
          value={val}
          onChange={(e) => setParams({ ...params, [p.id]: e.target.value })}
          className="w-full px-3 py-2 text-sm bg-[#14161b] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
        >
          {visualObjects.map((vo) => (
            <option key={vo.id} value={vo.id}>
              {vo.name} ({vo.plugin})
            </option>
          ))}
        </select>
      );
    }

    if (p.type === 'layout') {
      return (
        <select
          value={val}
          onChange={(e) => setParams({ ...params, [p.id]: e.target.value })}
          className="w-full px-3 py-2 text-sm bg-[#14161b] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
        >
          {project.layouts.map((lay) => (
            <option key={lay.id} value={lay.id}>
              {lay.name}
            </option>
          ))}
        </select>
      );
    }

    // Expression / text input
    const syntaxErr = p.type === 'expression' ? validateExpressionSyntax(val) : null;
    return (
      <div>
        <input
          type="text"
          value={val}
          onFocus={() => setActiveExprParam(p.id)}
          onChange={(e) => setParams({ ...params, [p.id]: e.target.value })}
          placeholder={p.placeholder || p.defaultValue}
          className={`w-full px-3 py-2 text-sm font-mono bg-[#14161b] border rounded-lg text-slate-100 focus:outline-none ${
            syntaxErr ? 'border-rose-500' : 'border-slate-700 focus:border-cyan-500'
          }`}
        />
        {syntaxErr && <p className="mt-1 text-xs text-rose-400">{syntaxErr}</p>}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="w-full max-w-3xl bg-[#1a1d24] border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header with 3-step breadcrumb */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-[#21252e]">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-slate-100">
              {initialItem ? 'Edit' : 'Add'} {mode === 'condition' ? 'Condition' : 'Action'}
            </h2>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <button
                type="button"
                onClick={() => setStep(1)}
                className={step === 1 ? 'text-cyan-400 font-semibold' : 'hover:text-slate-200'}
              >
                1. Object
              </button>
              <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
              <button
                type="button"
                disabled={!selectedObj}
                onClick={() => selectedObj && setStep(2)}
                className={step === 2 ? 'text-cyan-400 font-semibold' : 'hover:text-slate-200 disabled:opacity-40'}
              >
                2. {mode === 'condition' ? 'Condition' : 'Action'}
              </button>
              <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
              <span className={step === 3 ? 'text-cyan-400 font-semibold' : 'text-slate-500'}>3. Parameters</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-100 rounded-md hover:bg-slate-700/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step 1: Choose Object */}
        {step === 1 && (
          <div className="p-5 overflow-y-auto space-y-5">
            <div>
              <div className="text-xs font-medium text-slate-400 mb-2.5">Project Objects</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {visualObjects.map((ot) => {
                  const thumb = getObjectThumbnail(ot);
                  return (
                    <button
                      key={ot.id}
                      type="button"
                      onClick={() => handleSelectObject(ot)}
                      className="flex items-center gap-3 p-3 rounded-lg bg-[#14161b] border border-slate-800 hover:border-cyan-500/70 hover:bg-[#1e222b] text-left transition-colors"
                    >
                      <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center shrink-0 overflow-hidden">
                        {thumb ? (
                          <img src={thumb} alt={ot.name} className="w-7 h-7 object-contain" />
                        ) : (
                          <span className="text-xs font-mono text-cyan-400">{ot.plugin.slice(0, 2)}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-100 truncate">{ot.name}</div>
                        <div className="text-[11px] text-slate-400">{ot.plugin}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-slate-400 mb-2.5">System &amp; Built-in Plugins</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {globalObjects.map((ot) => (
                  <button
                    key={ot.id}
                    type="button"
                    onClick={() => handleSelectObject(ot)}
                    className="flex items-center gap-3 p-3 rounded-lg bg-[#14161b] border border-slate-800 hover:border-indigo-500/70 hover:bg-[#1e222b] text-left transition-colors"
                  >
                    <div className="w-8 h-8 rounded bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center shrink-0">
                      <span className="text-xs font-mono text-indigo-300">{ot.name.slice(0, 2).toUpperCase()}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-100 truncate">{ot.name}</div>
                      <div className="text-[11px] text-slate-400">Built-in</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Choose Condition / Action */}
        {step === 2 && selectedObj && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="p-4 border-b border-slate-800 flex items-center gap-3 bg-[#181a20]">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="p-1.5 rounded-lg bg-[#14161b] border border-slate-700 text-slate-300 hover:text-white"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Search ${selectedObj.name} ${mode}s...`}
                  className="w-full pl-9 pr-3 py-1.5 text-sm bg-[#14161b] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="p-4 overflow-y-auto space-y-4">
              {groupedChoices.map(([groupName, items]) => (
                <div key={groupName}>
                  <div className="text-xs font-semibold text-slate-400 mb-2">{groupName}</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {items.map((choice) => {
                      const isTrig = 'isTrigger' in choice.schema && choice.schema.isTrigger;
                      return (
                        <button
                          key={choice.key}
                          type="button"
                          onClick={() => handleSelectChoice(choice)}
                          className="text-left p-3 rounded-lg bg-[#14161b] border border-slate-800 hover:border-cyan-500/70 hover:bg-[#1e222b] transition-colors"
                        >
                          <div className="flex items-center gap-1.5 mb-0.5">
                            {isTrig && <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                            <span className="text-sm font-medium text-slate-100">{choice.schema.name}</span>
                          </div>
                          <p className="text-xs text-slate-400 leading-snug">{choice.schema.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Parameters + Expression Helper */}
        {step === 3 && selectedObj && selectedChoice && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <div className="text-xs text-cyan-400 font-medium">
                    {selectedObj.name} · {selectedChoice.groupLabel}
                  </div>
                  <div className="text-base font-semibold text-slate-100">{selectedChoice.schema.name}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="text-xs text-slate-400 hover:text-slate-200 underline"
                >
                  Change {mode}
                </button>
              </div>

              {selectedChoice.schema.params.length === 0 ? (
                <p className="text-sm text-slate-400">This {mode} requires no parameters.</p>
              ) : (
                <div className="space-y-3">
                  {selectedChoice.schema.params.map((p) => (
                    <div key={p.id}>
                      <label className="block text-xs font-medium text-slate-300 mb-1">{p.label}</label>
                      {renderParamInput(p)}
                    </div>
                  ))}
                </div>
              )}

              {mode === 'condition' && !('isTrigger' in selectedChoice.schema && selectedChoice.schema.isTrigger) && (
                <label className="flex items-center gap-2 pt-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={inverted}
                    onChange={(e) => setInverted(e.target.checked)}
                    className="rounded border-slate-600 bg-[#14161b] text-cyan-400"
                  />
                  Invert condition (negate logic)
                </label>
              )}

              {/* Expression Autocomplete Helper */}
              {selectedChoice.schema.params.some((p) => p.type === 'expression') && (
                <div className="mt-4 pt-4 border-t border-slate-800">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-2">
                    <Code2 className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Expression Reference (click to insert into active field)</span>
                  </div>
                  <div className="max-h-36 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-1.5 pr-1">
                    {exprSuggestions.slice(0, 120).map((item, i) => (
                      <button
                        key={`${item.label}_${i}`}
                        type="button"
                        onClick={() => insertSnippet(item.snippet)}
                        title={item.desc}
                        className="text-left px-2.5 py-1.5 rounded bg-[#14161b] border border-slate-800 hover:border-cyan-500/60 text-xs font-mono text-cyan-300 truncate"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-800 bg-[#181a20]">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white rounded-lg hover:bg-slate-800"
              >
                Back
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-1.5 text-xs font-medium text-slate-300 hover:text-white rounded-lg hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() =>
                    commitSelection(selectedObjId, selectedBehaviorId, selectedSchemaId, params)
                  }
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg"
                >
                  <Check className="w-3.5 h-3.5" />
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
