import { getWorldAABB, testOverlap } from './collision';
import { toNumber, toBool } from './expressionParser';
import { BehaviorRuntimeState, RuntimeHostAPI, RuntimeInstance } from './runtimeTypes';
import { getTilemapSolidAABBs, getTilemapSolidRects } from './tilemap';
import { BehaviorDef, Point2D, VarValue } from './types';

export function createBehaviorRuntimeState(def: BehaviorDef, inst: RuntimeInstance): BehaviorRuntimeState {
  const props = inst.behaviorProps[def.id] || def.properties;
  const activeAtStart = toBool(props.activeAtStart ?? true);
  return {
    vx: 0,
    vy: 0,
    onFloor: false,
    wasOnFloor: false,
    wasFalling: false,
    doubleJumpAvailable: toBool(props.doubleJump ?? true),
    jumpSustainRemaining: 0,
    fallThroughTimer: 0,
    byLeftWall: false,
    byRightWall: false,
    simLeft: false,
    simRight: false,
    simJump: false,
    simUp: false,
    simDown: false,

    bulletAngle: inst.angle,
    bulletVx: 0,
    bulletVy: 0,
    bulletInitialized: false,

    eightVx: 0,
    eightVy: 0,
    eightAngle: inst.angle,

    sineElapsed: toNumber(props.periodOffset ?? 0),
    sineValue: 0,
    sineLastOffset: 0,

    fadeState: def.type === 'Fade' && activeAtStart ? 'in' : 'idle',
    fadeElapsed: 0,

    flashActive: false,
    flashOnTime: 0.08,
    flashOffTime: 0.08,
    flashRemaining: 0,
    flashCycleElapsed: 0,
    flashVisible: true,

    timers: new Map(),

    isDragging: false,
    dragOffsetX: 0,
    dragOffsetY: 0,

    rotateSpeed: toNumber(props.speed ?? 90),
    rotateInitialized: false,

    tweens: new Map(),

    pinnedUid: 0,
    pinMode: 'both',
    pinLocalX: 0,
    pinLocalY: 0,
    pinRelAngle: 0,

    turretTargetTypeIds: [],
    turretTargetUid: 0,
    turretCooldown: 0,
    turretTargetLastPos: new Map(),

    pathNodes: [],
    pathNodeIndex: 0,
    pathMoving: false,
    pathSpeed: 0,
    pathMovingAngle: inst.angle,
    pathGridDirty: true,

    physicsVx: 0,
    physicsVy: 0,
    physicsVAng: 0,
    physicsMass: 1,
    physicsShape: props.collisionShape === 'circle' ? 'circle' : 'box',
    physicsRegistered: false,
  };
}

function getProp(inst: RuntimeInstance, def: BehaviorDef, key: string): VarValue {
  const override = inst.behaviorProps[def.id]?.[key];
  if (override !== undefined) return override;
  return def.properties[key] ?? 0;
}

function overlapsAny(
  inst: RuntimeInstance,
  candidates: RuntimeInstance[],
  host: RuntimeHostAPI
): RuntimeInstance | null {
  const rectA = host.getCollidableRect(inst);
  for (const other of candidates) {
    if (other === inst || other.destroyed) continue;
    if (other.objectType.plugin === 'Tilemap') {
      const tileRects = getTilemapSolidRects(other);
      for (const tr of tileRects) {
        if (testOverlap(rectA, tr)) return other;
      }
      continue;
    }
    if (testOverlap(rectA, host.getCollidableRect(other))) {
      return other;
    }
  }
  return null;
}

function getEnabledSolids(host: RuntimeHostAPI): RuntimeInstance[] {
  return host.getInstancesByBehavior('Solid').filter((s) => {
    const def = s.behaviorDefs.find((b) => b.type === 'Solid');
    return def ? toBool(getProp(s, def, 'enabled') ?? true) : true;
  });
}

function getEnabledJumpThrus(host: RuntimeHostAPI): RuntimeInstance[] {
  return host.getInstancesByBehavior('JumpThru').filter((s) => {
    const def = s.behaviorDefs.find((b) => b.type === 'JumpThru');
    return def ? toBool(getProp(s, def, 'enabled') ?? true) : true;
  });
}

export function stepInstanceBehaviors(inst: RuntimeInstance, host: RuntimeHostAPI): void {
  const dt = host.dt;
  if (dt <= 0 || inst.destroyed) return;

  for (const def of inst.behaviorDefs) {
    const state = inst.behaviorState[def.id];
    if (!state) continue;

    switch (def.type) {
      case 'Platform':
        stepPlatform(inst, def, state, host);
        break;
      case 'EightDirection':
        stepEightDirection(inst, def, state, host);
        break;
      case 'Bullet':
        stepBullet(inst, def, state, host);
        break;
      case 'Sine':
        stepSine(inst, def, state, dt);
        break;
      case 'Fade':
        stepFade(inst, def, state, host);
        break;
      case 'Flash':
        stepFlash(state, dt);
        break;
      case 'Timer':
        stepTimers(inst, def, state, host);
        break;
      case 'Rotate':
        stepRotate(inst, def, state, dt);
        break;
      case 'DragDrop':
        stepDragDrop(inst, def, state, host);
        break;
      case 'BoundTo':
        stepBoundTo(inst, def, host);
        break;
      case 'DestroyOutside':
        stepDestroyOutside(inst, def, host);
        break;
      case 'Wrap':
        stepWrap(inst, def, host);
        break;
      case 'Tween':
        stepTween(inst, def, state, host);
        break;
      case 'Pin':
        stepPin(inst, def, state, host);
        break;
      case 'Turret':
        stepTurret(inst, def, state, host);
        break;
      case 'Pathfinding':
        stepPathfinding(inst, def, state, host);
        break;
      case 'Physics':
        stepPhysics(inst, def, state, host);
        break;
      default:
        break;
    }
  }
}

function stepPlatform(
  inst: RuntimeInstance,
  def: BehaviorDef,
  st: BehaviorRuntimeState,
  host: RuntimeHostAPI
): void {
  const dt = host.dt;
  if (!toBool(getProp(inst, def, 'enabled') ?? true)) {
    st.simLeft = st.simRight = st.simJump = st.simDown = false;
    return;
  }

  const maxSpeed = toNumber(getProp(inst, def, 'maxSpeed'));
  const accel = toNumber(getProp(inst, def, 'acceleration'));
  const decel = toNumber(getProp(inst, def, 'deceleration'));
  const jumpStrength = toNumber(getProp(inst, def, 'jumpStrength'));
  const gravity = toNumber(getProp(inst, def, 'gravity'));
  const maxFallSpeed = toNumber(getProp(inst, def, 'maxFallSpeed'));
  const allowDoubleJump = toBool(getProp(inst, def, 'doubleJump'));
  const jumpSustainMs = toNumber(getProp(inst, def, 'jumpSustain'));
  const defaultControls = toBool(getProp(inst, def, 'defaultControls'));

  const keys = host.input.keysDown;
  const gpAxes = host.input.gamepadAxes[0] || [];
  const gpBtns = host.input.gamepadButtons[0] || [];
  const joyX = host.input.virtualJoyActive ? host.input.virtualJoyX : 0;
  const moveLeft = st.simLeft || (defaultControls && (keys.has('ArrowLeft') || keys.has('KeyA') || gpAxes[0] < -0.35 || gpBtns[14] || joyX < -0.25));
  const moveRight = st.simRight || (defaultControls && (keys.has('ArrowRight') || keys.has('KeyD') || gpAxes[0] > 0.35 || gpBtns[15] || joyX > 0.25));
  const holdJump =
    st.simJump || (defaultControls && (keys.has('ArrowUp') || keys.has('KeyW') || keys.has('Space') || gpBtns[0] || host.input.virtualBtnA));
  const holdDown = st.simDown || (defaultControls && (keys.has('ArrowDown') || keys.has('KeyS') || gpAxes[1] > 0.5 || gpBtns[13]));

  // Track edge-triggered jump key
  const prevJumpHeld = st.simUp;
  const jumpJustPressed = holdJump && !prevJumpHeld;
  st.simUp = holdJump;
  st.simLeft = st.simRight = st.simJump = st.simDown = false;

  if (st.fallThroughTimer > 0) {
    st.fallThroughTimer = Math.max(0, st.fallThroughTimer - dt);
  }
  if (holdDown && st.onFloor) {
    // Check if standing on a JumpThru -> fall through
    const jumpThrus = getEnabledJumpThrus(host);
    inst.y += 2;
    const jt = overlapsAny(inst, jumpThrus, host);
    inst.y -= 2;
    if (jt) {
      st.fallThroughTimer = 0.2;
      st.onFloor = false;
    }
  }

  // Horizontal acceleration / deceleration
  if (moveLeft && !moveRight) {
    st.vx -= accel * dt;
    if (st.vx < -maxSpeed) st.vx = -maxSpeed;
  } else if (moveRight && !moveLeft) {
    st.vx += accel * dt;
    if (st.vx > maxSpeed) st.vx = maxSpeed;
  } else {
    if (st.vx > 0) {
      st.vx = Math.max(0, st.vx - decel * dt);
    } else if (st.vx < 0) {
      st.vx = Math.min(0, st.vx + decel * dt);
    }
  }

  // Jump logic
  if (jumpJustPressed) {
    if (st.onFloor) {
      st.vy = -jumpStrength;
      st.onFloor = false;
      st.doubleJumpAvailable = allowDoubleJump;
      st.jumpSustainRemaining = jumpSustainMs / 1000;
      host.queueTrigger('platform_on_jump', inst);
    } else if (allowDoubleJump && st.doubleJumpAvailable) {
      st.vy = -jumpStrength * 0.92;
      st.doubleJumpAvailable = false;
      st.jumpSustainRemaining = (jumpSustainMs / 1000) * 0.6;
      host.queueTrigger('platform_on_jump', inst);
    }
  }

  // Jump sustain
  let effectiveGravity = gravity;
  if (holdJump && st.vy < 0 && st.jumpSustainRemaining > 0) {
    st.jumpSustainRemaining -= dt;
    effectiveGravity *= 0.45;
  } else {
    st.jumpSustainRemaining = 0;
  }

  st.vy = Math.min(maxFallSpeed, st.vy + effectiveGravity * dt);

  const solids = getEnabledSolids(host);
  const jumpThrus = getEnabledJumpThrus(host);

  // Move X & resolve solid collisions
  st.byLeftWall = false;
  st.byRightWall = false;
  const dx = st.vx * dt;
  if (Math.abs(dx) > 0.0001) {
    const prevX = inst.x;
    inst.x += dx;
    const hit = overlapsAny(inst, solids, host);
    if (hit) {
      // Try gentle step-up (up to 4px)
      let stepped = false;
      for (let step = 1; step <= 4; step++) {
        inst.y -= 1;
        if (!overlapsAny(inst, solids, host)) {
          stepped = true;
          break;
        }
      }
      if (!stepped) {
        inst.y += 4;
        inst.x = prevX;
        // Binary search to wall
        let lo = 0;
        let hi = 1;
        for (let i = 0; i < 6; i++) {
          const mid = (lo + hi) * 0.5;
          inst.x = prevX + dx * mid;
          if (overlapsAny(inst, solids, host)) {
            hi = mid;
          } else {
            lo = mid;
          }
        }
        inst.x = prevX + dx * lo;
        if (dx > 0) st.byRightWall = true;
        else st.byLeftWall = true;
        st.vx = 0;
      }
    }
  } else {
    // Check adjacent walls even when stationary
    inst.x -= 1;
    st.byLeftWall = overlapsAny(inst, solids, host) !== null;
    inst.x += 2;
    st.byRightWall = overlapsAny(inst, solids, host) !== null;
    inst.x -= 1;
  }

  // Move Y & resolve Solid + JumpThru
  const prevBottom = getWorldAABB(host.getCollidableRect(inst)).bottom;
  const prevY = inst.y;
  const dy = st.vy * dt;
  inst.y += dy;

  st.wasOnFloor = st.onFloor;
  st.onFloor = false;

  const hitSolidY = overlapsAny(inst, solids, host);
  if (hitSolidY) {
    inst.y = prevY;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 7; i++) {
      const mid = (lo + hi) * 0.5;
      inst.y = prevY + dy * mid;
      if (overlapsAny(inst, solids, host)) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    inst.y = prevY + dy * lo;
    if (st.vy >= 0) {
      st.onFloor = true;
      st.doubleJumpAvailable = allowDoubleJump;
    }
    st.vy = 0;
  } else if (st.vy >= 0 && st.fallThroughTimer <= 0) {
    // Check Jump-thru platforms only when falling/standing from above
    const rectA = host.getCollidableRect(inst);
    for (const jt of jumpThrus) {
      if (jt.destroyed) continue;
      const jtRect = host.getCollidableRect(jt);
      const jtBox = getWorldAABB(jtRect);
      if (prevBottom <= jtBox.top + 4 && testOverlap(rectA, jtRect)) {
        // Snap onto top of JumpThru
        const curBox = getWorldAABB(rectA);
        const pen = curBox.bottom - jtBox.top;
        inst.y -= pen;
        st.onFloor = true;
        st.doubleJumpAvailable = allowDoubleJump;
        st.vy = 0;
        break;
      }
    }
  }

  // Fallback floor probe (1px below) when vy === 0
  if (!st.onFloor && st.vy >= 0) {
    inst.y += 1.5;
    if (overlapsAny(inst, solids, host)) {
      st.onFloor = true;
      st.doubleJumpAvailable = allowDoubleJump;
    } else if (st.fallThroughTimer <= 0) {
      const rectA = host.getCollidableRect(inst);
      for (const jt of jumpThrus) {
        const jtBox = getWorldAABB(host.getCollidableRect(jt));
        if (prevBottom <= jtBox.top + 4 && testOverlap(rectA, host.getCollidableRect(jt))) {
          st.onFloor = true;
          st.doubleJumpAvailable = allowDoubleJump;
          break;
        }
      }
    }
    inst.y -= 1.5;
  }

  // Fire Platform triggers
  if (st.onFloor && !st.wasOnFloor) {
    host.queueTrigger('platform_on_landed', inst);
  }
  const isFallingNow = !st.onFloor && st.vy > 0;
  if (isFallingNow && !st.wasFalling) {
    host.queueTrigger('platform_on_fall', inst);
  }
  st.wasFalling = isFallingNow;
}

function stepEightDirection(
  inst: RuntimeInstance,
  def: BehaviorDef,
  st: BehaviorRuntimeState,
  host: RuntimeHostAPI
): void {
  const dt = host.dt;
  if (!toBool(getProp(inst, def, 'enabled') ?? true)) {
    st.simLeft = st.simRight = st.simUp = st.simDown = false;
    return;
  }

  const maxSpeed = toNumber(getProp(inst, def, 'maxSpeed'));
  const accel = toNumber(getProp(inst, def, 'acceleration'));
  const decel = toNumber(getProp(inst, def, 'deceleration'));
  const dirs = String(getProp(inst, def, 'directions') || '8');
  const setAngleMode = String(getProp(inst, def, 'setAngle') || '360');
  const defaultControls = toBool(getProp(inst, def, 'defaultControls'));

  const keys = host.input.keysDown;
  let ix = 0;
  let iy = 0;
  if (st.simLeft || (defaultControls && (keys.has('ArrowLeft') || keys.has('KeyA')))) ix -= 1;
  if (st.simRight || (defaultControls && (keys.has('ArrowRight') || keys.has('KeyD')))) ix += 1;
  if (st.simUp || (defaultControls && (keys.has('ArrowUp') || keys.has('KeyW')))) iy -= 1;
  if (st.simDown || (defaultControls && (keys.has('ArrowDown') || keys.has('KeyS')))) iy += 1;
  st.simLeft = st.simRight = st.simUp = st.simDown = false;

  if (dirs === 'up-down') ix = 0;
  if (dirs === 'left-right') iy = 0;
  if (dirs === '4' && ix !== 0 && iy !== 0) iy = 0;

  if (ix !== 0 || iy !== 0) {
    const len = Math.hypot(ix, iy);
    const nx = ix / len;
    const ny = iy / len;
    st.eightVx += nx * accel * dt;
    st.eightVy += ny * accel * dt;
    const spd = Math.hypot(st.eightVx, st.eightVy);
    if (spd > maxSpeed) {
      st.eightVx = (st.eightVx / spd) * maxSpeed;
      st.eightVy = (st.eightVy / spd) * maxSpeed;
    }
  } else {
    const spd = Math.hypot(st.eightVx, st.eightVy);
    if (spd > 0) {
      const nextSpd = Math.max(0, spd - decel * dt);
      const ratio = nextSpd / spd;
      st.eightVx *= ratio;
      st.eightVy *= ratio;
    }
  }

  const spd = Math.hypot(st.eightVx, st.eightVy);
  if (spd > 1) {
    const ang = ((Math.atan2(st.eightVy, st.eightVx) * 180) / Math.PI + 360) % 360;
    st.eightAngle = ang;
    if (setAngleMode === '360') inst.angle = ang;
    else if (setAngleMode === '90') inst.angle = Math.round(ang / 90) * 90;
    else if (setAngleMode === '45') inst.angle = Math.round(ang / 45) * 45;
  }

  const solids = getEnabledSolids(host);
  const prevX = inst.x;
  inst.x += st.eightVx * dt;
  if (overlapsAny(inst, solids, host)) {
    inst.x = prevX;
    st.eightVx = 0;
  }
  const prevY = inst.y;
  inst.y += st.eightVy * dt;
  if (overlapsAny(inst, solids, host)) {
    inst.y = prevY;
    st.eightVy = 0;
  }
}

function stepBullet(
  inst: RuntimeInstance,
  def: BehaviorDef,
  st: BehaviorRuntimeState,
  host: RuntimeHostAPI
): void {
  const dt = host.dt;
  if (!toBool(getProp(inst, def, 'enabled') ?? true)) return;

  const initSpeed = toNumber(getProp(inst, def, 'speed'));
  const accel = toNumber(getProp(inst, def, 'acceleration'));
  const gravity = toNumber(getProp(inst, def, 'gravity'));
  const bounce = toBool(getProp(inst, def, 'bounceOffSolids'));
  const setAngle = toBool(getProp(inst, def, 'setAngle'));

  if (!st.bulletInitialized) {
    st.bulletInitialized = true;
    st.bulletAngle = inst.angle;
    const rad = (st.bulletAngle * Math.PI) / 180;
    st.bulletVx = Math.cos(rad) * initSpeed;
    st.bulletVy = Math.sin(rad) * initSpeed;
  }

  if (accel !== 0) {
    const curSpd = Math.hypot(st.bulletVx, st.bulletVy);
    const nextSpd = curSpd + accel * dt;
    const rad = (st.bulletAngle * Math.PI) / 180;
    st.bulletVx = Math.cos(rad) * nextSpd;
    st.bulletVy = Math.sin(rad) * nextSpd;
  }

  if (gravity !== 0) {
    st.bulletVy += gravity * dt;
  }

  const solids = bounce ? getEnabledSolids(host) : [];
  const prevX = inst.x;
  inst.x += st.bulletVx * dt;
  if (bounce && overlapsAny(inst, solids, host)) {
    inst.x = prevX;
    st.bulletVx = -st.bulletVx;
  }

  const prevY = inst.y;
  inst.y += st.bulletVy * dt;
  if (bounce && overlapsAny(inst, solids, host)) {
    inst.y = prevY;
    st.bulletVy = -st.bulletVy;
  }

  st.bulletAngle = ((Math.atan2(st.bulletVy, st.bulletVx) * 180) / Math.PI + 360) % 360;
  if (setAngle) {
    inst.angle = st.bulletAngle;
  }
}

function stepSine(inst: RuntimeInstance, def: BehaviorDef, st: BehaviorRuntimeState, dt: number): void {
  if (!toBool(getProp(inst, def, 'enabled') ?? true)) return;

  const movement = String(getProp(inst, def, 'movement') || 'Vertical');
  const wave = String(getProp(inst, def, 'wave') || 'Sine');
  const period = Math.max(0.05, toNumber(getProp(inst, def, 'period') || 2));
  const magnitude = toNumber(getProp(inst, def, 'magnitude') || 8);

  st.sineElapsed += dt;
  const phase = (st.sineElapsed % period) / period; // 0..1

  let waveVal = 0;
  switch (wave) {
    case 'Triangle':
      waveVal = phase < 0.25 ? phase * 4 : phase < 0.75 ? 2 - phase * 4 : phase * 4 - 4;
      break;
    case 'Sawtooth':
      waveVal = phase * 2 - 1;
      break;
    case 'Square':
      waveVal = phase < 0.5 ? 1 : -1;
      break;
    case 'Sine':
    default:
      waveVal = Math.sin(phase * Math.PI * 2);
      break;
  }

  const nextOffset = waveVal * magnitude;
  const delta = nextOffset - st.sineLastOffset;
  st.sineValue = nextOffset;
  st.sineLastOffset = nextOffset;

  switch (movement) {
    case 'Horizontal':
      inst.x += delta;
      break;
    case 'Vertical':
      inst.y += delta;
      break;
    case 'Width':
      inst.width = Math.max(1, inst.width + delta);
      break;
    case 'Height':
      inst.height = Math.max(1, inst.height + delta);
      break;
    case 'Size':
      inst.width = Math.max(1, inst.width + delta);
      inst.height = Math.max(1, inst.height + delta);
      break;
    case 'Angle':
      inst.angle = (inst.angle + delta) % 360;
      break;
    case 'Opacity':
      inst.opacity = Math.max(0, Math.min(100, inst.opacity + delta));
      break;
    case 'Value only':
    default:
      break;
  }
}

function stepFade(inst: RuntimeInstance, def: BehaviorDef, st: BehaviorRuntimeState, host: RuntimeHostAPI): void {
  if (st.fadeState === 'idle' || st.fadeState === 'done') return;

  const fadeIn = Math.max(0, toNumber(getProp(inst, def, 'fadeInTime')));
  const wait = Math.max(0, toNumber(getProp(inst, def, 'waitTime')));
  const fadeOut = Math.max(0, toNumber(getProp(inst, def, 'fadeOutTime')));
  const destroyOnFinish = toBool(getProp(inst, def, 'destroyOnFinish') ?? true);

  st.fadeElapsed += host.dt;

  if (st.fadeState === 'in') {
    if (fadeIn <= 0 || st.fadeElapsed >= fadeIn) {
      inst.opacity = 100;
      st.fadeElapsed = 0;
      st.fadeState = 'wait';
    } else {
      inst.opacity = (st.fadeElapsed / fadeIn) * 100;
    }
  }
  if (st.fadeState === 'wait') {
    if (wait <= 0 || st.fadeElapsed >= wait) {
      st.fadeElapsed = 0;
      st.fadeState = 'out';
    }
  }
  if (st.fadeState === 'out') {
    if (fadeOut <= 0 || st.fadeElapsed >= fadeOut) {
      inst.opacity = 0;
      st.fadeState = 'done';
      host.queueTrigger('fade_on_finished', inst);
      if (destroyOnFinish) {
        host.destroyInstance(inst);
      }
    } else {
      inst.opacity = (1 - st.fadeElapsed / fadeOut) * 100;
    }
  }
}

function stepFlash(st: BehaviorRuntimeState, dt: number): void {
  if (!st.flashActive) {
    st.flashVisible = true;
    return;
  }
  st.flashRemaining -= dt;
  if (st.flashRemaining <= 0) {
    st.flashActive = false;
    st.flashVisible = true;
    return;
  }
  const cycle = Math.max(0.01, st.flashOnTime + st.flashOffTime);
  st.flashCycleElapsed = (st.flashCycleElapsed + dt) % cycle;
  st.flashVisible = st.flashCycleElapsed < st.flashOnTime;
}

function stepTimers(
  inst: RuntimeInstance,
  _def: BehaviorDef,
  st: BehaviorRuntimeState,
  host: RuntimeHostAPI
): void {
  for (const [tag, entry] of Array.from(st.timers.entries())) {
    if (!entry.running) continue;
    entry.elapsed += host.dt;
    if (entry.elapsed >= entry.duration) {
      host.queueTrigger('timer_on_timer', inst, { tag });
      if (entry.type === 'Regular') {
        entry.elapsed -= entry.duration;
      } else {
        entry.running = false;
        st.timers.delete(tag);
      }
    }
  }
}

function stepRotate(inst: RuntimeInstance, def: BehaviorDef, st: BehaviorRuntimeState, dt: number): void {
  if (!toBool(getProp(inst, def, 'enabled') ?? true)) return;
  if (!st.rotateInitialized) {
    st.rotateInitialized = true;
    st.rotateSpeed = toNumber(getProp(inst, def, 'speed') || 90);
  }
  const accel = toNumber(getProp(inst, def, 'acceleration') || 0);
  st.rotateSpeed += accel * dt;
  inst.angle = ((inst.angle + st.rotateSpeed * dt) % 360 + 360) % 360;
}

function stepDragDrop(
  inst: RuntimeInstance,
  def: BehaviorDef,
  st: BehaviorRuntimeState,
  host: RuntimeHostAPI
): void {
  if (!toBool(getProp(inst, def, 'enabled') ?? true)) {
    if (st.isDragging) {
      st.isDragging = false;
      host.queueTrigger('dragdrop_on_drop', inst);
    }
    return;
  }
  const axes = String(getProp(inst, def, 'axes') || 'Both');
  const px = host.input.mouseX;
  const py = host.input.mouseY;

  if (host.input.mouseJustPressed.has(0)) {
    const box = getWorldAABB(host.getCollidableRect(inst));
    if (px >= box.left && px <= box.right && py >= box.top && py <= box.bottom) {
      st.isDragging = true;
      st.dragOffsetX = inst.x - px;
      st.dragOffsetY = inst.y - py;
      host.queueTrigger('dragdrop_on_drag_start', inst);
    }
  }

  if (st.isDragging) {
    if (host.input.mouseButtonsDown.has(0)) {
      if (axes === 'Both' || axes === 'Horizontal only') {
        inst.x = px + st.dragOffsetX;
      }
      if (axes === 'Both' || axes === 'Vertical only') {
        inst.y = py + st.dragOffsetY;
      }
    } else {
      st.isDragging = false;
      host.queueTrigger('dragdrop_on_drop', inst);
    }
  }
}

function getScopeBounds(scope: string, host: RuntimeHostAPI) {
  if (scope === 'Viewport') {
    const left = host.scrollX - host.viewportWidth * 0.5;
    const top = host.scrollY - host.viewportHeight * 0.5;
    return {
      left,
      top,
      right: left + host.viewportWidth,
      bottom: top + host.viewportHeight,
    };
  }
  return {
    left: 0,
    top: 0,
    right: host.layoutWidth,
    bottom: host.layoutHeight,
  };
}

function stepBoundTo(inst: RuntimeInstance, def: BehaviorDef, host: RuntimeHostAPI): void {
  const scope = String(getProp(inst, def, 'boundTo') || 'Layout');
  const mode = String(getProp(inst, def, 'mode') || 'Edge');
  const bounds = getScopeBounds(scope, host);

  if (mode === 'Origin') {
    inst.x = Math.max(bounds.left, Math.min(bounds.right, inst.x));
    inst.y = Math.max(bounds.top, Math.min(bounds.bottom, inst.y));
  } else {
    const box = getWorldAABB(host.getCollidableRect(inst));
    if (box.left < bounds.left) inst.x += bounds.left - box.left;
    if (box.right > bounds.right) inst.x -= box.right - bounds.right;
    if (box.top < bounds.top) inst.y += bounds.top - box.top;
    if (box.bottom > bounds.bottom) inst.y -= box.bottom - bounds.bottom;
  }
}

function stepDestroyOutside(inst: RuntimeInstance, def: BehaviorDef, host: RuntimeHostAPI): void {
  const scope = String(getProp(inst, def, 'scope') || 'Layout');
  const bounds = getScopeBounds(scope, host);
  const box = getWorldAABB(host.getCollidableRect(inst));
  if (box.right < bounds.left || box.left > bounds.right || box.bottom < bounds.top || box.top > bounds.bottom) {
    host.destroyInstance(inst);
  }
}

function stepWrap(inst: RuntimeInstance, def: BehaviorDef, host: RuntimeHostAPI): void {
  const scope = String(getProp(inst, def, 'wrapTo') || 'Layout');
  const bounds = getScopeBounds(scope, host);
  const box = getWorldAABB(host.getCollidableRect(inst));
  const w = box.right - box.left;
  const h = box.bottom - box.top;
  let wrapped = false;

  if (box.right < bounds.left) {
    inst.x += bounds.right - bounds.left + w;
    wrapped = true;
  } else if (box.left > bounds.right) {
    inst.x -= bounds.right - bounds.left + w;
    wrapped = true;
  }

  if (box.bottom < bounds.top) {
    inst.y += bounds.bottom - bounds.top + h;
    wrapped = true;
  } else if (box.top > bounds.bottom) {
    inst.y -= bounds.bottom - bounds.top + h;
    wrapped = true;
  }

  if (wrapped) {
    host.queueTrigger('wrap_on_wrap', inst);
  }
}

// ==================== TWEEN ====================

function applyEasing(t: number, easing: string): number {
  const c = Math.max(0, Math.min(1, t));
  switch (easing) {
    case 'EaseOutQuad':
      return 1 - (1 - c) * (1 - c);
    case 'EaseInOutSine':
      return -(Math.cos(Math.PI * c) - 1) / 2;
    case 'Bounce': {
      const n1 = 7.5625;
      const d1 = 2.75;
      if (c < 1 / d1) return n1 * c * c;
      if (c < 2 / d1) {
        const u = c - 1.5 / d1;
        return n1 * u * u + 0.75;
      }
      if (c < 2.5 / d1) {
        const u = c - 2.25 / d1;
        return n1 * u * u + 0.9375;
      }
      const u = c - 2.625 / d1;
      return n1 * u * u + 0.984375;
    }
    case 'Linear':
    default:
      return c;
  }
}

function stepTween(inst: RuntimeInstance, def: BehaviorDef, st: BehaviorRuntimeState, host: RuntimeHostAPI): void {
  if (!toBool(getProp(inst, def, 'enabled') ?? true)) return;
  if (st.tweens.size === 0) return;

  for (const tw of st.tweens.values()) {
    if (tw.paused || tw.finished) continue;

    let completedThisTick = false;
    if (tw.duration <= 0) {
      tw.elapsed = tw.duration;
      tw.progress = 1;
      completedThisTick = true;
    } else {
      tw.elapsed += host.dt * tw.direction;
      if (tw.direction === 1 && tw.elapsed >= tw.duration) {
        if (tw.loopMode === 'loop') {
          tw.elapsed = tw.elapsed % tw.duration;
        } else if (tw.loopMode === 'pingpong') {
          const overshoot = tw.elapsed - tw.duration;
          tw.elapsed = Math.max(0, tw.duration - overshoot);
          tw.direction = -1;
        } else {
          tw.elapsed = tw.duration;
          completedThisTick = true;
        }
      } else if (tw.direction === -1 && tw.elapsed <= 0) {
        if (tw.loopMode === 'pingpong') {
          tw.elapsed = Math.min(tw.duration, -tw.elapsed);
          tw.direction = 1;
        } else {
          tw.elapsed = 0;
          completedThisTick = true;
        }
      }
    }

    const rawT = tw.duration > 0 ? Math.max(0, Math.min(1, tw.elapsed / tw.duration)) : 1;
    const eased = applyEasing(rawT, tw.easing);
    tw.progress = rawT;

    const v1 = tw.start1 + (tw.end1 - tw.start1) * eased;
    tw.currentValue = v1;

    if (tw.kind === 'one') {
      switch (tw.prop1) {
        case 'x':
          inst.x = v1;
          break;
        case 'y':
          inst.y = v1;
          break;
        case 'angle':
          inst.angle = ((v1 % 360) + 360) % 360;
          break;
        case 'opacity':
          inst.opacity = Math.max(0, Math.min(100, v1));
          break;
        case 'width':
          inst.width = Math.max(1, v1);
          break;
        case 'height':
          inst.height = Math.max(1, v1);
          break;
        case 'scale': {
          const bw = tw.baseWidth ?? (inst.objectType.defaultWidth || 32);
          const bh = tw.baseHeight ?? (inst.objectType.defaultHeight || 32);
          inst.width = Math.max(1, bw * v1);
          inst.height = Math.max(1, bh * v1);
          break;
        }
      }
    } else if (tw.kind === 'two') {
      const s2 = tw.start2 ?? 0;
      const e2 = tw.end2 ?? 0;
      const v2 = s2 + (e2 - s2) * eased;
      if (tw.prop1 === 'position') {
        inst.x = v1;
        inst.y = v2;
      } else if (tw.prop1 === 'size') {
        inst.width = Math.max(1, v1);
        inst.height = Math.max(1, v2);
      } else if (tw.prop1 === 'scale') {
        const bw = tw.baseWidth ?? (inst.objectType.defaultWidth || 32);
        const bh = tw.baseHeight ?? (inst.objectType.defaultHeight || 32);
        inst.width = Math.max(1, bw * v1);
        inst.height = Math.max(1, bh * v2);
      }
    }

    if (completedThisTick) {
      tw.finished = true;
      tw.paused = true;
      host.queueTrigger('tween_on_finished', inst, { tag: tw.tag });
      if (tw.destroyOnFinish) {
        host.destroyInstance(inst);
      }
    }
  }
}

// ==================== PIN ====================

function stepPin(inst: RuntimeInstance, def: BehaviorDef, st: BehaviorRuntimeState, host: RuntimeHostAPI): void {
  if (st.pinnedUid === 0) return;

  const target = host.getInstanceByUid(st.pinnedUid);
  if (!target || target.destroyed) {
    const destroyWith = toBool(getProp(inst, def, 'destroyWithPinned') ?? false);
    st.pinnedUid = 0;
    if (destroyWith) {
      host.destroyInstance(inst);
    }
    return;
  }

  if (st.pinMode === 'both' || st.pinMode === 'position') {
    const rad = (target.angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    inst.x = target.x + st.pinLocalX * cos - st.pinLocalY * sin;
    inst.y = target.y + st.pinLocalX * sin + st.pinLocalY * cos;
  }

  if (st.pinMode === 'both' || st.pinMode === 'angle') {
    inst.angle = (((target.angle + st.pinRelAngle) % 360) + 360) % 360;
  }
}

// ==================== TURRET ====================

function stepTurret(inst: RuntimeInstance, def: BehaviorDef, st: BehaviorRuntimeState, host: RuntimeHostAPI): void {
  if (!toBool(getProp(inst, def, 'enabled') ?? true)) {
    st.turretTargetUid = 0;
    return;
  }

  st.turretCooldown = Math.max(0, st.turretCooldown - host.dt);

  const range = Math.max(0, toNumber(getProp(inst, def, 'range') ?? 300));
  const rateOfFire = Math.max(0.02, toNumber(getProp(inst, def, 'rateOfFire') ?? 0.6));
  const rotateSpeed = Math.max(0, toNumber(getProp(inst, def, 'rotateSpeed') ?? 180));
  const predictiveAim = toBool(getProp(inst, def, 'predictiveAim') ?? false);
  const projectileSpeed = Math.max(10, toNumber(getProp(inst, def, 'projectileSpeed') ?? 450));
  const defaultTargetName = String(getProp(inst, def, 'targetObject') || '').trim();

  const targetTypeIds = new Set<string>(st.turretTargetTypeIds);
  if (defaultTargetName) {
    const ot = host.findObjectTypeByName(defaultTargetName);
    if (ot) targetTypeIds.add(ot.id);
  }

  const candidates: RuntimeInstance[] = [];
  for (const tid of targetTypeIds) {
    for (const c of host.getInstancesByObjectTypeId(tid)) {
      if (!c.destroyed && c !== inst) {
        candidates.push(c);
      }
    }
  }

  // Update tracked target velocities for predictive aim
  const nextTracked = new Map<number, { x: number; y: number; vx: number; vy: number }>();
  for (const c of candidates) {
    const prev = st.turretTargetLastPos.get(c.uid);
    let vx = 0;
    let vy = 0;
    if (prev && host.dt > 0.0001) {
      const ivx = (c.x - prev.x) / host.dt;
      const ivy = (c.y - prev.y) / host.dt;
      vx = prev.vx * 0.4 + ivx * 0.6;
      vy = prev.vy * 0.4 + ivy * 0.6;
    }
    nextTracked.set(c.uid, { x: c.x, y: c.y, vx, vy });
  }
  st.turretTargetLastPos = nextTracked;

  // Validate current target or acquire nearest in range
  let target: RuntimeInstance | undefined;
  if (st.turretTargetUid !== 0) {
    const cur = candidates.find((c) => c.uid === st.turretTargetUid);
    if (cur && Math.hypot(cur.x - inst.x, cur.y - inst.y) <= range) {
      target = cur;
    }
  }

  if (!target) {
    let bestDist = Infinity;
    for (const c of candidates) {
      const d = Math.hypot(c.x - inst.x, c.y - inst.y);
      if (d <= range && d < bestDist) {
        bestDist = d;
        target = c;
      }
    }
    if (target) {
      if (st.turretTargetUid !== target.uid) {
        st.turretTargetUid = target.uid;
        host.queueTrigger('turret_on_target_acquired', inst);
      }
    } else {
      st.turretTargetUid = 0;
      return;
    }
  }

  // Compute aim coordinates (with optional quadratic intercept prediction)
  let aimX = target.x;
  let aimY = target.y;
  if (predictiveAim) {
    const vel = st.turretTargetLastPos.get(target.uid);
    if (vel) {
      const rx = target.x - inst.x;
      const ry = target.y - inst.y;
      const vx = vel.vx;
      const vy = vel.vy;
      const a = vx * vx + vy * vy - projectileSpeed * projectileSpeed;
      const b = 2 * (rx * vx + ry * vy);
      const c = rx * rx + ry * ry;
      let t = -1;
      if (Math.abs(a) < 1e-4) {
        if (b < -1e-4) t = -c / b;
      } else {
        const disc = b * b - 4 * a * c;
        if (disc >= 0) {
          const sq = Math.sqrt(disc);
          const t1 = (-b - sq) / (2 * a);
          const t2 = (-b + sq) / (2 * a);
          if (t1 > 0 && t2 > 0) t = Math.min(t1, t2);
          else if (t1 > 0) t = t1;
          else if (t2 > 0) t = t2;
        }
      }
      if (t > 0 && t < 4) {
        aimX = target.x + vx * t;
        aimY = target.y + vy * t;
      }
    }
  }

  const desiredAngle = ((Math.atan2(aimY - inst.y, aimX - inst.x) * 180) / Math.PI + 360) % 360;
  const diff = ((desiredAngle - inst.angle + 540) % 360) - 180;
  const maxStep = rotateSpeed * host.dt;

  if (rotateSpeed <= 0 || Math.abs(diff) <= maxStep) {
    inst.angle = desiredAngle;
  } else {
    inst.angle = (((inst.angle + Math.sign(diff) * maxStep) % 360) + 360) % 360;
  }

  const postDiff = Math.abs(((desiredAngle - inst.angle + 540) % 360) - 180);
  if (postDiff <= 12 && st.turretCooldown <= 0) {
    st.turretCooldown = rateOfFire;
    host.queueTrigger('turret_on_shoot', inst);
  }
}

// ==================== LINE OF SIGHT ====================

export function computeLineOfSight(
  inst: RuntimeInstance,
  target: RuntimeInstance,
  range: number,
  coneOfView: number,
  host: RuntimeHostAPI
): boolean {
  if (inst === target || target.destroyed) return false;
  const dx = target.x - inst.x;
  const dy = target.y - inst.y;
  const dist = Math.hypot(dx, dy);
  if (dist > range) return false;

  if (coneOfView < 360 && dist > 0.001) {
    const angToTarget = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    const diff = Math.abs(((angToTarget - inst.angle + 540) % 360) - 180);
    if (diff > coneOfView * 0.5) return false;
  }

  return !host.raycastSolids(inst.x, inst.y, target.x, target.y, inst, target);
}

// ==================== PATHFINDING (A*) ====================

class MinHeap {
  private data: { idx: number; f: number }[] = [];

  get size(): number {
    return this.data.length;
  }

  push(idx: number, f: number): void {
    this.data.push({ idx, f });
    let i = this.data.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.data[p].f <= this.data[i].f) break;
      const tmp = this.data[p];
      this.data[p] = this.data[i];
      this.data[i] = tmp;
      i = p;
    }
  }

  pop(): number {
    const top = this.data[0].idx;
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      let i = 0;
      const len = this.data.length;
      while (true) {
        let smallest = i;
        const l = (i << 1) + 1;
        const r = l + 1;
        if (l < len && this.data[l].f < this.data[smallest].f) smallest = l;
        if (r < len && this.data[r].f < this.data[smallest].f) smallest = r;
        if (smallest === i) break;
        const tmp = this.data[i];
        this.data[i] = this.data[smallest];
        this.data[smallest] = tmp;
        i = smallest;
      }
    }
    return top;
  }
}

export function findAStarPath(
  inst: RuntimeInstance,
  def: BehaviorDef,
  st: BehaviorRuntimeState,
  targetX: number,
  targetY: number,
  host: RuntimeHostAPI
): void {
  const cellSize = Math.max(8, Math.round(toNumber(getProp(inst, def, 'cellSize') ?? 32)));
  const cellBorder = toNumber(getProp(inst, def, 'cellBorder') ?? 0);
  const allowDiagonals = toBool(getProp(inst, def, 'diagonals') ?? true);

  const cols = Math.max(1, Math.ceil(host.layoutWidth / cellSize));
  const rows = Math.max(1, Math.ceil(host.layoutHeight / cellSize));
  const total = cols * rows;

  const blocked = new Uint8Array(total);
  const solids = getEnabledSolids(host);
  for (const s of solids) {
    if (s === inst || s.destroyed) continue;
    const boxes = s.objectType.plugin === 'Tilemap' ? getTilemapSolidAABBs(s) : [getWorldAABB(host.getCollidableRect(s))];
    for (const box of boxes) {
      const c0 = Math.max(0, Math.floor((box.left - cellBorder) / cellSize));
      const c1 = Math.min(cols - 1, Math.floor((box.right + cellBorder - 0.001) / cellSize));
      const r0 = Math.max(0, Math.floor((box.top - cellBorder) / cellSize));
      const r1 = Math.min(rows - 1, Math.floor((box.bottom + cellBorder - 0.001) / cellSize));
      for (let r = r0; r <= r1; r++) {
        const rowOffset = r * cols;
        for (let c = c0; c <= c1; c++) {
          blocked[rowOffset + c] = 1;
        }
      }
    }
  }

  const sc = Math.max(0, Math.min(cols - 1, Math.floor(inst.x / cellSize)));
  const sr = Math.max(0, Math.min(rows - 1, Math.floor(inst.y / cellSize)));
  const gc = Math.max(0, Math.min(cols - 1, Math.floor(targetX / cellSize)));
  const gr = Math.max(0, Math.min(rows - 1, Math.floor(targetY / cellSize)));

  const startIdx = sr * cols + sc;
  const goalIdx = gr * cols + gc;

  // Always allow leaving the starting cell
  blocked[startIdx] = 0;

  if (startIdx === goalIdx) {
    st.pathNodes = [{ x: targetX, y: targetY }];
    st.pathNodeIndex = 0;
    st.pathMoving = false;
    st.pathGridDirty = false;
    host.queueTrigger('pathfinding_on_path_found', inst);
    return;
  }

  if (blocked[goalIdx]) {
    st.pathNodes = [];
    st.pathNodeIndex = 0;
    st.pathMoving = false;
    st.pathSpeed = 0;
    host.queueTrigger('pathfinding_on_failed', inst);
    return;
  }

  const gScore = new Float32Array(total);
  gScore.fill(Infinity);
  const cameFrom = new Int32Array(total);
  cameFrom.fill(-1);
  const closed = new Uint8Array(total);

  const heuristic = (c: number, r: number): number => {
    const dx = Math.abs(c - gc);
    const dy = Math.abs(r - gr);
    if (!allowDiagonals) return dx + dy;
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };

  gScore[startIdx] = 0;
  const open = new MinHeap();
  open.push(startIdx, heuristic(sc, sr));

  const dirs: [number, number, number][] = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
  ];
  if (allowDiagonals) {
    dirs.push([1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]);
  }

  let found = false;
  while (open.size > 0) {
    const cur = open.pop();
    if (cur === goalIdx) {
      found = true;
      break;
    }
    if (closed[cur]) continue;
    closed[cur] = 1;

    const cc = cur % cols;
    const cr = Math.floor(cur / cols);
    const curG = gScore[cur];

    for (let d = 0; d < dirs.length; d++) {
      const [dc, dr, cost] = dirs[d];
      const nc = cc + dc;
      const nr = cr + dr;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;

      const nIdx = nr * cols + nc;
      if (blocked[nIdx] || closed[nIdx]) continue;

      // Prevent diagonal corner-cutting against Solid cells
      if (dc !== 0 && dr !== 0) {
        if (blocked[cr * cols + nc] || blocked[nr * cols + cc]) continue;
      }

      const tentativeG = curG + cost;
      if (tentativeG < gScore[nIdx]) {
        cameFrom[nIdx] = cur;
        gScore[nIdx] = tentativeG;
        open.push(nIdx, tentativeG + heuristic(nc, nr));
      }
    }
  }

  if (!found) {
    st.pathNodes = [];
    st.pathNodeIndex = 0;
    st.pathMoving = false;
    st.pathSpeed = 0;
    host.queueTrigger('pathfinding_on_failed', inst);
    return;
  }

  // Reconstruct cell path (excluding start cell, simplifying collinear steps)
  const cellPath: { c: number; r: number }[] = [];
  let cur = goalIdx;
  while (cur !== -1 && cur !== startIdx) {
    cellPath.push({ c: cur % cols, r: Math.floor(cur / cols) });
    cur = cameFrom[cur];
  }
  cellPath.reverse();

  const waypoints: Point2D[] = [];
  let prevDc = 0;
  let prevDr = 0;
  let prevC = sc;
  let prevR = sr;

  for (let i = 0; i < cellPath.length; i++) {
    const cell = cellPath[i];
    const dc = cell.c - prevC;
    const dr = cell.r - prevR;
    const isLast = i === cellPath.length - 1;
    if (!isLast && i > 0 && dc === prevDc && dr === prevDr) {
      // Replace previous collinear waypoint to keep path concise
      waypoints[waypoints.length - 1] = {
        x: (cell.c + 0.5) * cellSize,
        y: (cell.r + 0.5) * cellSize,
      };
    } else {
      waypoints.push({
        x: isLast ? targetX : (cell.c + 0.5) * cellSize,
        y: isLast ? targetY : (cell.r + 0.5) * cellSize,
      });
    }
    prevDc = dc;
    prevDr = dr;
    prevC = cell.c;
    prevR = cell.r;
  }

  st.pathNodes = waypoints;
  st.pathNodeIndex = 0;
  st.pathMoving = false;
  st.pathGridDirty = false;
  host.queueTrigger('pathfinding_on_path_found', inst);
}

function stepPathfinding(inst: RuntimeInstance, def: BehaviorDef, st: BehaviorRuntimeState, host: RuntimeHostAPI): void {
  if (!toBool(getProp(inst, def, 'enabled') ?? true)) return;
  if (!st.pathMoving || st.pathNodes.length === 0) return;

  const maxSpeed = Math.max(1, toNumber(getProp(inst, def, 'speed') ?? 180));
  const accel = Math.max(1, toNumber(getProp(inst, def, 'acceleration') ?? 600));
  const rotateObj = toBool(getProp(inst, def, 'rotateObject') ?? true);

  st.pathSpeed = Math.min(maxSpeed, st.pathSpeed + accel * host.dt);
  let remaining = st.pathSpeed * host.dt;

  while (remaining > 0 && st.pathNodeIndex < st.pathNodes.length) {
    const wp = st.pathNodes[st.pathNodeIndex];
    const dx = wp.x - inst.x;
    const dy = wp.y - inst.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 0.0001) {
      const ang = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
      st.pathMovingAngle = ang;
      if (rotateObj) {
        inst.angle = ang;
      }
    }

    if (dist <= remaining) {
      inst.x = wp.x;
      inst.y = wp.y;
      remaining -= dist;
      st.pathNodeIndex++;
    } else {
      inst.x += (dx / dist) * remaining;
      inst.y += (dy / dist) * remaining;
      remaining = 0;
    }
  }

  if (st.pathNodeIndex >= st.pathNodes.length) {
    st.pathMoving = false;
    st.pathSpeed = 0;
    host.queueTrigger('pathfinding_on_arrived', inst);
  }
}

function stepPhysics(
  inst: RuntimeInstance,
  def: BehaviorDef,
  st: BehaviorRuntimeState,
  host: RuntimeHostAPI
): void {
  const world = host.getPhysicsWorld?.();
  if (!world) return;

  if (!st.physicsRegistered) {
    const shape = (getProp(inst, def, 'collisionShape') === 'circle' ? 'circle' : 'box') as 'box' | 'circle';
    const body = world.registerBody(inst, {
      density: toNumber(getProp(inst, def, 'density') ?? 1),
      friction: toNumber(getProp(inst, def, 'friction') ?? 0.2),
      elasticity: toNumber(getProp(inst, def, 'elasticity') ?? 0.2),
      linearDamping: toNumber(getProp(inst, def, 'linearDamping') ?? 0.01),
      angularDamping: toNumber(getProp(inst, def, 'angularDamping') ?? 0.05),
      immovable: toBool(getProp(inst, def, 'immovable') ?? false),
      fixedRotation: toBool(getProp(inst, def, 'fixedRotation') ?? false),
      gravityScale: toNumber(getProp(inst, def, 'gravityScale') ?? 1),
      collisionShape: shape,
    });
    st.physicsShape = shape;
    st.physicsMass = body.mass;
    st.physicsRegistered = true;
  }

  const body = world.getBody(inst.uid);
  if (body) {
    st.physicsVx = body.vx;
    st.physicsVy = body.vy;
    st.physicsVAng = body.vAng;
    st.physicsMass = body.mass;
  }
}

export function applyPhysicsForce(inst: RuntimeInstance, fx: number, fy: number, host: RuntimeHostAPI): void {
  const world = host.getPhysicsWorld?.();
  const body = world?.getBody(inst.uid);
  if (body && !body.immovable) {
    body.vx += (fx / Math.max(0.001, body.mass)) * host.dt;
    body.vy += (fy / Math.max(0.001, body.mass)) * host.dt;
  }
}

export function applyPhysicsForceAtAngle(inst: RuntimeInstance, force: number, angleDeg: number, host: RuntimeHostAPI): void {
  const rad = (angleDeg * Math.PI) / 180;
  applyPhysicsForce(inst, Math.cos(rad) * force, Math.sin(rad) * force, host);
}

export function applyPhysicsImpulse(inst: RuntimeInstance, jx: number, jy: number, host: RuntimeHostAPI): void {
  const world = host.getPhysicsWorld?.();
  const body = world?.getBody(inst.uid);
  if (body && !body.immovable) {
    body.vx += jx * body.invMass;
    body.vy += jy * body.invMass;
  }
}

export function applyPhysicsImpulseAtAngle(inst: RuntimeInstance, impulse: number, angleDeg: number, host: RuntimeHostAPI): void {
  const rad = (angleDeg * Math.PI) / 180;
  applyPhysicsImpulse(inst, Math.cos(rad) * impulse, Math.sin(rad) * impulse, host);
}

export function setPhysicsVelocity(inst: RuntimeInstance, vx: number, vy: number, host: RuntimeHostAPI): void {
  const world = host.getPhysicsWorld?.();
  const body = world?.getBody(inst.uid);
  if (body && !body.immovable) {
    body.vx = vx;
    body.vy = vy;
  }
}

export function setPhysicsAngularVelocity(inst: RuntimeInstance, vAng: number, host: RuntimeHostAPI): void {
  const world = host.getPhysicsWorld?.();
  const body = world?.getBody(inst.uid);
  if (body && !body.immovable && !body.fixedRotation) {
    body.vAng = vAng;
  }
}

export function setPhysicsGravityScale(inst: RuntimeInstance, scale: number, host: RuntimeHostAPI): void {
  const world = host.getPhysicsWorld?.();
  const body = world?.getBody(inst.uid);
  if (body) {
    body.gravityScale = scale;
  }
}

export function setPhysicsImmovable(inst: RuntimeInstance, immovable: boolean, host: RuntimeHostAPI): void {
  const world = host.getPhysicsWorld?.();
  const body = world?.getBody(inst.uid);
  if (body) {
    body.immovable = immovable;
    const area = body.shape === 'circle' ? Math.PI * body.radius * body.radius : body.width * body.height;
    body.mass = immovable ? Infinity : Math.max(1, area) * 0.001;
    body.invMass = immovable ? 0 : (body.mass > 0 ? 1 / body.mass : 0);
  }
}

export function createPhysicsDistanceJoint(instA: RuntimeInstance, instB: RuntimeInstance, distance: number | undefined, stiffness: number | undefined, host: RuntimeHostAPI): void {
  const world = host.getPhysicsWorld?.();
  const bodyA = world?.getBody(instA.uid);
  const bodyB = world?.getBody(instB.uid);
  if (bodyA && bodyB && world) {
    world.addDistanceJoint(bodyA, bodyB, distance, stiffness ?? 0.8);
  }
}

