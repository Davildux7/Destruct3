import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Copy,
  EyeOff,
  FileCode2,
  FolderPlus,
  Plus,
  Search,
  Trash2,
  Zap,
} from 'lucide-react';
import {
  ActionItem,
  ConditionItem,
  EventBlock,
  EventGroup,
  EventInclude,
  EventItem,
  EventSheetData,
  ProjectData,
} from '../engine/types';
import { EventWizardModal } from './EventWizardModal';
import {
  appendSubEvent,
  formatActionText,
  formatConditionText,
  getObjectThumbnail,
  isTriggerCondition,
  moveItemInList,
  uid,
  updateEventSheetItems,
} from './helpers';

interface EventSheetViewProps {
  project: ProjectData;
  sheet: EventSheetData;
  onUpdateSheet: (updated: EventSheetData) => void;
}

type WizardState =
  | null
  | {
      mode: 'condition';
      eventId: string;
      initialCondition?: ConditionItem;
    }
  | {
      mode: 'action';
      eventId: string;
      initialAction?: ActionItem;
    }
  | {
      mode: 'new-event';
      parentId?: string;
    };

export const EventSheetView: React.FC<EventSheetViewProps> = ({ project, sheet, onUpdateSheet }) => {
  const [wizard, setWizard] = useState<WizardState>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [includePickerOpen, setIncludePickerOpen] = useState(false);

  const otherSheets = project.eventSheets.filter((s) => s.id !== sheet.id);

  const updateItems = (nextItems: EventItem[]) => {
    onUpdateSheet({ ...sheet, items: nextItems });
  };

  const handleAddEvent = (parentId?: string) => {
    setWizard({ mode: 'new-event', parentId });
  };

  const handleAddGroup = () => {
    const newGroup: EventGroup = {
      id: uid('grp'),
      kind: 'group',
      title: `Group ${sheet.items.filter((i) => i.kind === 'group').length + 1}`,
      activeAtStart: true,
      items: [],
    };
    updateItems([...sheet.items, newGroup]);
  };

  const handleAddInclude = (targetSheetId: string) => {
    const inc: EventInclude = {
      id: uid('inc'),
      kind: 'include',
      eventSheetId: targetSheetId,
    };
    updateItems([...sheet.items, inc]);
    setIncludePickerOpen(false);
  };

  const handleSaveCondition = (eventId: string, cond: ConditionItem, isEdit: boolean) => {
    const next = updateEventSheetItems(sheet.items, eventId, (item) => {
      if (item.kind !== 'event') return item;
      const conditions = isEdit
        ? item.conditions.map((c) => (c.id === cond.id ? cond : c))
        : [...item.conditions, cond];
      return { ...item, conditions };
    });
    updateItems(next);
  };

  const handleSaveAction = (eventId: string, action: ActionItem, isEdit: boolean) => {
    const next = updateEventSheetItems(sheet.items, eventId, (item) => {
      if (item.kind !== 'event') return item;
      const actions = isEdit
        ? item.actions.map((a) => (a.id === action.id ? action : a))
        : [...item.actions, action];
      return { ...item, actions };
    });
    updateItems(next);
  };

  const handleCreateNewEventWithCondition = (cond: ConditionItem, parentId?: string) => {
    const newEv: EventBlock = {
      id: uid('ev'),
      kind: 'event',
      conditions: [cond],
      actions: [],
      subEvents: [],
    };
    if (parentId) {
      updateItems(appendSubEvent(sheet.items, parentId, newEv));
    } else {
      updateItems([...sheet.items, newEv]);
    }
  };

  const handleDuplicateItem = (item: EventItem) => {
    const clone = JSON.parse(JSON.stringify(item)) as EventItem;
    const reId = (it: EventItem): EventItem => {
      if (it.kind === 'event') {
        return {
          ...it,
          id: uid('ev'),
          conditions: it.conditions.map((c) => ({ ...c, id: uid('cond') })),
          actions: it.actions.map((a) => ({ ...a, id: uid('act') })),
          subEvents: it.subEvents.map(reId),
        };
      }
      if (it.kind === 'group') {
        return { ...it, id: uid('grp'), items: it.items.map(reId) };
      }
      return { ...it, id: uid('inc') };
    };
    updateItems([...sheet.items, reId(clone)]);
  };

  const renderObjectBadge = (objectTypeId: string) => {
    const ot = project.objectTypes.find((o) => o.id === objectTypeId);
    const thumb = ot ? getObjectThumbnail(ot) : null;
    const name = ot?.name || 'System';
    return (
      <span className="inline-flex items-center gap-1.5 font-semibold text-slate-100 shrink-0">
        {thumb ? (
          <img src={thumb} alt={name} className="w-4 h-4 object-contain rounded-xs bg-slate-800" />
        ) : (
          <span className="w-4 h-4 rounded-xs bg-indigo-500/20 border border-indigo-500/40 text-[9px] font-mono text-indigo-300 flex items-center justify-center">
            {name.slice(0, 2).toUpperCase()}
          </span>
        )}
        <span className="text-xs">{name}</span>
      </span>
    );
  };

  const matchesSearch = (item: EventItem): boolean => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    if (item.kind === 'include') {
      const target = project.eventSheets.find((s) => s.id === item.eventSheetId);
      return (target?.name || '').toLowerCase().includes(q);
    }
    if (item.kind === 'group') {
      return item.title.toLowerCase().includes(q) || item.items.some(matchesSearch);
    }
    const condMatch = item.conditions.some((c) =>
      formatConditionText(c, project).toLowerCase().includes(q)
    );
    const actMatch = item.actions.some((a) =>
      formatActionText(a, project).toLowerCase().includes(q)
    );
    return condMatch || actMatch || item.subEvents.some(matchesSearch);
  };

  const renderEventItem = (item: EventItem, depth = 0): React.ReactNode => {
    if (!matchesSearch(item)) return null;

    if (item.kind === 'include') {
      const incSheet = project.eventSheets.find((s) => s.id === item.eventSheetId);
      return (
        <div
          key={item.id}
          style={{ marginLeft: depth * 22 }}
          className="flex items-center justify-between px-3.5 py-2 rounded-lg bg-[#1c2029] border border-indigo-500/40 text-xs"
        >
          <div className="flex items-center gap-2 text-indigo-300 font-medium">
            <FileCode2 className="w-4 h-4" />
            <span>Include Event Sheet:</span>
            <span className="font-semibold text-white">{incSheet?.name || 'Missing Sheet'}</span>
          </div>
          <button
            type="button"
            onClick={() => updateItems(updateEventSheetItems(sheet.items, item.id, () => null))}
            className="p-1 text-slate-400 hover:text-rose-400"
            title="Remove Include"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      );
    }

    if (item.kind === 'group') {
      const collapsed = collapsedGroups.has(item.id);
      return (
        <div key={item.id} style={{ marginLeft: depth * 22 }} className="space-y-1.5">
          <div
            className={`flex items-center justify-between px-3 py-2 rounded-lg border ${
              item.disabled
                ? 'bg-[#181a20] border-slate-800 opacity-50'
                : 'bg-[#212632] border-slate-700/80'
            }`}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setCollapsedGroups((prev) => {
                    const next = new Set(prev);
                    if (next.has(item.id)) next.delete(item.id);
                    else next.add(item.id);
                    return next;
                  })
                }
                className="p-0.5 text-slate-400 hover:text-white"
              >
                {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              <input
                type="text"
                value={item.title}
                onChange={(e) =>
                  updateItems(
                    updateEventSheetItems(sheet.items, item.id, (it) =>
                      it.kind === 'group' ? { ...it, title: e.target.value } : it
                    )
                  )
                }
                className="bg-transparent text-sm font-semibold text-cyan-300 focus:outline-none focus:border-b focus:border-cyan-500"
              />
              <label className="flex items-center gap-1 text-[11px] text-slate-400 ml-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={item.activeAtStart}
                  onChange={(e) =>
                    updateItems(
                      updateEventSheetItems(sheet.items, item.id, (it) =>
                        it.kind === 'group' ? { ...it, activeAtStart: e.target.checked } : it
                      )
                    )
                  }
                />
                Active on start
              </label>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleAddEvent(item.id)}
                className="px-2 py-1 text-[11px] font-medium text-cyan-300 hover:bg-cyan-500/15 rounded"
              >
                + Event
              </button>
              <button
                type="button"
                onClick={() => updateItems(moveItemInList(sheet.items, item.id, -1))}
                className="p-1 text-slate-400 hover:text-white"
                title="Move Up"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => updateItems(moveItemInList(sheet.items, item.id, 1))}
                className="p-1 text-slate-400 hover:text-white"
                title="Move Down"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => updateItems(updateEventSheetItems(sheet.items, item.id, () => null))}
                className="p-1 text-slate-400 hover:text-rose-400"
                title="Delete Group"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {!collapsed && (
            <div className="space-y-1.5 border-l border-slate-700/60 ml-3 pl-2">
              {item.items.map((child) => renderEventItem(child, 0))}
            </div>
          )}
        </div>
      );
    }

    // EventBlock
    const ev = item;
    return (
      <div key={ev.id} style={{ marginLeft: depth * 22 }} className="space-y-1.5">
        <div
          className={`rounded-lg border transition-colors ${
            ev.disabled
              ? 'bg-[#16181d] border-slate-800/70 opacity-45'
              : 'bg-[#1a1d24] border-slate-800 hover:border-slate-700'
          }`}
        >
          {/* Event Control Strip */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-800/70 bg-[#1e222b] rounded-t-lg text-[11px]">
            <div className="flex items-center gap-2">
              {ev.isElse && (
                <span className="font-mono font-semibold text-amber-300">ELSE</span>
              )}
              {ev.isOrBlock && (
                <span className="font-mono font-semibold text-indigo-300">OR BLOCK</span>
              )}
              {!ev.isElse && !ev.isOrBlock && (
                <span className="text-slate-500 font-mono">EVENT</span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  updateItems(
                    updateEventSheetItems(sheet.items, ev.id, (it) =>
                      it.kind === 'event' ? { ...it, isOrBlock: !it.isOrBlock } : it
                    )
                  )
                }
                className={`px-1.5 py-0.5 rounded font-mono ${
                  ev.isOrBlock ? 'bg-indigo-500/25 text-indigo-300' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Toggle OR block"
              >
                OR
              </button>
              <button
                type="button"
                onClick={() =>
                  updateItems(
                    updateEventSheetItems(sheet.items, ev.id, (it) =>
                      it.kind === 'event' ? { ...it, isElse: !it.isElse } : it
                    )
                  )
                }
                className={`px-1.5 py-0.5 rounded font-mono ${
                  ev.isElse ? 'bg-amber-500/25 text-amber-300' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Toggle Else"
              >
                Else
              </button>
              <button
                type="button"
                onClick={() => handleAddEvent(ev.id)}
                className="px-1.5 py-0.5 text-cyan-300 hover:bg-cyan-500/15 rounded"
                title="Add Sub-event"
              >
                + Sub-event
              </button>
              <button
                type="button"
                onClick={() =>
                  updateItems(
                    updateEventSheetItems(sheet.items, ev.id, (it) =>
                      it.kind === 'event' ? { ...it, disabled: !it.disabled } : it
                    )
                  )
                }
                className={`p-1 rounded ${ev.disabled ? 'text-amber-300' : 'text-slate-400 hover:text-white'}`}
                title="Toggle Disabled"
              >
                <EyeOff className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => updateItems(moveItemInList(sheet.items, ev.id, -1))}
                className="p-1 text-slate-400 hover:text-white"
                title="Move Up"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => updateItems(moveItemInList(sheet.items, ev.id, 1))}
                className="p-1 text-slate-400 hover:text-white"
                title="Move Down"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleDuplicateItem(ev)}
                className="p-1 text-slate-400 hover:text-white"
                title="Duplicate Event"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => updateItems(updateEventSheetItems(sheet.items, ev.id, () => null))}
                className="p-1 text-slate-400 hover:text-rose-400"
                title="Delete Event"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Split Conditions (Left) / Actions (Right) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-800/80">
            {/* Conditions Column */}
            <div className="lg:col-span-5 p-2.5 space-y-1.5">
              {ev.conditions.map((cond, idx) => {
                const isTrig = isTriggerCondition(cond, project);
                return (
                  <React.Fragment key={cond.id}>
                    {ev.isOrBlock && idx > 0 && (
                      <div className="text-[10px] font-mono text-indigo-400 px-1">— OR —</div>
                    )}
                    <div
                      onClick={() => setWizard({ mode: 'condition', eventId: ev.id, initialCondition: cond })}
                      className="group flex items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-[#14161b] border border-slate-800 hover:border-cyan-500/60 cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isTrig && <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                        {cond.inverted && (
                          <span className="text-[10px] font-mono font-semibold text-rose-400 shrink-0">
                            NOT
                          </span>
                        )}
                        {renderObjectBadge(cond.objectTypeId)}
                        <span className="text-xs text-slate-300 truncate">
                          {formatConditionText(cond, project)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateItems(
                            updateEventSheetItems(sheet.items, ev.id, (it) =>
                              it.kind === 'event'
                                ? { ...it, conditions: it.conditions.filter((c) => c.id !== cond.id) }
                                : it
                            )
                          );
                        }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-500 hover:text-rose-400"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </React.Fragment>
                );
              })}
              <button
                type="button"
                onClick={() => setWizard({ mode: 'condition', eventId: ev.id })}
                className="text-xs text-cyan-400 hover:text-cyan-300 px-1.5 py-0.5 rounded hover:bg-cyan-500/10"
              >
                + Add condition
              </button>
            </div>

            {/* Actions Column */}
            <div className="lg:col-span-7 p-2.5 space-y-1.5">
              {ev.actions.map((act) => (
                <div
                  key={act.id}
                  onClick={() => setWizard({ mode: 'action', eventId: ev.id, initialAction: act })}
                  className="group flex items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-[#14161b] border border-slate-800 hover:border-indigo-500/60 cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {renderObjectBadge(act.objectTypeId)}
                    <span className="text-xs text-slate-300 truncate">
                      {formatActionText(act, project)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      updateItems(
                        updateEventSheetItems(sheet.items, ev.id, (it) =>
                          it.kind === 'event'
                            ? { ...it, actions: it.actions.filter((a) => a.id !== act.id) }
                            : it
                        )
                      );
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-500 hover:text-rose-400"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setWizard({ mode: 'action', eventId: ev.id })}
                className="text-xs text-indigo-400 hover:text-indigo-300 px-1.5 py-0.5 rounded hover:bg-indigo-500/10"
              >
                + Add action
              </button>
            </div>
          </div>
        </div>

        {/* Sub-events */}
        {ev.subEvents.length > 0 && (
          <div className="space-y-1.5 border-l border-slate-700/70 ml-3 pl-2">
            {ev.subEvents.map((sub) => renderEventItem(sub, 0))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#14161b]">
      {/* Event Sheet Toolbar */}
      <div className="h-11 px-4 border-b border-slate-800 bg-[#181a20] flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleAddEvent()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg"
          >
            <Plus className="w-3.5 h-3.5" /> Add Event
          </button>
          <button
            type="button"
            onClick={handleAddGroup}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#21252e] hover:bg-slate-700 border border-slate-700 rounded-lg"
          >
            <FolderPlus className="w-3.5 h-3.5 text-cyan-400" /> Add Group
          </button>
          {otherSheets.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setIncludePickerOpen((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#21252e] hover:bg-slate-700 border border-slate-700 rounded-lg"
              >
                <FileCode2 className="w-3.5 h-3.5 text-indigo-400" /> Include Sheet
              </button>
              {includePickerOpen && (
                <div className="absolute left-0 top-full mt-1 w-48 bg-[#1e222b] border border-slate-700 rounded-lg shadow-xl z-20 py-1">
                  {otherSheets.map((os) => (
                    <button
                      key={os.id}
                      type="button"
                      onClick={() => handleAddInclude(os.id)}
                      className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
                    >
                      {os.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter events, objects, actions..."
            className="w-full pl-8 pr-3 py-1 text-xs bg-[#14161b] border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>

      {/* Events Canvas */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
        {sheet.items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-12">
            <p className="text-sm font-medium text-slate-300 mb-1">No events in {sheet.name} yet</p>
            <p className="text-xs text-slate-500 mb-4 max-w-sm">
              Events define game logic: Conditions on the left pick object instances, and Actions on the right run on those picked instances.
            </p>
            <button
              type="button"
              onClick={() => handleAddEvent()}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg"
            >
              <Plus className="w-4 h-4" /> Add First Event
            </button>
          </div>
        ) : (
          sheet.items.map((item) => renderEventItem(item, 0))
        )}
      </div>

      {/* 3-Step Event Wizard Modal */}
      {wizard && (
        <EventWizardModal
          mode={wizard.mode === 'action' ? 'action' : 'condition'}
          project={project}
          initialCondition={wizard.mode === 'condition' ? wizard.initialCondition : undefined}
          initialAction={wizard.mode === 'action' ? wizard.initialAction : undefined}
          onClose={() => setWizard(null)}
          onSaveCondition={(cond) => {
            if (wizard.mode === 'new-event') {
              handleCreateNewEventWithCondition(cond, wizard.parentId);
            } else if (wizard.mode === 'condition') {
              handleSaveCondition(wizard.eventId, cond, Boolean(wizard.initialCondition));
            }
          }}
          onSaveAction={(act) => {
            if (wizard.mode === 'action') {
              handleSaveAction(wizard.eventId, act, Boolean(wizard.initialAction));
            }
          }}
        />
      )}
    </div>
  );
};
