import { createDefaultBehaviorProperties } from './catalog';
import { generateDefaultTilesetDataUrl } from './tilemap';
import { ObjectType, ProjectData } from './types';

function renderPixelMatrix(
  grid: string[],
  palette: Record<string, string>,
  scale = 2
): string {
  const h = grid.length;
  const w = grid[0]?.length || 1;
  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  for (let y = 0; y < h; y++) {
    const row = grid[y];
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      const color = palette[ch];
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
  }
  return canvas.toDataURL('image/png');
}

function makeNeonTileDataUrl(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#181e2c';
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = '#222b3f';
  ctx.fillRect(1, 1, 30, 30);
  ctx.fillStyle = '#0ea5e9';
  ctx.fillRect(0, 0, 32, 3);
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(0, 0, 32, 1);
  ctx.strokeStyle = '#2d3954';
  ctx.lineWidth = 1;
  ctx.strokeRect(4.5, 6.5, 23, 21);
  return canvas.toDataURL('image/png');
}

function makeBridgeTileDataUrl(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#083344';
  ctx.fillRect(0, 0, 32, 12);
  ctx.fillStyle = '#22d3ee';
  ctx.fillRect(0, 0, 32, 3);
  ctx.fillStyle = '#06b6d4';
  ctx.fillRect(2, 6, 12, 3);
  ctx.fillRect(18, 6, 12, 3);
  return canvas.toDataURL('image/png');
}

function makePortalFrame(phase: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 48;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.clearRect(0, 0, 32, 48);
  ctx.strokeStyle = phase === 0 ? '#22d3ee' : '#818cf8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(16, 24, 12, 20, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = phase === 0 ? 'rgba(34,211,238,0.35)' : 'rgba(129,140,248,0.45)';
  ctx.beginPath();
  ctx.ellipse(16, 24, 9, 16, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#e0f2fe';
  ctx.fillRect(phase === 0 ? 14 : 12, 18, 4, 12);
  return canvas.toDataURL('image/png');
}

function makeWallMarkerDataUrl(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = 'rgba(244, 63, 94, 0.25)';
  ctx.fillRect(0, 0, 16, 16);
  ctx.strokeStyle = '#fb7185';
  ctx.strokeRect(0.5, 0.5, 15, 15);
  return canvas.toDataURL('image/png');
}

function makeCrateDataUrl(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#92400e';
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = '#b45309';
  ctx.fillRect(2, 2, 28, 28);
  ctx.strokeStyle = '#451a03';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 30, 30);
  ctx.strokeStyle = '#d97706';
  ctx.beginPath();
  ctx.moveTo(4, 4);
  ctx.lineTo(28, 28);
  ctx.moveTo(28, 4);
  ctx.lineTo(4, 28);
  ctx.stroke();
  ctx.strokeStyle = '#78350f';
  ctx.strokeRect(5, 5, 22, 22);
  return canvas.toDataURL('image/png');
}

function makeBallDataUrl(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 28;
  canvas.height = 28;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.beginPath();
  ctx.arc(14, 14, 13, 0, Math.PI * 2);
  ctx.fillStyle = '#06b6d4';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#cffafe';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(10, 10, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#ecfeff';
  ctx.fill();
  return canvas.toDataURL('image/png');
}

function makeTurretDataUrl(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#334155';
  ctx.beginPath();
  ctx.arc(14, 16, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f43f5e';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Barrel pointing right (0 deg)
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(14, 13, 17, 6);
  ctx.fillStyle = '#fb7185';
  ctx.fillRect(27, 13, 4, 6);
  return canvas.toDataURL('image/png');
}

function makeLaserBoltDataUrl(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 6;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#fb7185';
  ctx.fillRect(0, 0, 16, 6);
  ctx.fillStyle = '#fff1f2';
  ctx.fillRect(2, 2, 12, 2);
  return canvas.toDataURL('image/png');
}

function makeDroneDataUrl(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 28;
  canvas.height = 28;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#312e81';
  ctx.beginPath();
  ctx.arc(14, 14, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#a78bfa';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#22d3ee';
  ctx.fillRect(16, 11, 7, 6);
  return canvas.toDataURL('image/png');
}

function makeShieldOrbDataUrl(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 14;
  canvas.height = 14;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.beginPath();
  ctx.arc(7, 7, 5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(34, 211, 238, 0.85)';
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  return canvas.toDataURL('image/png');
}

export function createGlobalPluginObjects(): ObjectType[] {
  return [
    { id: 'system', name: 'System', plugin: 'System', isGlobalPlugin: true, defaultWidth: 32, defaultHeight: 32, instVarDefs: [], behaviorDefs: [] },
    { id: 'obj_keyboard', name: 'Keyboard', plugin: 'Keyboard', isGlobalPlugin: true, defaultWidth: 32, defaultHeight: 32, instVarDefs: [], behaviorDefs: [] },
    { id: 'obj_mouse', name: 'Mouse', plugin: 'Mouse', isGlobalPlugin: true, defaultWidth: 32, defaultHeight: 32, instVarDefs: [], behaviorDefs: [] },
    { id: 'obj_touch', name: 'Touch', plugin: 'Touch', isGlobalPlugin: true, defaultWidth: 32, defaultHeight: 32, instVarDefs: [], behaviorDefs: [] },
    { id: 'obj_audio', name: 'Audio', plugin: 'Audio', isGlobalPlugin: true, defaultWidth: 32, defaultHeight: 32, instVarDefs: [], behaviorDefs: [] },
    { id: 'obj_localstorage', name: 'LocalStorage', plugin: 'LocalStorage', isGlobalPlugin: true, defaultWidth: 32, defaultHeight: 32, instVarDefs: [], behaviorDefs: [] },
    { id: 'obj_dictionary', name: 'Dictionary', plugin: 'Dictionary', isGlobalPlugin: true, defaultWidth: 32, defaultHeight: 32, instVarDefs: [], behaviorDefs: [] },
    { id: 'obj_gamepad', name: 'Gamepad', plugin: 'Gamepad', isGlobalPlugin: true, defaultWidth: 32, defaultHeight: 32, instVarDefs: [], behaviorDefs: [] },
    { id: 'obj_virtualjoy', name: 'VirtualJoystick', plugin: 'VirtualJoystick', isGlobalPlugin: true, defaultWidth: 32, defaultHeight: 32, instVarDefs: [], behaviorDefs: [] },
  ];
}

export function createDemoProject(): ProjectData {
  const pPalette = {
    '.': '',
    'H': '#e2e8f0',
    'V': '#22d3ee',
    'B': '#4f46e5',
    'D': '#312e81',
    'C': '#06b6d4',
    'F': '#f8fafc',
  };

  const playerIdle0 = renderPixelMatrix([
    '................',
    '.....HHHHHH.....',
    '....HHHHHHHH....',
    '....HHVVVVVH....',
    '....HHHHHHHH....',
    '.....BBBBBB.....',
    '....BBBBBBBB....',
    '....BBCCCCBB....',
    '....DDDDDDDD....',
    '.....DD..DD.....',
    '.....DD..DD.....',
    '.....DD..DD.....',
    '.....FF..FF.....',
    '....FFF..FFF....',
    '................',
    '................',
  ], pPalette, 2);

  const playerIdle1 = renderPixelMatrix([
    '................',
    '................',
    '.....HHHHHH.....',
    '....HHHHHHHH....',
    '....HHVVVVVH....',
    '....HHHHHHHH....',
    '....BBBBBBBB....',
    '....BBCCCCBB....',
    '....DDDDDDDD....',
    '.....DD..DD.....',
    '.....DD..DD.....',
    '.....DD..DD.....',
    '.....FF..FF.....',
    '....FFF..FFF....',
    '................',
    '................',
  ], pPalette, 2);

  const playerRun0 = renderPixelMatrix([
    '................',
    '.....HHHHHH.....',
    '....HHHHHHHH....',
    '....HHVVVVVH....',
    '....HHHHHHHH....',
    '.....BBBBBB.....',
    '....BBBBBBBB....',
    '...BBBCCCCBB....',
    '....DDDDDDDD....',
    '....DDD..DDD....',
    '...DDD....DDD...',
    '...FF......FF...',
    '..FFF.......FF..',
    '................',
    '................',
    '................',
  ], pPalette, 2);

  const playerRun1 = renderPixelMatrix([
    '................',
    '......HHHHHH....',
    '.....HHHHHHHH...',
    '.....HHVVVVVH...',
    '.....HHHHHHHH...',
    '......BBBBBB....',
    '.....BBBBBBBB...',
    '.....BBCCCCBB...',
    '.....DDDDDDDD...',
    '......DDDDDD....',
    '.......DD.DD....',
    '......FF..FF....',
    '......FFF.FF....',
    '................',
    '................',
    '................',
  ], pPalette, 2);

  const playerJump0 = renderPixelMatrix([
    '.....HHHHHH.....',
    '....HHHHHHHH....',
    '....HHVVVVVH....',
    '....HHHHHHHH....',
    '...BBBBBBBBBB...',
    '..BB.BBBBBB.BB..',
    '.....BBCCBB.....',
    '....DDDDDDDD....',
    '...DDD....DDD...',
    '...FF......FF...',
    '..FFF......FFF..',
    '................',
    '................',
    '................',
    '................',
    '................',
  ], pPalette, 2);

  const coinPalette = {
    '.': '',
    'O': '#b45309',
    'Y': '#fbbf24',
    'L': '#fef08a',
    'W': '#ffffff',
  };

  const coin0 = renderPixelMatrix([
    '....OOOO....',
    '..OOYYYYOO..',
    '.OYLLLLLLYO.',
    '.OYLWYYYYYO.',
    'OYLLWYYYYYYO',
    'OYLLWYYYYYYO',
    'OYLLWYYYYYYO',
    'OYYYYYYYYYYO',
    '.OYYYYYYYYO.',
    '.OYYYYYYYYO.',
    '..OOYYYYOO..',
    '....OOOO....',
  ], coinPalette, 2);

  const coin1 = renderPixelMatrix([
    '.....OO.....',
    '....OYYO....',
    '...OYLLYO...',
    '...OYLWYO...',
    '...OYLWYO...',
    '...OYLWYO...',
    '...OYLWYO...',
    '...OYYYYO...',
    '...OYYYYO...',
    '...OYYYYO...',
    '....OYYO....',
    '.....OO.....',
  ], coinPalette, 2);

  const slimePalette = {
    '.': '',
    'D': '#9d174d',
    'M': '#ec4899',
    'L': '#fbcfe8',
    'E': '#0f172a',
    'W': '#ffffff',
  };

  const slime0 = renderPixelMatrix([
    '................',
    '.....DDDDDD.....',
    '...DDMMMMMMMD...',
    '..DMMLLLLMMMMD..',
    '.DMMLMMMMMMLLMD.',
    '.DMMMEEMMMMEEMD.',
    'DMMMMEWMMMMEWMMD',
    'DMMMMMMMMMMMMMMD',
    'DMMMMMMMMMMMMMMD',
    'DMMDDDDDDDDDDMMD',
    '.DD..........DD.',
    '................',
  ], slimePalette, 2);

  const slime1 = renderPixelMatrix([
    '................',
    '................',
    '....DDDDDDDD....',
    '..DDMMMMMMMMDD..',
    '.DMMLLLMMMMMMMD.',
    'DMMMLMMMMMMLLLMD',
    'DMMMMEEMMMMEEMMD',
    'DMMMMEWMMMMEWMMD',
    'DMMMMMMMMMMMMMMD',
    'DDDDDDDDDDDDDDDD',
    '................',
    '................',
  ], slimePalette, 2);

  const tileGround = makeNeonTileDataUrl();
  const tileBridge = makeBridgeTileDataUrl();
  const portal0 = makePortalFrame(0);
  const portal1 = makePortalFrame(1);
  const wallMarkerUrl = makeWallMarkerDataUrl();
  const crateUrl = makeCrateDataUrl();
  const ballUrl = makeBallDataUrl();
  const turretUrl = makeTurretDataUrl();
  const laserBoltUrl = makeLaserBoltDataUrl();
  const droneUrl = makeDroneDataUrl();
  const shieldUrl = makeShieldOrbDataUrl();
  const tilesetUrl = generateDefaultTilesetDataUrl();

  const playerPlatformProps = {
    ...createDefaultBehaviorProperties('Platform'),
    maxSpeed: 260,
    acceleration: 1600,
    deceleration: 1600,
    jumpStrength: 540,
    gravity: 1350,
    maxFallSpeed: 900,
    doubleJump: true,
    jumpSustain: 120,
    defaultControls: true,
    enabled: true,
  };

  // Build procedural 53x15 tilemap (32px tiles -> 1696 x 480)
  const tmCols = 53;
  const tmRows = 15;
  const tmData = new Array<number>(tmCols * tmRows).fill(-1);
  const setTile = (c: number, r: number, val: number) => {
    if (c >= 0 && c < tmCols && r >= 0 && r < tmRows) {
      tmData[r * tmCols + c] = val;
    }
  };
  // Floor row 14 (with a small gap at cols 20..21)
  for (let c = 0; c < tmCols; c++) {
    if (c === 20 || c === 21) continue;
    setTile(c, 14, c >= 10 && c <= 28 ? 4 : 1); // Tech Metal in physics zone, Grass elsewhere
  }
  // Stepped stone pillar & elevated platform
  for (let c = 14; c <= 16; c++) {
    setTile(c, 12, 3);
    setTile(c, 13, 3);
  }
  // Elevated tech ledge around cols 32..36
  for (let c = 32; c <= 36; c++) {
    setTile(c, 11, 4);
  }
  // Decorative ladder
  for (let r = 11; r <= 13; r++) {
    setTile(32, r, 7);
  }

  const objectTypes: ObjectType[] = [
    ...createGlobalPluginObjects(),
    {
      id: 'obj_tilemap',
      name: 'WorldTilemap',
      plugin: 'Tilemap',
      defaultWidth: tmCols * 32,
      defaultHeight: tmRows * 32,
      instVarDefs: [],
      behaviorDefs: [{ id: 'beh_tm_solid', type: 'Solid', name: 'Solid', properties: { enabled: true } }],
      tilemapConfig: {
        tilesetDataUrl: tilesetUrl,
        tileWidth: 32,
        tileHeight: 32,
        columns: tmCols,
        rows: tmRows,
        solidTiles: [1, 2, 3, 4],
      },
    },
    {
      id: 'obj_player',
      name: 'Player',
      plugin: 'Sprite',
      defaultWidth: 32,
      defaultHeight: 32,
      instVarDefs: [{ id: 'iv_hp', name: 'Health', type: 'number', initialValue: 100 }],
      behaviorDefs: [
        { id: 'beh_platform', type: 'Platform', name: 'Platform', properties: playerPlatformProps },
        { id: 'beh_scrollto', type: 'ScrollTo', name: 'ScrollTo', properties: createDefaultBehaviorProperties('ScrollTo') },
        { id: 'beh_bound', type: 'BoundTo', name: 'BoundTo', properties: { boundTo: 'Layout', mode: 'Edge' } },
        { id: 'beh_flash', type: 'Flash', name: 'Flash', properties: {} },
      ],
      spriteConfig: {
        defaultAnimation: 'Idle',
        animations: [
          {
            name: 'Idle',
            speed: 3,
            loop: true,
            repeatCount: 1,
            pingPong: false,
            frames: [
              { id: 'f_p_i0', dataUrl: playerIdle0, width: 32, height: 32, originX: 0.5, originY: 0.5 },
              { id: 'f_p_i1', dataUrl: playerIdle1, width: 32, height: 32, originX: 0.5, originY: 0.5 },
            ],
          },
          {
            name: 'Run',
            speed: 10,
            loop: true,
            repeatCount: 1,
            pingPong: false,
            frames: [
              { id: 'f_p_r0', dataUrl: playerRun0, width: 32, height: 32, originX: 0.5, originY: 0.5 },
              { id: 'f_p_r1', dataUrl: playerRun1, width: 32, height: 32, originX: 0.5, originY: 0.5 },
            ],
          },
          {
            name: 'Jump',
            speed: 6,
            loop: false,
            repeatCount: 1,
            pingPong: false,
            frames: [
              { id: 'f_p_j0', dataUrl: playerJump0, width: 32, height: 32, originX: 0.5, originY: 0.5 },
            ],
          },
        ],
      },
    },
    {
      id: 'obj_shield',
      name: 'ShieldOrb',
      plugin: 'Sprite',
      defaultWidth: 14,
      defaultHeight: 14,
      instVarDefs: [],
      behaviorDefs: [
        { id: 'beh_shield_pin', type: 'Pin', name: 'Pin', properties: createDefaultBehaviorProperties('Pin') },
        { id: 'beh_shield_tween', type: 'Tween', name: 'Tween', properties: {} },
      ],
      spriteConfig: {
        defaultAnimation: 'Default',
        animations: [
          {
            name: 'Default',
            speed: 1,
            loop: false,
            repeatCount: 1,
            pingPong: false,
            frames: [{ id: 'f_sh0', dataUrl: shieldUrl, width: 14, height: 14, originX: 0.5, originY: 0.5 }],
          },
        ],
      },
    },
    {
      id: 'obj_crate',
      name: 'PhysicsCrate',
      plugin: 'Sprite',
      defaultWidth: 32,
      defaultHeight: 32,
      instVarDefs: [],
      behaviorDefs: [
        {
          id: 'beh_crate_phys',
          type: 'Physics',
          name: 'Physics',
          properties: {
            ...createDefaultBehaviorProperties('Physics'),
            density: 1.2,
            friction: 0.35,
            elasticity: 0.25,
            collisionShape: 'box',
          },
        },
        { id: 'beh_crate_drag', type: 'DragDrop', name: 'DragDrop', properties: createDefaultBehaviorProperties('DragDrop') },
      ],
      spriteConfig: {
        defaultAnimation: 'Default',
        animations: [
          {
            name: 'Default',
            speed: 1,
            loop: false,
            repeatCount: 1,
            pingPong: false,
            frames: [{ id: 'f_cr0', dataUrl: crateUrl, width: 32, height: 32, originX: 0.5, originY: 0.5 }],
          },
        ],
      },
    },
    {
      id: 'obj_ball',
      name: 'EnergyBall',
      plugin: 'Sprite',
      defaultWidth: 28,
      defaultHeight: 28,
      instVarDefs: [],
      behaviorDefs: [
        {
          id: 'beh_ball_phys',
          type: 'Physics',
          name: 'Physics',
          properties: {
            ...createDefaultBehaviorProperties('Physics'),
            density: 0.8,
            friction: 0.15,
            elasticity: 0.85,
            collisionShape: 'circle',
          },
        },
        { id: 'beh_ball_drag', type: 'DragDrop', name: 'DragDrop', properties: createDefaultBehaviorProperties('DragDrop') },
      ],
      spriteConfig: {
        defaultAnimation: 'Default',
        animations: [
          {
            name: 'Default',
            speed: 1,
            loop: false,
            repeatCount: 1,
            pingPong: false,
            frames: [{ id: 'f_bl0', dataUrl: ballUrl, width: 28, height: 28, originX: 0.5, originY: 0.5 }],
          },
        ],
      },
    },
    {
      id: 'obj_turret',
      name: 'AutoTurret',
      plugin: 'Sprite',
      defaultWidth: 32,
      defaultHeight: 32,
      instVarDefs: [],
      behaviorDefs: [
        {
          id: 'beh_turret',
          type: 'Turret',
          name: 'Turret',
          properties: {
            ...createDefaultBehaviorProperties('Turret'),
            range: 340,
            rateOfFire: 1.4,
            rotateSpeed: 180,
            predictiveAim: true,
          },
        },
        {
          id: 'beh_turret_los',
          type: 'LineOfSight',
          name: 'LineOfSight',
          properties: { range: 340, coneOfView: 360, enabled: true },
        },
      ],
      spriteConfig: {
        defaultAnimation: 'Default',
        animations: [
          {
            name: 'Default',
            speed: 1,
            loop: false,
            repeatCount: 1,
            pingPong: false,
            frames: [{ id: 'f_tur0', dataUrl: turretUrl, width: 32, height: 32, originX: 0.5, originY: 0.5 }],
          },
        ],
      },
    },
    {
      id: 'obj_laser',
      name: 'TurretLaser',
      plugin: 'Sprite',
      defaultWidth: 16,
      defaultHeight: 6,
      instVarDefs: [],
      behaviorDefs: [
        {
          id: 'beh_laser_bullet',
          type: 'Bullet',
          name: 'Bullet',
          properties: { speed: 340, acceleration: 0, gravity: 0, bounceOffSolids: false, setAngle: true, enabled: true },
        },
        { id: 'beh_laser_out', type: 'DestroyOutside', name: 'DestroyOutside', properties: {} },
      ],
      spriteConfig: {
        defaultAnimation: 'Default',
        animations: [
          {
            name: 'Default',
            speed: 1,
            loop: false,
            repeatCount: 1,
            pingPong: false,
            frames: [{ id: 'f_lz0', dataUrl: laserBoltUrl, width: 16, height: 6, originX: 0.5, originY: 0.5 }],
          },
        ],
      },
    },
    {
      id: 'obj_drone',
      name: 'PatrolDrone',
      plugin: 'Sprite',
      defaultWidth: 28,
      defaultHeight: 28,
      instVarDefs: [],
      behaviorDefs: [
        {
          id: 'beh_drone_path',
          type: 'Pathfinding',
          name: 'Pathfinding',
          properties: {
            ...createDefaultBehaviorProperties('Pathfinding'),
            cellSize: 32,
            speed: 130,
            rotateObject: true,
          },
        },
      ],
      spriteConfig: {
        defaultAnimation: 'Default',
        animations: [
          {
            name: 'Default',
            speed: 1,
            loop: false,
            repeatCount: 1,
            pingPong: false,
            frames: [{ id: 'f_dr0', dataUrl: droneUrl, width: 28, height: 28, originX: 0.5, originY: 0.5 }],
          },
        ],
      },
    },
    {
      id: 'obj_ground',
      name: 'Ground',
      plugin: 'TiledBackground',
      defaultWidth: 256,
      defaultHeight: 32,
      instVarDefs: [],
      behaviorDefs: [{ id: 'beh_solid', type: 'Solid', name: 'Solid', properties: { enabled: true } }],
      tiledBgConfig: { imageDataUrl: tileGround, imageWidth: 32, imageHeight: 32 },
    },
    {
      id: 'obj_jumpthru',
      name: 'PlatformJumpThru',
      plugin: 'TiledBackground',
      defaultWidth: 160,
      defaultHeight: 16,
      instVarDefs: [],
      behaviorDefs: [{ id: 'beh_jumpthru', type: 'JumpThru', name: 'JumpThru', properties: { enabled: true } }],
      tiledBgConfig: { imageDataUrl: tileBridge, imageWidth: 32, imageHeight: 16 },
    },
    {
      id: 'obj_coin',
      name: 'Coin',
      plugin: 'Sprite',
      defaultWidth: 24,
      defaultHeight: 24,
      instVarDefs: [],
      behaviorDefs: [
        {
          id: 'beh_coin_sine',
          type: 'Sine',
          name: 'Sine',
          properties: { movement: 'Vertical', wave: 'Sine', period: 1.6, periodOffset: 0, magnitude: 6, enabled: true },
        },
      ],
      spriteConfig: {
        defaultAnimation: 'Spin',
        animations: [
          {
            name: 'Spin',
            speed: 6,
            loop: true,
            repeatCount: 1,
            pingPong: false,
            frames: [
              { id: 'f_c0', dataUrl: coin0, width: 24, height: 24, originX: 0.5, originY: 0.5 },
              { id: 'f_c1', dataUrl: coin1, width: 24, height: 24, originX: 0.5, originY: 0.5 },
            ],
          },
        ],
      },
    },
    {
      id: 'obj_slime',
      name: 'SlimeEnemy',
      plugin: 'Sprite',
      defaultWidth: 32,
      defaultHeight: 24,
      instVarDefs: [],
      behaviorDefs: [
        {
          id: 'beh_slime_bullet',
          type: 'Bullet',
          name: 'Bullet',
          properties: { speed: 85, acceleration: 0, gravity: 0, bounceOffSolids: true, setAngle: false, enabled: true },
        },
      ],
      spriteConfig: {
        defaultAnimation: 'Patrol',
        animations: [
          {
            name: 'Patrol',
            speed: 5,
            loop: true,
            repeatCount: 1,
            pingPong: false,
            frames: [
              { id: 'f_s0', dataUrl: slime0, width: 32, height: 24, originX: 0.5, originY: 0.5 },
              { id: 'f_s1', dataUrl: slime1, width: 32, height: 24, originX: 0.5, originY: 0.5 },
            ],
          },
        ],
      },
    },
    {
      id: 'obj_marker',
      name: 'PatrolMarker',
      plugin: 'Sprite',
      defaultWidth: 16,
      defaultHeight: 32,
      instVarDefs: [],
      behaviorDefs: [],
      spriteConfig: {
        defaultAnimation: 'Default',
        animations: [
          {
            name: 'Default',
            speed: 1,
            loop: false,
            repeatCount: 1,
            pingPong: false,
            frames: [{ id: 'f_m0', dataUrl: wallMarkerUrl, width: 16, height: 16, originX: 0.5, originY: 0.5 }],
          },
        ],
      },
    },
    {
      id: 'obj_portal',
      name: 'GoalPortal',
      plugin: 'Sprite',
      defaultWidth: 40,
      defaultHeight: 56,
      instVarDefs: [],
      behaviorDefs: [],
      spriteConfig: {
        defaultAnimation: 'Pulse',
        animations: [
          {
            name: 'Pulse',
            speed: 5,
            loop: true,
            repeatCount: 1,
            pingPong: false,
            frames: [
              { id: 'f_g0', dataUrl: portal0, width: 32, height: 48, originX: 0.5, originY: 0.5 },
              { id: 'f_g1', dataUrl: portal1, width: 32, height: 48, originX: 0.5, originY: 0.5 },
            ],
          },
        ],
      },
    },
    {
      id: 'obj_coin_particles',
      name: 'CoinParticles',
      plugin: 'Particles',
      defaultWidth: 24,
      defaultHeight: 24,
      instVarDefs: [],
      behaviorDefs: [],
      particlesConfig: {
        rate: 16,
        sprayCone: 360,
        type: 'one-shot',
        speed: 110,
        size: 5,
        opacity: 100,
        lifetime: 0.45,
        acceleration: -120,
        gravity: 220,
        angleRandomiser: 0,
        speedRandomiser: 40,
        sizeRandomiser: 2,
        growRate: -6,
        color: '#fbbf24',
      },
    },
    {
      id: 'obj_slime_particles',
      name: 'SlimeParticles',
      plugin: 'Particles',
      defaultWidth: 24,
      defaultHeight: 24,
      instVarDefs: [],
      behaviorDefs: [],
      particlesConfig: {
        rate: 22,
        sprayCone: 360,
        type: 'one-shot',
        speed: 140,
        size: 6,
        opacity: 100,
        lifetime: 0.5,
        acceleration: -140,
        gravity: 300,
        angleRandomiser: 0,
        speedRandomiser: 50,
        sizeRandomiser: 2,
        growRate: -6,
        color: '#ec4899',
      },
    },
    {
      id: 'obj_score_text',
      name: 'ScoreText',
      plugin: 'Text',
      defaultWidth: 180,
      defaultHeight: 28,
      instVarDefs: [],
      behaviorDefs: [],
      textConfig: {
        initialText: '[b]SCORE:[/b] 0',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        fontSize: 16,
        color: '#f8fafc',
        bold: false,
        italic: false,
        align: 'left',
        verticalAlign: 'top',
        lineHeight: 1.25,
      },
    },
    {
      id: 'obj_lives_text',
      name: 'LivesText',
      plugin: 'Text',
      defaultWidth: 120,
      defaultHeight: 28,
      instVarDefs: [],
      behaviorDefs: [],
      textConfig: {
        initialText: '[b]LIVES:[/b] 3',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        fontSize: 16,
        color: '#f8fafc',
        bold: false,
        italic: false,
        align: 'left',
        verticalAlign: 'top',
        lineHeight: 1.25,
      },
    },
    {
      id: 'obj_hp_bar',
      name: 'HealthBar',
      plugin: 'ProgressBar',
      defaultWidth: 130,
      defaultHeight: 18,
      instVarDefs: [],
      behaviorDefs: [],
      progressBarConfig: {
        initialProgress: 100,
        bgColor: '#0f172a',
        fillColor: '#10b981',
        borderRadius: 6,
        showText: true,
      },
    },
    {
      id: 'obj_btn_crate',
      name: 'BtnSpawnCrate',
      plugin: 'Button',
      defaultWidth: 96,
      defaultHeight: 26,
      instVarDefs: [],
      behaviorDefs: [],
      buttonConfig: {
        text: '+ Crate',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        fontSize: 12,
        textColor: '#f8fafc',
        bgColor: '#0284c7',
        hoverBgColor: '#0ea5e9',
        activeBgColor: '#0369a1',
        borderRadius: 6,
      },
    },
    {
      id: 'obj_btn_crt',
      name: 'BtnToggleCRT',
      plugin: 'Button',
      defaultWidth: 96,
      defaultHeight: 26,
      instVarDefs: [],
      behaviorDefs: [],
      buttonConfig: {
        text: 'CRT Shader',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        fontSize: 12,
        textColor: '#f8fafc',
        bgColor: '#4f46e5',
        hoverBgColor: '#6366f1',
        activeBgColor: '#4338ca',
        borderRadius: 6,
      },
    },
    {
      id: 'obj_slider_time',
      name: 'TimeSlider',
      plugin: 'Slider',
      defaultWidth: 110,
      defaultHeight: 22,
      instVarDefs: [],
      behaviorDefs: [],
      sliderConfig: {
        min: 0.25,
        max: 2.0,
        step: 0.25,
        initialValue: 1.0,
        trackColor: '#1e293b',
        fillColor: '#22d3ee',
        thumbColor: '#f8fafc',
      },
    },
    {
      id: 'obj_hint_text',
      name: 'ControlsHint',
      plugin: 'Text',
      defaultWidth: 560,
      defaultHeight: 24,
      instVarDefs: [],
      behaviorDefs: [],
      textConfig: {
        initialText: 'Move: [b]WASD / Arrows[/b] · Double Jump: [b]Space[/b] · Drag Physics Crates · Slider: Time Scale',
        fontFamily: 'DM Sans, sans-serif',
        fontSize: 11,
        color: '#94a3b8',
        bold: false,
        italic: false,
        align: 'center',
        verticalAlign: 'top',
        lineHeight: 1.25,
      },
    },
    {
      id: 'obj_victory_text',
      name: 'VictoryTitle',
      plugin: 'Text',
      defaultWidth: 560,
      defaultHeight: 180,
      instVarDefs: [],
      behaviorDefs: [],
      textConfig: {
        initialText: '[color=#22d3ee][b]SECTOR CLEARED![/b][/color]\nFinal Score: 0\n\n[color=#94a3b8]Press Enter or Click to Play Again[/color]',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        fontSize: 28,
        color: '#f8fafc',
        bold: false,
        italic: false,
        align: 'center',
        verticalAlign: 'center',
        lineHeight: 1.4,
      },
    },
  ];

  let uid = 1;
  const nextUid = () => uid++;

  const level1Instances = [
    // Full-layout World Tilemap (bottom terrain, stone pillars, tech platforms)
    {
      uid: nextUid(),
      objectTypeId: 'obj_tilemap',
      x: 0,
      y: 0,
      width: tmCols * 32,
      height: tmRows * 32,
      angle: 0,
      opacity: 100,
      visible: true,
      instVars: {},
      behaviorProps: {},
      tileData: tmData,
      mapWidth: tmCols,
      mapHeight: tmRows,
    },
    // Jump-thru bridges
    { uid: nextUid(), objectTypeId: 'obj_jumpthru', x: 240, y: 344, width: 160, height: 16, angle: 0, opacity: 100, visible: true, instVars: {}, behaviorProps: {} },
    { uid: nextUid(), objectTypeId: 'obj_jumpthru', x: 560, y: 280, width: 192, height: 16, angle: 0, opacity: 100, visible: true, instVars: {}, behaviorProps: {} },
    { uid: nextUid(), objectTypeId: 'obj_jumpthru', x: 860, y: 320, width: 160, height: 16, angle: 0, opacity: 100, visible: true, instVars: {}, behaviorProps: {} },
    { uid: nextUid(), objectTypeId: 'obj_jumpthru', x: 1184, y: 312, width: 160, height: 16, angle: 0, opacity: 100, visible: true, instVars: {}, behaviorProps: {} },
    // Physics Crates & Bouncy Energy Ball
    { uid: nextUid(), objectTypeId: 'obj_crate', x: 360, y: 430, width: 32, height: 32, angle: 0, opacity: 100, visible: true, instVars: {}, behaviorProps: {} },
    { uid: nextUid(), objectTypeId: 'obj_crate', x: 396, y: 430, width: 32, height: 32, angle: 0, opacity: 100, visible: true, instVars: {}, behaviorProps: {} },
    { uid: nextUid(), objectTypeId: 'obj_crate', x: 378, y: 396, width: 32, height: 32, angle: 0, opacity: 100, visible: true, instVars: {}, behaviorProps: {} },
    { uid: nextUid(), objectTypeId: 'obj_ball', x: 210, y: 300, width: 28, height: 28, angle: 0, opacity: 100, visible: true, instVars: {}, behaviorProps: {} },
    // AutoTurret with Line of Sight
    { uid: nextUid(), objectTypeId: 'obj_turret', x: 960, y: 304, width: 32, height: 32, angle: 180, opacity: 100, visible: true, instVars: {}, behaviorProps: {} },
    // Pathfinding Patrol Drone
    { uid: nextUid(), objectTypeId: 'obj_drone', x: 740, y: 220, width: 28, height: 28, angle: 0, opacity: 100, visible: true, instVars: {}, behaviorProps: {} },
    // Patrol markers (invisible in game)
    { uid: nextUid(), objectTypeId: 'obj_marker', x: 720, y: 432, width: 16, height: 32, angle: 0, opacity: 100, visible: false, instVars: {}, behaviorProps: {} },
    { uid: nextUid(), objectTypeId: 'obj_marker', x: 1030, y: 432, width: 16, height: 32, angle: 0, opacity: 100, visible: false, instVars: {}, behaviorProps: {} },
    { uid: nextUid(), objectTypeId: 'obj_marker', x: 1300, y: 432, width: 16, height: 32, angle: 0, opacity: 100, visible: false, instVars: {}, behaviorProps: {} },
    { uid: nextUid(), objectTypeId: 'obj_marker', x: 1550, y: 432, width: 16, height: 32, angle: 0, opacity: 100, visible: false, instVars: {}, behaviorProps: {} },
    // Coins
    { uid: nextUid(), objectTypeId: 'obj_coin', x: 280, y: 312, width: 24, height: 24, angle: 0, opacity: 100, visible: true, instVars: {}, behaviorProps: {} },
    { uid: nextUid(), objectTypeId: 'obj_coin', x: 320, y: 312, width: 24, height: 24, angle: 0, opacity: 100, visible: true, instVars: {}, behaviorProps: {} },
    { uid: nextUid(), objectTypeId: 'obj_coin', x: 360, y: 312, width: 24, height: 24, angle: 0, opacity: 100, visible: true, instVars: {}, behaviorProps: {} },
    { uid: nextUid(), objectTypeId: 'obj_coin', x: 620, y: 244, width: 24, height: 24, angle: 0, opacity: 100, visible: true, instVars: {}, behaviorProps: {} },
    { uid: nextUid(), objectTypeId: 'obj_coin', x: 664, y: 244, width: 24, height: 24, angle: 0, opacity: 100, visible: true, instVars: {}, behaviorProps: {} },
    { uid: nextUid(), objectTypeId: 'obj_coin', x: 920, y: 286, width: 24, height: 24, angle: 0, opacity: 100, visible: true, instVars: {}, behaviorProps: {} },
    { uid: nextUid(), objectTypeId: 'obj_coin', x: 1244, y: 276, width: 24, height: 24, angle: 0, opacity: 100, visible: true, instVars: {}, behaviorProps: {} },
    { uid: nextUid(), objectTypeId: 'obj_coin', x: 1284, y: 276, width: 24, height: 24, angle: 0, opacity: 100, visible: true, instVars: {}, behaviorProps: {} },
    // Slime Enemies
    { uid: nextUid(), objectTypeId: 'obj_slime', x: 860, y: 436, width: 32, height: 24, angle: 0, opacity: 100, visible: true, instVars: {}, behaviorProps: {} },
    { uid: nextUid(), objectTypeId: 'obj_slime', x: 1410, y: 436, width: 32, height: 24, angle: 0, opacity: 100, visible: true, instVars: {}, behaviorProps: {} },
    // Goal Portal
    { uid: nextUid(), objectTypeId: 'obj_portal', x: 1620, y: 420, width: 40, height: 56, angle: 0, opacity: 100, visible: true, instVars: {}, behaviorProps: {} },
    // Player & Pinned ShieldOrb
    { uid: nextUid(), objectTypeId: 'obj_player', x: 96, y: 416, width: 32, height: 32, angle: 0, opacity: 100, visible: true, instVars: { Health: 100 }, behaviorProps: {} },
    { uid: nextUid(), objectTypeId: 'obj_shield', x: 122, y: 404, width: 14, height: 14, angle: 0, opacity: 90, visible: true, instVars: {}, behaviorProps: {} },
  ];

  const hudInstances = [
    { uid: nextUid(), objectTypeId: 'obj_score_text', x: 16, y: 14, width: 160, height: 26, angle: 0, opacity: 100, visible: true, instVars: {}, behaviorProps: {} },
    { uid: nextUid(), objectTypeId: 'obj_lives_text', x: 165, y: 14, width: 100, height: 26, angle: 0, opacity: 100, visible: true, instVars: {}, behaviorProps: {} },
    { uid: nextUid(), objectTypeId: 'obj_hp_bar', x: 268, y: 14, width: 120, height: 18, angle: 0, opacity: 100, visible: true, instVars: {}, behaviorProps: {} },
    { uid: nextUid(), objectTypeId: 'obj_slider_time', x: 510, y: 12, width: 115, height: 22, angle: 0, opacity: 100, visible: true, instVars: {}, behaviorProps: {} },
    { uid: nextUid(), objectTypeId: 'obj_btn_crate', x: 638, y: 11, width: 96, height: 26, angle: 0, opacity: 100, visible: true, instVars: {}, behaviorProps: {} },
    { uid: nextUid(), objectTypeId: 'obj_btn_crt', x: 742, y: 11, width: 96, height: 26, angle: 0, opacity: 100, visible: true, instVars: {}, behaviorProps: {} },
    { uid: nextUid(), objectTypeId: 'obj_hint_text', x: 147, y: 44, width: 560, height: 22, angle: 0, opacity: 85, visible: true, instVars: {}, behaviorProps: {} },
  ];

  const victoryInstances = [
    { uid: nextUid(), objectTypeId: 'obj_victory_text', x: 147, y: 150, width: 560, height: 180, angle: 0, opacity: 100, visible: true, instVars: {}, behaviorProps: {} },
  ];

  return {
    version: '1.0.0',
    name: 'Destruct Mega Sandbox',
    viewportWidth: 854,
    viewportHeight: 480,
    pixelRounding: true,
    fullscreenScaling: 'letterbox-scale',
    startupLayoutId: 'layout_level1',
    nextUid: uid,
    postProcessSettings: {
      enabled: false,
      bloom: true,
      bloomIntensity: 0.85,
      crtScanlines: false,
      crtCurvature: 0.25,
      vignette: true,
      vignetteStrength: 0.4,
      chromaticAberration: false,
      chromaticOffset: 2.0,
      pixelate: 1,
    },
    virtualJoystickSettings: {
      enabled: false,
      deadzone: 0.15,
      size: 54,
      showActionButtons: true,
    },
    globalVariables: [
      { id: 'gv_score', name: 'Score', type: 'number', initialValue: 0, description: 'Player score' },
      { id: 'gv_lives', name: 'Lives', type: 'number', initialValue: 3, description: 'Remaining lives' },
      { id: 'gv_invincible', name: 'Invincible', type: 'number', initialValue: 0, description: '1 during hit recovery' },
    ],
    objectTypes,
    layouts: [
      {
        id: 'layout_level1',
        name: 'Sandbox Level',
        width: 1700,
        height: 480,
        backgroundColor: '#0b0f19',
        eventSheetId: 'es_main',
        layers: [
          {
            id: 'layer_game',
            name: 'Game',
            visible: true,
            locked: false,
            opacity: 100,
            parallaxX: 100,
            parallaxY: 100,
            transparent: true,
            instances: level1Instances,
          },
          {
            id: 'layer_hud',
            name: 'HUD',
            visible: true,
            locked: false,
            opacity: 100,
            parallaxX: 0,
            parallaxY: 0,
            transparent: true,
            instances: hudInstances,
          },
        ],
      },
      {
        id: 'layout_victory',
        name: 'Victory',
        width: 854,
        height: 480,
        backgroundColor: '#090d16',
        eventSheetId: 'es_victory',
        layers: [
          {
            id: 'layer_victory_ui',
            name: 'UI',
            visible: true,
            locked: false,
            opacity: 100,
            parallaxX: 0,
            parallaxY: 0,
            transparent: true,
            instances: victoryInstances,
          },
        ],
      },
    ],
    eventSheets: [
      {
        id: 'es_main',
        name: 'MainEvents',
        items: [
          {
            id: 'ev_start',
            kind: 'event',
            conditions: [{ id: 'c_start', objectTypeId: 'system', conditionId: 'on_start_of_layout', params: {} }],
            actions: [
              { id: 'a_inv0', objectTypeId: 'system', actionId: 'set_var', params: { variable: 'Invincible', value: '0' } },
              { id: 'a_anim0', objectTypeId: 'obj_player', actionId: 'set_animation', params: { name: '"Idle"', from: 'beginning' } },
              { id: 'a_pin_sh', objectTypeId: 'obj_shield', behaviorId: 'beh_shield_pin', actionId: 'pin_to_object', params: { object: 'obj_player', mode: 'position' } },
              { id: 'a_tw_sh', objectTypeId: 'obj_shield', behaviorId: 'beh_shield_tween', actionId: 'tween_one', params: { tag: '"pulse"', property: 'scale', endValue: '1.35', duration: '0.8', easing: 'EaseInOutSine', loop: 'pingpong', destroyOnFinish: 'false' } },
              { id: 'a_tur_tgt', objectTypeId: 'obj_turret', behaviorId: 'beh_turret', actionId: 'add_target', params: { object: 'obj_slime' } },
              { id: 'a_tur_tgt2', objectTypeId: 'obj_turret', behaviorId: 'beh_turret', actionId: 'add_target', params: { object: 'obj_player' } },
            ],
            subEvents: [],
          },
          {
            id: 'ev_hud',
            kind: 'event',
            conditions: [{ id: 'c_tick', objectTypeId: 'system', conditionId: 'every_tick', params: {} }],
            actions: [
              { id: 'a_sc', objectTypeId: 'obj_score_text', actionId: 'set_text', params: { text: '"[b]SCORE:[/b] " & Score' } },
              { id: 'a_lv', objectTypeId: 'obj_lives_text', actionId: 'set_text', params: { text: '"[b]LIVES:[/b] " & Lives' } },
              { id: 'a_hpbar', objectTypeId: 'obj_hp_bar', actionId: 'set_progress', params: { progress: 'Player.Health' } },
            ],
            subEvents: [],
          },
          {
            id: 'grp_gui_sandbox',
            kind: 'group',
            title: 'Sandbox GUI, Shaders & Physics',
            activeAtStart: true,
            items: [
              {
                id: 'ev_btn_crate',
                kind: 'event',
                conditions: [{ id: 'c_btn_crate', objectTypeId: 'obj_btn_crate', conditionId: 'on_clicked', params: {} }],
                actions: [
                  { id: 'a_sp_crate', objectTypeId: 'system', actionId: 'create_object', params: { object: 'obj_crate', layer: '0', x: 'Player.X + 72', y: '80' } },
                  { id: 'a_sfx_crate', objectTypeId: 'obj_audio', actionId: 'play_synth', params: { preset: 'click', volume: '-4', tag: '"sfx"' } },
                ],
                subEvents: [],
              },
              {
                id: 'ev_btn_crt',
                kind: 'event',
                conditions: [{ id: 'c_btn_crt', objectTypeId: 'obj_btn_crt', conditionId: 'on_clicked', params: {} }],
                actions: [
                  { id: 'a_tog_crt', objectTypeId: 'system', actionId: 'set_postprocess', params: { effect: 'crtScanlines', mode: 'toggle' } },
                  { id: 'a_sfx_crt', objectTypeId: 'obj_audio', actionId: 'play_synth', params: { preset: 'powerup', volume: '-6', tag: '"sfx"' } },
                ],
                subEvents: [],
              },
              {
                id: 'ev_slider_time',
                kind: 'event',
                conditions: [{ id: 'c_sl_time', objectTypeId: 'obj_slider_time', conditionId: 'on_changed', params: {} }],
                actions: [
                  { id: 'a_set_ts', objectTypeId: 'system', actionId: 'set_timescale', params: { scale: 'TimeSlider.Value' } },
                ],
                subEvents: [],
              },
            ],
          },
          {
            id: 'grp_ai_turret_drone',
            kind: 'group',
            title: 'Turret, Line of Sight & A* Pathfinding',
            activeAtStart: true,
            items: [
              {
                id: 'ev_turret_shoot',
                kind: 'event',
                conditions: [
                  { id: 'c_tur_shoot', objectTypeId: 'obj_turret', behaviorId: 'beh_turret', conditionId: 'on_shoot', params: {} },
                  { id: 'c_tur_los', objectTypeId: 'obj_turret', behaviorId: 'beh_turret_los', conditionId: 'has_los', params: { object: 'obj_player' } },
                ],
                actions: [
                  { id: 'a_tur_fire', objectTypeId: 'obj_turret', actionId: 'spawn_object', params: { object: 'obj_laser', layer: '0' } },
                  { id: 'a_lz_ang', objectTypeId: 'obj_laser', behaviorId: 'beh_laser_bullet', actionId: 'set_angle_of_motion', params: { angle: 'AutoTurret.Angle' } },
                  { id: 'a_tur_sfx', objectTypeId: 'obj_audio', actionId: 'play_synth', params: { preset: 'laser', volume: '-8', tag: '"sfx"' } },
                ],
                subEvents: [],
              },
              {
                id: 'ev_drone_repath',
                kind: 'event',
                conditions: [{ id: 'c_dr_tick', objectTypeId: 'system', conditionId: 'every_x_seconds', params: { interval: '2.5' } }],
                actions: [
                  { id: 'a_dr_find', objectTypeId: 'obj_drone', behaviorId: 'beh_drone_path', actionId: 'find_path', params: { x: 'Player.X', y: 'max(64, Player.Y - 96)' } },
                ],
                subEvents: [],
              },
              {
                id: 'ev_drone_found',
                kind: 'event',
                conditions: [{ id: 'c_dr_found', objectTypeId: 'obj_drone', behaviorId: 'beh_drone_path', conditionId: 'on_path_found', params: {} }],
                actions: [
                  { id: 'a_dr_move', objectTypeId: 'obj_drone', behaviorId: 'beh_drone_path', actionId: 'move_along_path', params: {} },
                ],
                subEvents: [],
              },
            ],
          },
          {
            id: 'grp_controls',
            kind: 'group',
            title: 'Player Animations & Audio',
            activeAtStart: true,
            items: [
              {
                id: 'ev_move_run',
                kind: 'event',
                conditions: [
                  { id: 'c_onfloor1', objectTypeId: 'obj_player', behaviorId: 'beh_platform', conditionId: 'is_on_floor', params: {} },
                  { id: 'c_ismov', objectTypeId: 'obj_player', behaviorId: 'beh_platform', conditionId: 'is_moving', params: {} },
                ],
                actions: [{ id: 'a_run', objectTypeId: 'obj_player', actionId: 'set_animation', params: { name: '"Run"', from: 'beginning' } }],
                subEvents: [],
              },
              {
                id: 'ev_move_idle',
                kind: 'event',
                conditions: [
                  { id: 'c_onfloor2', objectTypeId: 'obj_player', behaviorId: 'beh_platform', conditionId: 'is_on_floor', params: {} },
                  { id: 'c_notmov', objectTypeId: 'obj_player', behaviorId: 'beh_platform', conditionId: 'is_moving', inverted: true, params: {} },
                ],
                actions: [{ id: 'a_idle', objectTypeId: 'obj_player', actionId: 'set_animation', params: { name: '"Idle"', from: 'beginning' } }],
                subEvents: [],
              },
              {
                id: 'ev_air',
                kind: 'event',
                isOrBlock: true,
                conditions: [
                  { id: 'c_jmp', objectTypeId: 'obj_player', behaviorId: 'beh_platform', conditionId: 'is_jumping', params: {} },
                  { id: 'c_fall', objectTypeId: 'obj_player', behaviorId: 'beh_platform', conditionId: 'is_falling', params: {} },
                ],
                actions: [{ id: 'a_jmp_anim', objectTypeId: 'obj_player', actionId: 'set_animation', params: { name: '"Jump"', from: 'beginning' } }],
                subEvents: [],
              },
              {
                id: 'ev_dir_left',
                kind: 'event',
                isOrBlock: true,
                conditions: [
                  { id: 'c_kl', objectTypeId: 'obj_keyboard', conditionId: 'is_key_down', params: { key: 'ArrowLeft' } },
                  { id: 'c_ka', objectTypeId: 'obj_keyboard', conditionId: 'is_key_down', params: { key: 'KeyA' } },
                ],
                actions: [{ id: 'a_mirl', objectTypeId: 'obj_player', actionId: 'set_mirrored', params: { mirrored: 'true' } }],
                subEvents: [],
              },
              {
                id: 'ev_dir_right',
                kind: 'event',
                isOrBlock: true,
                conditions: [
                  { id: 'c_kr', objectTypeId: 'obj_keyboard', conditionId: 'is_key_down', params: { key: 'ArrowRight' } },
                  { id: 'c_kd', objectTypeId: 'obj_keyboard', conditionId: 'is_key_down', params: { key: 'KeyD' } },
                ],
                actions: [{ id: 'a_mirr', objectTypeId: 'obj_player', actionId: 'set_mirrored', params: { mirrored: 'false' } }],
                subEvents: [],
              },
              {
                id: 'ev_on_jump_sfx',
                kind: 'event',
                conditions: [{ id: 'c_onjmp', objectTypeId: 'obj_player', behaviorId: 'beh_platform', conditionId: 'on_jump', params: {} }],
                actions: [{ id: 'a_sfx_jmp', objectTypeId: 'obj_audio', actionId: 'play_synth', params: { preset: 'jump', volume: '-6', tag: '"sfx"' } }],
                subEvents: [],
              },
            ],
          },
          {
            id: 'ev_collect_coin',
            kind: 'event',
            conditions: [{ id: 'c_col_coin', objectTypeId: 'obj_player', conditionId: 'on_collision', params: { other: 'obj_coin' } }],
            actions: [
              { id: 'a_add_score', objectTypeId: 'system', actionId: 'add_var', params: { variable: 'Score', value: '10' } },
              { id: 'a_heal_hp', objectTypeId: 'obj_player', actionId: 'set_inst_var', params: { varName: 'Health', value: 'min(100, Player.Health + 15)' } },
              { id: 'a_coin_sfx', objectTypeId: 'obj_audio', actionId: 'play_synth', params: { preset: 'coin', volume: '-4', tag: '"sfx"' } },
              { id: 'a_coin_fx', objectTypeId: 'obj_coin', actionId: 'spawn_object', params: { object: 'obj_coin_particles', layer: '0' } },
              { id: 'a_coin_del', objectTypeId: 'obj_coin', actionId: 'destroy', params: {} },
            ],
            subEvents: [],
          },
          {
            id: 'ev_slime_patrol',
            kind: 'event',
            conditions: [{ id: 'c_slime_mk', objectTypeId: 'obj_slime', conditionId: 'on_collision', params: { other: 'obj_marker' } }],
            actions: [
              { id: 'a_slime_turn', objectTypeId: 'obj_slime', behaviorId: 'beh_slime_bullet', actionId: 'set_angle_of_motion', params: { angle: 'SlimeEnemy.Bullet.AngleOfMotion + 180' } },
              { id: 'a_slime_mir', objectTypeId: 'obj_slime', actionId: 'toggle_mirrored', params: {} },
            ],
            subEvents: [],
          },
          {
            id: 'ev_slime_hit',
            kind: 'event',
            conditions: [{ id: 'c_col_slime', objectTypeId: 'obj_player', conditionId: 'on_collision', params: { other: 'obj_slime' } }],
            actions: [],
            subEvents: [
              {
                id: 'ev_slime_stomp',
                kind: 'event',
                conditions: [
                  { id: 'c_above', objectTypeId: 'obj_player', conditionId: 'compare_y', params: { cmp: '<', value: 'SlimeEnemy.Y - 6' } },
                  { id: 'c_falling', objectTypeId: 'obj_player', behaviorId: 'beh_platform', conditionId: 'is_falling', params: {} },
                ],
                actions: [
                  { id: 'a_stomp_fx', objectTypeId: 'obj_slime', actionId: 'spawn_object', params: { object: 'obj_slime_particles', layer: '0' } },
                  { id: 'a_stomp_del', objectTypeId: 'obj_slime', actionId: 'destroy', params: {} },
                  { id: 'a_bounce', objectTypeId: 'obj_player', behaviorId: 'beh_platform', actionId: 'set_vector_y', params: { vy: '-400' } },
                  { id: 'a_stomp_sc', objectTypeId: 'system', actionId: 'add_var', params: { variable: 'Score', value: '25' } },
                  { id: 'a_stomp_sfx', objectTypeId: 'obj_audio', actionId: 'play_synth', params: { preset: 'explosion', volume: '-4', tag: '"sfx"' } },
                ],
                subEvents: [],
              },
              {
                id: 'ev_player_hurt',
                kind: 'event',
                isElse: true,
                conditions: [{ id: 'c_not_inv', objectTypeId: 'system', conditionId: 'compare_variable', params: { variable: 'Invincible', cmp: '=', value: '0' } }],
                actions: [
                  { id: 'a_sub_lv', objectTypeId: 'system', actionId: 'sub_var', params: { variable: 'Lives', value: '1' } },
                  { id: 'a_sub_hp', objectTypeId: 'obj_player', actionId: 'set_inst_var', params: { varName: 'Health', value: 'max(0, Player.Health - 34)' } },
                  { id: 'a_set_inv1', objectTypeId: 'system', actionId: 'set_var', params: { variable: 'Invincible', value: '1' } },
                  { id: 'a_flash', objectTypeId: 'obj_player', behaviorId: 'beh_flash', actionId: 'flash', params: { onTime: '0.07', offTime: '0.07', duration: '1.2' } },
                  { id: 'a_shake', objectTypeId: 'obj_player', behaviorId: 'beh_scrollto', actionId: 'shake', params: { magnitude: '10', duration: '0.35', mode: 'reducing' } },
                  { id: 'a_hit_sfx', objectTypeId: 'obj_audio', actionId: 'play_synth', params: { preset: 'hit', volume: '-2', tag: '"sfx"' } },
                  { id: 'a_wait_inv', objectTypeId: 'system', actionId: 'wait', params: { seconds: '1.2' } },
                  { id: 'a_set_inv0', objectTypeId: 'system', actionId: 'set_var', params: { variable: 'Invincible', value: '0' } },
                ],
                subEvents: [],
              },
            ],
          },
          {
            id: 'ev_laser_hit',
            kind: 'event',
            conditions: [{ id: 'c_col_lz', objectTypeId: 'obj_laser', conditionId: 'on_collision', params: { other: 'obj_player' } }],
            actions: [
              { id: 'a_lz_del', objectTypeId: 'obj_laser', actionId: 'destroy', params: {} },
              { id: 'a_lz_hp', objectTypeId: 'obj_player', actionId: 'set_inst_var', params: { varName: 'Health', value: 'max(0, Player.Health - 15)' } },
              { id: 'a_lz_fl', objectTypeId: 'obj_player', behaviorId: 'beh_flash', actionId: 'flash', params: { onTime: '0.05', offTime: '0.05', duration: '0.4' } },
              { id: 'a_lz_sfx', objectTypeId: 'obj_audio', actionId: 'play_synth', params: { preset: 'hit', volume: '-5', tag: '"sfx"' } },
            ],
            subEvents: [],
          },
          {
            id: 'ev_gameover',
            kind: 'event',
            conditions: [
              { id: 'c_lives0', objectTypeId: 'system', conditionId: 'compare_variable', params: { variable: 'Lives', cmp: '<=', value: '0' } },
              { id: 'c_go_once', objectTypeId: 'system', conditionId: 'trigger_once', params: {} },
            ],
            actions: [
              { id: 'a_go_wait', objectTypeId: 'system', actionId: 'wait', params: { seconds: '0.45' } },
              { id: 'a_reset_lv', objectTypeId: 'system', actionId: 'set_var', params: { variable: 'Lives', value: '3' } },
              { id: 'a_reset_sc', objectTypeId: 'system', actionId: 'set_var', params: { variable: 'Score', value: '0' } },
              { id: 'a_restart', objectTypeId: 'system', actionId: 'restart_layout', params: {} },
            ],
            subEvents: [],
          },
          {
            id: 'ev_goal',
            kind: 'event',
            conditions: [
              { id: 'c_col_portal', objectTypeId: 'obj_player', conditionId: 'on_collision', params: { other: 'obj_portal' } },
              { id: 'c_goal_once', objectTypeId: 'system', conditionId: 'trigger_once', params: {} },
            ],
            actions: [
              { id: 'a_win_sfx', objectTypeId: 'obj_audio', actionId: 'play_synth', params: { preset: 'win', volume: '-3', tag: '"sfx"' } },
              { id: 'a_win_wait', objectTypeId: 'system', actionId: 'wait', params: { seconds: '0.6' } },
              { id: 'a_win_go', objectTypeId: 'system', actionId: 'go_to_layout', params: { layout: 'layout_victory' } },
            ],
            subEvents: [],
          },
        ],
      },
      {
        id: 'es_victory',
        name: 'VictoryEvents',
        items: [
          {
            id: 'ev_v_tick',
            kind: 'event',
            conditions: [{ id: 'c_v_tick', objectTypeId: 'system', conditionId: 'every_tick', params: {} }],
            actions: [
              {
                id: 'a_v_txt',
                objectTypeId: 'obj_victory_text',
                actionId: 'set_text',
                params: {
                  text: '"[color=#22d3ee][b]SECTOR CLEARED![/b][/color]" & newline & "Final Score: " & Score & newline & newline & "[color=#94a3b8]Press Enter or Click to Play Again[/color]"',
                },
              },
            ],
            subEvents: [],
          },
          {
            id: 'ev_v_restart_key',
            kind: 'event',
            conditions: [{ id: 'c_v_enter', objectTypeId: 'obj_keyboard', conditionId: 'on_key_pressed', params: { key: 'Enter' } }],
            actions: [
              { id: 'a_v_sc1', objectTypeId: 'system', actionId: 'set_var', params: { variable: 'Score', value: '0' } },
              { id: 'a_v_lv1', objectTypeId: 'system', actionId: 'set_var', params: { variable: 'Lives', value: '3' } },
              { id: 'a_v_go1', objectTypeId: 'system', actionId: 'go_to_layout', params: { layout: 'layout_level1' } },
            ],
            subEvents: [],
          },
          {
            id: 'ev_v_restart_click',
            kind: 'event',
            conditions: [{ id: 'c_v_clk', objectTypeId: 'obj_mouse', conditionId: 'on_click', params: { button: 'left' } }],
            actions: [
              { id: 'a_v_sc2', objectTypeId: 'system', actionId: 'set_var', params: { variable: 'Score', value: '0' } },
              { id: 'a_v_lv2', objectTypeId: 'system', actionId: 'set_var', params: { variable: 'Lives', value: '3' } },
              { id: 'a_v_go2', objectTypeId: 'system', actionId: 'go_to_layout', params: { layout: 'layout_level1' } },
            ],
            subEvents: [],
          },
        ],
      },
    ],
    audioAssets: [],
  };
}

export function createBlankProject(): ProjectData {
  return {
    version: '1.0.0',
    name: 'Untitled Game',
    viewportWidth: 854,
    viewportHeight: 480,
    pixelRounding: true,
    fullscreenScaling: 'letterbox-scale',
    startupLayoutId: 'layout_1',
    nextUid: 1,
    postProcessSettings: {
      enabled: false,
      bloom: false,
      bloomIntensity: 0.8,
      crtScanlines: false,
      crtCurvature: 0.25,
      vignette: false,
      vignetteStrength: 0.35,
      chromaticAberration: false,
      chromaticOffset: 2.0,
      pixelate: 1,
    },
    virtualJoystickSettings: {
      enabled: false,
      deadzone: 0.15,
      size: 54,
      showActionButtons: true,
    },
    globalVariables: [],
    objectTypes: [...createGlobalPluginObjects()],
    layouts: [
      {
        id: 'layout_1',
        name: 'Layout 1',
        width: 1708,
        height: 960,
        backgroundColor: '#111622',
        eventSheetId: 'es_1',
        layers: [
          {
            id: 'layer_0',
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
    eventSheets: [
      {
        id: 'es_1',
        name: 'Event sheet 1',
        items: [],
      },
    ],
    audioAssets: [],
  };
}
