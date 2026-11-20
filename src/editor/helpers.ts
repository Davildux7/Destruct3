import { BEHAVIOR_CATALOG, PLUGIN_CATALOG } from '../engine/catalog';
import { createGlobalPluginObjects } from '../engine/demoProject';
import {
  ActionItem,
  ConditionItem,
  EventItem,
  EventSheetData,
  ObjectType,
  ProjectData,
} from '../engine/types';

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36).slice(-4)}`;
}

export function cloneProject(p: ProjectData): ProjectData {
  return JSON.parse(JSON.stringify(p)) as ProjectData;
}

export function formatConditionText(cond: ConditionItem, project: ProjectData): string {
  const ot = project.objectTypes.find((o) => o.id === cond.objectTypeId);
  let schema;
  if (cond.behaviorId && ot) {
    const bDef = ot.behaviorDefs.find((b) => b.id === cond.behaviorId);
    if (bDef) {
      schema = BEHAVIOR_CATALOG[bDef.type]?.conditions.find((c) => c.id === cond.conditionId);
    }
  } else if (ot) {
    schema = PLUGIN_CATALOG[ot.plugin]?.conditions.find((c) => c.id === cond.conditionId);
  } else if (cond.objectTypeId === 'system') {
    schema = PLUGIN_CATALOG.System.conditions.find((c) => c.id === cond.conditionId);
  }
  if (!schema) return cond.conditionId;

  return schema.displayFormat.replace(/\{(\w+)\}/g, (_, key: string) => {
    const val = cond.params[key] ?? '';
    if (key === 'other' || key === 'object') {
      const target = project.objectTypes.find((o) => o.id === val);
      return target ? target.name : val || '?';
    }
    return val || '?';
  });
}

export function formatActionText(action: ActionItem, project: ProjectData): string {
  const ot = project.objectTypes.find((o) => o.id === action.objectTypeId);
  let schema;
  if (action.behaviorId && ot) {
    const bDef = ot.behaviorDefs.find((b) => b.id === action.behaviorId);
    if (bDef) {
      schema = BEHAVIOR_CATALOG[bDef.type]?.actions.find((a) => a.id === action.actionId);
    }
  } else if (ot) {
    schema = PLUGIN_CATALOG[ot.plugin]?.actions.find((a) => a.id === action.actionId);
  } else if (action.objectTypeId === 'system') {
    schema = PLUGIN_CATALOG.System.actions.find((a) => a.id === action.actionId);
  }
  if (!schema) return action.actionId;

  return schema.displayFormat.replace(/\{(\w+)\}/g, (_, key: string) => {
    const val = action.params[key] ?? '';
    if (key === 'object') {
      const target = project.objectTypes.find((o) => o.id === val);
      return target ? target.name : val || '?';
    }
    if (key === 'layout') {
      const lay = project.layouts.find((l) => l.id === val || l.name === val);
      return lay ? lay.name : val || '?';
    }
    return val || '?';
  });
}

export function isTriggerCondition(cond: ConditionItem, project: ProjectData): boolean {
  const ot = project.objectTypes.find((o) => o.id === cond.objectTypeId);
  if (cond.behaviorId && ot) {
    const bDef = ot.behaviorDefs.find((b) => b.id === cond.behaviorId);
    if (bDef) {
      return Boolean(BEHAVIOR_CATALOG[bDef.type]?.conditions.find((c) => c.id === cond.conditionId)?.isTrigger);
    }
  }
  const plugin = ot ? ot.plugin : cond.objectTypeId === 'system' ? 'System' : undefined;
  if (!plugin) return false;
  return Boolean(PLUGIN_CATALOG[plugin]?.conditions.find((c) => c.id === cond.conditionId)?.isTrigger);
}

export function getObjectThumbnail(ot: ObjectType): string | null {
  if (ot.plugin === 'Sprite' && ot.spriteConfig?.animations.length) {
    const defAnim =
      ot.spriteConfig.animations.find((a) => a.name === ot.spriteConfig?.defaultAnimation) ||
      ot.spriteConfig.animations[0];
    return defAnim?.frames[0]?.dataUrl || null;
  }
  if (ot.plugin === 'TiledBackground' && ot.tiledBgConfig?.imageDataUrl) {
    return ot.tiledBgConfig.imageDataUrl;
  }
  if (ot.plugin === 'Tilemap' && ot.tilemapConfig?.tilesetDataUrl) {
    return ot.tilemapConfig.tilesetDataUrl;
  }
  return null;
}

export function updateEventSheetItems(
  items: EventItem[],
  targetId: string,
  updater: (item: EventItem) => EventItem | null
): EventItem[] {
  const result: EventItem[] = [];
  for (const item of items) {
    if (item.id === targetId) {
      const updated = updater(item);
      if (updated) result.push(updated);
      continue;
    }
    if (item.kind === 'event') {
      result.push({
        ...item,
        subEvents: updateEventSheetItems(item.subEvents, targetId, updater),
      });
    } else if (item.kind === 'group') {
      result.push({
        ...item,
        items: updateEventSheetItems(item.items, targetId, updater),
      });
    } else {
      result.push(item);
    }
  }
  return result;
}

export function moveItemInList(items: EventItem[], targetId: string, dir: -1 | 1): EventItem[] {
  const idx = items.findIndex((i) => i.id === targetId);
  if (idx >= 0) {
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= items.length) return items;
    const copy = [...items];
    const [moved] = copy.splice(idx, 1);
    copy.splice(nextIdx, 0, moved);
    return copy;
  }
  return items.map((item) => {
    if (item.kind === 'event') {
      return { ...item, subEvents: moveItemInList(item.subEvents, targetId, dir) };
    }
    if (item.kind === 'group') {
      return { ...item, items: moveItemInList(item.items, targetId, dir) };
    }
    return item;
  });
}

export function appendSubEvent(items: EventItem[], parentId: string, child: EventItem): EventItem[] {
  return items.map((item) => {
    if (item.id === parentId) {
      if (item.kind === 'event') {
        return { ...item, subEvents: [...item.subEvents, child] };
      }
      if (item.kind === 'group') {
        return { ...item, items: [...item.items, child] };
      }
    }
    if (item.kind === 'event') {
      return { ...item, subEvents: appendSubEvent(item.subEvents, parentId, child) };
    }
    if (item.kind === 'group') {
      return { ...item, items: appendSubEvent(item.items, parentId, child) };
    }
    return item;
  });
}

export function countSheetEvents(sheet: EventSheetData): number {
  let count = 0;
  const walk = (list: EventItem[]) => {
    for (const item of list) {
      count++;
      if (item.kind === 'event') walk(item.subEvents);
      else if (item.kind === 'group') walk(item.items);
    }
  };
  walk(sheet.items);
  return count;
}

export function normalizeLoadedProject(p: ProjectData): ProjectData {
  const globalDefaults = createGlobalPluginObjects();
  const existingPlugins = new Set(p.objectTypes.map((o) => o.plugin));
  const missingGlobals = globalDefaults.filter((g) => !existingPlugins.has(g.plugin));

  return {
    ...p,
    audioAssets: Array.isArray(p.audioAssets) ? p.audioAssets : [],
    objectTypes: [...p.objectTypes, ...missingGlobals],
    postProcessSettings: p.postProcessSettings || {
      enabled: false,
      bloom: false,
      bloomIntensity: 0.8,
      crtScanlines: false,
      crtCurvature: 0.25,
      vignette: false,
      vignetteStrength: 0.35,
      chromaticAberration: false,
      chromaticOffset: 2,
      pixelate: 1,
    },
    virtualJoystickSettings: p.virtualJoystickSettings || {
      enabled: false,
      deadzone: 0.15,
      size: 54,
      showActionButtons: true,
    },
  };
}

const STORAGE_KEY = 'openconstruct_saved_project_v1';

export function saveProjectToLocalStorage(project: ProjectData): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  } catch {
    // ignore quota errors
  }
}

export function loadProjectFromLocalStorage(): ProjectData | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProjectData;
    if (parsed && Array.isArray(parsed.layouts) && Array.isArray(parsed.objectTypes)) {
      return normalizeLoadedProject(parsed);
    }
  } catch {
    // ignore parse errors
  }
  return null;
}
