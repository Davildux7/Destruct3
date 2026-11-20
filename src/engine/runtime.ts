import { EngineAudio } from './audio';
import {
  applyPhysicsForce,
  applyPhysicsForceAtAngle,
  applyPhysicsImpulse,
  applyPhysicsImpulseAtAngle,
  computeLineOfSight,
  createBehaviorRuntimeState,
  createPhysicsDistanceJoint,
  findAStarPath,
  setPhysicsAngularVelocity,
  setPhysicsGravityScale,
  setPhysicsImmovable,
  setPhysicsVelocity,
  stepInstanceBehaviors,
} from './behaviors';
import { CollidableRect, pointInInstance, segmentIntersectsRect, testOverlap } from './collision';
import {
  compareValues,
  evaluateExpression,
  ExpressionContext,
  toBool,
  toNumber,
  toStringVal,
} from './expressionParser';
import { PhysicsWorld } from './physics';
import {
  BehaviorRuntimeState,
  InputSnapshot,
  ParticleDot,
  RuntimeHostAPI,
  RuntimeInstance,
} from './runtimeTypes';
import { PostProcessPipeline } from './shaders';
import { generateDefaultTilesetDataUrl, getTilemapSolidAABBs, getTilemapSolidRects } from './tilemap';
import {
  ActionItem,
  BehaviorType,
  ConditionItem,
  EventBlock,
  EventGroup,
  EventItem,
  EventSheetData,
  LayerData,
  LayoutData,
  ObjectType,
  ProjectData,
  SpriteFrame,
  VarValue,
} from './types';

interface QueuedTrigger {
  kind: string;
  inst?: RuntimeInstance;
  extra?: Record<string, string>;
}

interface PendingWait {
  remaining: number;
  actions: ActionItem[];
  sol: Map<string, RuntimeInstance[] | null>;
  loopIndex: number;
}

interface ActiveShake {
  magnitude: number;
  duration: number;
  elapsed: number;
  mode: 'reducing' | 'constant';
}

export interface RuntimeStats {
  fps: number;
  objectCount: number;
  tickCount: number;
  layoutName: string;
  paused: boolean;
  globalVars: Record<string, VarValue>;
}

interface BBSegment {
  text: string;
  bold: boolean;
  italic: boolean;
  color: string;
}

export function parseBBCodeLines(raw: string, baseBold: boolean, baseItalic: boolean, baseColor: string): BBSegment[][] {
  const lines = raw.split('\n');
  return lines.map((line) => {
    const segments: BBSegment[] = [];
    let bold = baseBold;
    let italic = baseItalic;
    const colorStack: string[] = [baseColor];
    const regex = /\[(\/?)(b|i|color)(?:=([^\]]+))?\]/gi;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        segments.push({
          text: line.slice(lastIndex, match.index),
          bold,
          italic,
          color: colorStack[colorStack.length - 1],
        });
      }
      const isClose = match[1] === '/';
      const tag = match[2].toLowerCase();
      const arg = match[3];
      if (tag === 'b') bold = !isClose;
      else if (tag === 'i') italic = !isClose;
      else if (tag === 'color') {
        if (isClose) {
          if (colorStack.length > 1) colorStack.pop();
        } else if (arg) {
          colorStack.push(arg.trim());
        }
      }
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < line.length) {
      segments.push({
        text: line.slice(lastIndex),
        bold,
        italic,
        color: colorStack[colorStack.length - 1],
      });
    }
    if (segments.length === 0) {
      segments.push({ text: '', bold, italic, color: baseColor });
    }
    return segments;
  });
}

export class GameRuntime {
  public project: ProjectData;
  public audio = new EngineAudio();

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private offscreenCanvas: HTMLCanvasElement | null = null;
  private offscreenCtx: CanvasRenderingContext2D | null = null;
  public physicsWorld = new PhysicsWorld();
  public postProcess: PostProcessPipeline | null = null;
  private defaultTilesetUrl: string | null = null;
  private rafId: number | null = null;
  private lastFrameTime = 0;
  private running = false;
  private paused = false;

  // Game clock & stats
  private dt = 0;
  private gameTime = 0;
  private timeScale = 1;
  private tickCount = 0;
  private fps = 60;
  private fpsAccum = 0;
  private fpsFrames = 0;

  // Layout & instances
  private currentLayout!: LayoutData;
  private runtimeLayers: LayerData[] = [];
  private instances: RuntimeInstance[] = [];
  private instancesByType = new Map<string, RuntimeInstance[]>();
  private objectTypesById = new Map<string, ObjectType>();
  private objectTypesByName = new Map<string, ObjectType>();
  private nextUid = 1000;

  // Variables & Plugins state
  private globalVars = new Map<string, VarValue>();
  private dictionary = new Map<string, VarValue>();
  private localStorageLastKey = '';
  private localStorageLastVal: VarValue = '';

  // Camera
  private scrollX = 0;
  private scrollY = 0;
  private shakes: ActiveShake[] = [];
  private shakeOffsetX = 0;
  private shakeOffsetY = 0;

  // Image cache
  private imageCache = new Map<string, HTMLImageElement>();
  private patternCache = new Map<string, CanvasPattern | null>();

  // Input state
  private keysDown = new Set<string>();
  private pendingKeysPressed: string[] = [];
  private pendingKeysReleased: string[] = [];
  private lastKeyCode = '';
  private mouseX = 0;
  private mouseY = 0;
  private mouseAbsX = 0;
  private mouseAbsY = 0;
  private mouseButtonsDown = new Set<number>();
  private mouseJustPressed = new Set<number>();
  private mouseJustReleased = new Set<number>();
  private touchActive = false;
  private touchX = 0;
  private touchY = 0;
  private touchJustStarted = false;

  // Gamepad state
  private gamepadAxes: number[][] = [];
  private gamepadButtons: boolean[][] = [];
  private prevGamepadButtons: boolean[][] = [];

  // Virtual touch controls state
  private virtualJoyActive = false;
  private virtualJoyX = 0;
  private virtualJoyY = 0;
  private virtualJoyAngle = 0;
  private virtualJoyDistance = 0;
  private virtualBtnA = false;
  private virtualBtnB = false;

  // Event engine state
  private triggerQueue: QueuedTrigger[] = [];
  private pendingWaits: PendingWait[] = [];
  private activeOverlapPairs = new Set<string>();
  private prevTriggerOnceState = new Set<string>();
  private triggerOnceTrueThisTick = new Set<string>();
  private everyXTimers = new Map<string, number>();
  private groupActiveState = new Map<string, boolean>();
  private pendingLayoutSwitch: string | null = null;
  private pendingLayoutRestart = false;
  private loopIndexStack: number[] = [0];

  // Bound DOM listeners
  private onKeyDownBound: (e: KeyboardEvent) => void;
  private onKeyUpBound: (e: KeyboardEvent) => void;
  private onMouseMoveBound: (e: MouseEvent) => void;
  private onMouseDownBound: (e: MouseEvent) => void;
  private onMouseUpBound: (e: MouseEvent) => void;
  private onTouchStartBound: (e: TouchEvent) => void;
  private onTouchMoveBound: (e: TouchEvent) => void;
  private onTouchEndBound: (e: TouchEvent) => void;
  private onContextMenuBound: (e: MouseEvent) => void;

  constructor(project: ProjectData, canvas: HTMLCanvasElement) {
    this.project = JSON.parse(JSON.stringify(project)) as ProjectData;
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not initialize 2D canvas context');
    this.ctx = context;

    this.nextUid = Math.max(1000, this.project.nextUid || 1000);
    for (const ot of this.project.objectTypes) {
      this.objectTypesById.set(ot.id, ot);
      this.objectTypesByName.set(ot.name, ot);
    }
    for (const gv of this.project.globalVariables) {
      this.globalVars.set(gv.name, gv.initialValue);
    }

    // Bind listeners
    this.onKeyDownBound = (e) => this.handleKeyDown(e);
    this.onKeyUpBound = (e) => this.handleKeyUp(e);
    this.onMouseMoveBound = (e) => this.handleMouseMove(e);
    this.onMouseDownBound = (e) => this.handleMouseDown(e);
    this.onMouseUpBound = (e) => this.handleMouseUp(e);
    this.onTouchStartBound = (e) => this.handleTouchStart(e);
    this.onTouchMoveBound = (e) => this.handleTouchMove(e);
    this.onTouchEndBound = () => {
      this.touchActive = false;
    };
    this.onContextMenuBound = (e) => e.preventDefault();
  }

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.canvas.width = this.project.viewportWidth;
    this.canvas.height = this.project.viewportHeight;
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = this.project.viewportWidth;
    this.offscreenCanvas.height = this.project.viewportHeight;
    this.offscreenCtx = this.offscreenCanvas.getContext('2d');
    this.postProcess = new PostProcessPipeline(this.offscreenCanvas);
    this.preloadImages();
    this.audio.preloadAssets(this.project.audioAssets || []);
    this.attachEvents();

    const startLayout =
      this.project.layouts.find((l) => l.id === this.project.startupLayoutId) || this.project.layouts[0];
    if (startLayout) {
      this.loadLayout(startLayout.id);
    }

    this.lastFrameTime = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.tick(now);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  public destroy(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.detachEvents();
    this.audio.stopAll();
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
  }

  public pause(): void {
    this.paused = true;
  }

  public resume(): void {
    this.paused = false;
  }

  public isPaused(): boolean {
    return this.paused;
  }

  public stepSingleFrame(): void {
    const was = this.paused;
    this.paused = false;
    this.tick(performance.now());
    this.paused = was;
  }

  public restartLayout(): void {
    this.pendingLayoutRestart = true;
  }

  public setGlobalVar(name: string, val: VarValue): void {
    this.globalVars.set(name, val);
  }

  public setInstanceProp(uid: number, prop: string, value: VarValue): void {
    const inst = this.instances.find((i) => i.uid === uid && !i.destroyed);
    if (!inst) return;
    if (prop === 'x') inst.x = toNumber(value);
    else if (prop === 'y') inst.y = toNumber(value);
    else if (prop === 'angle') inst.angle = toNumber(value);
    else if (prop === 'opacity') inst.opacity = Math.max(0, Math.min(100, toNumber(value)));
    else if (prop === 'visible') inst.visible = toBool(value);
    else if (prop in inst.instVars) inst.instVars[prop] = value;
  }

  public getStats(): RuntimeStats {
    const gvObj: Record<string, VarValue> = {};
    for (const [k, v] of this.globalVars.entries()) {
      gvObj[k] = v;
    }
    return {
      fps: Math.round(this.fps),
      objectCount: this.instances.length,
      tickCount: this.tickCount,
      layoutName: this.currentLayout?.name || '',
      paused: this.paused,
      globalVars: gvObj,
    };
  }

  public getDebuggerState() {
    return {
      fps: Math.round(this.fps),
      objectCount: this.instances.filter((i) => !i.destroyed).length,
      tickCount: this.tickCount,
      gameTime: Math.round(this.gameTime * 100) / 100,
      timeScale: this.timeScale,
      paused: this.paused,
      layoutName: this.currentLayout ? this.currentLayout.name : '',
      scrollX: Math.round(this.scrollX),
      scrollY: Math.round(this.scrollY),
      globalVars: Object.fromEntries(this.globalVars),
      instances: this.instances
        .filter((i) => !i.destroyed)
        .map((i) => ({
          uid: i.uid,
          name: i.objectType.name,
          plugin: i.objectType.plugin,
          x: Math.round(i.x * 10) / 10,
          y: Math.round(i.y * 10) / 10,
          width: Math.round(i.width),
          height: Math.round(i.height),
          angle: Math.round(i.angle),
          opacity: i.opacity,
          visible: i.visible,
          instVars: { ...i.instVars },
          behaviors: i.behaviorDefs.map((b) => b.type),
        })),
    };
  }

  private attachEvents(): void {
    window.addEventListener('keydown', this.onKeyDownBound);
    window.addEventListener('keyup', this.onKeyUpBound);
    this.canvas.addEventListener('mousemove', this.onMouseMoveBound);
    this.canvas.addEventListener('mousedown', this.onMouseDownBound);
    window.addEventListener('mouseup', this.onMouseUpBound);
    this.canvas.addEventListener('touchstart', this.onTouchStartBound, { passive: false });
    this.canvas.addEventListener('touchmove', this.onTouchMoveBound, { passive: false });
    window.addEventListener('touchend', this.onTouchEndBound);
    this.canvas.addEventListener('contextmenu', this.onContextMenuBound);
  }

  private detachEvents(): void {
    window.removeEventListener('keydown', this.onKeyDownBound);
    window.removeEventListener('keyup', this.onKeyUpBound);
    this.canvas.removeEventListener('mousemove', this.onMouseMoveBound);
    this.canvas.removeEventListener('mousedown', this.onMouseDownBound);
    window.removeEventListener('mouseup', this.onMouseUpBound);
    this.canvas.removeEventListener('touchstart', this.onTouchStartBound);
    this.canvas.removeEventListener('touchmove', this.onTouchMoveBound);
    window.removeEventListener('touchend', this.onTouchEndBound);
    this.canvas.removeEventListener('contextmenu', this.onContextMenuBound);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    this.audio.unlock();
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
    if (!this.keysDown.has(e.code)) {
      this.keysDown.add(e.code);
      this.pendingKeysPressed.push(e.code);
      this.lastKeyCode = e.code;
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    if (this.keysDown.has(e.code)) {
      this.keysDown.delete(e.code);
      this.pendingKeysReleased.push(e.code);
    }
  }

  private updatePointerCoords(clientX: number, clientY: number): { absX: number; absY: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? this.project.viewportWidth / rect.width : 1;
    const scaleY = rect.height > 0 ? this.project.viewportHeight / rect.height : 1;
    const absX = (clientX - rect.left) * scaleX;
    const absY = (clientY - rect.top) * scaleY;
    return { absX, absY };
  }

  private handleMouseMove(e: MouseEvent): void {
    const { absX, absY } = this.updatePointerCoords(e.clientX, e.clientY);
    this.mouseAbsX = absX;
    this.mouseAbsY = absY;
    this.mouseX = absX + (this.scrollX - this.project.viewportWidth * 0.5);
    this.mouseY = absY + (this.scrollY - this.project.viewportHeight * 0.5);
  }

  private handleMouseDown(e: MouseEvent): void {
    this.audio.unlock();
    this.handleMouseMove(e);
    this.mouseButtonsDown.add(e.button);
    this.mouseJustPressed.add(e.button);
  }

  private handleMouseUp(e: MouseEvent): void {
    this.mouseButtonsDown.delete(e.button);
    this.mouseJustReleased.add(e.button);
  }

  private handleTouchStart(e: TouchEvent): void {
    e.preventDefault();
    this.audio.unlock();
    if (e.touches.length > 0) {
      const t = e.touches[0];
      const { absX, absY } = this.updatePointerCoords(t.clientX, t.clientY);
      this.touchActive = true;
      this.touchJustStarted = true;
      this.touchX = absX + (this.scrollX - this.project.viewportWidth * 0.5);
      this.touchY = absY + (this.scrollY - this.project.viewportHeight * 0.5);
      this.mouseAbsX = absX;
      this.mouseAbsY = absY;
      this.mouseX = this.touchX;
      this.mouseY = this.touchY;
      this.mouseButtonsDown.add(0);
      this.mouseJustPressed.add(0);
    }
  }

  private handleTouchMove(e: TouchEvent): void {
    e.preventDefault();
    if (e.touches.length > 0) {
      const t = e.touches[0];
      const { absX, absY } = this.updatePointerCoords(t.clientX, t.clientY);
      this.touchX = absX + (this.scrollX - this.project.viewportWidth * 0.5);
      this.touchY = absY + (this.scrollY - this.project.viewportHeight * 0.5);
      this.mouseAbsX = absX;
      this.mouseAbsY = absY;
      this.mouseX = this.touchX;
      this.mouseY = this.touchY;
    }
  }

  private preloadImages(): void {
    for (const ot of this.project.objectTypes) {
      if (ot.spriteConfig) {
        for (const anim of ot.spriteConfig.animations) {
          for (const frame of anim.frames) {
            if (frame.dataUrl && !this.imageCache.has(frame.dataUrl)) {
              const img = new Image();
              img.src = frame.dataUrl;
              this.imageCache.set(frame.dataUrl, img);
            }
          }
        }
      }
      if (ot.tiledBgConfig?.imageDataUrl && !this.imageCache.has(ot.tiledBgConfig.imageDataUrl)) {
        const img = new Image();
        img.src = ot.tiledBgConfig.imageDataUrl;
        this.imageCache.set(ot.tiledBgConfig.imageDataUrl, img);
      }
      if (ot.plugin === 'Tilemap') {
        const url = ot.tilemapConfig?.tilesetDataUrl || this.getDefaultTilesetUrl();
        if (url && !this.imageCache.has(url)) {
          const img = new Image();
          img.src = url;
          this.imageCache.set(url, img);
        }
      }
    }
  }

  private getDefaultTilesetUrl(): string {
    if (!this.defaultTilesetUrl) {
      this.defaultTilesetUrl = generateDefaultTilesetDataUrl();
    }
    return this.defaultTilesetUrl;
  }

  private loadLayout(layoutId: string): void {
    if (this.currentLayout) {
      this.triggerQueue.push({ kind: 'system_on_end_of_layout' });
      this.flushTriggers();
    }

    const layout = this.project.layouts.find((l) => l.id === layoutId);
    if (!layout) return;
    this.currentLayout = layout;
    this.runtimeLayers = layout.layers.map((l) => ({ ...l, instances: [] }));
    this.instances = [];
    this.instancesByType.clear();
    this.physicsWorld.clear();
    this.pendingWaits = [];
    this.activeOverlapPairs.clear();
    this.prevTriggerOnceState.clear();
    this.everyXTimers.clear();
    this.triggerQueue = [];
    this.shakes = [];

    // Initialize group active states from sheet
    this.groupActiveState.clear();
    const sheet = this.project.eventSheets.find((s) => s.id === layout.eventSheetId);
    if (sheet) {
      this.initGroupStates(sheet, new Set());
    }

    // Center camera initially
    this.scrollX = this.project.viewportWidth * 0.5;
    this.scrollY = this.project.viewportHeight * 0.5;

    // Instantiate layout instances (layers are stored top-to-bottom or bottom-to-top;
    // in our model, layer index 0 is bottom-most background, higher index is on top)
    layout.layers.forEach((layer, layerIdx) => {
      for (const instData of layer.instances) {
        const ot = this.objectTypesById.get(instData.objectTypeId);
        if (!ot) continue;
        this.spawnRuntimeInstance(ot, layerIdx, instData.x, instData.y, {
          uid: instData.uid,
          width: instData.width,
          height: instData.height,
          angle: instData.angle,
          opacity: instData.opacity,
          visible: instData.visible,
          mirrored: Boolean(instData.mirrored),
          flipped: Boolean(instData.flipped),
          instVars: { ...instData.instVars },
          behaviorProps: JSON.parse(JSON.stringify(instData.behaviorProps || {})),
          textOverride: instData.textOverride,
          tileData: instData.tileData,
          mapWidth: instData.mapWidth,
          mapHeight: instData.mapHeight,
        });
      }
    });

    this.updateCamera();
    this.triggerQueue.push({ kind: 'system_on_start_of_layout' });
  }

  private initGroupStates(sheet: EventSheetData, visited: Set<string>): void {
    if (visited.has(sheet.id)) return;
    visited.add(sheet.id);
    const walk = (items: EventItem[]) => {
      for (const item of items) {
        if (item.kind === 'group') {
          this.groupActiveState.set(item.title, item.activeAtStart && !item.disabled);
          walk(item.items);
        } else if (item.kind === 'include') {
          const inc = this.project.eventSheets.find((s) => s.id === item.eventSheetId);
          if (inc) this.initGroupStates(inc, visited);
        }
      }
    };
    walk(sheet.items);
  }

  private spawnRuntimeInstance(
    ot: ObjectType,
    layerIndex: number,
    x: number,
    y: number,
    overrides?: {
      uid?: number;
      width?: number;
      height?: number;
      angle?: number;
      opacity?: number;
      visible?: boolean;
      mirrored?: boolean;
      flipped?: boolean;
      instVars?: Record<string, VarValue>;
      behaviorProps?: Record<string, Record<string, VarValue>>;
      textOverride?: string;
      tileData?: number[];
      mapWidth?: number;
      mapHeight?: number;
    }
  ): RuntimeInstance {
    const uid = overrides?.uid ?? this.nextUid++;
    if (uid >= this.nextUid) this.nextUid = uid + 1;

    const typeList = this.instancesByType.get(ot.id) || [];
    const iid = typeList.length;

    const instVars: Record<string, VarValue> = {};
    for (const def of ot.instVarDefs) {
      instVars[def.name] = overrides?.instVars?.[def.name] ?? def.initialValue;
    }

    const behaviorProps: Record<string, Record<string, VarValue>> = {};
    for (const bdef of ot.behaviorDefs) {
      behaviorProps[bdef.id] = {
        ...bdef.properties,
        ...(overrides?.behaviorProps?.[bdef.id] || {}),
      };
    }

    const defaultAnim = ot.spriteConfig?.defaultAnimation || ot.spriteConfig?.animations[0]?.name || 'Default';

    const inst: RuntimeInstance = {
      uid,
      iid,
      objectType: ot,
      layerIndex: Math.max(0, Math.min(this.runtimeLayers.length - 1, layerIndex)),
      x,
      y,
      width: overrides?.width ?? ot.defaultWidth,
      height: overrides?.height ?? ot.defaultHeight,
      angle: overrides?.angle ?? 0,
      opacity: overrides?.opacity ?? 100,
      visible: overrides?.visible ?? true,
      mirrored: overrides?.mirrored ?? false,
      flipped: overrides?.flipped ?? false,
      destroyed: false,
      instVars,
      behaviorDefs: ot.behaviorDefs,
      behaviorProps,
      behaviorState: {},
      animName: defaultAnim,
      animFrame: 0,
      animTimer: 0,
      animSpeedOverride: null,
      animPlaying: true,
      animPingPongDir: 1,
      text: overrides?.textOverride ?? ot.textConfig?.initialText ?? '',
      particles: [],
      particleEmitAccum: 0,
      particleSpraying: ot.plugin === 'Particles',
      particleOneShotDone: false,
      tileData: overrides?.tileData ? [...overrides.tileData] : (ot.plugin === 'Tilemap' ? new Array((ot.tilemapConfig?.columns ?? 20) * (ot.tilemapConfig?.rows ?? 15)).fill(-1) : undefined),
      mapWidth: overrides?.mapWidth ?? ot.tilemapConfig?.columns ?? 20,
      mapHeight: overrides?.mapHeight ?? ot.tilemapConfig?.rows ?? 15,
      btnHovered: false,
      btnPressed: false,
      sliderValue: ot.sliderConfig?.initialValue ?? 50,
      sliderDragging: false,
      progressValue: ot.progressBarConfig?.initialProgress ?? 100,
    };

    for (const bdef of ot.behaviorDefs) {
      inst.behaviorState[bdef.id] = createBehaviorRuntimeState(bdef, inst);
    }

    typeList.push(inst);
    this.instancesByType.set(ot.id, typeList);
    this.instances.push(inst);

    // If one-shot particles, burst immediately
    if (ot.plugin === 'Particles' && ot.particlesConfig?.type === 'one-shot') {
      this.emitParticlesBurst(inst, ot.particlesConfig.rate);
      inst.particleOneShotDone = true;
    }

    return inst;
  }

  private getCurrentFrame(inst: RuntimeInstance): SpriteFrame | null {
    const sc = inst.objectType.spriteConfig;
    if (!sc || sc.animations.length === 0) return null;
    const anim = sc.animations.find((a) => a.name === inst.animName) || sc.animations[0];
    if (!anim || anim.frames.length === 0) return null;
    const idx = Math.max(0, Math.min(anim.frames.length - 1, inst.animFrame));
    return anim.frames[idx];
  }

  private getCollidableRect(inst: RuntimeInstance): CollidableRect {
    const frame = this.getCurrentFrame(inst);
    return {
      x: inst.x,
      y: inst.y,
      width: inst.width,
      height: inst.height,
      angle: inst.angle,
      originX: frame ? frame.originX : inst.objectType.plugin === 'Sprite' ? 0.5 : 0,
      originY: frame ? frame.originY : inst.objectType.plugin === 'Sprite' ? 0.5 : 0,
      mirrored: inst.mirrored,
      flipped: inst.flipped,
      collisionPoly: frame?.collisionPoly,
    };
  }

  private createHostAPI(): RuntimeHostAPI {
    return {
      dt: this.dt,
      layoutWidth: this.currentLayout.width,
      layoutHeight: this.currentLayout.height,
      viewportWidth: this.project.viewportWidth,
      viewportHeight: this.project.viewportHeight,
      scrollX: this.scrollX,
      scrollY: this.scrollY,
      input: this.getInputSnapshot(),
      getInstancesByBehavior: (bType: string) =>
        this.instances.filter((i) => !i.destroyed && i.behaviorDefs.some((b) => b.type === bType)),
      getInstancesByObjectTypeId: (objectTypeId: string) =>
        (this.instancesByType.get(objectTypeId) || []).filter((i) => !i.destroyed),
      getInstanceByUid: (uid: number) => this.instances.find((i) => !i.destroyed && i.uid === uid),
      getAllInstances: () => this.instances.filter((i) => !i.destroyed),
      findObjectTypeByName: (name: string) => this.objectTypesByName.get(name),
      getCollidableRect: (inst) => this.getCollidableRect(inst),
      raycastSolids: (x1, y1, x2, y2, ignoreInstA, ignoreInstB) => {
        for (const inst of this.instances) {
          if (inst.destroyed || inst === ignoreInstA || inst === ignoreInstB) continue;
          const solidDef = inst.behaviorDefs.find((b) => b.type === 'Solid');
          if (!solidDef) continue;
          const enabled = toBool(inst.behaviorProps[solidDef.id]?.enabled ?? solidDef.properties.enabled ?? true);
          if (!enabled) continue;
          if (inst.objectType.plugin === 'Tilemap') {
            for (const tr of getTilemapSolidRects(inst)) {
              if (segmentIntersectsRect(x1, y1, x2, y2, tr)) return true;
            }
            continue;
          }
          if (segmentIntersectsRect(x1, y1, x2, y2, this.getCollidableRect(inst))) {
            return true;
          }
        }
        return false;
      },
      queueTrigger: (kind, inst, extra) => {
        this.triggerQueue.push({ kind, inst, extra });
      },
      destroyInstance: (inst) => this.markDestroy(inst),
      triggerShake: (magnitude, duration, mode) => {
        this.shakes.push({ magnitude, duration, elapsed: 0, mode });
      },
      getPhysicsWorld: () => this.physicsWorld,
    };
  }

  private getInputSnapshot(): InputSnapshot {
    return {
      keysDown: this.keysDown,
      mouseX: this.mouseX,
      mouseY: this.mouseY,
      mouseAbsX: this.mouseAbsX,
      mouseAbsY: this.mouseAbsY,
      mouseButtonsDown: this.mouseButtonsDown,
      mouseJustPressed: this.mouseJustPressed,
      mouseJustReleased: this.mouseJustReleased,
      touchActive: this.touchActive,
      touchX: this.touchX,
      touchY: this.touchY,
      gamepadAxes: this.gamepadAxes,
      gamepadButtons: this.gamepadButtons,
      virtualJoyActive: this.virtualJoyActive,
      virtualJoyX: this.virtualJoyX,
      virtualJoyY: this.virtualJoyY,
      virtualJoyAngle: this.virtualJoyAngle,
      virtualJoyDistance: this.virtualJoyDistance,
      virtualBtnA: this.virtualBtnA,
      virtualBtnB: this.virtualBtnB,
    };
  }

  private markDestroy(inst: RuntimeInstance): void {
    if (inst.destroyed) return;
    inst.destroyed = true;
    this.physicsWorld.unregisterBody(inst.uid);
    this.triggerQueue.push({ kind: 'object_on_destroyed', inst });
  }

  private cleanupDestroyed(): void {
    let any = false;
    for (const i of this.instances) {
      if (i.destroyed) {
        any = true;
        break;
      }
    }
    if (!any) return;
    this.instances = this.instances.filter((i) => !i.destroyed);
    for (const [typeId, list] of this.instancesByType.entries()) {
      const filtered = list.filter((i) => !i.destroyed);
      filtered.forEach((inst, idx) => {
        inst.iid = idx;
      });
      this.instancesByType.set(typeId, filtered);
    }
  }

  private tick(now: number): void {
    const rawDt = (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;

    // FPS counter
    this.fpsAccum += rawDt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAccum;
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }

    if (this.paused) {
      this.render();
      return;
    }

    // Clamp dt to max 0.05s to protect physics from tab switches
    this.dt = Math.min(0.05, Math.max(0, rawDt)) * this.timeScale;
    this.gameTime += this.dt;
    this.tickCount++;

    // 1. Input triggers
    for (const code of this.pendingKeysPressed) {
      this.triggerQueue.push({ kind: 'keyboard_on_key_pressed', extra: { key: code } });
      this.triggerQueue.push({ kind: 'keyboard_on_any_key' });
    }
    for (const code of this.pendingKeysReleased) {
      this.triggerQueue.push({ kind: 'keyboard_on_key_released', extra: { key: code } });
    }
    for (const btn of this.mouseJustPressed) {
      const btnName = btn === 0 ? 'left' : btn === 1 ? 'middle' : 'right';
      this.triggerQueue.push({ kind: 'mouse_on_click', extra: { button: btnName } });
    }
    if (this.touchJustStarted) {
      this.triggerQueue.push({ kind: 'touch_on_start' });
    }

    // 1b. Poll Gamepads & Virtual/GUI controls
    this.pollGamepads();
    this.stepVirtualControls();
    this.stepGUIControls();

    // 2. Step behaviors, animations, and particles
    const host = this.createHostAPI();
    for (const inst of [...this.instances]) {
      if (inst.destroyed) continue;
      stepInstanceBehaviors(inst, host);
      this.stepSpriteAnimation(inst);
      this.stepParticles(inst);
    }

    // 2b. Step 2D Rigid-Body Physics World
    const tilemapStaticAABBs = this.instances
      .filter((i) => !i.destroyed && i.objectType.plugin === 'Tilemap' && i.behaviorDefs.some((b) => b.type === 'Solid' && toBool(i.behaviorProps[b.id]?.enabled ?? b.properties.enabled ?? true)))
      .flatMap((tm) => getTilemapSolidAABBs(tm));
    this.physicsWorld.step(
      this.dt,
      (instA, instB) => {
        this.triggerQueue.push({
          kind: 'physics_on_collision',
          inst: instA,
          extra: { otherTypeId: instB.objectType.id, otherUid: String(instB.uid) },
        });
        this.triggerQueue.push({
          kind: 'physics_on_collision',
          inst: instB,
          extra: { otherTypeId: instA.objectType.id, otherUid: String(instA.uid) },
        });
      },
      tilemapStaticAABBs
    );

    // 3. Detect new collision pairs for On collision triggers
    this.detectCollisionEvents();

    // 4. Resume Wait coroutines whose timer expired
    this.stepPendingWaits();

    // 5. Run triggers & main Event Sheet top-to-bottom
    this.flushTriggers();
    this.runEventSheet();

    // Handle pending layout switch/restart
    if (this.pendingLayoutRestart) {
      this.pendingLayoutRestart = false;
      this.loadLayout(this.currentLayout.id);
      this.flushTriggers();
    } else if (this.pendingLayoutSwitch) {
      const target = this.pendingLayoutSwitch;
      this.pendingLayoutSwitch = null;
      this.loadLayout(target);
      this.flushTriggers();
    }

    // 6. Cleanup destroyed & update camera
    this.cleanupDestroyed();
    this.updateCamera();
    this.updateShake();

    // Clear per-tick input edges
    this.pendingKeysPressed = [];
    this.pendingKeysReleased = [];
    this.mouseJustPressed.clear();
    this.mouseJustReleased.clear();
    this.touchJustStarted = false;

    // 7. Render
    this.render();
  }

  private stepSpriteAnimation(inst: RuntimeInstance): void {
    const sc = inst.objectType.spriteConfig;
    if (!sc || !inst.animPlaying) return;
    const anim = sc.animations.find((a) => a.name === inst.animName) || sc.animations[0];
    if (!anim || anim.frames.length <= 1) return;

    const speed = inst.animSpeedOverride ?? anim.speed;
    if (speed <= 0) return;

    const frameDuration = (1 / speed) * (anim.frames[inst.animFrame]?.duration ?? 1);
    inst.animTimer += this.dt;
    while (inst.animTimer >= frameDuration) {
      inst.animTimer -= frameDuration;
      if (anim.pingPong) {
        const next = inst.animFrame + inst.animPingPongDir;
        if (next >= anim.frames.length || next < 0) {
          inst.animPingPongDir = (inst.animPingPongDir * -1) as 1 | -1;
          inst.animFrame = Math.max(0, Math.min(anim.frames.length - 1, inst.animFrame + inst.animPingPongDir));
          if (!anim.loop && inst.animFrame === 0) {
            inst.animPlaying = false;
            this.triggerQueue.push({ kind: 'sprite_on_anim_finished', inst, extra: { name: anim.name } });
            break;
          }
        } else {
          inst.animFrame = next;
        }
      } else {
        if (inst.animFrame + 1 < anim.frames.length) {
          inst.animFrame++;
        } else if (anim.loop) {
          inst.animFrame = 0;
        } else {
          inst.animPlaying = false;
          this.triggerQueue.push({ kind: 'sprite_on_anim_finished', inst, extra: { name: anim.name } });
          break;
        }
      }
    }
  }

  private emitParticlesBurst(inst: RuntimeInstance, count: number): void {
    const cfg = inst.objectType.particlesConfig;
    if (!cfg) return;
    const baseAngle = inst.angle;
    const halfCone = cfg.sprayCone * 0.5;
    for (let i = 0; i < count; i++) {
      const ang = ((baseAngle + (Math.random() * 2 - 1) * halfCone) * Math.PI) / 180;
      const spd = Math.max(5, cfg.speed + (Math.random() * 2 - 1) * cfg.speedRandomiser);
      const sz = Math.max(1, cfg.size + (Math.random() * 2 - 1) * cfg.sizeRandomiser);
      inst.particles.push({
        x: inst.x,
        y: inst.y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        size: sz,
        age: 0,
        lifetime: Math.max(0.05, cfg.lifetime),
        color: cfg.color,
        alpha: cfg.opacity / 100,
      });
    }
  }

  private stepParticles(inst: RuntimeInstance): void {
    if (inst.objectType.plugin !== 'Particles') return;
    const cfg = inst.objectType.particlesConfig;
    if (!cfg) return;

    if (cfg.type === 'continuous' && inst.particleSpraying) {
      const rate = inst.particleRateOverride ?? cfg.rate;
      inst.particleEmitAccum += rate * this.dt;
      const toEmit = Math.floor(inst.particleEmitAccum);
      if (toEmit > 0) {
        inst.particleEmitAccum -= toEmit;
        this.emitParticlesBurst(inst, Math.min(toEmit, 30));
      }
    }

    for (let i = inst.particles.length - 1; i >= 0; i--) {
      const p = inst.particles[i];
      p.age += this.dt;
      if (p.age >= p.lifetime) {
        inst.particles.splice(i, 1);
        continue;
      }
      if (cfg.acceleration !== 0) {
        const spd = Math.hypot(p.vx, p.vy);
        if (spd > 0.01) {
          const next = Math.max(0, spd + cfg.acceleration * this.dt);
          p.vx = (p.vx / spd) * next;
          p.vy = (p.vy / spd) * next;
        }
      }
      p.vy += cfg.gravity * this.dt;
      p.x += p.vx * this.dt;
      p.y += p.vy * this.dt;
      p.size = Math.max(0.5, p.size + cfg.growRate * this.dt);
      p.alpha = (cfg.opacity / 100) * (1 - p.age / p.lifetime);
    }

    // Auto-destroy one-shot emitters once all particles finish
    if (cfg.type === 'one-shot' && inst.particleOneShotDone && inst.particles.length === 0) {
      this.markDestroy(inst);
    }
  }

  private detectCollisionEvents(): void {
    const sheet = this.project.eventSheets.find((s) => s.id === this.currentLayout.eventSheetId);
    if (!sheet) return;

    // Collect distinct object type pairs referenced by on_collision conditions
    const pairsToCheck = new Set<string>();
    const visited = new Set<string>();
    const scanItems = (items: EventItem[]) => {
      for (const item of items) {
        if (item.kind === 'group') scanItems(item.items);
        else if (item.kind === 'include') {
          const inc = this.project.eventSheets.find((s) => s.id === item.eventSheetId);
          if (inc && !visited.has(inc.id)) {
            visited.add(inc.id);
            scanItems(inc.items);
          }
        } else if (item.kind === 'event' && !item.disabled) {
          for (const c of item.conditions) {
            if (c.conditionId === 'on_collision' && c.params.other) {
              pairsToCheck.add(`${c.objectTypeId}|${c.params.other}`);
            }
          }
          scanItems(item.subEvents);
        }
      }
    };
    scanItems(sheet.items);

    const nextActivePairs = new Set<string>();
    for (const pairKey of pairsToCheck) {
      const [typeA, typeB] = pairKey.split('|');
      const listA = this.instancesByType.get(typeA) || [];
      const listB = this.instancesByType.get(typeB) || [];
      for (const a of listA) {
        if (a.destroyed) continue;
        for (const b of listB) {
          if (b.destroyed || a === b) continue;
          if (this.testInstanceOverlap(a, b)) {
            const uidKey = `${pairKey}:${a.uid}:${b.uid}`;
            nextActivePairs.add(uidKey);
            if (!this.activeOverlapPairs.has(uidKey)) {
              this.triggerQueue.push({
                kind: 'object_on_collision',
                inst: a,
                extra: { otherTypeId: typeB, otherUid: String(b.uid) },
              });
            }
          }
        }
      }
    }
    this.activeOverlapPairs = nextActivePairs;
  }

  private stepPendingWaits(): void {
    for (let i = this.pendingWaits.length - 1; i >= 0; i--) {
      const w = this.pendingWaits[i];
      w.remaining -= this.dt;
      if (w.remaining <= 0) {
        this.pendingWaits.splice(i, 1);
        // Filter out destroyed instances from preserved SOL
        const cleanedSol = new Map<string, RuntimeInstance[] | null>();
        for (const [k, v] of w.sol.entries()) {
          cleanedSol.set(k, v ? v.filter((inst) => !inst.destroyed) : null);
        }
        this.loopIndexStack.push(w.loopIndex);
        this.executeActionList(w.actions, cleanedSol);
        this.loopIndexStack.pop();
      }
    }
  }

  // ==================== EVENT ENGINE & SOL PICKING ====================

  private createExprContext(sol: Map<string, RuntimeInstance[] | null>, primaryInst?: RuntimeInstance): ExpressionContext {
    return {
      getGlobalVar: (name) => this.globalVars.get(name),
      getLoopIndex: () => this.loopIndexStack[this.loopIndexStack.length - 1] ?? 0,
      getSystemProp: (name) => {
        switch (name.toLowerCase()) {
          case 'dt':
            return this.dt;
          case 'time':
            return this.gameTime;
          case 'tickcount':
            return this.tickCount;
          case 'fps':
            return Math.round(this.fps);
          case 'layoutwidth':
            return this.currentLayout.width;
          case 'layoutheight':
            return this.currentLayout.height;
          case 'layoutname':
            return this.currentLayout.name;
          case 'scrollx':
            return this.scrollX;
          case 'scrolly':
            return this.scrollY;
          case 'viewportwidth':
          case 'windowwidth':
            return this.project.viewportWidth;
          case 'viewportheight':
          case 'windowheight':
            return this.project.viewportHeight;
          default:
            return undefined;
        }
      },
      getObjectProp: (objName, propChain, args) => {
        // Global plugins
        if (objName === 'Mouse') {
          const p = (propChain[0] || '').toLowerCase();
          if (p === 'x') return this.mouseX;
          if (p === 'y') return this.mouseY;
          if (p === 'absolutex') return this.mouseAbsX;
          if (p === 'absolutey') return this.mouseAbsY;
          return 0;
        }
        if (objName === 'Touch') {
          const p = (propChain[0] || '').toLowerCase();
          if (p === 'x') return this.touchX;
          if (p === 'y') return this.touchY;
          return 0;
        }
        if (objName === 'Keyboard') {
          if ((propChain[0] || '').toLowerCase() === 'lastkeycode') return this.lastKeyCode;
          return '';
        }
        if (objName === 'Dictionary') {
          const p = (propChain[0] || '').toLowerCase();
          if (p === 'get') return this.dictionary.get(toStringVal(args[0] ?? '')) ?? 0;
          if (p === 'keycount') return this.dictionary.size;
          return 0;
        }
        if (objName === 'LocalStorage') {
          const p = (propChain[0] || '').toLowerCase();
          if (p === 'itemvalue') return this.localStorageLastVal;
          if (p === 'key') return this.localStorageLastKey;
          return '';
        }
        if (objName === 'Audio') {
          const p = (propChain[0] || '').toLowerCase();
          if (p === 'volume') return this.audio.getTagVolume(toStringVal(args[0] ?? 'sfx'));
          return 0;
        }
        if (objName === 'Gamepad') {
          const p = (propChain[0] || '').toLowerCase();
          if (p === 'count') {
            return this.gamepadButtons.length;
          }
          if (p === 'axis') {
            const pad = Math.trunc(toNumber(args[0] ?? 0));
            const axisIdx = Math.trunc(toNumber(args[1] ?? 0));
            return this.gamepadAxes[pad]?.[axisIdx] ?? 0;
          }
          if (p === 'button') {
            const pad = Math.trunc(toNumber(args[0] ?? 0));
            const btnIdx = Math.trunc(toNumber(args[1] ?? 0));
            return this.gamepadButtons[pad]?.[btnIdx] ? 1 : 0;
          }
          return 0;
        }
        if (objName === 'VirtualJoystick') {
          const p = (propChain[0] || '').toLowerCase();
          if (p === 'x') return this.virtualJoyX;
          if (p === 'y') return this.virtualJoyY;
          if (p === 'angle') return this.virtualJoyAngle;
          if (p === 'distance') return this.virtualJoyDistance;
          return 0;
        }

        const ot = this.objectTypesByName.get(objName);
        if (!ot) return 0;

        const pickedList = sol.get(ot.id);
        const allList = this.instancesByType.get(ot.id) || [];
        const target =
          primaryInst && primaryInst.objectType.id === ot.id
            ? primaryInst
            : pickedList && pickedList.length > 0
            ? pickedList[0]
            : allList[0];

        if (propChain.length === 1) {
          const prop = propChain[0];
          const lower = prop.toLowerCase();
          if (lower === 'count') return allList.filter((i) => !i.destroyed).length;
          if (lower === 'pickedcount') return pickedList ? pickedList.length : allList.length;
          if (!target) return 0;
          switch (lower) {
            case 'x':
              return target.x;
            case 'y':
              return target.y;
            case 'width':
              return target.width;
            case 'height':
              return target.height;
            case 'angle':
              return target.angle;
            case 'opacity':
              return target.opacity;
            case 'uid':
              return target.uid;
            case 'iid':
              return target.iid;
            case 'animationname':
              return target.animName;
            case 'animationframe':
              return target.animFrame;
            case 'text':
              return target.text;
            case 'particlecount':
              return target.particles.length;
            case 'value':
              return target.sliderValue ?? 0;
            case 'progress':
              return target.progressValue ?? 0;
            case 'tilewidth':
              return target.objectType.tilemapConfig?.tileWidth ?? 32;
            case 'tileheight':
              return target.objectType.tilemapConfig?.tileHeight ?? 32;
            case 'mapwidth':
              return target.mapWidth ?? 0;
            case 'mapheight':
              return target.mapHeight ?? 0;
            case 'tileat': {
              const col = Math.trunc(toNumber(args[0] ?? 0));
              const row = Math.trunc(toNumber(args[1] ?? 0));
              const mw = target.mapWidth ?? 0;
              const mh = target.mapHeight ?? 0;
              if (!target.tileData || col < 0 || row < 0 || col >= mw || row >= mh) return -1;
              return target.tileData[row * mw + col] ?? -1;
            }
            default:
              if (prop in target.instVars) return target.instVars[prop];
              return 0;
          }
        }

        // Behavior expressions: Obj.Behavior.Prop
        if (propChain.length >= 2 && target) {
          const bName = propChain[0].toLowerCase();
          const bProp = propChain[1].toLowerCase();
          const bDef = target.behaviorDefs.find(
            (b) => b.type.toLowerCase() === bName || b.name.toLowerCase() === bName || (bName === 'eightdir' && b.type === 'EightDirection')
          );
          if (!bDef) return 0;
          const bst = target.behaviorState[bDef.id];
          if (!bst) return 0;

          if (bDef.type === 'Platform') {
            if (bProp === 'speed') return Math.hypot(bst.vx, bst.vy);
            if (bProp === 'vectorx') return bst.vx;
            if (bProp === 'vectory') return bst.vy;
            if (bProp === 'maxspeed') return toNumber(target.behaviorProps[bDef.id]?.maxSpeed ?? bDef.properties.maxSpeed);
            if (bProp === 'movingangle') return ((Math.atan2(bst.vy, bst.vx) * 180) / Math.PI + 360) % 360;
          } else if (bDef.type === 'EightDirection') {
            if (bProp === 'speed') return Math.hypot(bst.eightVx, bst.eightVy);
            if (bProp === 'vectorx') return bst.eightVx;
            if (bProp === 'vectory') return bst.eightVy;
            if (bProp === 'movingangle') return bst.eightAngle;
          } else if (bDef.type === 'Bullet') {
            if (bProp === 'speed') return Math.hypot(bst.bulletVx, bst.bulletVy);
            if (bProp === 'angleofmotion') return bst.bulletAngle;
          } else if (bDef.type === 'Sine') {
            if (bProp === 'value') return bst.sineValue;
            if (bProp === 'cycleposition') {
              const p = Math.max(0.05, toNumber(target.behaviorProps[bDef.id]?.period ?? 2));
              return (bst.sineElapsed % p) / p;
            }
          } else if (bDef.type === 'Timer') {
            const tag = toStringVal(args[0] ?? '');
            const entry = bst.timers.get(tag);
            if (bProp === 'currenttime') return entry ? entry.elapsed : 0;
            if (bProp === 'duration') return entry ? entry.duration : 0;
            if (bProp === 'normalizedprogress') return entry && entry.duration > 0 ? Math.min(1, entry.elapsed / entry.duration) : 0;
          } else if (bDef.type === 'Rotate') {
            if (bProp === 'speed') return bst.rotateSpeed;
          } else if (bDef.type === 'Tween') {
            const tag = toStringVal(args[0] ?? '');
            const tw = bst.tweens.get(tag);
            if (bProp === 'value') return tw ? tw.currentValue : 0;
            if (bProp === 'progress') return tw ? tw.progress : 0;
          } else if (bDef.type === 'Pin') {
            if (bProp === 'pinneduid') return bst.pinnedUid;
          } else if (bDef.type === 'Turret') {
            if (bProp === 'targetuid') return bst.turretTargetUid;
          } else if (bDef.type === 'LineOfSight') {
            if (bProp === 'range') return toNumber(target.behaviorProps[bDef.id]?.range ?? bDef.properties.range ?? 350);
            if (bProp === 'coneofview') return toNumber(target.behaviorProps[bDef.id]?.coneOfView ?? bDef.properties.coneOfView ?? 360);
          } else if (bDef.type === 'Pathfinding') {
            if (bProp === 'nodecount') return bst.pathNodes.length;
            if (bProp === 'nodexat') {
              const idx = Math.trunc(toNumber(args[0] ?? 0));
              return bst.pathNodes[idx]?.x ?? 0;
            }
            if (bProp === 'nodeyat') {
              const idx = Math.trunc(toNumber(args[0] ?? 0));
              return bst.pathNodes[idx]?.y ?? 0;
            }
            if (bProp === 'movingangle') return bst.pathMovingAngle;
            if (bProp === 'speed') return bst.pathSpeed;
          } else if (bDef.type === 'Physics') {
            if (bProp === 'velocityx') return bst.physicsVx;
            if (bProp === 'velocityy') return bst.physicsVy;
            if (bProp === 'angularvelocity') return bst.physicsVAng;
            if (bProp === 'mass') return Number.isFinite(bst.physicsMass) ? bst.physicsMass : 0;
          }
        }
        return 0;
      },
    };
  }

  private getSolInstances(sol: Map<string, RuntimeInstance[] | null>, objectTypeId: string): RuntimeInstance[] {
    const existing = sol.get(objectTypeId);
    if (existing !== undefined && existing !== null) return existing;
    return (this.instancesByType.get(objectTypeId) || []).filter((i) => !i.destroyed);
  }

  private cloneSol(sol: Map<string, RuntimeInstance[] | null>): Map<string, RuntimeInstance[] | null> {
    const copy = new Map<string, RuntimeInstance[] | null>();
    for (const [k, v] of sol.entries()) {
      copy.set(k, v ? [...v] : null);
    }
    return copy;
  }

  private isConditionTrigger(cond: ConditionItem): boolean {
    if (cond.behaviorId) {
      return [
        'on_landed',
        'on_jump',
        'on_fall',
        'on_timer',
        'on_fade_out_finished',
        'on_wrap',
        'on_drag_start',
        'on_drop',
        'on_finished',
        'on_target_acquired',
        'on_shoot',
        'on_path_found',
        'on_failed',
        'on_arrived',
        'on_collision',
      ].includes(cond.conditionId);
    }
    return [
      'on_start_of_layout',
      'on_end_of_layout',
      'on_key_pressed',
      'on_key_released',
      'on_any_key_pressed',
      'on_click',
      'on_object_clicked',
      'on_touch_start',
      'on_object_touched',
      'on_collision',
      'on_created',
      'on_destroyed',
      'on_anim_finished',
      'on_item_set',
      'on_item_get',
      'on_item_exists',
      'on_item_missing',
      'on_clicked',
      'on_changed',
      'on_button_pressed',
    ].includes(cond.conditionId);
  }

  private flushTriggers(): void {
    const sheet = this.project.eventSheets.find((s) => s.id === this.currentLayout?.eventSheetId);
    if (!sheet) {
      this.triggerQueue = [];
      return;
    }

    // Drain up to safety cap so cascading triggers work cleanly
    let safety = 0;
    while (this.triggerQueue.length > 0 && safety < 200) {
      safety++;
      const trig = this.triggerQueue.shift()!;
      this.dispatchTriggerInItems(sheet.items, trig, new Set());
    }
  }

  private dispatchTriggerInItems(items: EventItem[], trig: QueuedTrigger, visitedSheets: Set<string>): void {
    for (const item of items) {
      if (item.disabled) continue;
      if (item.kind === 'include') {
        const inc = this.project.eventSheets.find((s) => s.id === item.eventSheetId);
        if (inc && !visitedSheets.has(inc.id)) {
          visitedSheets.add(inc.id);
          this.dispatchTriggerInItems(inc.items, trig, visitedSheets);
        }
      } else if (item.kind === 'group') {
        if (this.groupActiveState.get(item.title) ?? item.activeAtStart) {
          this.dispatchTriggerInItems(item.items, trig, visitedSheets);
        }
      } else if (item.kind === 'event') {
        const firstCond = item.conditions[0];
        if (firstCond && this.isConditionTrigger(firstCond) && this.matchesTrigger(firstCond, trig)) {
          const sol = new Map<string, RuntimeInstance[] | null>();
          if (trig.inst && !trig.inst.destroyed) {
            sol.set(trig.inst.objectType.id, [trig.inst]);
          }
          // If collision trigger, also pick the other colliding instance
          if ((trig.kind === 'object_on_collision' || trig.kind === 'physics_on_collision') && trig.extra?.otherTypeId && trig.extra?.otherUid) {
            const otherUid = Number(trig.extra.otherUid);
            const otherInst = (this.instancesByType.get(trig.extra.otherTypeId) || []).find(
              (i) => i.uid === otherUid && !i.destroyed
            );
            if (!otherInst) continue;
            sol.set(trig.extra.otherTypeId, [otherInst]);
          }
          // Evaluate remaining non-trigger conditions in the event
          const restConds = item.conditions.slice(1);
          const passed = this.evaluateConditionList(restConds, Boolean(item.isOrBlock), sol);
          if (passed) {
            this.executeEventBlockBody(item, sol);
          }
        }
        // Also allow nested trigger checks only if parent had no trigger (or normal flow)
      }
    }
  }

  private matchesTrigger(cond: ConditionItem, trig: QueuedTrigger): boolean {
    const sol = new Map<string, RuntimeInstance[] | null>();
    const ctx = this.createExprContext(sol, trig.inst);

    switch (trig.kind) {
      case 'system_on_start_of_layout':
        return cond.conditionId === 'on_start_of_layout';
      case 'system_on_end_of_layout':
        return cond.conditionId === 'on_end_of_layout';
      case 'keyboard_on_key_pressed':
        return cond.conditionId === 'on_key_pressed' && cond.params.key === trig.extra?.key;
      case 'keyboard_on_key_released':
        return cond.conditionId === 'on_key_released' && cond.params.key === trig.extra?.key;
      case 'keyboard_on_any_key':
        return cond.conditionId === 'on_any_key_pressed';
      case 'mouse_on_click':
        if (cond.conditionId === 'on_click') {
          return (cond.params.button || 'left') === trig.extra?.button;
        }
        if (cond.conditionId === 'on_object_clicked' && (cond.params.button || 'left') === trig.extra?.button) {
          const targetList = this.instancesByType.get(cond.params.object) || [];
          for (const inst of targetList) {
            if (!inst.destroyed && pointInInstance(this.mouseX, this.mouseY, this.getCollidableRect(inst))) {
              trig.inst = inst;
              return true;
            }
          }
        }
        return false;
      case 'touch_on_start':
        if (cond.conditionId === 'on_touch_start') return true;
        if (cond.conditionId === 'on_object_touched') {
          const targetList = this.instancesByType.get(cond.params.object) || [];
          for (const inst of targetList) {
            if (!inst.destroyed && pointInInstance(this.touchX, this.touchY, this.getCollidableRect(inst))) {
              trig.inst = inst;
              return true;
            }
          }
        }
        return false;
      case 'object_on_collision':
        return (
          !cond.behaviorId &&
          cond.conditionId === 'on_collision' &&
          cond.objectTypeId === trig.inst?.objectType.id &&
          cond.params.other === trig.extra?.otherTypeId
        );
      case 'physics_on_collision':
        return (
          Boolean(cond.behaviorId) &&
          cond.conditionId === 'on_collision' &&
          cond.objectTypeId === trig.inst?.objectType.id &&
          cond.params.other === trig.extra?.otherTypeId
        );
      case 'button_on_clicked':
        return cond.conditionId === 'on_clicked' && cond.objectTypeId === trig.inst?.objectType.id;
      case 'slider_on_changed':
        return cond.conditionId === 'on_changed' && cond.objectTypeId === trig.inst?.objectType.id;
      case 'gamepad_on_button_pressed': {
        if (cond.conditionId !== 'on_button_pressed') return false;
        const pIdx = Math.trunc(toNumber(evaluateExpression(cond.params.gamepadIndex || '0', ctx)));
        const bIdx = Math.trunc(toNumber(evaluateExpression(cond.params.buttonIndex || '0', ctx)));
        return String(pIdx) === trig.extra?.pad && String(bIdx) === trig.extra?.button;
      }
      case 'object_on_destroyed':
        return cond.conditionId === 'on_destroyed' && cond.objectTypeId === trig.inst?.objectType.id;
      case 'sprite_on_anim_finished':
        return (
          cond.conditionId === 'on_anim_finished' &&
          cond.objectTypeId === trig.inst?.objectType.id &&
          toStringVal(evaluateExpression(cond.params.name || '""', ctx)) === trig.extra?.name
        );
      case 'platform_on_jump':
        return cond.conditionId === 'on_jump' && cond.objectTypeId === trig.inst?.objectType.id;
      case 'platform_on_landed':
        return cond.conditionId === 'on_landed' && cond.objectTypeId === trig.inst?.objectType.id;
      case 'platform_on_fall':
        return cond.conditionId === 'on_fall' && cond.objectTypeId === trig.inst?.objectType.id;
      case 'timer_on_timer':
        return (
          cond.conditionId === 'on_timer' &&
          cond.objectTypeId === trig.inst?.objectType.id &&
          toStringVal(evaluateExpression(cond.params.tag || '""', ctx)) === trig.extra?.tag
        );
      case 'fade_on_finished':
        return cond.conditionId === 'on_fade_out_finished' && cond.objectTypeId === trig.inst?.objectType.id;
      case 'wrap_on_wrap':
        return cond.conditionId === 'on_wrap' && cond.objectTypeId === trig.inst?.objectType.id;
      case 'dragdrop_on_drag_start':
        return cond.conditionId === 'on_drag_start' && cond.objectTypeId === trig.inst?.objectType.id;
      case 'dragdrop_on_drop':
        return cond.conditionId === 'on_drop' && cond.objectTypeId === trig.inst?.objectType.id;
      case 'tween_on_finished': {
        if (cond.conditionId !== 'on_finished' || cond.objectTypeId !== trig.inst?.objectType.id) return false;
        const expectedTag = toStringVal(evaluateExpression(cond.params.tag || '""', ctx));
        return expectedTag === '' || expectedTag === trig.extra?.tag;
      }
      case 'turret_on_target_acquired':
        return cond.conditionId === 'on_target_acquired' && cond.objectTypeId === trig.inst?.objectType.id;
      case 'turret_on_shoot':
        return cond.conditionId === 'on_shoot' && cond.objectTypeId === trig.inst?.objectType.id;
      case 'pathfinding_on_path_found':
        return cond.conditionId === 'on_path_found' && cond.objectTypeId === trig.inst?.objectType.id;
      case 'pathfinding_on_failed':
        return cond.conditionId === 'on_failed' && cond.objectTypeId === trig.inst?.objectType.id;
      case 'pathfinding_on_arrived':
        return cond.conditionId === 'on_arrived' && cond.objectTypeId === trig.inst?.objectType.id;
      case 'ls_on_set':
        return (
          cond.conditionId === 'on_item_set' &&
          toStringVal(evaluateExpression(cond.params.key || '""', ctx)) === trig.extra?.key
        );
      case 'ls_on_get':
        return (
          cond.conditionId === 'on_item_get' &&
          toStringVal(evaluateExpression(cond.params.key || '""', ctx)) === trig.extra?.key
        );
      case 'ls_on_exists':
        return (
          cond.conditionId === 'on_item_exists' &&
          toStringVal(evaluateExpression(cond.params.key || '""', ctx)) === trig.extra?.key
        );
      case 'ls_on_missing':
        return (
          cond.conditionId === 'on_item_missing' &&
          toStringVal(evaluateExpression(cond.params.key || '""', ctx)) === trig.extra?.key
        );
      default:
        return false;
    }
  }

  private runEventSheet(): void {
    const sheet = this.project.eventSheets.find((s) => s.id === this.currentLayout.eventSheetId);
    if (!sheet) return;
    this.triggerOnceTrueThisTick.clear();
    this.runEventItems(sheet.items, new Map(), new Set());
    this.prevTriggerOnceState = new Set(this.triggerOnceTrueThisTick);
  }

  private runEventItems(
    items: EventItem[],
    parentSol: Map<string, RuntimeInstance[] | null>,
    visitedSheets: Set<string>
  ): void {
    let prevEventRan = false;

    for (const item of items) {
      if (item.disabled) continue;

      if (item.kind === 'include') {
        const inc = this.project.eventSheets.find((s) => s.id === item.eventSheetId);
        if (inc && !visitedSheets.has(inc.id)) {
          visitedSheets.add(inc.id);
          this.runEventItems(inc.items, parentSol, visitedSheets);
        }
        continue;
      }

      if (item.kind === 'group') {
        const active = this.groupActiveState.get(item.title) ?? item.activeAtStart;
        if (active) {
          this.runEventItems(item.items, parentSol, visitedSheets);
        }
        continue;
      }

      // EventBlock
      if (item.conditions.length > 0 && this.isConditionTrigger(item.conditions[0])) {
        // Trigger events only run via trigger dispatch
        prevEventRan = false;
        continue;
      }

      if (item.isElse && prevEventRan) {
        prevEventRan = false;
        continue;
      }

      const sol = this.cloneSol(parentSol);
      const passed = this.evaluateConditionList(item.conditions, Boolean(item.isOrBlock), sol);
      if (passed) {
        prevEventRan = true;
        this.executeEventBlockBody(item, sol);
      } else {
        prevEventRan = false;
      }
    }
  }

  private evaluateConditionList(
    conditions: ConditionItem[],
    isOrBlock: boolean,
    sol: Map<string, RuntimeInstance[] | null>
  ): boolean {
    if (conditions.length === 0) return true;

    if (!isOrBlock) {
      for (const cond of conditions) {
        if (!this.evaluateSingleCondition(cond, sol)) {
          return false;
        }
      }
      return true;
    }

    // OR block: each condition runs against a snapshot of incoming SOL;
    // union picked instances per object type for conditions that succeeded.
    const baseSol = this.cloneSol(sol);
    const unionPicked = new Map<string, Set<RuntimeInstance>>();
    let anyPassed = false;

    for (const cond of conditions) {
      const branchSol = this.cloneSol(baseSol);
      if (this.evaluateSingleCondition(cond, branchSol)) {
        anyPassed = true;
        for (const [typeId, list] of branchSol.entries()) {
          if (list !== null) {
            let set = unionPicked.get(typeId);
            if (!set) {
              set = new Set();
              unionPicked.set(typeId, set);
            }
            for (const inst of list) set.add(inst);
          }
        }
      }
    }

    if (!anyPassed) return false;
    // Merge back: if a type was picked in any satisfied OR branch, narrow SOL to union;
    // otherwise all instances from baseSol remain selected!
    for (const [typeId, set] of unionPicked.entries()) {
      sol.set(typeId, Array.from(set));
    }
    return true;
  }

  private evaluateSingleCondition(cond: ConditionItem, sol: Map<string, RuntimeInstance[] | null>): boolean {
    const inverted = Boolean(cond.inverted);

    // Special System conditions
    if (cond.objectTypeId === 'system' || this.objectTypesById.get(cond.objectTypeId)?.plugin === 'System') {
      const ctx = this.createExprContext(sol);
      let res = false;
      switch (cond.conditionId) {
        case 'every_tick':
          res = true;
          break;
        case 'every_x_seconds': {
          const interval = Math.max(0.01, toNumber(evaluateExpression(cond.params.interval || '1', ctx)));
          const prev = (this.everyXTimers.get(cond.id) ?? 0) + this.dt;
          if (prev >= interval) {
            this.everyXTimers.set(cond.id, prev - interval);
            res = true;
          } else {
            this.everyXTimers.set(cond.id, prev);
            res = false;
          }
          break;
        }
        case 'compare_variable': {
          const val = this.globalVars.get(cond.params.variable) ?? 0;
          const target = evaluateExpression(cond.params.value || '0', ctx);
          res = compareValues(val, cond.params.cmp || '=', target);
          break;
        }
        case 'compare_two_values': {
          const a = evaluateExpression(cond.params.first || '0', ctx);
          const b = evaluateExpression(cond.params.second || '0', ctx);
          res = compareValues(a, cond.params.cmp || '=', b);
          break;
        }
        case 'trigger_once': {
          this.triggerOnceTrueThisTick.add(cond.id);
          const wasTrue = this.prevTriggerOnceState.has(cond.id);
          res = !wasTrue;
          break;
        }
        case 'repeat':
        case 'for_each':
          res = true;
          break;
        default:
          res = true;
      }
      return inverted ? !res : res;
    }

    const ot = this.objectTypesById.get(cond.objectTypeId);
    if (!ot) return false;

    // Non-instance global plugins
    if (ot.plugin === 'Keyboard') {
      const res = cond.conditionId === 'is_key_down' ? this.keysDown.has(cond.params.key) : false;
      return inverted ? !res : res;
    }
    if (ot.plugin === 'Mouse') {
      if (cond.conditionId === 'is_button_down') {
        const b = cond.params.button === 'right' ? 2 : cond.params.button === 'middle' ? 1 : 0;
        const res = this.mouseButtonsDown.has(b);
        return inverted ? !res : res;
      }
      if (cond.conditionId === 'is_over_object') {
        const targetId = cond.params.object;
        const candidates = this.getSolInstances(sol, targetId);
        const matched = candidates.filter((i) =>
          pointInInstance(this.mouseX, this.mouseY, this.getCollidableRect(i))
        );
        if (inverted) return matched.length === 0;
        if (matched.length === 0) return false;
        sol.set(targetId, matched);
        return true;
      }
    }
    if (ot.plugin === 'Touch') {
      if (cond.conditionId === 'is_in_touch') {
        return inverted ? !this.touchActive : this.touchActive;
      }
    }
    if (ot.plugin === 'Audio') {
      const ctx = this.createExprContext(sol);
      if (cond.conditionId === 'is_tag_playing') {
        const tag = toStringVal(evaluateExpression(cond.params.tag || '""', ctx));
        const res = this.audio.isTagPlaying(tag);
        return inverted ? !res : res;
      }
    }
    if (ot.plugin === 'Dictionary') {
      const ctx = this.createExprContext(sol);
      const key = toStringVal(evaluateExpression(cond.params.key || '""', ctx));
      if (cond.conditionId === 'has_key') {
        const res = this.dictionary.has(key);
        return inverted ? !res : res;
      }
      if (cond.conditionId === 'compare_value') {
        const stored = this.dictionary.get(key) ?? 0;
        const target = evaluateExpression(cond.params.value || '0', ctx);
        const res = compareValues(stored, cond.params.cmp || '=', target);
        return inverted ? !res : res;
      }
    }
    if (ot.plugin === 'Gamepad') {
      const ctx = this.createExprContext(sol);
      const padIdx = Math.trunc(toNumber(evaluateExpression(cond.params.gamepadIndex || '0', ctx)));
      if (cond.conditionId === 'has_gamepad') {
        const res = padIdx >= 0 && padIdx < this.gamepadButtons.length;
        return inverted ? !res : res;
      }
      if (cond.conditionId === 'is_button_down') {
        const btnIdx = Math.trunc(toNumber(evaluateExpression(cond.params.buttonIndex || '0', ctx)));
        const res = Boolean(this.gamepadButtons[padIdx]?.[btnIdx]);
        return inverted ? !res : res;
      }
    }
    if (ot.plugin === 'VirtualJoystick') {
      if (cond.conditionId === 'is_active') {
        return inverted ? !this.virtualJoyActive : this.virtualJoyActive;
      }
      if (cond.conditionId === 'is_button_down') {
        const res = cond.params.button === 'B' ? this.virtualBtnB : this.virtualBtnA;
        return inverted ? !res : res;
      }
    }

    // Visual object instance filtering (SOL!)
    const candidates = this.getSolInstances(sol, ot.id);
    if (candidates.length === 0) {
      return inverted ? true : false;
    }

    // Special Pick Nearest/Furthest
    if (!cond.behaviorId && cond.conditionId === 'pick_nearest') {
      const ctx = this.createExprContext(sol);
      const tx = toNumber(evaluateExpression(cond.params.x || '0', ctx));
      const ty = toNumber(evaluateExpression(cond.params.y || '0', ctx));
      let best = candidates[0];
      let bestDist = Math.hypot(best.x - tx, best.y - ty);
      const wantFurthest = cond.params.which === 'furthest';
      for (let i = 1; i < candidates.length; i++) {
        const d = Math.hypot(candidates[i].x - tx, candidates[i].y - ty);
        if (wantFurthest ? d > bestDist : d < bestDist) {
          best = candidates[i];
          bestDist = d;
        }
      }
      sol.set(ot.id, [best]);
      return true;
    }

    // Filter each candidate instance
    const matched: RuntimeInstance[] = [];
    for (const inst of candidates) {
      const ctx = this.createExprContext(sol, inst);
      let ok = false;

      if (cond.behaviorId) {
        const bDef = inst.behaviorDefs.find((b) => b.id === cond.behaviorId);
        const bst = bDef ? inst.behaviorState[bDef.id] : undefined;
        if (bDef && bst) {
          ok = this.evalBehaviorCondition(inst, bDef.type, bDef.id, bst, cond, sol, ctx);
        }
      } else {
        ok = this.evalObjectCondition(inst, cond, sol, ctx);
      }

      if (inverted ? !ok : ok) {
        matched.push(inst);
      }
    }

    if (matched.length === 0) return false;
    sol.set(ot.id, matched);
    return true;
  }

  private evalBehaviorCondition(
    inst: RuntimeInstance,
    bType: BehaviorType,
    bId: string,
    bst: BehaviorRuntimeState,
    cond: ConditionItem,
    sol: Map<string, RuntimeInstance[] | null>,
    ctx: ExpressionContext
  ): boolean {
    switch (bType) {
      case 'Platform':
        if (cond.conditionId === 'is_on_floor') return bst.onFloor;
        if (cond.conditionId === 'is_jumping') return !bst.onFloor && bst.vy < 0;
        if (cond.conditionId === 'is_falling') return !bst.onFloor && bst.vy > 0;
        if (cond.conditionId === 'is_moving') return Math.abs(bst.vx) > 0.5;
        if (cond.conditionId === 'is_by_wall') {
          return cond.params.side === 'right' ? bst.byRightWall : bst.byLeftWall;
        }
        return false;
      case 'Solid':
      case 'JumpThru':
        return toBool(inst.behaviorProps[bId]?.enabled ?? true);
      case 'EightDirection':
        return Math.hypot(bst.eightVx, bst.eightVy) > 0.5;
      case 'Bullet':
        if (cond.conditionId === 'compare_speed') {
          const spd = Math.hypot(bst.bulletVx, bst.bulletVy);
          return compareValues(spd, cond.params.cmp || '>', evaluateExpression(cond.params.speed || '0', ctx));
        }
        return false;
      case 'Sine':
        return toBool(inst.behaviorProps[bId]?.enabled ?? true);
      case 'Flash':
        return bst.flashActive;
      case 'Timer':
        if (cond.conditionId === 'is_timer_running') {
          const tag = toStringVal(evaluateExpression(cond.params.tag || '""', ctx));
          return Boolean(bst.timers.get(tag)?.running);
        }
        return false;
      case 'DragDrop':
        return bst.isDragging;
      case 'Tween':
        if (cond.conditionId === 'is_playing') {
          const tag = toStringVal(evaluateExpression(cond.params.tag || '""', ctx));
          const tw = bst.tweens.get(tag);
          return Boolean(tw && !tw.paused && !tw.finished);
        }
        if (cond.conditionId === 'is_any_playing') {
          for (const tw of bst.tweens.values()) {
            if (!tw.paused && !tw.finished) return true;
          }
          return false;
        }
        return false;
      case 'Pin':
        if (cond.conditionId === 'is_pinned') {
          return bst.pinnedUid !== 0 && Boolean(this.instances.find((i) => !i.destroyed && i.uid === bst.pinnedUid));
        }
        return false;
      case 'Turret':
        if (cond.conditionId === 'has_target') {
          return (
            bst.turretTargetUid !== 0 &&
            Boolean(this.instances.find((i) => !i.destroyed && i.uid === bst.turretTargetUid))
          );
        }
        return false;
      case 'LineOfSight':
        if (cond.conditionId === 'has_los') {
          if (!toBool(inst.behaviorProps[bId]?.enabled ?? true)) return false;
          const range = Math.max(0, toNumber(inst.behaviorProps[bId]?.range ?? 350));
          const cone = Math.max(0, Math.min(360, toNumber(inst.behaviorProps[bId]?.coneOfView ?? 360)));
          const others = this.getSolInstances(sol, cond.params.object);
          const host = this.createHostAPI();
          return others.some((o) => computeLineOfSight(inst, o, range, cone, host));
        }
        return false;
      case 'Pathfinding':
        if (cond.conditionId === 'is_moving') return bst.pathMoving;
        if (cond.conditionId === 'has_path') return bst.pathNodes.length > 0;
        return false;
      case 'Physics':
        if (cond.conditionId === 'is_sleeping') {
          const b = this.physicsWorld.getBody(inst.uid);
          return b ? b.sleeping : false;
        }
        if (cond.conditionId === 'compare_velocity') {
          const spd = Math.hypot(bst.physicsVx, bst.physicsVy);
          return compareValues(spd, cond.params.cmp || '>', evaluateExpression(cond.params.value || '0', ctx));
        }
        return false;
      default:
        return false;
    }
  }

  private evalObjectCondition(
    inst: RuntimeInstance,
    cond: ConditionItem,
    sol: Map<string, RuntimeInstance[] | null>,
    ctx: ExpressionContext
  ): boolean {
    switch (cond.conditionId) {
      case 'is_overlapping': {
        const otherTypeId = cond.params.other;
        const others = this.getSolInstances(sol, otherTypeId);
        for (const o of others) {
          if (o === inst || o.destroyed) continue;
          if (this.testInstanceOverlap(inst, o)) {
            return true;
          }
        }
        return false;
      }
      case 'compare_x':
        return compareValues(inst.x, cond.params.cmp || '=', evaluateExpression(cond.params.value || '0', ctx));
      case 'compare_y':
        return compareValues(inst.y, cond.params.cmp || '=', evaluateExpression(cond.params.value || '0', ctx));
      case 'compare_inst_var': {
        const v = inst.instVars[cond.params.varName] ?? 0;
        const target = evaluateExpression(cond.params.value || '0', ctx);
        return compareValues(v, cond.params.cmp || '=', target);
      }
      case 'is_boolean_inst_var':
        return toBool(inst.instVars[cond.params.varName] ?? false);
      case 'is_visible':
        return inst.visible;
      case 'is_outside_layout':
        return (
          inst.x + inst.width < 0 ||
          inst.x - inst.width > this.currentLayout.width ||
          inst.y + inst.height < 0 ||
          inst.y - inst.height > this.currentLayout.height
        );
      case 'is_playing_anim':
        return inst.animName === toStringVal(evaluateExpression(cond.params.name || '""', ctx));
      case 'compare_frame':
        return compareValues(
          inst.animFrame,
          cond.params.cmp || '=',
          evaluateExpression(cond.params.frame || '0', ctx)
        );
      case 'compare_text':
        return inst.text === toStringVal(evaluateExpression(cond.params.text || '""', ctx));
      case 'is_spraying':
        return inst.particleSpraying;
      case 'compare_tile_at': {
        const col = Math.trunc(toNumber(evaluateExpression(cond.params.col || '0', ctx)));
        const row = Math.trunc(toNumber(evaluateExpression(cond.params.row || '0', ctx)));
        const mw = inst.mapWidth ?? 0;
        const mh = inst.mapHeight ?? 0;
        const tile = inst.tileData && col >= 0 && row >= 0 && col < mw && row < mh ? (inst.tileData[row * mw + col] ?? -1) : -1;
        return compareValues(tile, cond.params.cmp || '=', evaluateExpression(cond.params.tileIndex || '0', ctx));
      }
      case 'is_hovered':
        return Boolean(inst.btnHovered);
      case 'is_pressed':
        return Boolean(inst.btnPressed);
      case 'compare_value':
        return compareValues(inst.sliderValue ?? 0, cond.params.cmp || '>', evaluateExpression(cond.params.value || '0', ctx));
      case 'compare_progress':
        return compareValues(inst.progressValue ?? 0, cond.params.cmp || '<', evaluateExpression(cond.params.value || '0', ctx));
      default:
        return false;
    }
  }

  private executeEventBlockBody(block: EventBlock, sol: Map<string, RuntimeInstance[] | null>): void {
    // Check loop conditions (Repeat / For Each)
    const repeatCond = block.conditions.find((c) => c.conditionId === 'repeat');
    const forEachCond = block.conditions.find((c) => c.conditionId === 'for_each');

    if (repeatCond) {
      const ctx = this.createExprContext(sol);
      const count = Math.max(0, Math.min(500, Math.trunc(toNumber(evaluateExpression(repeatCond.params.count || '1', ctx)))));
      for (let i = 0; i < count; i++) {
        this.loopIndexStack.push(i);
        this.executeActionList(block.actions, sol);
        if (block.subEvents.length > 0) {
          this.runEventItems(block.subEvents, sol, new Set());
        }
        this.loopIndexStack.pop();
      }
      return;
    }

    if (forEachCond && forEachCond.params.object) {
      const targetId = forEachCond.params.object;
      const list = this.getSolInstances(sol, targetId);
      for (let i = 0; i < list.length; i++) {
        const iterSol = this.cloneSol(sol);
        iterSol.set(targetId, [list[i]]);
        this.loopIndexStack.push(i);
        this.executeActionList(block.actions, iterSol);
        if (block.subEvents.length > 0) {
          this.runEventItems(block.subEvents, iterSol, new Set());
        }
        this.loopIndexStack.pop();
      }
      return;
    }

    this.executeActionList(block.actions, sol);
    if (block.subEvents.length > 0) {
      this.runEventItems(block.subEvents, sol, new Set());
    }
  }

  private executeActionList(actions: ActionItem[], sol: Map<string, RuntimeInstance[] | null>): void {
    for (let idx = 0; idx < actions.length; idx++) {
      const action = actions[idx];
      const ot = this.objectTypesById.get(action.objectTypeId);

      // Handle System Wait (async action queue preserving SOL!)
      if ((action.objectTypeId === 'system' || ot?.plugin === 'System') && action.actionId === 'wait') {
        const ctx = this.createExprContext(sol);
        const seconds = Math.max(0, toNumber(evaluateExpression(action.params.seconds || '1', ctx)));
        this.pendingWaits.push({
          remaining: seconds,
          actions: actions.slice(idx + 1),
          sol: this.cloneSol(sol),
          loopIndex: this.loopIndexStack[this.loopIndexStack.length - 1] ?? 0,
        });
        return; // Halt rest of current slice until wait resolves
      }

      this.executeSingleAction(action, sol);
    }
  }

  private executeSingleAction(action: ActionItem, sol: Map<string, RuntimeInstance[] | null>): void {
    const ot = this.objectTypesById.get(action.objectTypeId);
    const ctx = this.createExprContext(sol);

    // System actions
    if (action.objectTypeId === 'system' || ot?.plugin === 'System') {
      switch (action.actionId) {
        case 'set_var':
          this.globalVars.set(action.params.variable, evaluateExpression(action.params.value || '0', ctx));
          break;
        case 'add_var': {
          const cur = toNumber(this.globalVars.get(action.params.variable) ?? 0);
          const delta = toNumber(evaluateExpression(action.params.value || '0', ctx));
          this.globalVars.set(action.params.variable, cur + delta);
          break;
        }
        case 'sub_var': {
          const cur = toNumber(this.globalVars.get(action.params.variable) ?? 0);
          const delta = toNumber(evaluateExpression(action.params.value || '0', ctx));
          this.globalVars.set(action.params.variable, cur - delta);
          break;
        }
        case 'create_object': {
          const targetOt = this.objectTypesById.get(action.params.object);
          if (!targetOt) break;
          const layerIdx = this.resolveLayerIndex(evaluateExpression(action.params.layer || '0', ctx));
          const x = toNumber(evaluateExpression(action.params.x || '0', ctx));
          const y = toNumber(evaluateExpression(action.params.y || '0', ctx));
          const created = this.spawnRuntimeInstance(targetOt, layerIdx, x, y);
          sol.set(targetOt.id, [created]);
          this.triggerQueue.push({ kind: 'object_on_created', inst: created });
          break;
        }
        case 'go_to_layout': {
          const targetLayout = this.project.layouts.find(
            (l) => l.id === action.params.layout || l.name === action.params.layout
          );
          if (targetLayout) this.pendingLayoutSwitch = targetLayout.id;
          break;
        }
        case 'restart_layout':
          this.pendingLayoutRestart = true;
          break;
        case 'set_scroll_x':
          this.scrollX = toNumber(evaluateExpression(action.params.x || '0', ctx));
          break;
        case 'set_scroll_y':
          this.scrollY = toNumber(evaluateExpression(action.params.y || '0', ctx));
          break;
        case 'set_timescale':
          this.timeScale = Math.max(0, toNumber(evaluateExpression(action.params.scale || '1', ctx)));
          break;
        case 'set_group_active': {
          const gName = toStringVal(evaluateExpression(action.params.group || '""', ctx));
          this.groupActiveState.set(gName, action.params.active === 'true');
          break;
        }
        case 'set_layer_visible': {
          const idx = this.resolveLayerIndex(evaluateExpression(action.params.layer || '0', ctx));
          if (this.runtimeLayers[idx]) {
            this.runtimeLayers[idx].visible = action.params.visible === 'true';
          }
          break;
        }
        case 'set_postprocess': {
          if (!this.project.postProcessSettings) {
            this.project.postProcessSettings = {
              enabled: true,
              bloom: false,
              bloomIntensity: 0.9,
              crtScanlines: false,
              crtCurvature: 0.25,
              vignette: true,
              vignetteStrength: 0.45,
              chromaticAberration: false,
              chromaticOffset: 2,
              pixelate: 1,
            };
          }
          const pp = this.project.postProcessSettings;
          const effect = action.params.effect as 'enabled' | 'crtScanlines' | 'bloom' | 'vignette' | 'chromaticAberration';
          const mode = action.params.mode || 'toggle';
          if (effect in pp) {
            const nextVal = mode === 'toggle' ? !pp[effect] : mode === 'true';
            pp[effect] = nextVal;
            if (effect !== 'enabled' && nextVal) {
              pp.enabled = true;
            }
          }
          break;
        }
      }
      return;
    }

    if (!ot) return;

    // Global plugin actions
    if (ot.plugin === 'Audio') {
      switch (action.actionId) {
        case 'play_synth': {
          const vol = toNumber(evaluateExpression(action.params.volume || '-4', ctx));
          const tag = toStringVal(evaluateExpression(action.params.tag || '"sfx"', ctx));
          this.audio.playSynth(action.params.preset || 'coin', vol, tag);
          break;
        }
        case 'play_asset': {
          const name = toStringVal(evaluateExpression(action.params.name || '""', ctx));
          const loop = action.params.loop === 'true';
          const vol = toNumber(evaluateExpression(action.params.volume || '0', ctx));
          const tag = toStringVal(evaluateExpression(action.params.tag || '"music"', ctx));
          this.audio.playAsset(name, this.project.audioAssets || [], loop, vol, tag);
          break;
        }
        case 'set_volume': {
          const tag = toStringVal(evaluateExpression(action.params.tag || '"sfx"', ctx));
          const vol = toNumber(evaluateExpression(action.params.volume || '0', ctx));
          this.audio.setTagVolume(tag, vol);
          break;
        }
        case 'stop_tag': {
          const tag = toStringVal(evaluateExpression(action.params.tag || '"music"', ctx));
          this.audio.stopTag(tag);
          break;
        }
        case 'stop_all':
          this.audio.stopAll();
          break;
      }
      return;
    }

    if (ot.plugin === 'Mouse' && action.actionId === 'set_cursor') {
      this.canvas.style.cursor = action.params.cursor || 'default';
      return;
    }

    if (ot.plugin === 'Dictionary') {
      const key = toStringVal(evaluateExpression(action.params.key || '""', ctx));
      if (action.actionId === 'set_key') {
        this.dictionary.set(key, evaluateExpression(action.params.value || '0', ctx));
      } else if (action.actionId === 'delete_key') {
        this.dictionary.delete(key);
      } else if (action.actionId === 'clear') {
        this.dictionary.clear();
      }
      return;
    }

    if (ot.plugin === 'LocalStorage') {
      const key = toStringVal(evaluateExpression(action.params.key || '""', ctx));
      const storagePrefix = `oc_${this.project.name}_`;
      if (action.actionId === 'set_item') {
        const val = evaluateExpression(action.params.value || '0', ctx);
        Promise.resolve().then(() => {
          try {
            window.localStorage.setItem(storagePrefix + key, JSON.stringify(val));
          } catch {
            // ignore storage quota errors
          }
          this.localStorageLastKey = key;
          this.triggerQueue.push({ kind: 'ls_on_set', extra: { key } });
        });
      } else if (action.actionId === 'get_item') {
        Promise.resolve().then(() => {
          let val: VarValue = '';
          try {
            const raw = window.localStorage.getItem(storagePrefix + key);
            if (raw !== null) val = JSON.parse(raw) as VarValue;
          } catch {
            // ignore
          }
          this.localStorageLastKey = key;
          this.localStorageLastVal = val;
          this.triggerQueue.push({ kind: 'ls_on_get', extra: { key } });
        });
      } else if (action.actionId === 'check_item_exists') {
        Promise.resolve().then(() => {
          let exists = false;
          try {
            exists = window.localStorage.getItem(storagePrefix + key) !== null;
          } catch {
            exists = false;
          }
          this.localStorageLastKey = key;
          this.triggerQueue.push({ kind: exists ? 'ls_on_exists' : 'ls_on_missing', extra: { key } });
        });
      } else if (action.actionId === 'remove_item') {
        try {
          window.localStorage.removeItem(storagePrefix + key);
        } catch {
          // ignore
        }
      }
      return;
    }

    if (ot.plugin === 'Gamepad') {
      if (action.actionId === 'vibrate') {
        const padIdx = Math.trunc(toNumber(evaluateExpression(action.params.gamepadIndex || '0', ctx)));
        const dur = Math.max(10, toNumber(evaluateExpression(action.params.durationMs || '200', ctx)));
        const strong = Math.max(0, Math.min(1, toNumber(evaluateExpression(action.params.strong || '0.8', ctx))));
        const weak = Math.max(0, Math.min(1, toNumber(evaluateExpression(action.params.weak || '0.5', ctx))));
        try {
          const pads = navigator.getGamepads?.() || [];
          const gp = pads[padIdx] as (Gamepad & { vibrationActuator?: { playEffect?: (type: string, params: Record<string, number>) => void } }) | null;
          gp?.vibrationActuator?.playEffect?.('dual-rumble', {
            startDelay: 0,
            duration: dur,
            weakMagnitude: weak,
            strongMagnitude: strong,
          });
        } catch {
          // ignore unsupported gamepad rumble
        }
      }
      return;
    }

    // Visual instance actions (operate ONLY on picked instances in SOL!)
    const picked = this.getSolInstances(sol, ot.id);
    for (const inst of picked) {
      if (inst.destroyed) continue;
      const instCtx = this.createExprContext(sol, inst);

      if (action.behaviorId) {
        const bDef = inst.behaviorDefs.find((b) => b.id === action.behaviorId);
        const bst = bDef ? inst.behaviorState[bDef.id] : undefined;
        if (bDef && bst) {
          this.execBehaviorAction(inst, bDef.type, bDef.id, bst, action, sol, instCtx);
        }
        continue;
      }

      switch (action.actionId) {
        case 'set_position':
          inst.x = toNumber(evaluateExpression(action.params.x || '0', instCtx));
          inst.y = toNumber(evaluateExpression(action.params.y || '0', instCtx));
          break;
        case 'set_x':
          inst.x = toNumber(evaluateExpression(action.params.x || '0', instCtx));
          break;
        case 'set_y':
          inst.y = toNumber(evaluateExpression(action.params.y || '0', instCtx));
          break;
        case 'move_at_angle': {
          const ang = (toNumber(evaluateExpression(action.params.angle || '0', instCtx)) * Math.PI) / 180;
          const dist = toNumber(evaluateExpression(action.params.distance || '0', instCtx));
          inst.x += Math.cos(ang) * dist;
          inst.y += Math.sin(ang) * dist;
          break;
        }
        case 'set_size':
          inst.width = Math.max(1, toNumber(evaluateExpression(action.params.width || '32', instCtx)));
          inst.height = Math.max(1, toNumber(evaluateExpression(action.params.height || '32', instCtx)));
          break;
        case 'set_angle':
          inst.angle = ((toNumber(evaluateExpression(action.params.angle || '0', instCtx)) % 360) + 360) % 360;
          break;
        case 'rotate_clockwise':
          inst.angle =
            (((inst.angle + toNumber(evaluateExpression(action.params.degrees || '0', instCtx))) % 360) + 360) % 360;
          break;
        case 'set_angle_toward': {
          const tx = toNumber(evaluateExpression(action.params.x || '0', instCtx));
          const ty = toNumber(evaluateExpression(action.params.y || '0', instCtx));
          inst.angle = (((Math.atan2(ty - inst.y, tx - inst.x) * 180) / Math.PI) % 360 + 360) % 360;
          break;
        }
        case 'set_opacity':
          inst.opacity = Math.max(0, Math.min(100, toNumber(evaluateExpression(action.params.opacity || '100', instCtx))));
          break;
        case 'set_visible':
          inst.visible = action.params.visible === 'true';
          break;
        case 'set_inst_var':
          inst.instVars[action.params.varName] = evaluateExpression(action.params.value || '0', instCtx);
          break;
        case 'add_inst_var':
          inst.instVars[action.params.varName] =
            toNumber(inst.instVars[action.params.varName] ?? 0) +
            toNumber(evaluateExpression(action.params.value || '1', instCtx));
          break;
        case 'spawn_object': {
          const spawnOt = this.objectTypesById.get(action.params.object);
          if (spawnOt) {
            const layerIdx =
              action.params.layer !== undefined && action.params.layer !== ''
                ? this.resolveLayerIndex(evaluateExpression(action.params.layer, instCtx))
                : inst.layerIndex;
            const spawned = this.spawnRuntimeInstance(spawnOt, layerIdx, inst.x, inst.y);
            this.triggerQueue.push({ kind: 'object_on_created', inst: spawned });
          }
          break;
        }
        case 'destroy':
          this.markDestroy(inst);
          break;
        case 'set_animation': {
          const nextName = toStringVal(evaluateExpression(action.params.name || '""', instCtx));
          if (inst.animName !== nextName) {
            inst.animName = nextName;
            if (action.params.from !== 'current-frame') {
              inst.animFrame = 0;
              inst.animTimer = 0;
            }
            inst.animPlaying = true;
          }
          break;
        }
        case 'set_frame': {
          const f = Math.max(0, Math.trunc(toNumber(evaluateExpression(action.params.frame || '0', instCtx))));
          inst.animFrame = f;
          inst.animTimer = 0;
          break;
        }
        case 'set_anim_speed':
          inst.animSpeedOverride = Math.max(0, toNumber(evaluateExpression(action.params.speed || '8', instCtx)));
          break;
        case 'set_mirrored':
          inst.mirrored = action.params.mirrored === 'true';
          break;
        case 'toggle_mirrored':
          inst.mirrored = !inst.mirrored;
          break;
        case 'set_flipped':
          inst.flipped = action.params.flipped === 'true';
          break;
        case 'set_text':
          inst.text = toStringVal(evaluateExpression(action.params.text || '""', instCtx));
          break;
        case 'append_text':
          inst.text += toStringVal(evaluateExpression(action.params.text || '""', instCtx));
          break;
        case 'set_font_color':
          inst.textColorOverride = toStringVal(evaluateExpression(action.params.color || '"#ffffff"', instCtx));
          break;
        case 'set_font_size':
          inst.textSizeOverride = Math.max(6, toNumber(evaluateExpression(action.params.size || '16', instCtx)));
          break;
        case 'set_spraying':
          inst.particleSpraying = action.params.spraying === 'true';
          break;
        case 'set_rate':
          inst.particleRateOverride = Math.max(0, toNumber(evaluateExpression(action.params.rate || '30', instCtx)));
          break;
        case 'set_tile': {
          const col = Math.trunc(toNumber(evaluateExpression(action.params.col || '0', instCtx)));
          const row = Math.trunc(toNumber(evaluateExpression(action.params.row || '0', instCtx)));
          const tileIdx = Math.trunc(toNumber(evaluateExpression(action.params.tileIndex || '0', instCtx)));
          const mw = inst.mapWidth ?? 0;
          const mh = inst.mapHeight ?? 0;
          if (inst.tileData && col >= 0 && row >= 0 && col < mw && row < mh) {
            inst.tileData[row * mw + col] = tileIdx;
          }
          break;
        }
        case 'clear_tile': {
          const col = Math.trunc(toNumber(evaluateExpression(action.params.col || '0', instCtx)));
          const row = Math.trunc(toNumber(evaluateExpression(action.params.row || '0', instCtx)));
          const mw = inst.mapWidth ?? 0;
          const mh = inst.mapHeight ?? 0;
          if (inst.tileData && col >= 0 && row >= 0 && col < mw && row < mh) {
            inst.tileData[row * mw + col] = -1;
          }
          break;
        }
        case 'clear_map':
          if (inst.tileData) inst.tileData.fill(-1);
          break;
        case 'set_value': {
          const cfg = inst.objectType.sliderConfig;
          const v = toNumber(evaluateExpression(action.params.value || '50', instCtx));
          inst.sliderValue = cfg ? Math.max(cfg.min, Math.min(cfg.max, v)) : v;
          break;
        }
        case 'set_range': {
          if (inst.objectType.sliderConfig) {
            inst.objectType.sliderConfig.min = toNumber(evaluateExpression(action.params.min || '0', instCtx));
            inst.objectType.sliderConfig.max = toNumber(evaluateExpression(action.params.max || '100', instCtx));
          }
          break;
        }
        case 'set_progress': {
          const p = toNumber(evaluateExpression(action.params.progress || '100', instCtx));
          inst.progressValue = Math.max(0, Math.min(100, p));
          break;
        }
      }
    }
  }

  private execBehaviorAction(
    inst: RuntimeInstance,
    bType: BehaviorType,
    bId: string,
    bst: BehaviorRuntimeState,
    action: ActionItem,
    sol: Map<string, RuntimeInstance[] | null>,
    ctx: ExpressionContext
  ): void {
    const setProp = (k: string, v: VarValue) => {
      if (!inst.behaviorProps[bId]) inst.behaviorProps[bId] = {};
      inst.behaviorProps[bId][k] = v;
    };

    switch (bType) {
      case 'Platform':
        if (action.actionId === 'simulate_control') {
          if (action.params.control === 'left') bst.simLeft = true;
          else if (action.params.control === 'right') bst.simRight = true;
          else if (action.params.control === 'jump') bst.simJump = true;
        } else if (action.actionId === 'fall_through') {
          bst.fallThroughTimer = 0.25;
          bst.onFloor = false;
        } else if (action.actionId === 'set_vector_x') {
          bst.vx = toNumber(evaluateExpression(action.params.vx || '0', ctx));
        } else if (action.actionId === 'set_vector_y') {
          bst.vy = toNumber(evaluateExpression(action.params.vy || '0', ctx));
          if (bst.vy < 0) bst.onFloor = false;
        } else if (action.actionId === 'reset_double_jump') {
          bst.doubleJumpAvailable = true;
        } else if (action.actionId === 'set_max_speed') {
          setProp('maxSpeed', Math.max(0, toNumber(evaluateExpression(action.params.speed || '260', ctx))));
        } else if (action.actionId === 'set_enabled') {
          setProp('enabled', action.params.enabled === 'true');
        }
        break;
      case 'Solid':
      case 'JumpThru':
      case 'ScrollTo':
        if (action.actionId === 'set_enabled') {
          setProp('enabled', action.params.enabled === 'true');
        } else if (bType === 'ScrollTo' && action.actionId === 'shake') {
          const mag = toNumber(evaluateExpression(action.params.magnitude || '10', ctx));
          const dur = toNumber(evaluateExpression(action.params.duration || '0.4', ctx));
          const mode = action.params.mode === 'constant' ? 'constant' : 'reducing';
          this.shakes.push({ magnitude: mag, duration: dur, elapsed: 0, mode });
        }
        break;
      case 'EightDirection':
        if (action.actionId === 'simulate_control') {
          if (action.params.control === 'left') bst.simLeft = true;
          else if (action.params.control === 'right') bst.simRight = true;
          else if (action.params.control === 'up') bst.simUp = true;
          else if (action.params.control === 'down') bst.simDown = true;
        } else if (action.actionId === 'stop') {
          bst.eightVx = 0;
          bst.eightVy = 0;
        } else if (action.actionId === 'set_speed') {
          const spd = toNumber(evaluateExpression(action.params.speed || '200', ctx));
          const rad = (bst.eightAngle * Math.PI) / 180;
          bst.eightVx = Math.cos(rad) * spd;
          bst.eightVy = Math.sin(rad) * spd;
        }
        break;
      case 'Bullet':
        if (action.actionId === 'set_speed') {
          const spd = toNumber(evaluateExpression(action.params.speed || '400', ctx));
          const rad = (bst.bulletAngle * Math.PI) / 180;
          bst.bulletVx = Math.cos(rad) * spd;
          bst.bulletVy = Math.sin(rad) * spd;
          bst.bulletInitialized = true;
        } else if (action.actionId === 'set_angle_of_motion') {
          const ang = toNumber(evaluateExpression(action.params.angle || '0', ctx));
          bst.bulletAngle = ((ang % 360) + 360) % 360;
          const spd = bst.bulletInitialized
            ? Math.hypot(bst.bulletVx, bst.bulletVy)
            : toNumber(inst.behaviorProps[bId]?.speed ?? 400);
          const rad = (bst.bulletAngle * Math.PI) / 180;
          bst.bulletVx = Math.cos(rad) * spd;
          bst.bulletVy = Math.sin(rad) * spd;
          bst.bulletInitialized = true;
        } else if (action.actionId === 'set_gravity') {
          setProp('gravity', toNumber(evaluateExpression(action.params.gravity || '0', ctx)));
        } else if (action.actionId === 'set_enabled') {
          setProp('enabled', action.params.enabled === 'true');
        }
        break;
      case 'Sine':
        if (action.actionId === 'set_enabled') setProp('enabled', action.params.enabled === 'true');
        else if (action.actionId === 'set_magnitude')
          setProp('magnitude', toNumber(evaluateExpression(action.params.magnitude || '8', ctx)));
        else if (action.actionId === 'set_period')
          setProp('period', Math.max(0.05, toNumber(evaluateExpression(action.params.period || '2', ctx))));
        break;
      case 'Fade':
        if (action.actionId === 'start_fade' || action.actionId === 'restart_fade') {
          bst.fadeState = 'in';
          bst.fadeElapsed = 0;
        }
        break;
      case 'Flash':
        if (action.actionId === 'flash') {
          bst.flashOnTime = Math.max(0.01, toNumber(evaluateExpression(action.params.onTime || '0.08', ctx)));
          bst.flashOffTime = Math.max(0.01, toNumber(evaluateExpression(action.params.offTime || '0.08', ctx)));
          bst.flashRemaining = Math.max(0.01, toNumber(evaluateExpression(action.params.duration || '1.0', ctx)));
          bst.flashCycleElapsed = 0;
          bst.flashActive = true;
          bst.flashVisible = false;
        } else if (action.actionId === 'stop_flashing') {
          bst.flashActive = false;
          bst.flashVisible = true;
        }
        break;
      case 'Timer':
        if (action.actionId === 'start_timer') {
          const duration = Math.max(0.001, toNumber(evaluateExpression(action.params.duration || '1', ctx)));
          const tag = toStringVal(evaluateExpression(action.params.tag || '""', ctx));
          const type = action.params.type === 'Regular' ? 'Regular' : 'Once';
          bst.timers.set(tag, { tag, duration, elapsed: 0, type, running: true });
        } else if (action.actionId === 'stop_timer') {
          const tag = toStringVal(evaluateExpression(action.params.tag || '""', ctx));
          bst.timers.delete(tag);
        } else if (action.actionId === 'stop_all_timers') {
          bst.timers.clear();
        }
        break;
      case 'DragDrop':
        if (action.actionId === 'drop') {
          if (bst.isDragging) {
            bst.isDragging = false;
            this.triggerQueue.push({ kind: 'dragdrop_on_drop', inst });
          }
        } else if (action.actionId === 'set_enabled') {
          setProp('enabled', action.params.enabled === 'true');
        }
        break;
      case 'Rotate':
        if (action.actionId === 'set_speed') {
          bst.rotateSpeed = toNumber(evaluateExpression(action.params.speed || '90', ctx));
          bst.rotateInitialized = true;
        } else if (action.actionId === 'set_acceleration') {
          setProp('acceleration', toNumber(evaluateExpression(action.params.accel || '0', ctx)));
        } else if (action.actionId === 'set_enabled') {
          setProp('enabled', action.params.enabled === 'true');
        }
        break;
      case 'Tween': {
        const tag = toStringVal(evaluateExpression(action.params.tag || '""', ctx));
        if (action.actionId === 'tween_one') {
          const prop = action.params.property || 'x';
          const end1 = toNumber(evaluateExpression(action.params.endValue || '0', ctx));
          const duration = Math.max(0, toNumber(evaluateExpression(action.params.duration || '1', ctx)));
          const easing = action.params.easing || 'EaseOutQuad';
          const loopMode = (action.params.loop as 'none' | 'loop' | 'pingpong') || 'none';
          const destroyOnFinish = action.params.destroyOnFinish === 'true';
          const baseWidth = inst.objectType.defaultWidth || inst.width || 32;
          const baseHeight = inst.objectType.defaultHeight || inst.height || 32;
          let start1 = inst.x;
          if (prop === 'y') start1 = inst.y;
          else if (prop === 'angle') start1 = inst.angle;
          else if (prop === 'opacity') start1 = inst.opacity;
          else if (prop === 'width') start1 = inst.width;
          else if (prop === 'height') start1 = inst.height;
          else if (prop === 'scale') start1 = baseWidth > 0 ? inst.width / baseWidth : 1;
          bst.tweens.set(tag, {
            tag,
            kind: 'one',
            prop1: prop,
            start1,
            end1,
            baseWidth,
            baseHeight,
            duration,
            elapsed: 0,
            easing,
            loopMode,
            direction: 1,
            paused: false,
            destroyOnFinish,
            currentValue: start1,
            progress: 0,
            finished: false,
          });
        } else if (action.actionId === 'tween_two') {
          const props = action.params.properties || 'position';
          const end1 = toNumber(evaluateExpression(action.params.end1 || '0', ctx));
          const end2 = toNumber(evaluateExpression(action.params.end2 || '0', ctx));
          const duration = Math.max(0, toNumber(evaluateExpression(action.params.duration || '1', ctx)));
          const easing = action.params.easing || 'EaseOutQuad';
          const loopMode = (action.params.loop as 'none' | 'loop' | 'pingpong') || 'none';
          const destroyOnFinish = action.params.destroyOnFinish === 'true';
          const baseWidth = inst.objectType.defaultWidth || inst.width || 32;
          const baseHeight = inst.objectType.defaultHeight || inst.height || 32;
          let start1 = inst.x;
          let start2 = inst.y;
          if (props === 'size') {
            start1 = inst.width;
            start2 = inst.height;
          } else if (props === 'scale') {
            start1 = baseWidth > 0 ? inst.width / baseWidth : 1;
            start2 = baseHeight > 0 ? inst.height / baseHeight : 1;
          }
          bst.tweens.set(tag, {
            tag,
            kind: 'two',
            prop1: props,
            start1,
            end1,
            start2,
            end2,
            baseWidth,
            baseHeight,
            duration,
            elapsed: 0,
            easing,
            loopMode,
            direction: 1,
            paused: false,
            destroyOnFinish,
            currentValue: start1,
            progress: 0,
            finished: false,
          });
        } else if (action.actionId === 'tween_value') {
          const start1 = toNumber(evaluateExpression(action.params.startValue || '0', ctx));
          const end1 = toNumber(evaluateExpression(action.params.endValue || '100', ctx));
          const duration = Math.max(0, toNumber(evaluateExpression(action.params.duration || '1', ctx)));
          const easing = action.params.easing || 'EaseInOutSine';
          const loopMode = (action.params.loop as 'none' | 'loop' | 'pingpong') || 'none';
          bst.tweens.set(tag, {
            tag,
            kind: 'value',
            prop1: 'value',
            start1,
            end1,
            duration,
            elapsed: 0,
            easing,
            loopMode,
            direction: 1,
            paused: false,
            destroyOnFinish: false,
            currentValue: start1,
            progress: 0,
            finished: false,
          });
        } else if (action.actionId === 'stop_tween') {
          if (!tag) bst.tweens.clear();
          else bst.tweens.delete(tag);
        } else if (action.actionId === 'pause_tween') {
          const tw = bst.tweens.get(tag);
          if (tw) tw.paused = true;
        } else if (action.actionId === 'resume_tween') {
          const tw = bst.tweens.get(tag);
          if (tw && !tw.finished) tw.paused = false;
        }
        break;
      }
      case 'Pin':
        if (action.actionId === 'pin_to_object') {
          const targets = this.getSolInstances(sol, action.params.object).filter((t) => !t.destroyed && t !== inst);
          const target = targets[0];
          if (target) {
            const dx = inst.x - target.x;
            const dy = inst.y - target.y;
            const rad = (-target.angle * Math.PI) / 180;
            bst.pinLocalX = dx * Math.cos(rad) - dy * Math.sin(rad);
            bst.pinLocalY = dx * Math.sin(rad) + dy * Math.cos(rad);
            bst.pinRelAngle = inst.angle - target.angle;
            bst.pinnedUid = target.uid;
            bst.pinMode = (action.params.mode as 'both' | 'position' | 'angle') || 'both';
          }
        } else if (action.actionId === 'unpin') {
          bst.pinnedUid = 0;
        }
        break;
      case 'Turret':
        if (action.actionId === 'add_target') {
          if (action.params.object && !bst.turretTargetTypeIds.includes(action.params.object)) {
            bst.turretTargetTypeIds.push(action.params.object);
          }
        } else if (action.actionId === 'clear_targets') {
          bst.turretTargetTypeIds = [];
          bst.turretTargetUid = 0;
        } else if (action.actionId === 'set_range') {
          setProp('range', Math.max(0, toNumber(evaluateExpression(action.params.range || '300', ctx))));
        } else if (action.actionId === 'set_rate_of_fire') {
          setProp('rateOfFire', Math.max(0.02, toNumber(evaluateExpression(action.params.rate || '0.5', ctx))));
        } else if (action.actionId === 'set_rotate_speed') {
          setProp('rotateSpeed', Math.max(0, toNumber(evaluateExpression(action.params.speed || '180', ctx))));
        } else if (action.actionId === 'set_enabled') {
          setProp('enabled', action.params.enabled === 'true');
        }
        break;
      case 'LineOfSight':
        if (action.actionId === 'set_range') {
          setProp('range', Math.max(0, toNumber(evaluateExpression(action.params.range || '350', ctx))));
        } else if (action.actionId === 'set_cone') {
          setProp('coneOfView', Math.max(1, Math.min(360, toNumber(evaluateExpression(action.params.cone || '90', ctx)))));
        } else if (action.actionId === 'set_enabled') {
          setProp('enabled', action.params.enabled === 'true');
        }
        break;
      case 'Pathfinding':
        if (action.actionId === 'find_path') {
          const tx = toNumber(evaluateExpression(action.params.x || '0', ctx));
          const ty = toNumber(evaluateExpression(action.params.y || '0', ctx));
          const bDef = inst.behaviorDefs.find((b) => b.id === bId);
          if (bDef) {
            findAStarPath(inst, bDef, bst, tx, ty, this.createHostAPI());
          }
        } else if (action.actionId === 'move_along_path') {
          if (bst.pathNodes.length > 0) {
            bst.pathNodeIndex = 0;
            bst.pathMoving = true;
          }
        } else if (action.actionId === 'stop') {
          bst.pathMoving = false;
          bst.pathSpeed = 0;
        } else if (action.actionId === 'regenerate_map') {
          bst.pathGridDirty = true;
        } else if (action.actionId === 'set_speed') {
          setProp('speed', Math.max(1, toNumber(evaluateExpression(action.params.speed || '180', ctx))));
        } else if (action.actionId === 'set_enabled') {
          setProp('enabled', action.params.enabled === 'true');
        }
        break;
      case 'Physics': {
        const host = this.createHostAPI();
        if (action.actionId === 'apply_force') {
          const fx = toNumber(evaluateExpression(action.params.fx || '0', ctx));
          const fy = toNumber(evaluateExpression(action.params.fy || '0', ctx));
          applyPhysicsForce(inst, fx, fy, host);
        } else if (action.actionId === 'apply_force_at_angle') {
          const force = toNumber(evaluateExpression(action.params.force || '0', ctx));
          const angle = toNumber(evaluateExpression(action.params.angle || '0', ctx));
          applyPhysicsForceAtAngle(inst, force, angle, host);
        } else if (action.actionId === 'apply_impulse') {
          const jx = toNumber(evaluateExpression(action.params.jx || '0', ctx));
          const jy = toNumber(evaluateExpression(action.params.jy || '0', ctx));
          applyPhysicsImpulse(inst, jx, jy, host);
        } else if (action.actionId === 'apply_impulse_at_angle') {
          const imp = toNumber(evaluateExpression(action.params.impulse || '0', ctx));
          const angle = toNumber(evaluateExpression(action.params.angle || '0', ctx));
          applyPhysicsImpulseAtAngle(inst, imp, angle, host);
        } else if (action.actionId === 'set_velocity') {
          const vx = toNumber(evaluateExpression(action.params.vx || '0', ctx));
          const vy = toNumber(evaluateExpression(action.params.vy || '0', ctx));
          setPhysicsVelocity(inst, vx, vy, host);
        } else if (action.actionId === 'set_angular_velocity') {
          const vAng = toNumber(evaluateExpression(action.params.vAng || '0', ctx));
          setPhysicsAngularVelocity(inst, vAng, host);
        } else if (action.actionId === 'set_gravity_scale') {
          const scale = toNumber(evaluateExpression(action.params.scale || '1', ctx));
          setPhysicsGravityScale(inst, scale, host);
        } else if (action.actionId === 'set_immovable') {
          setPhysicsImmovable(inst, action.params.immovable === 'true', host);
        } else if (action.actionId === 'create_distance_joint') {
          const targets = this.getSolInstances(sol, action.params.other).filter((t) => !t.destroyed && t !== inst);
          const distVal = toNumber(evaluateExpression(action.params.distance || '0', ctx));
          const stiff = toNumber(evaluateExpression(action.params.stiffness || '0.8', ctx));
          if (targets[0]) {
            createPhysicsDistanceJoint(inst, targets[0], distVal > 0 ? distVal : undefined, stiff, host);
          }
        }
        break;
      }
    }
  }

  private resolveLayerIndex(layerRef: VarValue): number {
    if (typeof layerRef === 'number') {
      return Math.max(0, Math.min(this.runtimeLayers.length - 1, Math.trunc(layerRef)));
    }
    const name = String(layerRef);
    const idx = this.runtimeLayers.findIndex((l) => l.name === name);
    return idx >= 0 ? idx : 0;
  }

  private updateCamera(): void {
    const scrollTargets = this.instances.filter(
      (i) =>
        !i.destroyed &&
        i.behaviorDefs.some((b) => b.type === 'ScrollTo' && toBool(i.behaviorProps[b.id]?.enabled ?? true))
    );

    if (scrollTargets.length > 0) {
      let sumX = 0;
      let sumY = 0;
      for (const t of scrollTargets) {
        sumX += t.x;
        sumY += t.y;
      }
      this.scrollX = sumX / scrollTargets.length;
      this.scrollY = sumY / scrollTargets.length;
    }

    // Clamp to layout bounds
    const halfW = this.project.viewportWidth * 0.5;
    const halfH = this.project.viewportHeight * 0.5;
    if (this.currentLayout.width >= this.project.viewportWidth) {
      this.scrollX = Math.max(halfW, Math.min(this.currentLayout.width - halfW, this.scrollX));
    } else {
      this.scrollX = this.currentLayout.width * 0.5;
    }
    if (this.currentLayout.height >= this.project.viewportHeight) {
      this.scrollY = Math.max(halfH, Math.min(this.currentLayout.height - halfH, this.scrollY));
    } else {
      this.scrollY = this.currentLayout.height * 0.5;
    }
  }

  private updateShake(): void {
    let sx = 0;
    let sy = 0;
    for (let i = this.shakes.length - 1; i >= 0; i--) {
      const sh = this.shakes[i];
      sh.elapsed += this.dt;
      if (sh.elapsed >= sh.duration) {
        this.shakes.splice(i, 1);
        continue;
      }
      const factor = sh.mode === 'reducing' ? 1 - sh.elapsed / sh.duration : 1;
      const mag = sh.magnitude * factor;
      sx += (Math.random() * 2 - 1) * mag;
      sy += (Math.random() * 2 - 1) * mag;
    }
    this.shakeOffsetX = sx;
    this.shakeOffsetY = sy;
  }

  private testInstanceOverlap(a: RuntimeInstance, b: RuntimeInstance): boolean {
    if (a.objectType.plugin === 'Tilemap' && b.objectType.plugin === 'Tilemap') {
      return testOverlap(this.getCollidableRect(a), this.getCollidableRect(b));
    }
    if (a.objectType.plugin === 'Tilemap') {
      const rectB = this.getCollidableRect(b);
      for (const tr of getTilemapSolidRects(a)) {
        if (testOverlap(tr, rectB)) return true;
      }
      return false;
    }
    if (b.objectType.plugin === 'Tilemap') {
      const rectA = this.getCollidableRect(a);
      for (const tr of getTilemapSolidRects(b)) {
        if (testOverlap(rectA, tr)) return true;
      }
      return false;
    }
    return testOverlap(this.getCollidableRect(a), this.getCollidableRect(b));
  }

  private pollGamepads(): void {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    try {
      const pads = navigator.getGamepads();
      this.gamepadAxes = [];
      this.gamepadButtons = [];
      for (let p = 0; p < pads.length; p++) {
        const gp = pads[p];
        if (!gp || !gp.connected) continue;
        this.gamepadAxes[p] = gp.axes ? [...gp.axes] : [];
        const btns = gp.buttons ? gp.buttons.map((b) => Boolean(b.pressed)) : [];
        this.gamepadButtons[p] = btns;
        const prev = this.prevGamepadButtons[p] || [];
        for (let b = 0; b < btns.length; b++) {
          if (btns[b] && !prev[b]) {
            this.triggerQueue.push({
              kind: 'gamepad_on_button_pressed',
              extra: { pad: String(p), button: String(b) },
            });
          }
        }
        this.prevGamepadButtons[p] = btns;
      }
    } catch {
      // ignore sandboxed gamepad access errors
    }
  }

  private hasVirtualJoystickPlugin(): boolean {
    return (
      Boolean(this.project.virtualJoystickSettings?.enabled) ||
      this.project.objectTypes.some((o) => o.plugin === 'VirtualJoystick')
    );
  }

  private stepVirtualControls(): void {
    if (!this.hasVirtualJoystickPlugin()) {
      this.virtualJoyActive = false;
      this.virtualJoyX = 0;
      this.virtualJoyY = 0;
      this.virtualJoyDistance = 0;
      this.virtualBtnA = false;
      this.virtualBtnB = false;
      return;
    }
    const vh = this.project.viewportHeight;
    const vw = this.project.viewportWidth;
    const size = this.project.virtualJoystickSettings?.size ?? 54;
    const joyCenterX = 84;
    const joyCenterY = vh - 84;
    const btnAX = vw - 76;
    const btnAY = vh - 68;
    const btnBX = vw - 144;
    const btnBY = vh - 96;

    const pointerDown = this.mouseButtonsDown.has(0) || this.touchActive;
    const px = this.mouseAbsX;
    const py = this.mouseAbsY;

    if (pointerDown) {
      const distJoy = Math.hypot(px - joyCenterX, py - joyCenterY);
      if (distJoy <= size * 1.8) {
        this.virtualJoyActive = true;
        const clampedDist = Math.min(size, distJoy);
        const norm = clampedDist / size;
        const angle = Math.atan2(py - joyCenterY, px - joyCenterX);
        this.virtualJoyX = Math.cos(angle) * norm;
        this.virtualJoyY = Math.sin(angle) * norm;
        this.virtualJoyDistance = norm;
        this.virtualJoyAngle = ((angle * 180) / Math.PI + 360) % 360;
      } else {
        this.virtualJoyActive = false;
        this.virtualJoyX = 0;
        this.virtualJoyY = 0;
        this.virtualJoyDistance = 0;
      }
      this.virtualBtnA = Math.hypot(px - btnAX, py - btnAY) <= 32;
      this.virtualBtnB = Math.hypot(px - btnBX, py - btnBY) <= 32;
    } else {
      this.virtualJoyActive = false;
      this.virtualJoyX = 0;
      this.virtualJoyY = 0;
      this.virtualJoyDistance = 0;
      this.virtualBtnA = false;
      this.virtualBtnB = false;
    }
  }

  private stepGUIControls(): void {
    const pointerDown = this.mouseButtonsDown.has(0);
    const justPressed = this.mouseJustPressed.has(0);
    const justReleased = this.mouseJustReleased.has(0);

    for (const inst of this.instances) {
      if (inst.destroyed || !inst.visible) continue;
      const plugin = inst.objectType.plugin;
      if (plugin !== 'Button' && plugin !== 'Slider') continue;

      const layer = this.runtimeLayers[inst.layerIndex];
      const parallaxX = (layer?.parallaxX ?? 100) / 100;
      const parallaxY = (layer?.parallaxY ?? 100) / 100;
      const vw = this.project.viewportWidth;
      const vh = this.project.viewportHeight;
      const worldMouseX = this.mouseAbsX + (this.scrollX - vw * 0.5) * parallaxX;
      const worldMouseY = this.mouseAbsY + (this.scrollY - vh * 0.5) * parallaxY;

      const inside =
        worldMouseX >= inst.x &&
        worldMouseX <= inst.x + inst.width &&
        worldMouseY >= inst.y &&
        worldMouseY <= inst.y + inst.height;

      if (plugin === 'Button') {
        inst.btnHovered = inside;
        if (inside && justPressed) {
          inst.btnPressed = true;
        }
        if (justReleased) {
          if (inst.btnPressed && inside) {
            this.triggerQueue.push({ kind: 'button_on_clicked', inst });
          }
          inst.btnPressed = false;
        }
        if (!pointerDown) {
          inst.btnPressed = false;
        }
      } else if (plugin === 'Slider') {
        const cfg = inst.objectType.sliderConfig;
        const min = cfg?.min ?? 0;
        const max = cfg?.max ?? 100;
        const step = cfg?.step ?? 1;
        if (inside && justPressed) {
          inst.sliderDragging = true;
        }
        if (!pointerDown || justReleased) {
          inst.sliderDragging = false;
        }
        if (inst.sliderDragging) {
          const ratio = Math.max(0, Math.min(1, (worldMouseX - inst.x) / Math.max(1, inst.width)));
          let nextVal = min + ratio * (max - min);
          if (step > 0) {
            nextVal = Math.round(nextVal / step) * step;
          }
          nextVal = Math.max(min, Math.min(max, Math.round(nextVal * 1000) / 1000));
          if (inst.sliderValue !== nextVal) {
            inst.sliderValue = nextVal;
            this.triggerQueue.push({ kind: 'slider_on_changed', inst });
          }
        }
      }
    }
  }

  // ==================== RENDERING ====================

  private render(): void {
    const ppSettings = this.project.postProcessSettings;
    const usePostProcess = Boolean(ppSettings?.enabled && this.offscreenCtx && this.offscreenCanvas && this.postProcess);
    const ctx = usePostProcess ? this.offscreenCtx! : this.ctx;
    const vw = this.project.viewportWidth;
    const vh = this.project.viewportHeight;

    ctx.save();
    ctx.imageSmoothingEnabled = !this.project.pixelRounding;

    // Layout background
    ctx.fillStyle = this.currentLayout.backgroundColor || '#0b0e14';
    ctx.fillRect(0, 0, vw, vh);

    const camCenterX = this.scrollX + this.shakeOffsetX;
    const camCenterY = this.scrollY + this.shakeOffsetY;

    // Render layers in order (index 0 = bottom)
    for (let layerIdx = 0; layerIdx < this.runtimeLayers.length; layerIdx++) {
      const layer = this.runtimeLayers[layerIdx];
      if (!layer.visible || layer.opacity <= 0) continue;

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity / 100));

      if (!layer.transparent && layer.backgroundColor) {
        ctx.fillStyle = layer.backgroundColor;
        ctx.fillRect(0, 0, vw, vh);
      }

      const px = layer.parallaxX / 100;
      const py = layer.parallaxY / 100;
      const offsetX = vw * 0.5 - (camCenterX - vw * 0.5) * px - vw * 0.5;
      const offsetY = vh * 0.5 - (camCenterY - vh * 0.5) * py - vh * 0.5;

      ctx.translate(
        this.project.pixelRounding ? Math.round(offsetX) : offsetX,
        this.project.pixelRounding ? Math.round(offsetY) : offsetY
      );

      for (const inst of this.instances) {
        if (inst.destroyed || inst.layerIndex !== layerIdx || !inst.visible || inst.opacity <= 0) continue;

        // Check Flash behavior visibility
        const flashDef = inst.behaviorDefs.find((b) => b.type === 'Flash');
        if (flashDef && inst.behaviorState[flashDef.id] && !inst.behaviorState[flashDef.id].flashVisible) {
          continue;
        }

        this.renderInstance(ctx, inst);
      }

      ctx.restore();
    }

    // Virtual Joystick Overlay
    if (this.hasVirtualJoystickPlugin()) {
      this.renderVirtualControls(ctx);
    }

    ctx.restore();

    if (usePostProcess && this.postProcess && ppSettings) {
      const ok = this.postProcess.render(this.ctx, ppSettings, this.gameTime);
      if (!ok && this.offscreenCanvas) {
        this.ctx.drawImage(this.offscreenCanvas, 0, 0);
      }
    }
  }

  private renderVirtualControls(ctx: CanvasRenderingContext2D): void {
    const vh = this.project.viewportHeight;
    const vw = this.project.viewportWidth;
    const size = this.project.virtualJoystickSettings?.size ?? 54;
    const jx = 84;
    const jy = vh - 84;

    ctx.save();
    // Base ring
    ctx.beginPath();
    ctx.arc(jx, jy, size, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
    ctx.stroke();

    // Thumbstick knob
    ctx.beginPath();
    ctx.arc(jx + this.virtualJoyX * size * 0.75, jy + this.virtualJoyY * size * 0.75, size * 0.38, 0, Math.PI * 2);
    ctx.fillStyle = this.virtualJoyActive ? 'rgba(56, 189, 248, 0.85)' : 'rgba(226, 232, 240, 0.55)';
    ctx.fill();

    // Action buttons A & B
    if (this.project.virtualJoystickSettings?.showActionButtons !== false) {
      const drawBtn = (bx: number, by: number, label: string, active: boolean, color: string) => {
        ctx.beginPath();
        ctx.arc(bx, by, 26, 0, Math.PI * 2);
        ctx.fillStyle = active ? color : 'rgba(15, 23, 42, 0.5)';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = color;
        ctx.stroke();
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, bx, by + 1);
      };
      drawBtn(vw - 76, vh - 68, 'A', this.virtualBtnA, 'rgba(34, 211, 238, 0.75)');
      drawBtn(vw - 144, vh - 96, 'B', this.virtualBtnB, 'rgba(244, 63, 94, 0.75)');
    }
    ctx.restore();
  }

  private renderInstance(ctx: CanvasRenderingContext2D, inst: RuntimeInstance): void {
    const ot = inst.objectType;
    ctx.save();
    ctx.globalAlpha *= Math.max(0, Math.min(1, inst.opacity / 100));

    const rx = this.project.pixelRounding ? Math.round(inst.x) : inst.x;
    const ry = this.project.pixelRounding ? Math.round(inst.y) : inst.y;

    if (ot.plugin === 'Sprite') {
      const frame = this.getCurrentFrame(inst);
      const ox = frame ? frame.originX : 0.5;
      const oy = frame ? frame.originY : 0.5;

      ctx.translate(rx, ry);
      if (inst.angle !== 0) ctx.rotate((inst.angle * Math.PI) / 180);
      ctx.scale(inst.mirrored ? -1 : 1, inst.flipped ? -1 : 1);

      const drawX = -ox * inst.width;
      const drawY = -oy * inst.height;

      if (frame?.dataUrl) {
        let img = this.imageCache.get(frame.dataUrl);
        if (!img) {
          img = new Image();
          img.src = frame.dataUrl;
          this.imageCache.set(frame.dataUrl, img);
        }
        if (img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, drawX, drawY, inst.width, inst.height);
        } else {
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(drawX, drawY, inst.width, inst.height);
        }
      } else {
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(drawX, drawY, inst.width, inst.height);
      }
    } else if (ot.plugin === 'TiledBackground') {
      ctx.translate(rx, ry);
      if (inst.angle !== 0) ctx.rotate((inst.angle * Math.PI) / 180);

      const url = ot.tiledBgConfig?.imageDataUrl;
      if (url) {
        let img = this.imageCache.get(url);
        if (!img) {
          img = new Image();
          img.src = url;
          this.imageCache.set(url, img);
        }
        if (img.complete && img.naturalWidth > 0) {
          let pat = this.patternCache.get(url);
          if (pat === undefined) {
            pat = ctx.createPattern(img, 'repeat');
            this.patternCache.set(url, pat);
          }
          if (pat) {
            ctx.fillStyle = pat;
            ctx.fillRect(0, 0, inst.width, inst.height);
          }
        } else {
          ctx.fillStyle = '#334155';
          ctx.fillRect(0, 0, inst.width, inst.height);
        }
      } else {
        ctx.fillStyle = '#334155';
        ctx.fillRect(0, 0, inst.width, inst.height);
      }
    } else if (ot.plugin === 'Text') {
      const cfg = ot.textConfig;
      const fontFamily = cfg?.fontFamily || 'Plus Jakarta Sans, sans-serif';
      const fontSize = inst.textSizeOverride ?? cfg?.fontSize ?? 16;
      const color = inst.textColorOverride ?? cfg?.color ?? '#f8fafc';
      const lineHeight = fontSize * (cfg?.lineHeight ?? 1.25);

      ctx.translate(rx, ry);
      if (inst.angle !== 0) ctx.rotate((inst.angle * Math.PI) / 180);

      const parsedLines = parseBBCodeLines(
        inst.text,
        cfg?.bold ?? false,
        cfg?.italic ?? false,
        color
      );

      ctx.textBaseline = 'top';
      let curY = 0;
      if (cfg?.verticalAlign === 'center') {
        curY = Math.max(0, (inst.height - parsedLines.length * lineHeight) * 0.5);
      } else if (cfg?.verticalAlign === 'bottom') {
        curY = Math.max(0, inst.height - parsedLines.length * lineHeight);
      }

      for (const segs of parsedLines) {
        let lineWidth = 0;
        const measured = segs.map((seg) => {
          ctx.font = `${seg.italic ? 'italic ' : ''}${seg.bold ? 'bold ' : ''}${fontSize}px ${fontFamily}`;
          const w = ctx.measureText(seg.text).width;
          lineWidth += w;
          return { seg, w };
        });

        let curX = 0;
        if (cfg?.align === 'center') curX = (inst.width - lineWidth) * 0.5;
        else if (cfg?.align === 'right') curX = inst.width - lineWidth;

        for (const item of measured) {
          ctx.font = `${item.seg.italic ? 'italic ' : ''}${item.seg.bold ? 'bold ' : ''}${fontSize}px ${fontFamily}`;
          ctx.fillStyle = item.seg.color;
          ctx.fillText(item.seg.text, curX, curY);
          curX += item.w;
        }
        curY += lineHeight;
      }
    } else if (ot.plugin === 'Particles') {
      for (const p of inst.particles) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size);
        ctx.restore();
      }
    } else if (ot.plugin === 'Tilemap') {
      const cfg = ot.tilemapConfig;
      const tileData = inst.tileData;
      if (cfg && tileData) {
        const tw = cfg.tileWidth || 32;
        const th = cfg.tileHeight || 32;
        const mw = inst.mapWidth || cfg.columns || 20;
        const mh = inst.mapHeight || cfg.rows || 15;
        const url = cfg.tilesetDataUrl || this.getDefaultTilesetUrl();
        let img = url ? this.imageCache.get(url) : undefined;
        if (url && !img) {
          img = new Image();
          img.src = url;
          this.imageCache.set(url, img);
        }
        ctx.imageSmoothingEnabled = false;
        const srcTileW = cfg.sourceTileWidth || 16;
        const srcTileH = cfg.sourceTileHeight || srcTileW;
        const minValidTile = cfg.allowZeroTile ? 0 : 1;
        for (let r = 0; r < mh; r++) {
          for (let c = 0; c < mw; c++) {
            const tileId = tileData[r * mw + c];
            if (tileId === undefined || tileId < minValidTile) continue;
            const dx = rx + c * tw;
            const dy = ry + r * th;
            if (img && img.complete && img.naturalWidth > 0) {
              const tilesPerRow = Math.max(1, Math.floor(img.naturalWidth / srcTileW));
              const sx = (tileId % tilesPerRow) * srcTileW;
              const sy = Math.floor(tileId / tilesPerRow) * srcTileH;
              ctx.drawImage(img, sx, sy, srcTileW, srcTileH, dx, dy, tw, th);
            } else {
              ctx.fillStyle = '#475569';
              ctx.fillRect(dx, dy, tw, th);
            }
          }
        }
      }
    } else if (ot.plugin === 'Button') {
      const cfg = ot.buttonConfig;
      const bg = inst.btnPressed
        ? cfg?.activeBgColor || '#0284c7'
        : inst.btnHovered
        ? cfg?.hoverBgColor || '#0ea5e9'
        : cfg?.bgColor || '#0369a1';
      const radius = cfg?.borderRadius ?? 6;
      ctx.translate(rx, ry);
      if (inst.angle !== 0) ctx.rotate((inst.angle * Math.PI) / 180);
      ctx.beginPath();
      ctx.roundRect(0, 0, inst.width, inst.height, radius);
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = cfg?.textColor || '#ffffff';
      ctx.font = `600 ${cfg?.fontSize ?? 13}px ${cfg?.fontFamily || 'sans-serif'}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(inst.text || cfg?.text || 'Button', inst.width * 0.5, inst.height * 0.5 + (inst.btnPressed ? 1 : 0));
    } else if (ot.plugin === 'Slider') {
      const cfg = ot.sliderConfig;
      const min = cfg?.min ?? 0;
      const max = cfg?.max ?? 100;
      const val = inst.sliderValue ?? cfg?.initialValue ?? 50;
      const ratio = max > min ? Math.max(0, Math.min(1, (val - min) / (max - min))) : 0;
      ctx.translate(rx, ry);
      const trackH = Math.max(6, inst.height * 0.32);
      const trackY = (inst.height - trackH) * 0.5;
      ctx.beginPath();
      ctx.roundRect(0, trackY, inst.width, trackH, trackH * 0.5);
      ctx.fillStyle = cfg?.trackColor || '#1e293b';
      ctx.fill();

      ctx.beginPath();
      ctx.roundRect(0, trackY, inst.width * ratio, trackH, trackH * 0.5);
      ctx.fillStyle = cfg?.fillColor || '#06b6d4';
      ctx.fill();

      const thumbR = Math.max(7, inst.height * 0.42);
      ctx.beginPath();
      ctx.arc(inst.width * ratio, inst.height * 0.5, thumbR, 0, Math.PI * 2);
      ctx.fillStyle = cfg?.thumbColor || '#f8fafc';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = cfg?.fillColor || '#06b6d4';
      ctx.stroke();
    } else if (ot.plugin === 'ProgressBar') {
      const cfg = ot.progressBarConfig;
      const val = Math.max(0, Math.min(100, inst.progressValue ?? cfg?.initialProgress ?? 100));
      const radius = cfg?.borderRadius ?? 6;
      ctx.translate(rx, ry);
      ctx.beginPath();
      ctx.roundRect(0, 0, inst.width, inst.height, radius);
      ctx.fillStyle = cfg?.bgColor || '#0f172a';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();

      if (val > 0) {
        ctx.beginPath();
        ctx.roundRect(2, 2, Math.max(4, (inst.width - 4) * (val / 100)), Math.max(2, inst.height - 4), Math.max(2, radius - 2));
        ctx.fillStyle = cfg?.fillColor || '#10b981';
        ctx.fill();
      }
      if (cfg?.showText !== false) {
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${Math.round(val)}%`, inst.width * 0.5, inst.height * 0.5);
      }
    }

    ctx.restore();
  }
}
