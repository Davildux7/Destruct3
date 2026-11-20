import JSZip from 'jszip';
import { createDefaultBehaviorProperties } from './catalog';
import { createGlobalPluginObjects } from './demoProject';
import { generateDefaultTilesetDataUrl } from './tilemap';
import {
  ActionItem,
  AudioAsset,
  BehaviorDef,
  BehaviorType,
  ConditionItem,
  EventBlock,
  EventGroup,
  EventInclude,
  EventItem,
  EventSheetData,
  GlobalVariable,
  InstanceData,
  InstVarDef,
  LayerData,
  LayoutData,
  ObjectType,
  PluginType,
  Point2D,
  ProjectData,
  SpriteAnimation,
  SpriteFrame,
  VarValue,
  VarValueType,
} from './types';

export interface C3ImportReport {
  projectName: string;
  sourceFormat: 'c3p' | 'c3proj' | 'folder';
  objectCount: number;
  layoutCount: number;
  eventSheetCount: number;
  imageCount: number;
  audioCount: number;
  globalVarCount: number;
  familyCount: number;
  warnings: string[];
}

export interface C3ImportResult {
  project: ProjectData;
  report: C3ImportReport;
}

interface VfsEntry {
  path: string; // normalized lowercase relative path
  originalPath: string;
  readText: () => Promise<string>;
  readBase64: () => Promise<string>;
}

interface Vfs {
  entries: Map<string, VfsEntry>;
  allPaths: string[];
}

let uidCounter = 1;
function makeId(prefix: string): string {
  uidCounter += 1;
  return `${prefix}_c3_${uidCounter.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/').toLowerCase();
}

function stripExt(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(0, idx) : name;
}

function getExt(path: string): string {
  const idx = path.lastIndexOf('.');
  return idx >= 0 ? path.slice(idx + 1).toLowerCase() : '';
}

function sanitizeC3Name(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

function inferImageMime(path: string): string {
  const ext = getExt(path);
  if (ext === 'webp') return 'image/webp';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'bmp') return 'image/bmp';
  return 'image/png';
}

function inferAudioMime(path: string): string {
  const ext = getExt(path);
  if (ext === 'webm') return 'audio/webm';
  if (ext === 'ogg' || ext === 'oga') return 'audio/ogg';
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'wav') return 'audio/wav';
  if (ext === 'm4a' || ext === 'aac') return 'audio/mp4';
  if (ext === 'flac') return 'audio/flac';
  return 'audio/webm';
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...sub);
  }
  return btoa(binary);
}

function makePlaceholderSvgDataUrl(label: string, width = 32, height = 32, colorHex = '#38bdf8'): string {
  const w = Math.max(8, Math.round(width));
  const h = Math.max(8, Math.round(height));
  const safeLabel = label.replace(/[<>&"']/g, '').slice(0, 12);
  const fontSize = Math.max(7, Math.min(14, Math.floor(Math.min(w, h) * 0.35)));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" rx="3" fill="#1e293b" stroke="${colorHex}" stroke-width="2"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="${fontSize}" fill="#e2e8f0">${safeLabel}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Detect if a parsed JSON object looks like a Construct 3 .c3proj file.
 */
export function isConstruct3Json(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== 'object') return false;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.firstLayout === 'string' && (obj.objectTypes || obj.layouts || obj.eventSheets)) {
    return true;
  }
  if (
    obj.objectTypes &&
    typeof obj.objectTypes === 'object' &&
    'items' in (obj.objectTypes as Record<string, unknown>) &&
    obj.layouts &&
    typeof obj.layouts === 'object' &&
    'items' in (obj.layouts as Record<string, unknown>)
  ) {
    return true;
  }
  return false;
}

function buildZipVfs(zip: JSZip): Vfs {
  const entries = new Map<string, VfsEntry>();
  const allPaths: string[] = [];

  zip.forEach((relativePath, zipEntry) => {
    if (zipEntry.dir) return;
    const norm = normalizePath(relativePath);
    allPaths.push(norm);
    entries.set(norm, {
      path: norm,
      originalPath: relativePath,
      readText: () => zipEntry.async('string'),
      readBase64: () => zipEntry.async('base64'),
    });
  });

  return { entries, allPaths };
}

function buildFilesVfs(files: File[]): Vfs {
  const entries = new Map<string, VfsEntry>();
  const allPaths: string[] = [];

  // Strip common root directory if files come from webkitdirectory
  const relPaths = files.map((f) =>
    normalizePath((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name)
  );
  let commonPrefix = '';
  if (relPaths.length > 1 && relPaths.every((p) => p.includes('/'))) {
    const firstRoot = relPaths[0].split('/')[0];
    if (relPaths.every((p) => p.startsWith(firstRoot + '/'))) {
      commonPrefix = firstRoot + '/';
    }
  }

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    let norm = relPaths[i];
    if (commonPrefix && norm.startsWith(commonPrefix)) {
      norm = norm.slice(commonPrefix.length);
    }
    allPaths.push(norm);
    entries.set(norm, {
      path: norm,
      originalPath: file.name,
      readText: () => file.text(),
      readBase64: async () => arrayBufferToBase64(await file.arrayBuffer()),
    });
  }

  return { entries, allPaths };
}

interface C3FolderNode {
  items?: string[];
  subfolders?: Array<C3FolderNode & { name?: string }>;
}

function collectC3FolderItems(
  folder: C3FolderNode | undefined,
  parentParts: string[] = []
): Array<{ name: string; subPathParts: string[] }> {
  if (!folder) return [];
  const results: Array<{ name: string; subPathParts: string[] }> = [];
  if (Array.isArray(folder.items)) {
    for (const item of folder.items) {
      if (typeof item === 'string' && item.trim()) {
        results.push({ name: item, subPathParts: parentParts });
      }
    }
  }
  if (Array.isArray(folder.subfolders)) {
    for (const sf of folder.subfolders) {
      const nextParts = sf.name ? [...parentParts, sf.name] : parentParts;
      results.push(...collectC3FolderItems(sf, nextParts));
    }
  }
  return results;
}

function findEntryInVfs(
  vfs: Vfs,
  basePrefix: string,
  candidates: string[]
): VfsEntry | undefined {
  for (const c of candidates) {
    const norm = normalizePath(basePrefix + c);
    const hit = vfs.entries.get(norm);
    if (hit) return hit;
    const direct = vfs.entries.get(normalizePath(c));
    if (direct) return direct;
  }
  return undefined;
}

function findJsonItemEntry(
  vfs: Vfs,
  basePrefix: string,
  rootFolder: string,
  itemName: string,
  subPathParts: string[]
): VfsEntry | undefined {
  const candidates: string[] = [];
  if (subPathParts.length > 0) {
    candidates.push(`${rootFolder}/${subPathParts.join('/')}/${itemName}.json`);
    candidates.push(`${rootFolder}/${subPathParts.join('/')}/${itemName}`);
  }
  candidates.push(`${rootFolder}/${itemName}.json`);
  candidates.push(`${rootFolder}/${itemName}`);

  const direct = findEntryInVfs(vfs, basePrefix, candidates);
  if (direct) return direct;

  // Fallback: match filename ending with /<itemName>.json inside rootFolder
  const targetSuffix = `/${itemName.toLowerCase()}.json`;
  const folderPrefix = normalizePath(`${basePrefix}${rootFolder}/`);
  for (const p of vfs.allPaths) {
    if (p.startsWith(folderPrefix) && p.endsWith(targetSuffix)) {
      return vfs.entries.get(p);
    }
  }
  return undefined;
}

function findImageEntry(
  vfs: Vfs,
  basePrefix: string,
  objectName: string,
  animName?: string,
  frameIdx?: number,
  imageSpriteId?: number | string
): VfsEntry | undefined {
  const exts = ['png', 'webp', 'jpg', 'jpeg', 'gif', 'svg'];
  const objNames = Array.from(
    new Set([
      objectName.toLowerCase(),
      sanitizeC3Name(objectName),
      objectName.toLowerCase().replace(/\s+/g, '_'),
      objectName.toLowerCase().replace(/\s+/g, '-'),
    ])
  ).filter(Boolean);

  const animNames = animName
    ? Array.from(
        new Set([
          animName.toLowerCase(),
          sanitizeC3Name(animName),
          animName.toLowerCase().replace(/\s+/g, '_'),
          animName.toLowerCase().replace(/\s+/g, '-'),
        ])
      ).filter(Boolean)
    : ['default', 'animation1'];

  const candidates: string[] = [];
  const fPad = frameIdx !== undefined ? pad3(frameIdx) : '000';

  if (imageSpriteId !== undefined) {
    for (const ext of exts) {
      candidates.push(`images/shared-${pad3(Number(imageSpriteId))}-sheet0.${ext}`);
      candidates.push(`images/sprite-${imageSpriteId}.${ext}`);
    }
  }

  for (const o of objNames) {
    for (const a of animNames) {
      for (const ext of exts) {
        candidates.push(`images/${o}-${a}-${fPad}.${ext}`);
        candidates.push(`images/${o}_${a}_${fPad}.${ext}`);
        candidates.push(`images/${o}-${a}-${frameIdx ?? 0}.${ext}`);
      }
    }
    for (const ext of exts) {
      candidates.push(`images/${o}-${fPad}.${ext}`);
      candidates.push(`images/${o}-sheet0.${ext}`);
      candidates.push(`images/${o}-sheet${frameIdx ?? 0}.${ext}`);
      candidates.push(`images/${o}.${ext}`);
      candidates.push(`images/${o}_${fPad}.${ext}`);
    }
  }

  const direct = findEntryInVfs(vfs, basePrefix, candidates);
  if (direct) return direct;

  // Fuzzy prefix search inside images/
  const imgPrefix = normalizePath(`${basePrefix}images/`);
  const imagePaths = vfs.allPaths.filter((p) => p.startsWith(imgPrefix) || p.startsWith('images/'));
  const objSan = sanitizeC3Name(objectName);
  const animSan = animName ? sanitizeC3Name(animName) : '';

  if (animSan && frameIdx !== undefined) {
    for (const p of imagePaths) {
      const file = p.split('/').pop() || '';
      const fileSan = sanitizeC3Name(stripExt(file));
      if (fileSan.includes(objSan) && fileSan.includes(animSan) && file.includes(fPad)) {
        return vfs.entries.get(p);
      }
    }
  }

  for (const p of imagePaths) {
    const file = p.split('/').pop() || '';
    const base = stripExt(file);
    const baseSan = sanitizeC3Name(base);
    if (baseSan === objSan || baseSan.startsWith(objSan + fPad) || base.startsWith(objSan + '-')) {
      if (frameIdx === undefined || file.includes(fPad) || frameIdx === 0) {
        return vfs.entries.get(p);
      }
    }
  }

  return undefined;
}

function c3ColorToHex(val: unknown, fallback = '#111622'): string {
  if (typeof val === 'string') {
    const s = val.trim();
    if (/^#[0-9a-f]{6}$/i.test(s)) return s;
    if (/^#[0-9a-f]{3}$/i.test(s)) {
      return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
    }
    if (/^rgb/i.test(s)) {
      const nums = s.match(/[\d.]+/g)?.map(Number);
      if (nums && nums.length >= 3) {
        const [r, g, b] = nums.map((c) => Math.max(0, Math.min(255, Math.round(c))));
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      }
    }
    return fallback;
  }
  if (Array.isArray(val) && val.length >= 3) {
    const nums = val.slice(0, 3).map((n) => Number(n));
    if (nums.some((n) => Number.isNaN(n))) return fallback;
    const isNormalized = nums.every((n) => n >= 0 && n <= 1);
    const [r, g, b] = nums.map((c) =>
      Math.max(0, Math.min(255, Math.round(isNormalized ? c * 255 : c)))
    );
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }
  return fallback;
}

function mapC3PluginId(pluginId: string | undefined): {
  plugin: PluginType;
  exact: boolean;
  note?: string;
} {
  const raw = (pluginId || 'Sprite').trim();
  const key = raw.toLowerCase();
  const table: Record<string, PluginType> = {
    sprite: 'Sprite',
    tiledbg: 'TiledBackground',
    tiledbackground: 'TiledBackground',
    ninepatch: 'TiledBackground',
    '9patch': 'TiledBackground',
    text: 'Text',
    spritefont2: 'Text',
    spritefont: 'Text',
    particles: 'Particles',
    tilemap: 'Tilemap',
    button: 'Button',
    sliderbar: 'Slider',
    slider: 'Slider',
    progressbar: 'ProgressBar',
    system: 'System',
    keyboard: 'Keyboard',
    mouse: 'Mouse',
    touch: 'Touch',
    audio: 'Audio',
    localstorage: 'LocalStorage',
    dictionary: 'Dictionary',
    gamepad: 'Gamepad',
  };
  if (table[key]) {
    return { plugin: table[key], exact: true };
  }
  return {
    plugin: 'Sprite',
    exact: false,
    note: `Plugin "${raw}" is not natively implemented; imported as Sprite placeholder`,
  };
}

function mapC3BehaviorId(behaviorId: string | undefined): BehaviorType | null {
  const key = (behaviorId || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const map: Record<string, BehaviorType> = {
    platform: 'Platform',
    solid: 'Solid',
    jumpthru: 'JumpThru',
    eightdir: 'EightDirection',
    eightdirection: 'EightDirection',
    '8direction': 'EightDirection',
    bullet: 'Bullet',
    sin: 'Sine',
    sine: 'Sine',
    fade: 'Fade',
    flash: 'Flash',
    timer: 'Timer',
    scrollto: 'ScrollTo',
    bound: 'BoundTo',
    boundto: 'BoundTo',
    boundtolayout: 'BoundTo',
    destroy: 'DestroyOutside',
    destroyoutside: 'DestroyOutside',
    destroyoutsidelayout: 'DestroyOutside',
    wrap: 'Wrap',
    dragndrop: 'DragDrop',
    dragdrop: 'DragDrop',
    rotate: 'Rotate',
    tween: 'Tween',
    pin: 'Pin',
    turret: 'Turret',
    los: 'LineOfSight',
    lineofsight: 'LineOfSight',
    pathfinding: 'Pathfinding',
    physics: 'Physics',
  };
  return map[key] || null;
}

function normalizeC3BehaviorProps(
  type: BehaviorType,
  rawProps: Record<string, unknown> | undefined
): Record<string, VarValue> {
  const defaults = createDefaultBehaviorProperties(type);
  if (!rawProps) return defaults;

  const get = (...keys: string[]): unknown => {
    for (const k of keys) {
      if (rawProps[k] !== undefined) return rawProps[k];
      const lower = k.toLowerCase();
      for (const [rk, rv] of Object.entries(rawProps)) {
        if (rk.toLowerCase() === lower) return rv;
      }
    }
    return undefined;
  };

  const num = (fallback: VarValue, ...keys: string[]): number => {
    const v = get(...keys);
    const n = Number(v);
    return Number.isFinite(n) ? n : Number(fallback);
  };
  const bool = (fallback: VarValue, ...keys: string[]): boolean => {
    const v = get(...keys);
    if (v === undefined) return Boolean(fallback);
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return v.toLowerCase() === 'true' || v === 'yes' || v === '1' || v === 'enabled';
    return Boolean(v);
  };

  const out: Record<string, VarValue> = { ...defaults };

  switch (type) {
    case 'Platform':
      out.maxSpeed = num(defaults.maxSpeed, 'max-speed', 'maxSpeed');
      out.acceleration = num(defaults.acceleration, 'acceleration');
      out.deceleration = num(defaults.deceleration, 'deceleration');
      out.jumpStrength = num(defaults.jumpStrength, 'jump-strength', 'jumpStrength');
      out.gravity = num(defaults.gravity, 'gravity');
      out.maxFallSpeed = num(defaults.maxFallSpeed, 'max-fall-speed', 'maxFallSpeed');
      out.doubleJump = bool(defaults.doubleJump, 'double-jump', 'doubleJump');
      out.jumpSustain = num(defaults.jumpSustain, 'jump-sustain', 'jumpSustain');
      out.defaultControls = bool(defaults.defaultControls, 'default-controls', 'defaultControls');
      out.enabled = bool(defaults.enabled, 'enabled');
      break;
    case 'Solid':
    case 'JumpThru':
    case 'ScrollTo':
    case 'Tween':
      out.enabled = bool(defaults.enabled, 'enabled');
      break;
    case 'EightDirection': {
      out.maxSpeed = num(defaults.maxSpeed, 'max-speed', 'maxSpeed');
      out.acceleration = num(defaults.acceleration, 'acceleration');
      out.deceleration = num(defaults.deceleration, 'deceleration');
      const dirs = String(get('directions') ?? defaults.directions).toLowerCase();
      if (dirs.includes('4')) out.directions = '4';
      else if (dirs.includes('up')) out.directions = 'up-down';
      else if (dirs.includes('left')) out.directions = 'left-right';
      else out.directions = '8';
      const setAng = String(get('set-angle', 'setAngle') ?? defaults.setAngle).toLowerCase();
      if (setAng.includes('no') || setAng === 'false') out.setAngle = 'no';
      else if (setAng.includes('90')) out.setAngle = '90';
      else if (setAng.includes('45')) out.setAngle = '45';
      else out.setAngle = '360';
      out.defaultControls = bool(defaults.defaultControls, 'default-controls', 'defaultControls');
      out.enabled = bool(defaults.enabled, 'enabled');
      break;
    }
    case 'Bullet':
      out.speed = num(defaults.speed, 'speed');
      out.acceleration = num(defaults.acceleration, 'acceleration');
      out.gravity = num(defaults.gravity, 'gravity');
      out.bounceOffSolids = bool(defaults.bounceOffSolids, 'bounce-off-solids', 'bounceOffSolids');
      out.setAngle = bool(defaults.setAngle, 'set-angle', 'setAngle');
      out.enabled = bool(defaults.enabled, 'enabled');
      break;
    case 'Sine': {
      const mov = String(get('movement') ?? defaults.movement);
      out.movement = mov;
      const wave = String(get('wave') ?? defaults.wave);
      out.wave = wave;
      out.period = num(defaults.period, 'period');
      out.periodOffset = num(defaults.periodOffset, 'period-offset', 'periodOffset');
      out.magnitude = num(defaults.magnitude, 'magnitude');
      out.enabled = bool(defaults.enabled, 'enabled', 'active-on-start');
      break;
    }
    case 'Fade':
      out.activeAtStart = bool(defaults.activeAtStart, 'active-at-start', 'activeAtStart');
      out.fadeInTime = num(defaults.fadeInTime, 'fade-in-time', 'fadeInTime');
      out.waitTime = num(defaults.waitTime, 'wait-time', 'waitTime');
      out.fadeOutTime = num(defaults.fadeOutTime, 'fade-out-time', 'fadeOutTime');
      out.destroyOnFinish = bool(defaults.destroyOnFinish, 'destroy', 'destroyOnFinish');
      break;
    case 'Rotate':
      out.speed = num(defaults.speed, 'speed');
      out.acceleration = num(defaults.acceleration, 'acceleration');
      out.enabled = bool(defaults.enabled, 'enabled');
      break;
    case 'BoundTo': {
      const b = String(get('bound-to', 'boundTo') ?? defaults.boundTo).toLowerCase();
      out.boundTo = b.includes('view') ? 'Viewport' : 'Layout';
      break;
    }
    case 'DragDrop': {
      const axes = String(get('axes') ?? defaults.axes).toLowerCase();
      if (axes.includes('horiz')) out.axes = 'Horizontal only';
      else if (axes.includes('vert')) out.axes = 'Vertical only';
      else out.axes = 'Both';
      out.enabled = bool(defaults.enabled, 'enabled');
      break;
    }
    case 'Turret':
      out.range = num(defaults.range, 'range');
      out.rateOfFire = num(defaults.rateOfFire, 'rate-of-fire', 'rateOfFire');
      out.rotateSpeed = num(defaults.rotateSpeed, 'rotate-speed', 'rotateSpeed');
      out.predictiveAim = bool(defaults.predictiveAim, 'predictive-aim', 'predictiveAim');
      out.projectileSpeed = num(defaults.projectileSpeed, 'projectile-speed', 'projectileSpeed');
      out.enabled = bool(defaults.enabled, 'enabled');
      break;
    case 'LineOfSight':
      out.range = num(defaults.range, 'range');
      out.coneOfView = num(defaults.coneOfView, 'cone-of-view', 'coneOfView');
      out.enabled = bool(defaults.enabled, 'enabled');
      break;
    case 'Pathfinding':
      out.cellSize = num(defaults.cellSize, 'cell-size', 'cellSize');
      out.cellBorder = num(defaults.cellBorder, 'cell-border', 'cellBorder');
      out.diagonals = bool(defaults.diagonals, 'diagonals');
      out.speed = num(defaults.speed, 'max-speed', 'speed');
      out.acceleration = num(defaults.acceleration, 'acceleration');
      out.rotateObject = bool(defaults.rotateObject, 'rotate-object', 'rotateObject');
      out.enabled = bool(defaults.enabled, 'enabled');
      break;
    case 'Physics':
      out.density = num(defaults.density, 'density');
      out.friction = num(defaults.friction, 'friction');
      out.elasticity = num(defaults.elasticity, 'elasticity', 'restitution');
      out.linearDamping = num(defaults.linearDamping, 'linear-damping', 'linearDamping');
      out.angularDamping = num(defaults.angularDamping, 'angular-damping', 'angularDamping');
      out.immovable = bool(defaults.immovable, 'immovable');
      out.fixedRotation = bool(defaults.fixedRotation, 'prevent-rotation', 'fixedRotation');
      out.gravityScale = num(defaults.gravityScale, 'gravity-scale', 'gravityScale');
      out.enabled = bool(true, 'enabled');
      break;
    default:
      break;
  }

  return out;
}

/**
 * Decode Construct 3 Tilemap RLE or array data into a 1D number array (-1 = empty, >=0 = tile index).
 */
function decodeC3TilemapData(raw: unknown, width: number, height: number): number[] {
  const total = Math.max(1, width * height);
  const out = new Array<number>(total).fill(-1);

  if (Array.isArray(raw)) {
    for (let i = 0; i < Math.min(total, raw.length); i++) {
      const n = Number(raw[i]);
      out[i] = Number.isFinite(n) ? n : -1;
    }
    return out;
  }

  if (typeof raw === 'string') {
    const tokens = raw.split(',');
    let writeIdx = 0;
    for (const tokenRaw of tokens) {
      if (writeIdx >= total) break;
      const token = tokenRaw.trim();
      if (!token) continue;
      const xIdx = token.indexOf('x');
      if (xIdx > 0) {
        const count = parseInt(token.slice(0, xIdx), 10);
        const val = parseInt(token.slice(xIdx + 1), 10);
        if (Number.isFinite(count) && Number.isFinite(val)) {
          const end = Math.min(total, writeIdx + count);
          for (; writeIdx < end; writeIdx++) {
            out[writeIdx] = val;
          }
        }
      } else {
        const val = parseInt(token, 10);
        out[writeIdx++] = Number.isFinite(val) ? val : -1;
      }
    }
  }

  return out;
}

function mapC3Comparison(raw: unknown): string {
  if (typeof raw === 'number') {
    return ['=', '!=', '<', '<=', '>', '>='][raw] || '=';
  }
  const s = String(raw ?? '=').trim().toLowerCase();
  const table: Record<string, string> = {
    '0': '=',
    'equal-to': '=',
    'equals': '=',
    '=': '=',
    '==': '=',
    '1': '!=',
    'not-equal-to': '!=',
    'not-equal': '!=',
    '!=': '!=',
    '<>': '!=',
    '2': '<',
    'less-than': '<',
    '<': '<',
    '3': '<=',
    'less-or-equal': '<=',
    '<=': '<=',
    '4': '>',
    'greater-than': '>',
    '>': '>',
    '5': '>=',
    'greater-or-equal': '>=',
    '>=': '>=',
  };
  return table[s] || '=';
}

function mapC3KeyName(raw: unknown): string {
  const s = String(raw ?? 'Space').replace(/^"|"$/g, '').trim();
  const low = s.toLowerCase();
  const map: Record<string, string> = {
    'left arrow': 'ArrowLeft',
    left: 'ArrowLeft',
    arrowleft: 'ArrowLeft',
    'right arrow': 'ArrowRight',
    right: 'ArrowRight',
    arrowright: 'ArrowRight',
    'up arrow': 'ArrowUp',
    up: 'ArrowUp',
    arrowup: 'ArrowUp',
    'down arrow': 'ArrowDown',
    down: 'ArrowDown',
    arrowdown: 'ArrowDown',
    space: 'Space',
    spacebar: 'Space',
    ' ': 'Space',
    enter: 'Enter',
    return: 'Enter',
    escape: 'Escape',
    esc: 'Escape',
    shift: 'ShiftLeft',
    shiftleft: 'ShiftLeft',
    control: 'ControlLeft',
    ctrl: 'ControlLeft',
  };
  if (map[low]) return map[low];
  if (/^[a-z]$/i.test(s)) return `Key${s.toUpperCase()}`;
  if (/^[0-9]$/.test(s)) return `Digit${s}`;
  if (/^(key|digit|arrow)[a-z0-9]+$/i.test(s)) return s;
  return s || 'Space';
}

function normalizeC3Expr(raw: unknown, fallback = '0'): string {
  if (raw === undefined || raw === null) return fallback;
  let expr = String(raw).trim();
  if (!expr) return fallback;
  // Normalize System.random(...) etc. into Destruct built-in functions
  expr = expr
    .replace(/\bSystem\.(random|choose|distance|angle|clamp|lerp|dt|time|tickcount|fps|LayoutWidth|LayoutHeight|ScrollX|ScrollY|ViewportWidth|ViewportHeight)\b/gi, '$1')
    .replace(/\bdt\b/g, 'dt');
  return expr;
}

function unquoteString(raw: unknown, fallback = ''): string {
  const s = String(raw ?? fallback).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s || fallback;
}

function quoteIfPlainIdentifier(raw: unknown, fallback = '""'): string {
  const s = String(raw ?? '').trim();
  if (!s) return fallback;
  if (s.startsWith('"') || s.startsWith("'")) return s;
  return `"${s}"`;
}

function getParam(
  params: Record<string, unknown> | undefined,
  ...keys: string[]
): unknown {
  if (!params) return undefined;
  for (const k of keys) {
    if (params[k] !== undefined) return params[k];
    const kLow = k.toLowerCase();
    for (const [pk, pv] of Object.entries(params)) {
      if (pk.toLowerCase() === kLow) return pv;
    }
  }
  return undefined;
}

function normalizeBoolSelect(raw: unknown, truthyWords: string[] = ['true', 'visible', 'enabled', 'active', 'activated', 'looping', 'mirrored', 'flipped', 'yes', '1', 'spraying']): string {
  if (typeof raw === 'boolean') return raw ? 'true' : 'false';
  const s = String(raw ?? '').toLowerCase().trim();
  if (truthyWords.some((w) => s === w || s.includes(w))) return 'true';
  return 'false';
}

interface C3FamilyInfo {
  name: string;
  members: string[];
  instVarDefs: InstVarDef[];
  behaviorDefs: BehaviorDef[];
}

interface ConversionContext {
  objectIdByName: Map<string, string>; // lowercase C3 name -> Destruct objectType.id
  objectById: Map<string, ObjectType>;
  layoutIdByName: Map<string, string>;
  sheetIdByName: Map<string, string>;
  familyByName: Map<string, C3FamilyInfo>;
  warnings: Set<string>;
}

function resolveObjectRef(raw: unknown, ctx: ConversionContext): string {
  const name = unquoteString(raw, '').trim();
  if (!name) return '';
  const low = name.toLowerCase();
  const direct = ctx.objectIdByName.get(low);
  if (direct) return direct;
  const fam = ctx.familyByName.get(low);
  if (fam && fam.members.length > 0) {
    const firstMember = ctx.objectIdByName.get(fam.members[0].toLowerCase());
    if (firstMember) {
      ctx.warnings.add(`Family "${fam.name}" reference in events was mapped to its member "${fam.members[0]}"`);
      return firstMember;
    }
  }
  return name;
}

function mapC3Condition(
  c3Cond: Record<string, unknown>,
  ctx: ConversionContext,
  sheetName: string
): ConditionItem | null {
  const rawClass = String(c3Cond.objectClass || 'System');
  const rawId = String(c3Cond.id || '');
  const behaviorTypeRaw = c3Cond.behaviorType ? String(c3Cond.behaviorType) : undefined;
  const inverted = Boolean(c3Cond.isInverted);
  const params = (c3Cond.parameters || {}) as Record<string, unknown>;

  const targetOtId = resolveObjectRef(rawClass, ctx);
  const targetOt = ctx.objectById.get(targetOtId);
  const idLow = rawId.toLowerCase();

  // Behavior condition?
  if (behaviorTypeRaw && targetOt) {
    const mappedBType = mapC3BehaviorId(behaviorTypeRaw);
    const bDef =
      targetOt.behaviorDefs.find((b) => b.name.toLowerCase() === behaviorTypeRaw.toLowerCase()) ||
      (mappedBType ? targetOt.behaviorDefs.find((b) => b.type === mappedBType) : undefined);

    if (bDef) {
      const condId = mapC3BehaviorConditionId(bDef.type, idLow);
      if (condId) {
        const mappedParams: Record<string, string> = {};
        if (condId === 'is_by_wall') {
          const s = String(getParam(params, 'side') ?? 'left').toLowerCase();
          mappedParams.side = s.includes('right') ? 'right' : 'left';
        } else if (condId === 'compare_speed' || condId === 'compare_velocity') {
          mappedParams.cmp = mapC3Comparison(getParam(params, 'comparison', 'cmp'));
          const val = normalizeC3Expr(getParam(params, 'speed', 'velocity', 'value'), '0');
          if (condId === 'compare_speed') mappedParams.speed = val;
          else mappedParams.value = val;
        } else if (condId === 'on_timer' || condId === 'is_timer_running' || condId === 'on_finished' || condId === 'is_playing') {
          mappedParams.tag = quoteIfPlainIdentifier(getParam(params, 'tag'), '"tag"');
        } else if (condId === 'has_los') {
          mappedParams.object = resolveObjectRef(getParam(params, 'object'), ctx);
        } else if (condId === 'on_collision') {
          mappedParams.other = resolveObjectRef(getParam(params, 'object', 'other'), ctx);
        }
        return {
          id: makeId('cond'),
          objectTypeId: targetOt.id,
          behaviorId: bDef.id,
          conditionId: condId,
          inverted,
          params: mappedParams,
        };
      }
      ctx.warnings.add(`Unmapped ${bDef.type} condition "${rawId}" in "${sheetName}"`);
      return null;
    }
  }

  // System conditions
  if (rawClass.toLowerCase() === 'system' || targetOtId === 'system') {
    if (idLow === 'on-start-of-layout' || idLow === 'on_start_of_layout') {
      return { id: makeId('cond'), objectTypeId: 'system', conditionId: 'on_start_of_layout', inverted, params: {} };
    }
    if (idLow === 'on-end-of-layout' || idLow === 'on_end_of_layout') {
      return { id: makeId('cond'), objectTypeId: 'system', conditionId: 'on_end_of_layout', inverted, params: {} };
    }
    if (idLow === 'every-tick' || idLow === 'every_tick') {
      return { id: makeId('cond'), objectTypeId: 'system', conditionId: 'every_tick', inverted, params: {} };
    }
    if (idLow === 'every-x-seconds' || idLow === 'every_x_seconds') {
      return {
        id: makeId('cond'),
        objectTypeId: 'system',
        conditionId: 'every_x_seconds',
        inverted,
        params: { interval: normalizeC3Expr(getParam(params, 'interval', 'seconds'), '1') },
      };
    }
    if (idLow === 'compare-variable' || idLow === 'compare-eventvar' || idLow === 'compare_variable') {
      return {
        id: makeId('cond'),
        objectTypeId: 'system',
        conditionId: 'compare_variable',
        inverted,
        params: {
          variable: unquoteString(getParam(params, 'variable'), ''),
          cmp: mapC3Comparison(getParam(params, 'comparison', 'cmp')),
          value: normalizeC3Expr(getParam(params, 'value'), '0'),
        },
      };
    }
    if (idLow === 'compare-two-values' || idLow === 'compare_two_values') {
      return {
        id: makeId('cond'),
        objectTypeId: 'system',
        conditionId: 'compare_two_values',
        inverted,
        params: {
          first: normalizeC3Expr(getParam(params, 'first-value', 'first', 'a'), '0'),
          cmp: mapC3Comparison(getParam(params, 'comparison', 'cmp')),
          second: normalizeC3Expr(getParam(params, 'second-value', 'second', 'b'), '0'),
        },
      };
    }
    if (idLow === 'trigger-once-while-true' || idLow === 'trigger_once') {
      return { id: makeId('cond'), objectTypeId: 'system', conditionId: 'trigger_once', inverted, params: {} };
    }
    if (idLow === 'repeat') {
      return {
        id: makeId('cond'),
        objectTypeId: 'system',
        conditionId: 'repeat',
        inverted,
        params: { count: normalizeC3Expr(getParam(params, 'count'), '5') },
      };
    }
    if (idLow === 'for-each' || idLow === 'for_each') {
      return {
        id: makeId('cond'),
        objectTypeId: 'system',
        conditionId: 'for_each',
        inverted,
        params: { object: resolveObjectRef(getParam(params, 'object'), ctx) },
      };
    }
    ctx.warnings.add(`Unmapped System condition "${rawId}" in "${sheetName}"`);
    return null;
  }

  // Global & visual plugin conditions
  const plugin = targetOt?.plugin;
  if (!targetOt || !plugin) {
    ctx.warnings.add(`Unknown object "${rawClass}" in condition "${rawId}" ("${sheetName}")`);
    return null;
  }

  if (plugin === 'Keyboard') {
    if (idLow === 'on-key-pressed' || idLow === 'on_key_pressed') {
      return {
        id: makeId('cond'),
        objectTypeId: targetOt.id,
        conditionId: 'on_key_pressed',
        inverted,
        params: { key: mapC3KeyName(getParam(params, 'key')) },
      };
    }
    if (idLow === 'on-key-released' || idLow === 'on_key_released') {
      return {
        id: makeId('cond'),
        objectTypeId: targetOt.id,
        conditionId: 'on_key_released',
        inverted,
        params: { key: mapC3KeyName(getParam(params, 'key')) },
      };
    }
    if (idLow === 'is-key-down' || idLow === 'is_key_down') {
      return {
        id: makeId('cond'),
        objectTypeId: targetOt.id,
        conditionId: 'is_key_down',
        inverted,
        params: { key: mapC3KeyName(getParam(params, 'key')) },
      };
    }
    if (idLow === 'on-any-key-pressed' || idLow === 'on_any_key_pressed') {
      return { id: makeId('cond'), objectTypeId: targetOt.id, conditionId: 'on_any_key_pressed', inverted, params: {} };
    }
  }

  if (plugin === 'Mouse') {
    const btnRaw = String(getParam(params, 'mouse-button', 'button') ?? 'left').toLowerCase();
    const button = btnRaw.includes('right') ? 'right' : btnRaw.includes('mid') ? 'middle' : 'left';
    if (idLow === 'on-click' || idLow === 'on_click') {
      return { id: makeId('cond'), objectTypeId: targetOt.id, conditionId: 'on_click', inverted, params: { button } };
    }
    if (idLow === 'on-object-clicked' || idLow === 'on_object_clicked') {
      return {
        id: makeId('cond'),
        objectTypeId: targetOt.id,
        conditionId: 'on_object_clicked',
        inverted,
        params: {
          button: button === 'middle' ? 'left' : button,
          object: resolveObjectRef(getParam(params, 'object-clicked', 'object'), ctx),
        },
      };
    }
    if (idLow === 'is-button-down' || idLow === 'is_button_down') {
      return {
        id: makeId('cond'),
        objectTypeId: targetOt.id,
        conditionId: 'is_button_down',
        inverted,
        params: { button: button === 'middle' ? 'left' : button },
      };
    }
    if (idLow === 'is-over-object' || idLow === 'cursor-is-over-object' || idLow === 'is_over_object') {
      return {
        id: makeId('cond'),
        objectTypeId: targetOt.id,
        conditionId: 'is_over_object',
        inverted,
        params: { object: resolveObjectRef(getParam(params, 'object'), ctx) },
      };
    }
  }

  if (plugin === 'Touch') {
    if (idLow === 'on-any-touch-start' || idLow === 'on-touch-start' || idLow === 'on_touch_start') {
      return { id: makeId('cond'), objectTypeId: targetOt.id, conditionId: 'on_touch_start', inverted, params: {} };
    }
    if (idLow === 'on-touched-object' || idLow === 'on-tap-object' || idLow === 'on_object_touched') {
      return {
        id: makeId('cond'),
        objectTypeId: targetOt.id,
        conditionId: 'on_object_touched',
        inverted,
        params: { object: resolveObjectRef(getParam(params, 'object'), ctx) },
      };
    }
    if (idLow === 'is-in-touch' || idLow === 'is_in_touch') {
      return { id: makeId('cond'), objectTypeId: targetOt.id, conditionId: 'is_in_touch', inverted, params: {} };
    }
  }

  if (plugin === 'Audio' && (idLow === 'is-tag-playing' || idLow === 'is_tag_playing')) {
    return {
      id: makeId('cond'),
      objectTypeId: targetOt.id,
      conditionId: 'is_tag_playing',
      inverted,
      params: { tag: quoteIfPlainIdentifier(getParam(params, 'tag'), '"sfx"') },
    };
  }

  if (plugin === 'LocalStorage') {
    const lsMap: Record<string, string> = {
      'on-item-set': 'on_item_set',
      'on-item-get': 'on_item_get',
      'on-item-exists': 'on_item_exists',
      'on-item-missing': 'on_item_missing',
    };
    if (lsMap[idLow]) {
      return {
        id: makeId('cond'),
        objectTypeId: targetOt.id,
        conditionId: lsMap[idLow],
        inverted,
        params: { key: quoteIfPlainIdentifier(getParam(params, 'key'), '"key"') },
      };
    }
  }

  if (plugin === 'Dictionary') {
    if (idLow === 'has-key' || idLow === 'has_key') {
      return {
        id: makeId('cond'),
        objectTypeId: targetOt.id,
        conditionId: 'has_key',
        inverted,
        params: { key: quoteIfPlainIdentifier(getParam(params, 'key'), '"key"') },
      };
    }
    if (idLow === 'compare-value' || idLow === 'compare_value') {
      return {
        id: makeId('cond'),
        objectTypeId: targetOt.id,
        conditionId: 'compare_value',
        inverted,
        params: {
          key: quoteIfPlainIdentifier(getParam(params, 'key'), '"key"'),
          cmp: mapC3Comparison(getParam(params, 'comparison', 'cmp')),
          value: normalizeC3Expr(getParam(params, 'value'), '0'),
        },
      };
    }
  }

  if (plugin === 'Gamepad') {
    if (idLow === 'is-button-down' || idLow === 'is_button_down') {
      return {
        id: makeId('cond'),
        objectTypeId: targetOt.id,
        conditionId: 'is_button_down',
        inverted,
        params: {
          gamepadIndex: normalizeC3Expr(getParam(params, 'gamepad'), '0'),
          buttonIndex: normalizeC3Expr(getParam(params, 'button'), '0'),
        },
      };
    }
    if (idLow === 'on-button-down' || idLow === 'on-button-pressed' || idLow === 'on_button_pressed') {
      return {
        id: makeId('cond'),
        objectTypeId: targetOt.id,
        conditionId: 'on_button_pressed',
        inverted,
        params: {
          gamepadIndex: normalizeC3Expr(getParam(params, 'gamepad'), '0'),
          buttonIndex: normalizeC3Expr(getParam(params, 'button'), '0'),
        },
      };
    }
  }

  // Common visual conditions
  if (idLow === 'on-collision-with-another-object' || idLow === 'on_collision') {
    return {
      id: makeId('cond'),
      objectTypeId: targetOt.id,
      conditionId: 'on_collision',
      inverted,
      params: { other: resolveObjectRef(getParam(params, 'object', 'other'), ctx) },
    };
  }
  if (idLow === 'is-overlapping-another-object' || idLow === 'is_overlapping') {
    return {
      id: makeId('cond'),
      objectTypeId: targetOt.id,
      conditionId: 'is_overlapping',
      inverted,
      params: { other: resolveObjectRef(getParam(params, 'object', 'other'), ctx) },
    };
  }
  if (idLow === 'compare-x' || idLow === 'compare_x') {
    return {
      id: makeId('cond'),
      objectTypeId: targetOt.id,
      conditionId: 'compare_x',
      inverted,
      params: {
        cmp: mapC3Comparison(getParam(params, 'comparison', 'cmp')),
        value: normalizeC3Expr(getParam(params, 'x-co-ordinate', 'x', 'value'), '0'),
      },
    };
  }
  if (idLow === 'compare-y' || idLow === 'compare_y') {
    return {
      id: makeId('cond'),
      objectTypeId: targetOt.id,
      conditionId: 'compare_y',
      inverted,
      params: {
        cmp: mapC3Comparison(getParam(params, 'comparison', 'cmp')),
        value: normalizeC3Expr(getParam(params, 'y-co-ordinate', 'y', 'value'), '0'),
      },
    };
  }
  if (idLow === 'compare-instance-variable' || idLow === 'compare_inst_var') {
    return {
      id: makeId('cond'),
      objectTypeId: targetOt.id,
      conditionId: 'compare_inst_var',
      inverted,
      params: {
        varName: unquoteString(getParam(params, 'instance-variable', 'varName', 'variable'), ''),
        cmp: mapC3Comparison(getParam(params, 'comparison', 'cmp')),
        value: normalizeC3Expr(getParam(params, 'value'), '0'),
      },
    };
  }
  if (idLow === 'is-boolean-instance-variable-set' || idLow === 'is_boolean_inst_var') {
    return {
      id: makeId('cond'),
      objectTypeId: targetOt.id,
      conditionId: 'is_boolean_inst_var',
      inverted,
      params: {
        varName: unquoteString(getParam(params, 'instance-variable', 'varName', 'variable'), ''),
      },
    };
  }
  if (idLow === 'is-visible' || idLow === 'is_visible') {
    return { id: makeId('cond'), objectTypeId: targetOt.id, conditionId: 'is_visible', inverted, params: {} };
  }
  if (idLow === 'is-outside-layout' || idLow === 'is_outside_layout') {
    return { id: makeId('cond'), objectTypeId: targetOt.id, conditionId: 'is_outside_layout', inverted, params: {} };
  }
  if (idLow === 'pick-nearest-furthest' || idLow === 'pick_nearest') {
    const w = String(getParam(params, 'which') ?? 'nearest').toLowerCase();
    return {
      id: makeId('cond'),
      objectTypeId: targetOt.id,
      conditionId: 'pick_nearest',
      inverted,
      params: {
        which: w.includes('furth') ? 'furthest' : 'nearest',
        x: normalizeC3Expr(getParam(params, 'x'), '0'),
        y: normalizeC3Expr(getParam(params, 'y'), '0'),
      },
    };
  }
  if (idLow === 'on-created' || idLow === 'on_created') {
    return { id: makeId('cond'), objectTypeId: targetOt.id, conditionId: 'on_created', inverted, params: {} };
  }
  if (idLow === 'on-destroyed' || idLow === 'on_destroyed') {
    return { id: makeId('cond'), objectTypeId: targetOt.id, conditionId: 'on_destroyed', inverted, params: {} };
  }

  // Sprite specific
  if (plugin === 'Sprite') {
    if (idLow === 'is-playing' || idLow === 'is_playing_anim') {
      return {
        id: makeId('cond'),
        objectTypeId: targetOt.id,
        conditionId: 'is_playing_anim',
        inverted,
        params: { name: quoteIfPlainIdentifier(getParam(params, 'animation', 'name'), '"Default"') },
      };
    }
    if (idLow === 'on-finished' || idLow === 'on_anim_finished') {
      return {
        id: makeId('cond'),
        objectTypeId: targetOt.id,
        conditionId: 'on_anim_finished',
        inverted,
        params: { name: quoteIfPlainIdentifier(getParam(params, 'animation', 'name'), '"Default"') },
      };
    }
    if (idLow === 'compare-frame' || idLow === 'compare_frame') {
      return {
        id: makeId('cond'),
        objectTypeId: targetOt.id,
        conditionId: 'compare_frame',
        inverted,
        params: {
          cmp: mapC3Comparison(getParam(params, 'comparison', 'cmp')),
          frame: normalizeC3Expr(getParam(params, 'number', 'frame'), '0'),
        },
      };
    }
  }

  if (plugin === 'Text' && (idLow === 'compare-text' || idLow === 'compare_text')) {
    return {
      id: makeId('cond'),
      objectTypeId: targetOt.id,
      conditionId: 'compare_text',
      inverted,
      params: { text: quoteIfPlainIdentifier(getParam(params, 'text-to-compare', 'text'), '""') },
    };
  }

  if (plugin === 'Tilemap' && (idLow === 'compare-tile-at' || idLow === 'compare_tile_at')) {
    return {
      id: makeId('cond'),
      objectTypeId: targetOt.id,
      conditionId: 'compare_tile_at',
      inverted,
      params: {
        col: normalizeC3Expr(getParam(params, 'tile-x', 'col', 'x'), '0'),
        row: normalizeC3Expr(getParam(params, 'tile-y', 'row', 'y'), '0'),
        cmp: mapC3Comparison(getParam(params, 'comparison', 'cmp')),
        tileIndex: normalizeC3Expr(getParam(params, 'tile', 'tileIndex'), '0'),
      },
    };
  }

  if (plugin === 'Button' && (idLow === 'on-clicked' || idLow === 'on_clicked')) {
    return { id: makeId('cond'), objectTypeId: targetOt.id, conditionId: 'on_clicked', inverted, params: {} };
  }

  if (plugin === 'Slider' && (idLow === 'on-changed' || idLow === 'on_changed')) {
    return { id: makeId('cond'), objectTypeId: targetOt.id, conditionId: 'on_changed', inverted, params: {} };
  }

  ctx.warnings.add(`Unmapped condition ${rawClass}.${rawId} in "${sheetName}"`);
  return null;
}

function mapC3BehaviorConditionId(bType: BehaviorType, idLow: string): string | null {
  if (bType === 'Platform') {
    const map: Record<string, string> = {
      'is-on-floor': 'is_on_floor',
      'is-jumping': 'is_jumping',
      'is-falling': 'is_falling',
      'is-moving': 'is_moving',
      'is-by-wall': 'is_by_wall',
      'on-landed': 'on_landed',
      'on-jump': 'on_jump',
      'on-fall': 'on_fall',
    };
    return map[idLow] || null;
  }
  if (bType === 'Solid' || bType === 'JumpThru') {
    return idLow === 'is-enabled' ? 'is_enabled' : null;
  }
  if (bType === 'EightDirection') {
    return idLow === 'is-moving' ? 'is_moving' : null;
  }
  if (bType === 'Bullet') {
    return idLow === 'compare-speed' ? 'compare_speed' : null;
  }
  if (bType === 'Sine') {
    return idLow === 'is-active' || idLow === 'is-enabled' ? 'is_active' : null;
  }
  if (bType === 'Fade') {
    return idLow === 'on-fade-out-finished' ? 'on_fade_out_finished' : null;
  }
  if (bType === 'Flash') {
    return idLow === 'is-flashing' ? 'is_flashing' : null;
  }
  if (bType === 'Timer') {
    if (idLow === 'on-timer') return 'on_timer';
    if (idLow === 'is-timer-running') return 'is_timer_running';
  }
  if (bType === 'Wrap') {
    return idLow === 'on-wrap' ? 'on_wrap' : null;
  }
  if (bType === 'DragDrop') {
    if (idLow === 'is-dragging') return 'is_dragging';
    if (idLow === 'on-drag-start') return 'on_drag_start';
    if (idLow === 'on-drop') return 'on_drop';
  }
  if (bType === 'Tween') {
    if (idLow === 'on-tweens-finished' || idLow === 'on-finished') return 'on_finished';
    if (idLow === 'is-playing') return 'is_playing';
    if (idLow === 'is-any-playing') return 'is_any_playing';
  }
  if (bType === 'Pin') {
    return idLow === 'is-pinned' ? 'is_pinned' : null;
  }
  if (bType === 'Turret') {
    if (idLow === 'on-target-acquired') return 'on_target_acquired';
    if (idLow === 'on-shoot') return 'on_shoot';
    if (idLow === 'has-target') return 'has_target';
  }
  if (bType === 'LineOfSight') {
    return idLow === 'has-los-to-object' || idLow === 'has-los' ? 'has_los' : null;
  }
  if (bType === 'Pathfinding') {
    const map: Record<string, string> = {
      'on-path-found': 'on_path_found',
      'on-failed-to-find-path': 'on_failed',
      'on-arrived': 'on_arrived',
      'is-moving': 'is_moving',
      'has-path': 'has_path',
    };
    return map[idLow] || null;
  }
  if (bType === 'Physics') {
    if (idLow === 'is-sleeping') return 'is_sleeping';
    if (idLow === 'compare-velocity') return 'compare_velocity';
    if (idLow === 'on-collision' || idLow === 'on-collision-with-another-object') return 'on_collision';
  }
  return null;
}

function mapC3Action(
  c3Act: Record<string, unknown>,
  ctx: ConversionContext,
  sheetName: string
): ActionItem | null {
  const rawClass = String(c3Act.objectClass || 'System');
  const rawId = String(c3Act.id || '');
  const behaviorTypeRaw = c3Act.behaviorType ? String(c3Act.behaviorType) : undefined;
  const params = (c3Act.parameters || {}) as Record<string, unknown>;

  const targetOtId = resolveObjectRef(rawClass, ctx);
  const targetOt = ctx.objectById.get(targetOtId);
  const idLow = rawId.toLowerCase();

  // Behavior action
  if (behaviorTypeRaw && targetOt) {
    const mappedBType = mapC3BehaviorId(behaviorTypeRaw);
    const bDef =
      targetOt.behaviorDefs.find((b) => b.name.toLowerCase() === behaviorTypeRaw.toLowerCase()) ||
      (mappedBType ? targetOt.behaviorDefs.find((b) => b.type === mappedBType) : undefined);

    if (bDef) {
      const mapped = mapC3BehaviorAction(bDef.type, idLow, params, ctx);
      if (mapped) {
        return {
          id: makeId('act'),
          objectTypeId: targetOt.id,
          behaviorId: bDef.id,
          actionId: mapped.actionId,
          params: mapped.params,
        };
      }
      ctx.warnings.add(`Unmapped ${bDef.type} action "${rawId}" in "${sheetName}"`);
      return null;
    }
  }

  // System actions
  if (rawClass.toLowerCase() === 'system' || targetOtId === 'system') {
    if (idLow === 'set-eventvar-value' || idLow === 'set-value' || idLow === 'set_var') {
      return {
        id: makeId('act'),
        objectTypeId: 'system',
        actionId: 'set_var',
        params: {
          variable: unquoteString(getParam(params, 'variable'), ''),
          value: normalizeC3Expr(getParam(params, 'value'), '0'),
        },
      };
    }
    if (idLow === 'add-to-eventvar' || idLow === 'add-to' || idLow === 'add_var') {
      return {
        id: makeId('act'),
        objectTypeId: 'system',
        actionId: 'add_var',
        params: {
          variable: unquoteString(getParam(params, 'variable'), ''),
          value: normalizeC3Expr(getParam(params, 'value'), '1'),
        },
      };
    }
    if (idLow === 'subtract-from-eventvar' || idLow === 'subtract-from' || idLow === 'sub_var') {
      return {
        id: makeId('act'),
        objectTypeId: 'system',
        actionId: 'sub_var',
        params: {
          variable: unquoteString(getParam(params, 'variable'), ''),
          value: normalizeC3Expr(getParam(params, 'value'), '1'),
        },
      };
    }
    if (idLow === 'wait') {
      return {
        id: makeId('act'),
        objectTypeId: 'system',
        actionId: 'wait',
        params: { seconds: normalizeC3Expr(getParam(params, 'seconds'), '1') },
      };
    }
    if (idLow === 'create-object' || idLow === 'create_object') {
      return {
        id: makeId('act'),
        objectTypeId: 'system',
        actionId: 'create_object',
        params: {
          object: resolveObjectRef(getParam(params, 'object-to-create', 'object'), ctx),
          layer: normalizeC3Expr(getParam(params, 'layer'), '0'),
          x: normalizeC3Expr(getParam(params, 'x'), '0'),
          y: normalizeC3Expr(getParam(params, 'y'), '0'),
        },
      };
    }
    if (idLow === 'go-to-layout' || idLow === 'go-to-layout-by-name' || idLow === 'go_to_layout') {
      const layName = unquoteString(getParam(params, 'layout'), '');
      const layId = ctx.layoutIdByName.get(layName.toLowerCase()) || layName;
      return {
        id: makeId('act'),
        objectTypeId: 'system',
        actionId: 'go_to_layout',
        params: { layout: layId },
      };
    }
    if (idLow === 'restart-layout' || idLow === 'restart_layout') {
      return { id: makeId('act'), objectTypeId: 'system', actionId: 'restart_layout', params: {} };
    }
    if (idLow === 'set-scroll-x' || idLow === 'set_scroll_x') {
      return {
        id: makeId('act'),
        objectTypeId: 'system',
        actionId: 'set_scroll_x',
        params: { x: normalizeC3Expr(getParam(params, 'x'), '0') },
      };
    }
    if (idLow === 'set-scroll-y' || idLow === 'set_scroll_y') {
      return {
        id: makeId('act'),
        objectTypeId: 'system',
        actionId: 'set_scroll_y',
        params: { y: normalizeC3Expr(getParam(params, 'y'), '0') },
      };
    }
    if (idLow === 'set-time-scale' || idLow === 'set_timescale') {
      return {
        id: makeId('act'),
        objectTypeId: 'system',
        actionId: 'set_timescale',
        params: { scale: normalizeC3Expr(getParam(params, 'time-scale', 'scale'), '1') },
      };
    }
    if (idLow === 'set-group-active' || idLow === 'set_group_active') {
      return {
        id: makeId('act'),
        objectTypeId: 'system',
        actionId: 'set_group_active',
        params: {
          group: quoteIfPlainIdentifier(getParam(params, 'group-name', 'group'), '""'),
          active: normalizeBoolSelect(getParam(params, 'state', 'active'), ['active', 'activated', 'true']),
        },
      };
    }
    if (idLow === 'set-layer-visible' || idLow === 'set_layer_visible') {
      return {
        id: makeId('act'),
        objectTypeId: 'system',
        actionId: 'set_layer_visible',
        params: {
          layer: normalizeC3Expr(getParam(params, 'layer'), '0'),
          visible: normalizeBoolSelect(getParam(params, 'visibility', 'visible'), ['visible', 'true']),
        },
      };
    }
    ctx.warnings.add(`Unmapped System action "${rawId}" in "${sheetName}"`);
    return null;
  }

  if (!targetOt) {
    ctx.warnings.add(`Unknown object "${rawClass}" in action "${rawId}" ("${sheetName}")`);
    return null;
  }

  const plugin = targetOt.plugin;

  if (plugin === 'Audio') {
    if (idLow === 'play' || idLow === 'play-by-name' || idLow === 'play_asset') {
      return {
        id: makeId('act'),
        objectTypeId: targetOt.id,
        actionId: 'play_asset',
        params: {
          name: quoteIfPlainIdentifier(getParam(params, 'audio-file', 'audio-file-name', 'name'), '""'),
          loop: normalizeBoolSelect(getParam(params, 'loop'), ['loop', 'true', '1']),
          volume: normalizeC3Expr(getParam(params, 'volume'), '0'),
          tag: quoteIfPlainIdentifier(getParam(params, 'tag-optional', 'tag'), '"sfx"'),
        },
      };
    }
    if (idLow === 'set-volume' || idLow === 'set_volume') {
      return {
        id: makeId('act'),
        objectTypeId: targetOt.id,
        actionId: 'set_volume',
        params: {
          tag: quoteIfPlainIdentifier(getParam(params, 'tag'), '"sfx"'),
          volume: normalizeC3Expr(getParam(params, 'db', 'volume'), '0'),
        },
      };
    }
    if (idLow === 'stop' || idLow === 'stop_tag') {
      return {
        id: makeId('act'),
        objectTypeId: targetOt.id,
        actionId: 'stop_tag',
        params: { tag: quoteIfPlainIdentifier(getParam(params, 'tag'), '"sfx"') },
      };
    }
    if (idLow === 'stop-all' || idLow === 'stop_all') {
      return { id: makeId('act'), objectTypeId: targetOt.id, actionId: 'stop_all', params: {} };
    }
  }

  if (plugin === 'Mouse' && (idLow === 'set-cursor-style' || idLow === 'set_cursor')) {
    const c = String(getParam(params, 'cursor-style', 'cursor') ?? 'default').toLowerCase();
    return {
      id: makeId('act'),
      objectTypeId: targetOt.id,
      actionId: 'set_cursor',
      params: {
        cursor: c.includes('hand') || c.includes('point') ? 'pointer' : c.includes('cross') ? 'crosshair' : c.includes('none') ? 'none' : 'default',
      },
    };
  }

  if (plugin === 'LocalStorage') {
    const keyExpr = quoteIfPlainIdentifier(getParam(params, 'key'), '"key"');
    if (idLow === 'set-item' || idLow === 'set_item') {
      return {
        id: makeId('act'),
        objectTypeId: targetOt.id,
        actionId: 'set_item',
        params: { key: keyExpr, value: normalizeC3Expr(getParam(params, 'value'), '0') },
      };
    }
    if (idLow === 'get-item' || idLow === 'get_item') {
      return { id: makeId('act'), objectTypeId: targetOt.id, actionId: 'get_item', params: { key: keyExpr } };
    }
    if (idLow === 'check-item-exists' || idLow === 'check_item_exists') {
      return { id: makeId('act'), objectTypeId: targetOt.id, actionId: 'check_item_exists', params: { key: keyExpr } };
    }
    if (idLow === 'remove-item' || idLow === 'remove_item') {
      return { id: makeId('act'), objectTypeId: targetOt.id, actionId: 'remove_item', params: { key: keyExpr } };
    }
  }

  if (plugin === 'Dictionary') {
    if (idLow === 'add-key' || idLow === 'set-key' || idLow === 'set_key') {
      return {
        id: makeId('act'),
        objectTypeId: targetOt.id,
        actionId: 'set_key',
        params: {
          key: quoteIfPlainIdentifier(getParam(params, 'key'), '"key"'),
          value: normalizeC3Expr(getParam(params, 'value'), '0'),
        },
      };
    }
    if (idLow === 'delete-key' || idLow === 'delete_key') {
      return {
        id: makeId('act'),
        objectTypeId: targetOt.id,
        actionId: 'delete_key',
        params: { key: quoteIfPlainIdentifier(getParam(params, 'key'), '"key"') },
      };
    }
    if (idLow === 'clear') {
      return { id: makeId('act'), objectTypeId: targetOt.id, actionId: 'clear', params: {} };
    }
  }

  if (plugin === 'Gamepad' && idLow === 'vibrate') {
    return {
      id: makeId('act'),
      objectTypeId: targetOt.id,
      actionId: 'vibrate',
      params: {
        gamepadIndex: normalizeC3Expr(getParam(params, 'gamepad'), '0'),
        durationMs: normalizeC3Expr(getParam(params, 'duration'), '200'),
        strong: normalizeC3Expr(getParam(params, 'strong-magnitude', 'strong'), '0.8'),
        weak: normalizeC3Expr(getParam(params, 'weak-magnitude', 'weak'), '0.5'),
      },
    };
  }

  // Common visual actions
  if (idLow === 'set-position' || idLow === 'set_position') {
    return {
      id: makeId('act'),
      objectTypeId: targetOt.id,
      actionId: 'set_position',
      params: {
        x: normalizeC3Expr(getParam(params, 'x'), '0'),
        y: normalizeC3Expr(getParam(params, 'y'), '0'),
      },
    };
  }
  if (idLow === 'set-x' || idLow === 'set_x') {
    return {
      id: makeId('act'),
      objectTypeId: targetOt.id,
      actionId: 'set_x',
      params: { x: normalizeC3Expr(getParam(params, 'x'), '0') },
    };
  }
  if (idLow === 'set-y' || idLow === 'set_y') {
    return {
      id: makeId('act'),
      objectTypeId: targetOt.id,
      actionId: 'set_y',
      params: { y: normalizeC3Expr(getParam(params, 'y'), '0') },
    };
  }
  if (idLow === 'move-at-angle' || idLow === 'move_at_angle') {
    return {
      id: makeId('act'),
      objectTypeId: targetOt.id,
      actionId: 'move_at_angle',
      params: {
        angle: normalizeC3Expr(getParam(params, 'angle'), '0'),
        distance: normalizeC3Expr(getParam(params, 'distance'), '10'),
      },
    };
  }
  if (idLow === 'set-size' || idLow === 'set_size') {
    return {
      id: makeId('act'),
      objectTypeId: targetOt.id,
      actionId: 'set_size',
      params: {
        width: normalizeC3Expr(getParam(params, 'width'), '32'),
        height: normalizeC3Expr(getParam(params, 'height'), '32'),
      },
    };
  }
  if (idLow === 'set-angle' || idLow === 'set_angle') {
    return {
      id: makeId('act'),
      objectTypeId: targetOt.id,
      actionId: 'set_angle',
      params: { angle: normalizeC3Expr(getParam(params, 'angle'), '0') },
    };
  }
  if (idLow === 'rotate-clockwise' || idLow === 'rotate_clockwise') {
    return {
      id: makeId('act'),
      objectTypeId: targetOt.id,
      actionId: 'rotate_clockwise',
      params: { degrees: normalizeC3Expr(getParam(params, 'degrees'), '90 * dt') },
    };
  }
  if (idLow === 'rotate-toward-position' || idLow === 'set-angle-toward-position' || idLow === 'set_angle_toward') {
    return {
      id: makeId('act'),
      objectTypeId: targetOt.id,
      actionId: 'set_angle_toward',
      params: {
        x: normalizeC3Expr(getParam(params, 'x'), '0'),
        y: normalizeC3Expr(getParam(params, 'y'), '0'),
      },
    };
  }
  if (idLow === 'set-opacity' || idLow === 'set_opacity') {
    return {
      id: makeId('act'),
      objectTypeId: targetOt.id,
      actionId: 'set_opacity',
      params: { opacity: normalizeC3Expr(getParam(params, 'opacity'), '100') },
    };
  }
  if (idLow === 'set-visible' || idLow === 'set_visible') {
    return {
      id: makeId('act'),
      objectTypeId: targetOt.id,
      actionId: 'set_visible',
      params: { visible: normalizeBoolSelect(getParam(params, 'visibility', 'visible'), ['visible', 'true']) },
    };
  }
  if (idLow === 'set-instvar-value' || idLow === 'set-instance-variable' || idLow === 'set_inst_var') {
    return {
      id: makeId('act'),
      objectTypeId: targetOt.id,
      actionId: 'set_inst_var',
      params: {
        varName: unquoteString(getParam(params, 'instance-variable', 'varName', 'variable'), ''),
        value: normalizeC3Expr(getParam(params, 'value'), '0'),
      },
    };
  }
  if (idLow === 'add-to-instvar' || idLow === 'add-to-instance-variable' || idLow === 'add_inst_var') {
    return {
      id: makeId('act'),
      objectTypeId: targetOt.id,
      actionId: 'add_inst_var',
      params: {
        varName: unquoteString(getParam(params, 'instance-variable', 'varName', 'variable'), ''),
        value: normalizeC3Expr(getParam(params, 'value'), '1'),
      },
    };
  }
  if (idLow === 'spawn-another-object' || idLow === 'spawn_object') {
    return {
      id: makeId('act'),
      objectTypeId: targetOt.id,
      actionId: 'spawn_object',
      params: {
        object: resolveObjectRef(getParam(params, 'object-to-spawn', 'object'), ctx),
        layer: normalizeC3Expr(getParam(params, 'layer'), '0'),
      },
    };
  }
  if (idLow === 'destroy') {
    return { id: makeId('act'), objectTypeId: targetOt.id, actionId: 'destroy', params: {} };
  }

  // Sprite actions
  if (plugin === 'Sprite') {
    if (idLow === 'set-animation' || idLow === 'set_animation') {
      const f = String(getParam(params, 'from') ?? 'beginning').toLowerCase();
      return {
        id: makeId('act'),
        objectTypeId: targetOt.id,
        actionId: 'set_animation',
        params: {
          name: quoteIfPlainIdentifier(getParam(params, 'animation', 'name'), '"Default"'),
          from: f.includes('current') ? 'current-frame' : 'beginning',
        },
      };
    }
    if (idLow === 'set-animation-frame' || idLow === 'set_frame') {
      return {
        id: makeId('act'),
        objectTypeId: targetOt.id,
        actionId: 'set_frame',
        params: { frame: normalizeC3Expr(getParam(params, 'frame-number', 'frame'), '0') },
      };
    }
    if (idLow === 'set-animation-speed' || idLow === 'set_anim_speed') {
      return {
        id: makeId('act'),
        objectTypeId: targetOt.id,
        actionId: 'set_anim_speed',
        params: { speed: normalizeC3Expr(getParam(params, 'speed'), '8') },
      };
    }
    if (idLow === 'set-mirrored' || idLow === 'set_mirrored') {
      return {
        id: makeId('act'),
        objectTypeId: targetOt.id,
        actionId: 'set_mirrored',
        params: { mirrored: normalizeBoolSelect(getParam(params, 'state', 'mirrored'), ['mirrored', 'true']) },
      };
    }
    if (idLow === 'toggle-mirrored' || idLow === 'toggle_mirrored') {
      return { id: makeId('act'), objectTypeId: targetOt.id, actionId: 'toggle_mirrored', params: {} };
    }
    if (idLow === 'set-flipped' || idLow === 'set_flipped') {
      return {
        id: makeId('act'),
        objectTypeId: targetOt.id,
        actionId: 'set_flipped',
        params: { flipped: normalizeBoolSelect(getParam(params, 'state', 'flipped'), ['flipped', 'true']) },
      };
    }
  }

  // Text / Button actions
  if (plugin === 'Text' || plugin === 'Button') {
    if (idLow === 'set-text' || idLow === 'set_text') {
      return {
        id: makeId('act'),
        objectTypeId: targetOt.id,
        actionId: 'set_text',
        params: { text: normalizeC3Expr(getParam(params, 'text'), '""') },
      };
    }
    if (plugin === 'Text' && (idLow === 'append-text' || idLow === 'append_text')) {
      return {
        id: makeId('act'),
        objectTypeId: targetOt.id,
        actionId: 'append_text',
        params: { text: normalizeC3Expr(getParam(params, 'text'), '""') },
      };
    }
    if (plugin === 'Text' && (idLow === 'set-font-color' || idLow === 'set_font_color')) {
      return {
        id: makeId('act'),
        objectTypeId: targetOt.id,
        actionId: 'set_font_color',
        params: { color: normalizeC3Expr(getParam(params, 'color'), '"#ffffff"') },
      };
    }
    if (plugin === 'Text' && (idLow === 'set-font-size' || idLow === 'set_font_size')) {
      return {
        id: makeId('act'),
        objectTypeId: targetOt.id,
        actionId: 'set_font_size',
        params: { size: normalizeC3Expr(getParam(params, 'size-pt', 'size'), '16') },
      };
    }
  }

  if (plugin === 'Particles') {
    if (idLow === 'set-spraying' || idLow === 'set_spraying') {
      return {
        id: makeId('act'),
        objectTypeId: targetOt.id,
        actionId: 'set_spraying',
        params: { spraying: normalizeBoolSelect(getParam(params, 'state', 'spraying'), ['spraying', 'true']) },
      };
    }
    if (idLow === 'set-rate' || idLow === 'set_rate') {
      return {
        id: makeId('act'),
        objectTypeId: targetOt.id,
        actionId: 'set_rate',
        params: { rate: normalizeC3Expr(getParam(params, 'rate'), '30') },
      };
    }
  }

  if (plugin === 'Tilemap') {
    if (idLow === 'set-tile' || idLow === 'set_tile') {
      return {
        id: makeId('act'),
        objectTypeId: targetOt.id,
        actionId: 'set_tile',
        params: {
          col: normalizeC3Expr(getParam(params, 'tile-x', 'col', 'x'), '0'),
          row: normalizeC3Expr(getParam(params, 'tile-y', 'row', 'y'), '0'),
          tileIndex: normalizeC3Expr(getParam(params, 'tile', 'tileIndex'), '0'),
        },
      };
    }
    if (idLow === 'erase-tile' || idLow === 'clear_tile') {
      return {
        id: makeId('act'),
        objectTypeId: targetOt.id,
        actionId: 'clear_tile',
        params: {
          col: normalizeC3Expr(getParam(params, 'tile-x', 'col', 'x'), '0'),
          row: normalizeC3Expr(getParam(params, 'tile-y', 'row', 'y'), '0'),
        },
      };
    }
  }

  if (plugin === 'Slider' && (idLow === 'set-value' || idLow === 'set_value')) {
    return {
      id: makeId('act'),
      objectTypeId: targetOt.id,
      actionId: 'set_value',
      params: { value: normalizeC3Expr(getParam(params, 'value'), '50') },
    };
  }

  if (plugin === 'ProgressBar' && (idLow === 'set-progress' || idLow === 'set_progress')) {
    return {
      id: makeId('act'),
      objectTypeId: targetOt.id,
      actionId: 'set_progress',
      params: { progress: normalizeC3Expr(getParam(params, 'value', 'progress'), '50') },
    };
  }

  ctx.warnings.add(`Unmapped action ${rawClass}.${rawId} in "${sheetName}"`);
  return null;
}

function mapC3BehaviorAction(
  bType: BehaviorType,
  idLow: string,
  params: Record<string, unknown>,
  ctx: ConversionContext
): { actionId: string; params: Record<string, string> } | null {
  if (idLow === 'set-enabled' || idLow === 'set-active') {
    return {
      actionId: 'set_enabled',
      params: { enabled: normalizeBoolSelect(getParam(params, 'state', 'enabled'), ['enabled', 'active', 'true']) },
    };
  }

  if (bType === 'Platform') {
    if (idLow === 'simulate-control') {
      const c = String(getParam(params, 'control') ?? 'jump').toLowerCase();
      return {
        actionId: 'simulate_control',
        params: { control: c.includes('left') ? 'left' : c.includes('right') ? 'right' : 'jump' },
      };
    }
    if (idLow === 'fall-through') return { actionId: 'fall_through', params: {} };
    if (idLow === 'set-vector-x') return { actionId: 'set_vector_x', params: { vx: normalizeC3Expr(getParam(params, 'vector-x', 'vx'), '0') } };
    if (idLow === 'set-vector-y') return { actionId: 'set_vector_y', params: { vy: normalizeC3Expr(getParam(params, 'vector-y', 'vy'), '0') } };
    if (idLow === 'set-max-speed') return { actionId: 'set_max_speed', params: { speed: normalizeC3Expr(getParam(params, 'max-speed', 'speed'), '260') } };
    if (idLow === 'reset-double-jump') return { actionId: 'reset_double_jump', params: {} };
  }

  if (bType === 'EightDirection') {
    if (idLow === 'simulate-control') {
      const c = String(getParam(params, 'control') ?? 'right').toLowerCase();
      return {
        actionId: 'simulate_control',
        params: {
          control: c.includes('left') ? 'left' : c.includes('up') ? 'up' : c.includes('down') ? 'down' : 'right',
        },
      };
    }
    if (idLow === 'stop') return { actionId: 'stop', params: {} };
    if (idLow === 'set-speed') return { actionId: 'set_speed', params: { speed: normalizeC3Expr(getParam(params, 'speed'), '200') } };
  }

  if (bType === 'Bullet') {
    if (idLow === 'set-speed') return { actionId: 'set_speed', params: { speed: normalizeC3Expr(getParam(params, 'speed'), '400') } };
    if (idLow === 'set-angle-of-motion') return { actionId: 'set_angle_of_motion', params: { angle: normalizeC3Expr(getParam(params, 'angle'), '0') } };
    if (idLow === 'set-gravity') return { actionId: 'set_gravity', params: { gravity: normalizeC3Expr(getParam(params, 'gravity'), '0') } };
  }

  if (bType === 'Sine') {
    if (idLow === 'set-magnitude') return { actionId: 'set_magnitude', params: { magnitude: normalizeC3Expr(getParam(params, 'magnitude'), '10') } };
    if (idLow === 'set-period') return { actionId: 'set_period', params: { period: normalizeC3Expr(getParam(params, 'period'), '2') } };
  }

  if (bType === 'Fade') {
    if (idLow === 'start-fade') return { actionId: 'start_fade', params: {} };
    if (idLow === 'restart-fade') return { actionId: 'restart_fade', params: {} };
  }

  if (bType === 'Flash') {
    if (idLow === 'flash') {
      return {
        actionId: 'flash',
        params: {
          onTime: normalizeC3Expr(getParam(params, 'on-time', 'onTime'), '0.08'),
          offTime: normalizeC3Expr(getParam(params, 'off-time', 'offTime'), '0.08'),
          duration: normalizeC3Expr(getParam(params, 'duration'), '1.0'),
        },
      };
    }
    if (idLow === 'stop-flashing') return { actionId: 'stop_flashing', params: {} };
  }

  if (bType === 'Timer') {
    if (idLow === 'start-timer') {
      const t = String(getParam(params, 'type') ?? 'once').toLowerCase();
      return {
        actionId: 'start_timer',
        params: {
          duration: normalizeC3Expr(getParam(params, 'duration'), '1.0'),
          tag: quoteIfPlainIdentifier(getParam(params, 'tag'), '"timer"'),
          type: t.includes('reg') ? 'Regular' : 'Once',
        },
      };
    }
    if (idLow === 'stop-timer') return { actionId: 'stop_timer', params: { tag: quoteIfPlainIdentifier(getParam(params, 'tag'), '"timer"') } };
    if (idLow === 'stop-all-timers') return { actionId: 'stop_all_timers', params: {} };
  }

  if (bType === 'ScrollTo' && idLow === 'shake') {
    const mode = String(getParam(params, 'mode') ?? 'reducing').toLowerCase();
    return {
      actionId: 'shake',
      params: {
        magnitude: normalizeC3Expr(getParam(params, 'magnitude'), '12'),
        duration: normalizeC3Expr(getParam(params, 'duration'), '0.4'),
        mode: mode.includes('const') ? 'constant' : 'reducing',
      },
    };
  }

  if (bType === 'DragDrop' && idLow === 'drop') return { actionId: 'drop', params: {} };

  if (bType === 'Rotate') {
    if (idLow === 'set-speed') return { actionId: 'set_speed', params: { speed: normalizeC3Expr(getParam(params, 'speed'), '90') } };
    if (idLow === 'set-acceleration') return { actionId: 'set_acceleration', params: { accel: normalizeC3Expr(getParam(params, 'acceleration', 'accel'), '0') } };
  }

  if (bType === 'Tween') {
    if (idLow === 'tween-one-property') {
      const propRaw = String(getParam(params, 'property') ?? 'x').toLowerCase();
      const property = propRaw.includes('y')
        ? 'y'
        : propRaw.includes('angle')
        ? 'angle'
        : propRaw.includes('opac')
        ? 'opacity'
        : propRaw.includes('scale')
        ? 'scale'
        : propRaw.includes('width')
        ? 'width'
        : propRaw.includes('height')
        ? 'height'
        : 'x';
      return {
        actionId: 'tween_one',
        params: {
          tag: quoteIfPlainIdentifier(getParam(params, 'tag'), '"move"'),
          property,
          endValue: normalizeC3Expr(getParam(params, 'end-value', 'endValue'), '200'),
          duration: normalizeC3Expr(getParam(params, 'time', 'duration'), '1.0'),
          easing: 'EaseOutQuad',
          loop: 'none',
          destroyOnFinish: normalizeBoolSelect(getParam(params, 'destroy-on-complete'), ['yes', 'true']),
        },
      };
    }
    if (idLow === 'tween-two-properties') {
      const propRaw = String(getParam(params, 'property', 'properties') ?? 'position').toLowerCase();
      return {
        actionId: 'tween_two',
        params: {
          tag: quoteIfPlainIdentifier(getParam(params, 'tag'), '"pos"'),
          properties: propRaw.includes('size') ? 'size' : propRaw.includes('scale') ? 'scale' : 'position',
          end1: normalizeC3Expr(getParam(params, 'end-x', 'end1'), '200'),
          end2: normalizeC3Expr(getParam(params, 'end-y', 'end2'), '200'),
          duration: normalizeC3Expr(getParam(params, 'time', 'duration'), '1.0'),
          easing: 'EaseOutQuad',
          loop: 'none',
          destroyOnFinish: normalizeBoolSelect(getParam(params, 'destroy-on-complete'), ['yes', 'true']),
        },
      };
    }
    if (idLow === 'tween-value') {
      return {
        actionId: 'tween_value',
        params: {
          tag: quoteIfPlainIdentifier(getParam(params, 'tag'), '"val"'),
          startValue: normalizeC3Expr(getParam(params, 'start-value', 'start'), '0'),
          endValue: normalizeC3Expr(getParam(params, 'end-value', 'end'), '100'),
          duration: normalizeC3Expr(getParam(params, 'time', 'duration'), '1.0'),
          easing: 'EaseInOutSine',
          loop: 'none',
        },
      };
    }
    if (idLow === 'stop-tweens' || idLow === 'stop') return { actionId: 'stop_tween', params: { tag: quoteIfPlainIdentifier(getParam(params, 'tag'), '""') } };
    if (idLow === 'pause-tweens' || idLow === 'pause') return { actionId: 'pause_tween', params: { tag: quoteIfPlainIdentifier(getParam(params, 'tag'), '""') } };
    if (idLow === 'resume-tweens' || idLow === 'resume') return { actionId: 'resume_tween', params: { tag: quoteIfPlainIdentifier(getParam(params, 'tag'), '""') } };
  }

  if (bType === 'Pin') {
    if (idLow === 'pin-to-object') {
      const m = String(getParam(params, 'mode') ?? 'both').toLowerCase();
      return {
        actionId: 'pin_to_object',
        params: {
          object: resolveObjectRef(getParam(params, 'pin-to', 'object'), ctx),
          mode: m.includes('pos') && !m.includes('angle') ? 'position' : m.includes('angle') && !m.includes('pos') ? 'angle' : 'both',
        },
      };
    }
    if (idLow === 'unpin') return { actionId: 'unpin', params: {} };
  }

  if (bType === 'Turret') {
    if (idLow === 'add-object-to-target') return { actionId: 'add_target', params: { object: resolveObjectRef(getParam(params, 'target', 'object'), ctx) } };
    if (idLow === 'clear-targets') return { actionId: 'clear_targets', params: {} };
    if (idLow === 'set-range') return { actionId: 'set_range', params: { range: normalizeC3Expr(getParam(params, 'range'), '300') } };
    if (idLow === 'set-rate-of-fire') return { actionId: 'set_rate_of_fire', params: { rate: normalizeC3Expr(getParam(params, 'rate-of-fire', 'rate'), '0.6') } };
    if (idLow === 'set-rotate-speed') return { actionId: 'set_rotate_speed', params: { speed: normalizeC3Expr(getParam(params, 'rotate-speed', 'speed'), '180') } };
  }

  if (bType === 'LineOfSight') {
    if (idLow === 'set-range') return { actionId: 'set_range', params: { range: normalizeC3Expr(getParam(params, 'range'), '350') } };
    if (idLow === 'set-cone-of-view') return { actionId: 'set_cone', params: { cone: normalizeC3Expr(getParam(params, 'cone-of-view', 'cone'), '90') } };
  }

  if (bType === 'Pathfinding') {
    if (idLow === 'find-path') {
      return {
        actionId: 'find_path',
        params: { x: normalizeC3Expr(getParam(params, 'x'), '0'), y: normalizeC3Expr(getParam(params, 'y'), '0') },
      };
    }
    if (idLow === 'move-along-path') return { actionId: 'move_along_path', params: {} };
    if (idLow === 'stop') return { actionId: 'stop', params: {} };
    if (idLow === 'regenerate-obstacle-map') return { actionId: 'regenerate_map', params: {} };
    if (idLow === 'set-max-speed') return { actionId: 'set_speed', params: { speed: normalizeC3Expr(getParam(params, 'max-speed', 'speed'), '180') } };
  }

  if (bType === 'Physics') {
    if (idLow === 'apply-force') {
      return {
        actionId: 'apply_force',
        params: { fx: normalizeC3Expr(getParam(params, 'force-x', 'fx'), '0'), fy: normalizeC3Expr(getParam(params, 'force-y', 'fy'), '0') },
      };
    }
    if (idLow === 'apply-force-at-angle') {
      return {
        actionId: 'apply_force_at_angle',
        params: { force: normalizeC3Expr(getParam(params, 'force'), '500'), angle: normalizeC3Expr(getParam(params, 'angle'), '270') },
      };
    }
    if (idLow === 'apply-impulse') {
      return {
        actionId: 'apply_impulse',
        params: { jx: normalizeC3Expr(getParam(params, 'impulse-x', 'jx'), '0'), jy: normalizeC3Expr(getParam(params, 'impulse-y', 'jy'), '0') },
      };
    }
    if (idLow === 'apply-impulse-at-angle') {
      return {
        actionId: 'apply_impulse_at_angle',
        params: { impulse: normalizeC3Expr(getParam(params, 'impulse'), '300'), angle: normalizeC3Expr(getParam(params, 'angle'), '270') },
      };
    }
    if (idLow === 'set-velocity') {
      return {
        actionId: 'set_velocity',
        params: { vx: normalizeC3Expr(getParam(params, 'velocity-x', 'vx'), '0'), vy: normalizeC3Expr(getParam(params, 'velocity-y', 'vy'), '0') },
      };
    }
    if (idLow === 'set-angular-velocity') return { actionId: 'set_angular_velocity', params: { vAng: normalizeC3Expr(getParam(params, 'angular-velocity', 'vAng'), '0') } };
    if (idLow === 'set-gravity-scale') return { actionId: 'set_gravity_scale', params: { scale: normalizeC3Expr(getParam(params, 'gravity-scale', 'scale'), '1') } };
    if (idLow === 'set-immovable') {
      return {
        actionId: 'set_immovable',
        params: { immovable: normalizeBoolSelect(getParam(params, 'immovable'), ['immovable', 'true']) },
      };
    }
    if (idLow === 'create-distance-joint') {
      return {
        actionId: 'create_distance_joint',
        params: {
          other: resolveObjectRef(getParam(params, 'object', 'other'), ctx),
          distance: normalizeC3Expr(getParam(params, 'distance'), '0'),
          stiffness: normalizeC3Expr(getParam(params, 'stiffness', 'damping-ratio'), '0.8'),
        },
      };
    }
  }

  return null;
}

function parseC3VarType(raw: unknown): VarValueType {
  const s = String(raw || 'number').toLowerCase();
  if (s === 'string' || s === 'text') return 'string';
  if (s === 'boolean' || s === 'bool') return 'boolean';
  return 'number';
}

function coerceVarValue(val: unknown, type: VarValueType): VarValue {
  if (type === 'boolean') return Boolean(val === true || String(val).toLowerCase() === 'true');
  if (type === 'string') return String(val ?? '');
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

function parseC3InstVars(rawList: unknown): InstVarDef[] {
  if (!Array.isArray(rawList)) return [];
  return rawList
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => {
      const type = parseC3VarType(item.type);
      return {
        id: makeId('iv'),
        name: String(item.name || 'Var'),
        type,
        initialValue: coerceVarValue(item.initialValue, type),
      };
    });
}

function parseC3Behaviors(rawList: unknown, warnings: Set<string>, ownerName: string): BehaviorDef[] {
  if (!Array.isArray(rawList)) return [];
  const defs: BehaviorDef[] = [];
  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const rawId = String(obj.behaviorId || obj.type || '');
    const mapped = mapC3BehaviorId(rawId);
    if (!mapped) {
      warnings.add(`Unsupported Construct 3 behavior "${rawId}" on "${ownerName}" was skipped`);
      continue;
    }
    defs.push({
      id: makeId('beh'),
      type: mapped,
      name: String(obj.name || mapped),
      properties: createDefaultBehaviorProperties(mapped),
    });
  }
  return defs;
}

function collectC3Animations(rawAnims: unknown): Array<Record<string, unknown>> {
  if (!rawAnims || typeof rawAnims !== 'object') return [];
  if (Array.isArray(rawAnims)) return rawAnims as Array<Record<string, unknown>>;
  const container = rawAnims as {
    items?: Array<Record<string, unknown>>;
    subfolders?: Array<Record<string, unknown>>;
  };
  const out: Array<Record<string, unknown>> = [];
  if (Array.isArray(container.items)) {
    out.push(...container.items);
  }
  if (Array.isArray(container.subfolders)) {
    for (const sf of container.subfolders) {
      out.push(...collectC3Animations(sf));
    }
  }
  return out;
}

async function importFromVfs(
  vfs: Vfs,
  sourceFormat: 'c3p' | 'c3proj' | 'folder'
): Promise<C3ImportResult> {
  // Locate .c3proj root
  const c3projPath =
    vfs.allPaths.find((p) => p === 'project.c3proj') ||
    vfs.allPaths.find((p) => p.endsWith('.c3proj'));

  if (!c3projPath) {
    throw new Error('Could not find a valid .c3proj file inside the selected Construct 3 package.');
  }

  const c3projEntry = vfs.entries.get(c3projPath)!;
  const basePrefix = c3projPath.includes('/')
    ? c3projPath.slice(0, c3projPath.lastIndexOf('/') + 1)
    : '';

  const c3proj = JSON.parse(await c3projEntry.readText()) as Record<string, unknown>;
  if (!isConstruct3Json(c3proj)) {
    throw new Error('The selected .c3proj file does not match the Construct 3 project format.');
  }

  const warnings = new Set<string>();
  const projProps = (c3proj.properties || {}) as Record<string, unknown>;

  const viewportSize = Array.isArray(projProps.viewportSize)
    ? projProps.viewportSize
    : Array.isArray(c3proj.viewportSize)
    ? c3proj.viewportSize
    : null;

  const viewportWidth = Number(
    projProps.viewportWidth ?? c3proj.viewportWidth ?? viewportSize?.[0] ?? 854
  ) || 854;
  const viewportHeight = Number(
    projProps.viewportHeight ?? c3proj.viewportHeight ?? viewportSize?.[1] ?? 480
  ) || 480;

  const pixelRounding = Boolean(projProps.pixelRounding ?? c3proj.pixelRounding ?? false);
  const rawFullscreen = String(
    projProps.fullscreenMode ?? c3proj.fullscreenMode ?? 'letterbox-scale'
  ).toLowerCase();
  const fullscreenScaling: ProjectData['fullscreenScaling'] =
    rawFullscreen.includes('integer')
      ? 'letterbox-integer'
      : rawFullscreen.includes('outer')
      ? 'scale-outer'
      : rawFullscreen.includes('inner')
      ? 'scale-inner'
      : rawFullscreen === 'off'
      ? 'off'
      : 'letterbox-scale';

  const projectName = String(c3proj.name || 'Imported Construct 3 Game');

  // Seed default global plugins (System, Keyboard, Mouse, Touch, Audio, LocalStorage, Dictionary, Gamepad, VirtualJoystick)
  const globalPlugins = createGlobalPluginObjects();
  const objectTypes: ObjectType[] = [...globalPlugins];
  const objectIdByName = new Map<string, string>();
  const objectById = new Map<string, ObjectType>();

  for (const gp of globalPlugins) {
    objectIdByName.set(gp.name.toLowerCase(), gp.id);
    objectById.set(gp.id, gp);
  }

  let loadedImagesCount = 0;

  // Helper to read image DataURL with cache
  const imageCache = new Map<string, string>();
  const readImageAsDataUrl = async (entry: VfsEntry): Promise<string> => {
    const cached = imageCache.get(entry.path);
    if (cached) return cached;
    const base64 = await entry.readBase64();
    const mime = inferImageMime(entry.path);
    const dataUrl = `data:${mime};base64,${base64}`;
    imageCache.set(entry.path, dataUrl);
    loadedImagesCount++;
    return dataUrl;
  };

  // 1. Load Object Types
  const otFolderEntries = collectC3FolderItems(c3proj.objectTypes as C3FolderNode | undefined);

  for (const itemRef of otFolderEntries) {
    const entry = findJsonItemEntry(vfs, basePrefix, 'objectTypes', itemRef.name, itemRef.subPathParts);
    let rawObj: Record<string, unknown> = { name: itemRef.name, 'plugin-id': 'Sprite' };
    if (entry) {
      try {
        rawObj = JSON.parse(await entry.readText()) as Record<string, unknown>;
      } catch {
        warnings.add(`Failed to parse objectType "${itemRef.name}" JSON; created fallback object`);
      }
    }

    const name = String(rawObj.name || itemRef.name);
    const pluginInfo = mapC3PluginId(rawObj['plugin-id'] as string | undefined);
    if (!pluginInfo.exact && pluginInfo.note) {
      warnings.add(`${name}: ${pluginInfo.note}`);
    }

    const plugin = pluginInfo.plugin;

    // Map C3 singleton global plugins onto Destruct's built-in global plugins
    if (
      plugin === 'Keyboard' ||
      plugin === 'Mouse' ||
      plugin === 'Touch' ||
      plugin === 'Audio' ||
      plugin === 'LocalStorage' ||
      plugin === 'Dictionary' ||
      plugin === 'Gamepad' ||
      plugin === 'System'
    ) {
      const existingGlobal = objectTypes.find((o) => o.plugin === plugin);
      if (existingGlobal) {
        objectIdByName.set(name.toLowerCase(), existingGlobal.id);
        continue;
      }
    }

    const instVarDefs = parseC3InstVars(rawObj.instanceVariables);
    const behaviorDefs = parseC3Behaviors(rawObj.behaviorTypes, warnings, name);

    let defaultWidth = 32;
    let defaultHeight = 32;

    const ot: ObjectType = {
      id: makeId('obj'),
      name,
      plugin,
      defaultWidth,
      defaultHeight,
      instVarDefs,
      behaviorDefs,
    };

    if (plugin === 'Sprite') {
      const rawAnims = collectC3Animations(rawObj.animations);
      const animations: SpriteAnimation[] = [];

      for (const animRaw of rawAnims) {
        const animName = String(animRaw.name || 'Default');
        const framesRaw = Array.isArray(animRaw.frames)
          ? (animRaw.frames as Array<Record<string, unknown>>)
          : [];
        const frames: SpriteFrame[] = [];

        for (let fi = 0; fi < framesRaw.length; fi++) {
          const fRaw = framesRaw[fi];
          const fw = Number(fRaw.width) || 32;
          const fh = Number(fRaw.height) || 32;
          if (animations.length === 0 && fi === 0) {
            defaultWidth = fw;
            defaultHeight = fh;
          }

          let dataUrl = '';
          const imgEntry = findImageEntry(
            vfs,
            basePrefix,
            name,
            animName,
            fi,
            fRaw.imageSpriteId as number | string | undefined
          );
          if (imgEntry) {
            dataUrl = await readImageAsDataUrl(imgEntry);
          } else {
            dataUrl = makePlaceholderSvgDataUrl(name, fw, fh);
          }

          let collisionPoly: Point2D[] | undefined;
          const rawPoly = (fRaw.collisionPoly as { points?: number[] } | undefined)?.points;
          if (fRaw.useCollisionPoly && Array.isArray(rawPoly) && rawPoly.length >= 6) {
            collisionPoly = [];
            for (let pi = 0; pi + 1 < rawPoly.length; pi += 2) {
              collisionPoly.push({ x: Number(rawPoly[pi]), y: Number(rawPoly[pi + 1]) });
            }
          }

          frames.push({
            id: makeId('frm'),
            dataUrl,
            width: fw,
            height: fh,
            originX: fRaw.originX !== undefined ? Number(fRaw.originX) : 0.5,
            originY: fRaw.originY !== undefined ? Number(fRaw.originY) : 0.5,
            duration: fRaw.duration !== undefined ? Number(fRaw.duration) : 1,
            collisionPoly,
          });
        }

        if (frames.length === 0) {
          frames.push({
            id: makeId('frm'),
            dataUrl: makePlaceholderSvgDataUrl(name, 32, 32),
            width: 32,
            height: 32,
            originX: 0.5,
            originY: 0.5,
          });
        }

        animations.push({
          name: animName,
          speed: Number(animRaw.speed ?? 5),
          loop: Boolean(animRaw.isLooping ?? true),
          repeatCount: Number(animRaw.repeatCount ?? 1),
          pingPong: Boolean(animRaw.isPingPong ?? false),
          frames,
        });
      }

      if (animations.length === 0) {
        const imgEntry = findImageEntry(vfs, basePrefix, name);
        const dataUrl = imgEntry
          ? await readImageAsDataUrl(imgEntry)
          : makePlaceholderSvgDataUrl(name, 32, 32);
        animations.push({
          name: 'Default',
          speed: 5,
          loop: true,
          repeatCount: 1,
          pingPong: false,
          frames: [
            {
              id: makeId('frm'),
              dataUrl,
              width: 32,
              height: 32,
              originX: 0.5,
              originY: 0.5,
            },
          ],
        });
      }

      ot.defaultWidth = defaultWidth;
      ot.defaultHeight = defaultHeight;
      ot.spriteConfig = {
        defaultAnimation: animations[0].name,
        animations,
      };
    } else if (plugin === 'TiledBackground') {
      const rawImg = (rawObj.image || {}) as Record<string, unknown>;
      const iw = Number(rawImg.width) || 32;
      const ih = Number(rawImg.height) || 32;
      const imgEntry = findImageEntry(vfs, basePrefix, name);
      const imageDataUrl = imgEntry
        ? await readImageAsDataUrl(imgEntry)
        : makePlaceholderSvgDataUrl(name, iw, ih, '#818cf8');
      ot.defaultWidth = 128;
      ot.defaultHeight = 128;
      ot.tiledBgConfig = { imageDataUrl, imageWidth: iw, imageHeight: ih };
    } else if (plugin === 'Tilemap') {
      const props = (rawObj.properties || {}) as Record<string, unknown>;
      const tw = Number(props['tile-width'] ?? rawObj['tile-width'] ?? 32) || 32;
      const th = Number(props['tile-height'] ?? rawObj['tile-height'] ?? 32) || 32;
      const imgEntry = findImageEntry(vfs, basePrefix, name);
      const tilesetDataUrl = imgEntry
        ? await readImageAsDataUrl(imgEntry)
        : generateDefaultTilesetDataUrl();
      const hasSolid = behaviorDefs.some((b) => b.type === 'Solid');
      ot.defaultWidth = tw * 16;
      ot.defaultHeight = th * 12;
      ot.tilemapConfig = {
        tilesetDataUrl,
        tileWidth: tw,
        tileHeight: th,
        sourceTileWidth: tw,
        sourceTileHeight: th,
        allowZeroTile: Boolean(imgEntry),
        columns: 16,
        rows: 12,
        solidTiles: hasSolid
          ? Array.from({ length: 256 }, (_, i) => i)
          : [],
      };
    } else if (plugin === 'Text') {
      ot.defaultWidth = 220;
      ot.defaultHeight = 40;
      ot.textConfig = {
        initialText: name,
        fontFamily: 'sans-serif',
        fontSize: 18,
        color: '#f8fafc',
        bold: false,
        italic: false,
        align: 'left',
        verticalAlign: 'top',
        lineHeight: 1.25,
      };
    } else if (plugin === 'Particles') {
      ot.defaultWidth = 32;
      ot.defaultHeight = 32;
      ot.particlesConfig = {
        rate: 30,
        sprayCone: 60,
        type: 'continuous',
        speed: 140,
        size: 6,
        opacity: 100,
        lifetime: 0.8,
        acceleration: 0,
        gravity: 120,
        angleRandomiser: 15,
        speedRandomiser: 30,
        sizeRandomiser: 2,
        growRate: -2,
        color: '#38bdf8',
        endColor: '#818cf8',
      };
    } else if (plugin === 'Button') {
      ot.defaultWidth = 110;
      ot.defaultHeight = 34;
      ot.buttonConfig = {
        text: name,
        fontFamily: 'sans-serif',
        fontSize: 13,
        textColor: '#ffffff',
        bgColor: '#0369a1',
        hoverBgColor: '#0ea5e9',
        activeBgColor: '#0284c7',
        borderRadius: 6,
      };
    } else if (plugin === 'Slider') {
      ot.defaultWidth = 140;
      ot.defaultHeight = 24;
      ot.sliderConfig = {
        min: 0,
        max: 100,
        step: 1,
        initialValue: 50,
        trackColor: '#1e293b',
        fillColor: '#06b6d4',
        thumbColor: '#f8fafc',
      };
    } else if (plugin === 'ProgressBar') {
      ot.defaultWidth = 160;
      ot.defaultHeight = 22;
      ot.progressBarConfig = {
        initialProgress: 100,
        bgColor: '#1e293b',
        fillColor: '#10b981',
        borderRadius: 4,
        showText: true,
      };
    }

    objectTypes.push(ot);
    objectIdByName.set(name.toLowerCase(), ot.id);
    objectById.set(ot.id, ot);
  }

  // 2. Load Families and merge family variables & behaviors onto member objectTypes
  const familyByName = new Map<string, C3FamilyInfo>();
  const familyRefs = collectC3FolderItems(c3proj.families as C3FolderNode | undefined);
  for (const famRef of familyRefs) {
    const entry = findJsonItemEntry(vfs, basePrefix, 'families', famRef.name, famRef.subPathParts);
    if (!entry) continue;
    try {
      const famRaw = JSON.parse(await entry.readText()) as Record<string, unknown>;
      const famName = String(famRaw.name || famRef.name);
      const members = Array.isArray(famRaw.members)
        ? famRaw.members.map((m) => String(m))
        : [];
      const famVars = parseC3InstVars(famRaw.instanceVariables);
      const famBehs = parseC3Behaviors(famRaw.behaviorTypes, warnings, famName);

      familyByName.set(famName.toLowerCase(), {
        name: famName,
        members,
        instVarDefs: famVars,
        behaviorDefs: famBehs,
      });

      for (const mName of members) {
        const mOtId = objectIdByName.get(mName.toLowerCase());
        const mOt = mOtId ? objectById.get(mOtId) : undefined;
        if (!mOt) continue;

        for (const fv of famVars) {
          if (!mOt.instVarDefs.some((v) => v.name.toLowerCase() === fv.name.toLowerCase())) {
            mOt.instVarDefs.push({ ...fv, id: makeId('iv') });
          }
        }
        for (const fb of famBehs) {
          if (!mOt.behaviorDefs.some((b) => b.type === fb.type && b.name === fb.name)) {
            mOt.behaviorDefs.push({ ...fb, id: makeId('beh'), properties: { ...fb.properties } });
          }
        }
      }
    } catch {
      warnings.add(`Could not parse family "${famRef.name}"`);
    }
  }

  // 3. Load Layouts + Layers + Instances
  const layoutRefs = collectC3FolderItems(c3proj.layouts as C3FolderNode | undefined);
  const layouts: LayoutData[] = [];
  const layoutIdByName = new Map<string, string>();
  const layoutSheetNames = new Map<string, string>(); // layoutId -> c3 eventSheet name

  let maxUid = 100;

  for (const layRef of layoutRefs) {
    const entry = findJsonItemEntry(vfs, basePrefix, 'layouts', layRef.name, layRef.subPathParts);
    if (!entry) {
      warnings.add(`Layout file for "${layRef.name}" was not found`);
      continue;
    }

    let rawLay: Record<string, unknown>;
    try {
      rawLay = JSON.parse(await entry.readText()) as Record<string, unknown>;
    } catch {
      warnings.add(`Could not parse layout "${layRef.name}"`);
      continue;
    }

    const layName = String(rawLay.name || layRef.name);
    const sizeArr = Array.isArray(rawLay.size) ? rawLay.size : null;
    const width = Number(rawLay.width ?? sizeArr?.[0] ?? viewportWidth) || viewportWidth;
    const height = Number(rawLay.height ?? sizeArr?.[1] ?? viewportHeight) || viewportHeight;

    const layersRaw = Array.isArray(rawLay.layers)
      ? (rawLay.layers as Array<Record<string, unknown>>)
      : [];

    const layers: LayerData[] = [];
    let layoutBgColor = '#111622';

    for (let li = 0; li < layersRaw.length; li++) {
      const lRaw = layersRaw[li];
      const parallaxArr = Array.isArray(lRaw.parallax) ? lRaw.parallax : null;
      const rawOpacity = lRaw.opacity !== undefined ? Number(lRaw.opacity) : 1;
      const opacity = rawOpacity <= 1 ? Math.round(rawOpacity * 100) : Math.round(rawOpacity);
      const isTransparent = Boolean(lRaw.isTransparent ?? lRaw.transparent ?? (li > 0));
      const bgColor = c3ColorToHex(lRaw.backgroundColor, '#111622');
      if (li === 0 && !isTransparent && lRaw.backgroundColor) {
        layoutBgColor = bgColor;
      }

      const instsRaw = Array.isArray(lRaw.instances)
        ? (lRaw.instances as Array<Record<string, unknown>>)
        : [];
      const instances: InstanceData[] = [];

      for (const iRaw of instsRaw) {
        const typeName = String(iRaw.type || '');
        const otId = objectIdByName.get(typeName.toLowerCase());
        const ot = otId ? objectById.get(otId) : undefined;
        if (!ot) continue;

        const world = (iRaw.world || {}) as Record<string, unknown>;
        const instUid = Number(iRaw.uid) || ++maxUid;
        if (instUid > maxUid) maxUid = instUid;

        const x = Number(world.x ?? 0);
        const y = Number(world.y ?? 0);
        const iw = Number(world.width ?? ot.defaultWidth) || ot.defaultWidth;
        const ih = Number(world.height ?? ot.defaultHeight) || ot.defaultHeight;

        // C3 stores world.angle in radians inside .layout.json
        const rawAngle = Number(world.angle ?? 0);
        const angleDeg = Number.isFinite(rawAngle) ? Math.round(((rawAngle * 180) / Math.PI) * 100) / 100 : 0;

        // C3 world.color = [r, g, b, a] where a is 0..1
        const worldColor = Array.isArray(world.color) ? world.color : null;
        const instOpacity =
          worldColor && worldColor.length >= 4
            ? Math.round(Math.max(0, Math.min(1, Number(worldColor[3]))) * 100)
            : 100;

        const iProps = (iRaw.properties || {}) as Record<string, unknown>;
        const visibleVal = iProps['initially-visible'] ?? iProps['initial-visibility'];
        const visible = visibleVal === undefined ? true : String(visibleVal).toLowerCase() !== 'false' && visibleVal !== false;

        // Instance variables
        const instVars: Record<string, VarValue> = {};
        for (const vd of ot.instVarDefs) {
          instVars[vd.name] = vd.initialValue;
        }
        const rawInstVars = (iRaw.instanceVariables || {}) as Record<string, unknown>;
        for (const [vk, vv] of Object.entries(rawInstVars)) {
          const def = ot.instVarDefs.find((d) => d.name.toLowerCase() === vk.toLowerCase());
          if (def) {
            instVars[def.name] = coerceVarValue(vv, def.type);
          } else {
            instVars[vk] = typeof vv === 'boolean' || typeof vv === 'number' ? vv : String(vv ?? '');
          }
        }

        // Behavior property overrides
        const behaviorProps: Record<string, Record<string, VarValue>> = {};
        const rawBehMap = (iRaw.behaviors || {}) as Record<string, { properties?: Record<string, unknown> }>;
        for (const bDef of ot.behaviorDefs) {
          const matchedEntry = Object.entries(rawBehMap).find(
            ([bKey]) =>
              bKey.toLowerCase() === bDef.name.toLowerCase() ||
              mapC3BehaviorId(bKey) === bDef.type
          );
          if (matchedEntry?.[1]?.properties) {
            behaviorProps[bDef.id] = normalizeC3BehaviorProps(bDef.type, matchedEntry[1].properties);
            // Also propagate first instance's behavior config back to objectType defaults
            bDef.properties = { ...behaviorProps[bDef.id] };
          } else {
            behaviorProps[bDef.id] = { ...bDef.properties };
          }
        }

        // Plugin-specific instance overrides
        let textOverride: string | undefined;
        if (ot.plugin === 'Text' && ot.textConfig) {
          if (iProps.text !== undefined) {
            textOverride = String(iProps.text);
            if (ot.textConfig.initialText === ot.name) {
              ot.textConfig.initialText = textOverride;
            }
          }
          if (iProps.size !== undefined) ot.textConfig.fontSize = Number(iProps.size) || ot.textConfig.fontSize;
          if (iProps.font !== undefined) ot.textConfig.fontFamily = String(iProps.font || 'sans-serif');
          if (iProps.color !== undefined) ot.textConfig.color = c3ColorToHex(iProps.color, ot.textConfig.color);
          if (iProps['horizontal-alignment'] !== undefined) {
            const ha = String(iProps['horizontal-alignment']).toLowerCase();
            ot.textConfig.align = ha === 'center' ? 'center' : ha === 'right' ? 'right' : 'left';
          }
        } else if (ot.plugin === 'Button' && ot.buttonConfig && iProps.text !== undefined) {
          ot.buttonConfig.text = String(iProps.text);
          textOverride = String(iProps.text);
        } else if (ot.plugin === 'Slider' && ot.sliderConfig) {
          if (iProps.value !== undefined) ot.sliderConfig.initialValue = Number(iProps.value) || 0;
          if (iProps.minimum !== undefined) ot.sliderConfig.min = Number(iProps.minimum) || 0;
          if (iProps.maximum !== undefined) ot.sliderConfig.max = Number(iProps.maximum) || 100;
          if (iProps.step !== undefined) ot.sliderConfig.step = Number(iProps.step) || 1;
        } else if (ot.plugin === 'ProgressBar' && ot.progressBarConfig) {
          if (iProps.value !== undefined) ot.progressBarConfig.initialProgress = Number(iProps.value) || 0;
        } else if (ot.plugin === 'Particles' && ot.particlesConfig) {
          if (iProps.rate !== undefined) ot.particlesConfig.rate = Number(iProps.rate) || 30;
          if (iProps['spray-cone'] !== undefined) ot.particlesConfig.sprayCone = Number(iProps['spray-cone']) || 60;
          if (iProps.speed !== undefined) ot.particlesConfig.speed = Number(iProps.speed) || 140;
          if (iProps.size !== undefined) ot.particlesConfig.size = Number(iProps.size) || 6;
          if (iProps.timeout !== undefined) ot.particlesConfig.lifetime = Number(iProps.timeout) || 0.8;
          if (iProps.gravity !== undefined) ot.particlesConfig.gravity = Number(iProps.gravity) || 0;
          if (iProps.type !== undefined) {
            ot.particlesConfig.type = String(iProps.type).toLowerCase().includes('one') ? 'one-shot' : 'continuous';
          }
        }

        const inst: InstanceData = {
          uid: instUid,
          objectTypeId: ot.id,
          x: ot.plugin === 'Sprite' ? x : x - (Number(world.originX ?? 0) * iw),
          y: ot.plugin === 'Sprite' ? y : y - (Number(world.originY ?? 0) * ih),
          width: iw,
          height: ih,
          angle: angleDeg,
          opacity: instOpacity,
          visible,
          instVars,
          behaviorProps,
          ...(textOverride !== undefined ? { textOverride } : {}),
        };

        // Handle Tilemap grid data
        const tmDataRaw = iRaw['tilemap-data'] as Record<string, unknown> | undefined;
        if (ot.plugin === 'Tilemap' && tmDataRaw && ot.tilemapConfig) {
          const tmWidth = Number(tmDataRaw.width ?? Math.max(1, Math.round(iw / ot.tilemapConfig.tileWidth))) || 16;
          const tmHeight = Number(tmDataRaw.height ?? Math.max(1, Math.round(ih / ot.tilemapConfig.tileHeight))) || 12;
          const tw = Number(iProps['tile-width'] ?? tmDataRaw['tile-width'] ?? ot.tilemapConfig.tileWidth) || 32;
          const th = Number(iProps['tile-height'] ?? tmDataRaw['tile-height'] ?? ot.tilemapConfig.tileHeight) || 32;
          ot.tilemapConfig.tileWidth = tw;
          ot.tilemapConfig.tileHeight = th;
          ot.tilemapConfig.sourceTileWidth = tw;
          ot.tilemapConfig.sourceTileHeight = th;
          ot.tilemapConfig.columns = tmWidth;
          ot.tilemapConfig.rows = tmHeight;

          inst.mapWidth = tmWidth;
          inst.mapHeight = tmHeight;
          inst.tileData = decodeC3TilemapData(tmDataRaw.data, tmWidth, tmHeight);
        }

        instances.push(inst);
      }

      layers.push({
        id: makeId('lay'),
        name: String(lRaw.name || `Layer ${li}`),
        visible: Boolean(lRaw.isVisible ?? true),
        locked: Boolean(lRaw.isLocked ?? false),
        opacity: Number.isFinite(opacity) ? opacity : 100,
        parallaxX: Number(parallaxArr?.[0] ?? lRaw.parallaxX ?? 100),
        parallaxY: Number(parallaxArr?.[1] ?? lRaw.parallaxY ?? 100),
        transparent: isTransparent,
        backgroundColor: bgColor,
        instances,
      });
    }

    if (layers.length === 0) {
      layers.push({
        id: makeId('lay'),
        name: 'Layer 0',
        visible: true,
        locked: false,
        opacity: 100,
        parallaxX: 100,
        parallaxY: 100,
        transparent: true,
        instances: [],
      });
    }

    const layId = makeId('layout');
    layouts.push({
      id: layId,
      name: layName,
      width,
      height,
      backgroundColor: layoutBgColor,
      eventSheetId: '',
      layers,
    });
    layoutIdByName.set(layName.toLowerCase(), layId);
    if (typeof rawLay.eventSheet === 'string') {
      layoutSheetNames.set(layId, rawLay.eventSheet);
    }
  }

  // 4. First pass over Event Sheets to register IDs and extract top-level Global Variables
  const sheetRefs = collectC3FolderItems(c3proj.eventSheets as C3FolderNode | undefined);
  const rawSheets: Array<{ id: string; name: string; events: Array<Record<string, unknown>> }> = [];
  const sheetIdByName = new Map<string, string>();
  const globalVariables: GlobalVariable[] = [];

  for (const sheetRef of sheetRefs) {
    const entry = findJsonItemEntry(vfs, basePrefix, 'eventSheets', sheetRef.name, sheetRef.subPathParts);
    let parsedSheet: Record<string, unknown> = { name: sheetRef.name, events: [] };
    if (entry) {
      try {
        parsedSheet = JSON.parse(await entry.readText()) as Record<string, unknown>;
      } catch {
        warnings.add(`Could not parse event sheet "${sheetRef.name}"`);
      }
    }
    const sName = String(parsedSheet.name || sheetRef.name);
    const sId = makeId('es');
    const events = Array.isArray(parsedSheet.events)
      ? (parsedSheet.events as Array<Record<string, unknown>>)
      : [];

    sheetIdByName.set(sName.toLowerCase(), sId);
    rawSheets.push({ id: sId, name: sName, events });

    for (const ev of events) {
      if (ev.eventType === 'variable') {
        const vType = parseC3VarType(ev.type);
        const vName = String(ev.name || `Var_${globalVariables.length + 1}`);
        if (!globalVariables.some((g) => g.name.toLowerCase() === vName.toLowerCase())) {
          globalVariables.push({
            id: makeId('gv'),
            name: vName,
            type: vType,
            initialValue: coerceVarValue(ev.initialValue, vType),
            description: typeof ev.comment === 'string' ? ev.comment : undefined,
          });
        }
      }
    }
  }

  // Link layouts to eventSheets
  for (const lay of layouts) {
    const targetEsName = layoutSheetNames.get(lay.id);
    if (targetEsName) {
      lay.eventSheetId = sheetIdByName.get(targetEsName.toLowerCase()) || '';
    }
    if (!lay.eventSheetId && rawSheets.length > 0) {
      lay.eventSheetId = rawSheets[0].id;
    }
  }

  // 5. Convert Event Sheets (blocks, groups, includes, sub-events)
  const convCtx: ConversionContext = {
    objectIdByName,
    objectById,
    layoutIdByName,
    sheetIdByName,
    familyByName,
    warnings,
  };

  const convertEventList = (
    rawList: Array<Record<string, unknown>>,
    sheetName: string
  ): EventItem[] => {
    const items: EventItem[] = [];
    for (const ev of rawList) {
      const evType = String(ev.eventType || 'block');
      if (evType === 'variable' || evType === 'comment') {
        continue;
      }
      if (evType === 'include') {
        const incName = String(ev.includeSheet || '');
        const incId = sheetIdByName.get(incName.toLowerCase());
        if (incId) {
          const inc: EventInclude = {
            id: makeId('inc'),
            kind: 'include',
            eventSheetId: incId,
            disabled: Boolean(ev.disabled),
          };
          items.push(inc);
        } else if (incName) {
          warnings.add(`Included event sheet "${incName}" was not found`);
        }
        continue;
      }
      if (evType === 'group') {
        const children = Array.isArray(ev.children)
          ? (ev.children as Array<Record<string, unknown>>)
          : [];
        const grp: EventGroup = {
          id: makeId('grp'),
          kind: 'group',
          title: String(ev.title || 'Group'),
          description: typeof ev.description === 'string' ? ev.description : undefined,
          activeAtStart: Boolean(ev.isActiveOnStart ?? true),
          disabled: Boolean(ev.disabled),
          items: convertEventList(children, sheetName),
        };
        items.push(grp);
        continue;
      }
      if (evType === 'function-block') {
        warnings.add(`Construct 3 built-in function "${String(ev.functionName || 'Function')}" in "${sheetName}" is not directly supported and was skipped`);
        continue;
      }
      // Event block
      const rawConds = Array.isArray(ev.conditions)
        ? (ev.conditions as Array<Record<string, unknown>>)
        : [];
      const rawActs = Array.isArray(ev.actions)
        ? (ev.actions as Array<Record<string, unknown>>)
        : [];
      const rawChildren = Array.isArray(ev.children)
        ? (ev.children as Array<Record<string, unknown>>)
        : [];

      const mappedConds: ConditionItem[] = [];
      for (const c of rawConds) {
        const mc = mapC3Condition(c, convCtx, sheetName);
        if (mc) mappedConds.push(mc);
      }

      const mappedActs: ActionItem[] = [];
      for (const a of rawActs) {
        const ma = mapC3Action(a, convCtx, sheetName);
        if (ma) mappedActs.push(ma);
      }

      // Safety: if a C3 event originally had conditions and NONE could be mapped, disable it so it doesn't run unconditionally every tick
      const lostAllConditions = rawConds.length > 0 && mappedConds.length === 0;

      const block: EventBlock = {
        id: makeId('ev'),
        kind: 'event',
        isOrBlock: Boolean(ev.isOr),
        isElse: Boolean(ev.isElse),
        disabled: Boolean(ev.disabled) || lostAllConditions,
        conditions: mappedConds,
        actions: mappedActs,
        subEvents: convertEventList(rawChildren, sheetName),
      };
      items.push(block);
    }
    return items;
  };

  const eventSheets: EventSheetData[] = rawSheets.map((s) => ({
    id: s.id,
    name: s.name,
    items: convertEventList(s.events, s.name),
  }));

  if (layouts.length === 0) {
    const fallbackSheetId = eventSheets[0]?.id || makeId('es');
    if (eventSheets.length === 0) {
      eventSheets.push({ id: fallbackSheetId, name: 'Event sheet 1', items: [] });
    }
    layouts.push({
      id: makeId('layout'),
      name: 'Layout 1',
      width: viewportWidth,
      height: viewportHeight,
      backgroundColor: '#111622',
      eventSheetId: fallbackSheetId,
      layers: [
        {
          id: makeId('lay'),
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
    });
  } else if (eventSheets.length === 0) {
    const fallbackId = makeId('es');
    eventSheets.push({ id: fallbackId, name: 'Event sheet 1', items: [] });
    layouts[0].eventSheetId = fallbackId;
  }

  // 6. Import Audio assets (sounds/* and music/*)
  const audioAssets: AudioAsset[] = [];
  const audioSeenPaths = new Set<string>();
  const rootFiles = (c3proj.rootFileFolders || {}) as {
    sound?: C3FolderNode;
    music?: C3FolderNode;
  };
  const declaredAudio = [
    ...collectC3FolderItems(rootFiles.sound).map((item) => ({ folder: 'sounds', ...item })),
    ...collectC3FolderItems(rootFiles.music).map((item) => ({ folder: 'music', ...item })),
  ];

  for (const aRef of declaredAudio) {
    const sub = aRef.subPathParts.length ? `${aRef.subPathParts.join('/')}/` : '';
    const entry = findEntryInVfs(vfs, basePrefix, [
      `${aRef.folder}/${sub}${aRef.name}`,
      `${aRef.folder}/${aRef.name}`,
    ]);
    if (entry && !audioSeenPaths.has(entry.path)) {
      audioSeenPaths.add(entry.path);
      const b64 = await entry.readBase64();
      audioAssets.push({
        id: makeId('aud'),
        name: stripExt(aRef.name),
        dataUrl: `data:${inferAudioMime(entry.path)};base64,${b64}`,
      });
    }
  }

  // Also sweep any remaining audio files under sounds/ or music/
  for (const p of vfs.allPaths) {
    if (audioSeenPaths.has(p)) continue;
    if (
      (p.startsWith(normalizePath(`${basePrefix}sounds/`)) ||
        p.startsWith(normalizePath(`${basePrefix}music/`)) ||
        p.startsWith('sounds/') ||
        p.startsWith('music/')) &&
      /\.(webm|ogg|mp3|wav|m4a|aac|flac)$/i.test(p)
    ) {
      const entry = vfs.entries.get(p);
      if (!entry) continue;
      audioSeenPaths.add(p);
      const b64 = await entry.readBase64();
      const fileName = p.split('/').pop() || 'sound';
      audioAssets.push({
        id: makeId('aud'),
        name: stripExt(fileName),
        dataUrl: `data:${inferAudioMime(p)};base64,${b64}`,
      });
    }
  }

  const firstLayoutName = typeof c3proj.firstLayout === 'string' ? c3proj.firstLayout : '';
  const startupLayoutId =
    layoutIdByName.get(firstLayoutName.toLowerCase()) || layouts[0].id;

  const project: ProjectData = {
    version: '1.0.0',
    name: projectName,
    viewportWidth,
    viewportHeight,
    pixelRounding,
    fullscreenScaling,
    startupLayoutId,
    nextUid: maxUid + 1,
    globalVariables,
    objectTypes,
    layouts,
    eventSheets,
    audioAssets,
  };

  const visualObjectCount = objectTypes.filter((o) => !o.isGlobalPlugin).length;

  return {
    project,
    report: {
      projectName,
      sourceFormat,
      objectCount: visualObjectCount,
      layoutCount: layouts.length,
      eventSheetCount: eventSheets.length,
      imageCount: loadedImagesCount,
      audioCount: audioAssets.length,
      globalVarCount: globalVariables.length,
      familyCount: familyByName.size,
      warnings: Array.from(warnings),
    },
  };
}

/**
 * Import a Construct 3 .c3p ZIP archive directly in the browser.
 */
export async function importConstruct3Archive(file: File): Promise<C3ImportResult> {
  const zip = await JSZip.loadAsync(file);
  const vfs = buildZipVfs(zip);
  return importFromVfs(vfs, 'c3p');
}

/**
 * Import a standalone .c3proj JSON string.
 */
export async function importConstruct3Json(
  jsonText: string,
  fileName = 'project.c3proj'
): Promise<C3ImportResult> {
  const norm = normalizePath(fileName.endsWith('.c3proj') ? fileName : 'project.c3proj');
  const entries = new Map<string, VfsEntry>();
  entries.set(norm, {
    path: norm,
    originalPath: fileName,
    readText: async () => jsonText,
    readBase64: async () => arrayBufferToBase64(new TextEncoder().encode(jsonText).buffer),
  });
  return importFromVfs({ entries, allPaths: [norm] }, 'c3proj');
}

/**
 * Import an unpacked Construct 3 project folder or multi-file selection.
 */
export async function importConstruct3FileList(
  fileList: FileList | File[]
): Promise<C3ImportResult> {
  const files = Array.from(fileList);
  if (files.length === 0) {
    throw new Error('No files selected.');
  }
  if (files.length === 1 && files[0].name.toLowerCase().endsWith('.c3p')) {
    return importConstruct3Archive(files[0]);
  }
  const vfs = buildFilesVfs(files);
  const hasOnlyC3Proj =
    files.length === 1 && files[0].name.toLowerCase().endsWith('.c3proj');
  return importFromVfs(vfs, hasOnlyC3Proj ? 'c3proj' : 'folder');
}
