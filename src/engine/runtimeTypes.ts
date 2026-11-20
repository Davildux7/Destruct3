import { BehaviorDef, ObjectType, Point2D, VarValue } from './types';
import { CollidableRect } from './collision';

export interface ParticleDot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  age: number;
  lifetime: number;
  color: string;
  alpha: number;
}

export interface TimerEntry {
  tag: string;
  duration: number;
  elapsed: number;
  type: 'Once' | 'Regular';
  running: boolean;
}

export interface TweenEntry {
  tag: string;
  kind: 'one' | 'two' | 'value';
  prop1: string;
  prop2?: string;
  start1: number;
  end1: number;
  start2?: number;
  end2?: number;
  baseWidth?: number;
  baseHeight?: number;
  duration: number;
  elapsed: number;
  easing: string;
  loopMode: 'none' | 'loop' | 'pingpong';
  direction: 1 | -1;
  paused: boolean;
  destroyOnFinish: boolean;
  currentValue: number;
  progress: number;
  finished?: boolean;
}

export interface BehaviorRuntimeState {
  // Platform
  vx: number;
  vy: number;
  onFloor: boolean;
  wasOnFloor: boolean;
  wasFalling: boolean;
  doubleJumpAvailable: boolean;
  jumpSustainRemaining: number;
  fallThroughTimer: number;
  byLeftWall: boolean;
  byRightWall: boolean;
  simLeft: boolean;
  simRight: boolean;
  simJump: boolean;
  simUp: boolean;
  simDown: boolean;

  // Bullet
  bulletAngle: number;
  bulletVx: number;
  bulletVy: number;
  bulletInitialized: boolean;

  // EightDirection
  eightVx: number;
  eightVy: number;
  eightAngle: number;

  // Sine
  sineElapsed: number;
  sineValue: number;
  sineLastOffset: number;
  sineBaseOpacity?: number;

  // Fade
  fadeState: 'idle' | 'in' | 'wait' | 'out' | 'done';
  fadeElapsed: number;

  // Flash
  flashActive: boolean;
  flashOnTime: number;
  flashOffTime: number;
  flashRemaining: number;
  flashCycleElapsed: number;
  flashVisible: boolean;

  // Timer
  timers: Map<string, TimerEntry>;

  // DragDrop
  isDragging: boolean;
  dragOffsetX: number;
  dragOffsetY: number;

  // Rotate
  rotateSpeed: number;
  rotateInitialized: boolean;

  // Tween
  tweens: Map<string, TweenEntry>;

  // Pin
  pinnedUid: number;
  pinMode: 'both' | 'position' | 'angle';
  pinLocalX: number;
  pinLocalY: number;
  pinRelAngle: number;

  // Turret
  turretTargetTypeIds: string[];
  turretTargetUid: number;
  turretCooldown: number;
  turretTargetLastPos: Map<number, { x: number; y: number; vx: number; vy: number }>;

  // Pathfinding
  pathNodes: Point2D[];
  pathNodeIndex: number;
  pathMoving: boolean;
  pathSpeed: number;
  pathMovingAngle: number;
  pathGridDirty: boolean;

  // Physics (rigid body properties & velocity)
  physicsVx: number;
  physicsVy: number;
  physicsVAng: number;
  physicsMass: number;
  physicsShape: 'box' | 'circle';
  physicsRegistered: boolean;
}

export interface RuntimeInstance {
  uid: number;
  iid: number;
  objectType: ObjectType;
  layerIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number; // degrees
  opacity: number; // 0..100
  visible: boolean;
  mirrored: boolean;
  flipped: boolean;
  destroyed: boolean;
  instVars: Record<string, VarValue>;
  behaviorDefs: BehaviorDef[];
  behaviorProps: Record<string, Record<string, VarValue>>;
  behaviorState: Record<string, BehaviorRuntimeState>;

  // Sprite animation state
  animName: string;
  animFrame: number;
  animTimer: number;
  animSpeedOverride: number | null;
  animPlaying: boolean;
  animPingPongDir: 1 | -1;

  // Text state
  text: string;
  textColorOverride?: string;
  textSizeOverride?: number;

  // Particles state
  particles: ParticleDot[];
  particleEmitAccum: number;
  particleSpraying: boolean;
  particleOneShotDone: boolean;
  particleRateOverride?: number;

  // Tilemap state
  tileData?: number[];
  mapWidth?: number;
  mapHeight?: number;

  // GUI control states
  btnHovered?: boolean;
  btnPressed?: boolean;
  sliderValue?: number;
  sliderDragging?: boolean;
  progressValue?: number;
}

export interface InputSnapshot {
  keysDown: Set<string>;
  mouseX: number; // layout world X
  mouseY: number; // layout world Y
  mouseAbsX: number; // viewport X
  mouseAbsY: number; // viewport Y
  mouseButtonsDown: Set<number>;
  mouseJustPressed: Set<number>;
  mouseJustReleased: Set<number>;
  touchActive: boolean;
  touchX: number;
  touchY: number;

  // Gamepad state
  gamepadAxes: number[][];
  gamepadButtons: boolean[][];

  // Virtual touch controls
  virtualJoyActive: boolean;
  virtualJoyX: number; // -1..1
  virtualJoyY: number; // -1..1
  virtualJoyAngle: number; // degrees
  virtualJoyDistance: number; // 0..1
  virtualBtnA: boolean;
  virtualBtnB: boolean;
}

export interface RuntimeHostAPI {
  dt: number;
  layoutWidth: number;
  layoutHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  scrollX: number;
  scrollY: number;
  input: InputSnapshot;
  getInstancesByBehavior: (type: string) => RuntimeInstance[];
  getInstancesByObjectTypeId: (objectTypeId: string) => RuntimeInstance[];
  getInstanceByUid: (uid: number) => RuntimeInstance | undefined;
  getAllInstances: () => RuntimeInstance[];
  findObjectTypeByName: (name: string) => ObjectType | undefined;
  getCollidableRect: (inst: RuntimeInstance) => CollidableRect;
  raycastSolids: (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    ignoreInstA?: RuntimeInstance,
    ignoreInstB?: RuntimeInstance
  ) => boolean;
  queueTrigger: (eventName: string, inst: RuntimeInstance, extra?: Record<string, string>) => void;
  destroyInstance: (inst: RuntimeInstance) => void;
  triggerShake: (magnitude: number, duration: number, mode: 'reducing' | 'constant') => void;
  getPhysicsWorld?: () => any;
}
