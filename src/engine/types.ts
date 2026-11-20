/**
 * Core Project & Engine Data Model (100% serializable JSON).
 * Angles are always in degrees (0 = right, increasing clockwise: 90 = down, 180 = left, 270 = up).
 * Distances & positions are in pixels. Indices for frames, layers, and arrays are 0-based.
 */

export type PluginType =
  | 'Sprite'
  | 'TiledBackground'
  | 'Text'
  | 'Particles'
  | 'Tilemap'
  | 'Button'
  | 'Slider'
  | 'ProgressBar'
  | 'System'
  | 'Keyboard'
  | 'Mouse'
  | 'Touch'
  | 'Audio'
  | 'LocalStorage'
  | 'Dictionary'
  | 'Gamepad'
  | 'VirtualJoystick';

export type BehaviorType =
  | 'Platform'
  | 'Solid'
  | 'JumpThru'
  | 'EightDirection'
  | 'Bullet'
  | 'Sine'
  | 'Fade'
  | 'Flash'
  | 'Timer'
  | 'ScrollTo'
  | 'BoundTo'
  | 'DestroyOutside'
  | 'Wrap'
  | 'DragDrop'
  | 'Rotate'
  | 'Tween'
  | 'Pin'
  | 'Turret'
  | 'LineOfSight'
  | 'Pathfinding'
  | 'Physics';

export type VarValueType = 'number' | 'string' | 'boolean';
export type VarValue = number | string | boolean;

export interface Point2D {
  x: number;
  y: number;
}

export interface GlobalVariable {
  id: string;
  name: string;
  type: VarValueType;
  initialValue: VarValue;
  description?: string;
}

export interface InstVarDef {
  id: string;
  name: string;
  type: VarValueType;
  initialValue: VarValue;
}

export interface BehaviorDef {
  id: string;
  type: BehaviorType;
  name: string;
  properties: Record<string, VarValue>;
}

export interface SpriteFrame {
  id: string;
  dataUrl: string;
  width: number;
  height: number;
  originX: number; // normalized 0..1 (e.g. 0.5 = center)
  originY: number; // normalized 0..1
  duration?: number; // multiplier (default 1)
  collisionPoly?: Point2D[]; // normalized 0..1 vertices if custom
}

export interface SpriteAnimation {
  name: string;
  speed: number; // FPS
  loop: boolean;
  repeatCount: number;
  pingPong: boolean;
  frames: SpriteFrame[];
}

export interface SpriteConfig {
  animations: SpriteAnimation[];
  defaultAnimation: string;
}

export interface TiledBgConfig {
  imageDataUrl: string;
  imageWidth: number;
  imageHeight: number;
}

export interface TextConfig {
  initialText: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  verticalAlign: 'top' | 'center' | 'bottom';
  lineHeight: number;
}

export interface ParticlesConfig {
  rate: number; // particles per second (continuous) or total count (one-shot)
  sprayCone: number; // degrees
  type: 'continuous' | 'one-shot';
  speed: number;
  size: number;
  opacity: number; // 0..100
  lifetime: number; // seconds
  acceleration: number;
  gravity: number;
  angleRandomiser: number;
  speedRandomiser: number;
  sizeRandomiser: number;
  growRate: number;
  color: string;
  endColor?: string;
}

export interface TilemapConfig {
  tilesetDataUrl: string;
  tileWidth: number;
  tileHeight: number;
  sourceTileWidth?: number;
  sourceTileHeight?: number;
  allowZeroTile?: boolean;
  columns: number;
  rows: number;
  solidTiles: number[]; // indices of solid collidable tiles
}

export interface ButtonConfig {
  text: string;
  fontFamily: string;
  fontSize: number;
  textColor: string;
  bgColor: string;
  hoverBgColor: string;
  activeBgColor: string;
  borderRadius: number;
}

export interface SliderConfig {
  min: number;
  max: number;
  step: number;
  initialValue: number;
  trackColor: string;
  fillColor: string;
  thumbColor: string;
}

export interface ProgressBarConfig {
  initialProgress: number; // 0..100
  bgColor: string;
  fillColor: string;
  borderRadius: number;
  showText: boolean;
}

export interface PostProcessSettings {
  enabled: boolean;
  bloom: boolean;
  bloomIntensity: number; // 0..2
  crtScanlines: boolean;
  crtCurvature: number; // 0..1
  vignette: boolean;
  vignetteStrength: number; // 0..1
  chromaticAberration: boolean;
  chromaticOffset: number; // 0..10
  pixelate: number; // 1 = off, 2, 4, 8
}

export interface ObjectType {
  id: string;
  name: string;
  plugin: PluginType;
  isGlobalPlugin?: boolean;
  defaultWidth: number;
  defaultHeight: number;
  instVarDefs: InstVarDef[];
  behaviorDefs: BehaviorDef[];
  spriteConfig?: SpriteConfig;
  tiledBgConfig?: TiledBgConfig;
  textConfig?: TextConfig;
  particlesConfig?: ParticlesConfig;
  tilemapConfig?: TilemapConfig;
  buttonConfig?: ButtonConfig;
  sliderConfig?: SliderConfig;
  progressBarConfig?: ProgressBarConfig;
}

export interface InstanceData {
  uid: number;
  objectTypeId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number; // degrees
  opacity: number; // 0..100
  visible: boolean;
  mirrored?: boolean;
  flipped?: boolean;
  instVars: Record<string, VarValue>;
  behaviorProps: Record<string, Record<string, VarValue>>;
  textOverride?: string;
  tileData?: number[]; // For Tilemap instances: 1D array of tile indices
  mapWidth?: number; // In tiles
  mapHeight?: number; // In tiles
}

export interface LayerData {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0..100
  parallaxX: number; // 0..200 (percentage, 100 = normal)
  parallaxY: number; // 0..200
  transparent: boolean;
  backgroundColor?: string;
  instances: InstanceData[];
}

export interface LayoutData {
  id: string;
  name: string;
  width: number;
  height: number;
  backgroundColor: string;
  eventSheetId: string;
  layers: LayerData[];
}

export interface ConditionItem {
  id: string;
  objectTypeId: string;
  behaviorId?: string;
  conditionId: string;
  inverted?: boolean;
  params: Record<string, string>;
}

export interface ActionItem {
  id: string;
  objectTypeId: string;
  behaviorId?: string;
  actionId: string;
  params: Record<string, string>;
}

export interface EventBlock {
  id: string;
  kind: 'event';
  isOrBlock?: boolean;
  isElse?: boolean;
  disabled?: boolean;
  conditions: ConditionItem[];
  actions: ActionItem[];
  subEvents: EventItem[];
}

export interface EventGroup {
  id: string;
  kind: 'group';
  title: string;
  description?: string;
  activeAtStart: boolean;
  disabled?: boolean;
  items: EventItem[];
}

export interface EventInclude {
  id: string;
  kind: 'include';
  eventSheetId: string;
  disabled?: boolean;
}

export type EventItem = EventBlock | EventGroup | EventInclude;

export interface EventSheetData {
  id: string;
  name: string;
  items: EventItem[];
}

export interface AudioAsset {
  id: string;
  name: string;
  dataUrl: string;
}

export interface ProjectData {
  version: string;
  name: string;
  viewportWidth: number;
  viewportHeight: number;
  pixelRounding: boolean;
  fullscreenScaling: 'letterbox-scale' | 'letterbox-integer' | 'scale-outer' | 'scale-inner' | 'off';
  startupLayoutId: string;
  nextUid: number;
  globalVariables: GlobalVariable[];
  objectTypes: ObjectType[];
  layouts: LayoutData[];
  eventSheets: EventSheetData[];
  audioAssets: AudioAsset[];
  postProcessSettings?: PostProcessSettings;
  virtualJoystickSettings?: {
    enabled: boolean;
    deadzone: number;
    size: number;
    showActionButtons: boolean;
  };
}
