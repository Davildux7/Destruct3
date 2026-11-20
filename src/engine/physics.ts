import { AABB, CollidableRect, getWorldAABB } from './collision';
import { RuntimeInstance } from './runtimeTypes';

export interface PhysicsBody {
  inst: RuntimeInstance;
  shape: 'box' | 'circle';
  radius: number;
  width: number;
  height: number;
  invMass: number;
  mass: number;
  inertia: number;
  invInertia: number;
  vx: number;
  vy: number;
  vAng: number; // degrees per second
  friction: number;
  elasticity: number; // restitution 0..1
  linearDamping: number;
  angularDamping: number;
  gravityScale: number;
  immovable: boolean;
  fixedRotation: boolean;
  collisionMask: number;
  sleeping: boolean;
  sleepTimer: number;
}

export interface PhysicsManifold {
  bodyA: PhysicsBody;
  bodyB: PhysicsBody;
  normalX: number; // points from A to B
  normalY: number;
  penetration: number;
  contactX: number;
  contactY: number;
}

export interface DistanceJoint {
  id: string;
  bodyA: PhysicsBody;
  bodyB: PhysicsBody;
  distance: number;
  stiffness: number;
}

export class PhysicsWorld {
  public gravityX = 0;
  public gravityY = 980; // px/s^2 default
  private bodies: Map<number, PhysicsBody> = new Map();
  private joints: DistanceJoint[] = [];
  private recentCollisionPairs = new Set<string>();

  public clear(): void {
    this.bodies.clear();
    this.joints = [];
    this.recentCollisionPairs.clear();
  }

  public registerBody(
    inst: RuntimeInstance,
    props: {
      density?: number;
      friction?: number;
      elasticity?: number;
      linearDamping?: number;
      angularDamping?: number;
      immovable?: boolean;
      fixedRotation?: boolean;
      gravityScale?: number;
      collisionShape?: 'box' | 'circle';
      collisionMask?: number;
    }
  ): PhysicsBody {
    const shape = props.collisionShape === 'circle' ? 'circle' : 'box';
    const width = Math.max(2, inst.width);
    const height = Math.max(2, inst.height);
    const radius = Math.max(1, Math.min(width, height) * 0.5);
    const density = Math.max(0.001, props.density ?? 1);
    const immovable = Boolean(props.immovable);
    const fixedRotation = Boolean(props.fixedRotation);

    let area = shape === 'circle' ? Math.PI * radius * radius : width * height;
    area = Math.max(1, area);
    const mass = immovable ? 0 : area * density * 0.001;
    const invMass = mass > 0 ? 1 / mass : 0;

    let inertia = 0;
    if (!immovable && !fixedRotation) {
      if (shape === 'circle') {
        inertia = 0.5 * mass * radius * radius;
      } else {
        inertia = (1 / 12) * mass * (width * width + height * height);
      }
    }
    const invInertia = inertia > 0 ? 1 / inertia : 0;

    const existing = this.bodies.get(inst.uid);
    const body: PhysicsBody = {
      inst,
      shape,
      radius,
      width,
      height,
      mass: immovable ? Infinity : mass,
      invMass,
      inertia: immovable || fixedRotation ? Infinity : inertia,
      invInertia,
      vx: existing?.vx ?? 0,
      vy: existing?.vy ?? 0,
      vAng: existing?.vAng ?? 0,
      friction: Math.max(0, props.friction ?? 0.2),
      elasticity: Math.max(0, Math.min(1, props.elasticity ?? 0.2)),
      linearDamping: Math.max(0, props.linearDamping ?? 0.01),
      angularDamping: Math.max(0, props.angularDamping ?? 0.05),
      gravityScale: props.gravityScale ?? 1,
      immovable,
      fixedRotation,
      collisionMask: props.collisionMask ?? 1,
      sleeping: false,
      sleepTimer: 0,
    };

    this.bodies.set(inst.uid, body);
    return body;
  }

  public unregisterBody(instUid: number): void {
    this.bodies.delete(instUid);
    this.joints = this.joints.filter((j) => j.bodyA.inst.uid !== instUid && j.bodyB.inst.uid !== instUid);
  }

  public getBody(instUid: number): PhysicsBody | undefined {
    return this.bodies.get(instUid);
  }

  public addDistanceJoint(bodyA: PhysicsBody, bodyB: PhysicsBody, distance?: number, stiffness = 0.8): void {
    const dist = distance ?? Math.hypot(bodyB.inst.x - bodyA.inst.x, bodyB.inst.y - bodyA.inst.y);
    const id = `${bodyA.inst.uid}_${bodyB.inst.uid}`;
    this.joints.push({ id, bodyA, bodyB, distance: Math.max(1, dist), stiffness: Math.max(0.01, Math.min(1, stiffness)) });
  }

  public step(dt: number, onCollisionPair?: (instA: RuntimeInstance, instB: RuntimeInstance) => void, staticAABBs?: AABB[]): void {
    if (dt <= 0) return;
    const subSteps = 4;
    const subDt = dt / subSteps;

    for (let step = 0; step < subSteps; step++) {
      // 1. Integrate forces and gravity
      for (const b of this.bodies.values()) {
        if (b.immovable || b.inst.destroyed) continue;

        const gx = this.gravityX * b.gravityScale;
        const gy = this.gravityY * b.gravityScale;
        b.vx += gx * subDt;
        b.vy += gy * subDt;

        // Linear and angular damping
        const linDamp = Math.max(0, 1 - b.linearDamping * subDt);
        b.vx *= linDamp;
        b.vy *= linDamp;

        const angDamp = Math.max(0, 1 - b.angularDamping * subDt);
        b.vAng *= angDamp;

        b.inst.x += b.vx * subDt;
        b.inst.y += b.vy * subDt;
        if (!b.fixedRotation) {
          b.inst.angle = (((b.inst.angle + b.vAng * subDt) % 360) + 360) % 360;
        }
      }

      // 2. Solve Distance Joints
      for (const joint of this.joints) {
        if (joint.bodyA.inst.destroyed || joint.bodyB.inst.destroyed) continue;
        const dx = joint.bodyB.inst.x - joint.bodyA.inst.x;
        const dy = joint.bodyB.inst.y - joint.bodyA.inst.y;
        const curDist = Math.hypot(dx, dy);
        if (curDist > 0.0001) {
          const delta = (curDist - joint.distance) * joint.stiffness;
          const nx = dx / curDist;
          const ny = dy / curDist;
          const totalInv = joint.bodyA.invMass + joint.bodyB.invMass;
          if (totalInv > 0) {
            if (!joint.bodyA.immovable) {
              const fA = (joint.bodyA.invMass / totalInv) * delta;
              joint.bodyA.inst.x += nx * fA;
              joint.bodyA.inst.y += ny * fA;
            }
            if (!joint.bodyB.immovable) {
              const fB = (joint.bodyB.invMass / totalInv) * delta;
              joint.bodyB.inst.x -= nx * fB;
              joint.bodyB.inst.y -= ny * fB;
            }
          }
        }
      }

      // 3. Collision detection and impulse resolution
      const bodyList = Array.from(this.bodies.values()).filter((b) => !b.inst.destroyed);
      const manifolds: PhysicsManifold[] = [];

      for (let i = 0; i < bodyList.length; i++) {
        const bA = bodyList[i];
        for (let j = i + 1; j < bodyList.length; j++) {
          const bB = bodyList[j];
          if (bA.immovable && bB.immovable) continue;
          if ((bA.collisionMask & bB.collisionMask) === 0) continue;

          const manifold = this.detectCollision(bA, bB);
          if (manifold) {
            manifolds.push(manifold);
            const pairKey = bA.inst.uid < bB.inst.uid ? `${bA.inst.uid}:${bB.inst.uid}` : `${bB.inst.uid}:${bA.inst.uid}`;
            if (!this.recentCollisionPairs.has(pairKey)) {
              this.recentCollisionPairs.add(pairKey);
              if (onCollisionPair) {
                onCollisionPair(bA.inst, bB.inst);
              }
            }
          }
        }
      }

      // 4. Collide dynamic bodies against static AABBs (e.g. Tilemap solids)
      if (staticAABBs && staticAABBs.length > 0) {
        for (const b of bodyList) {
          if (b.immovable) continue;
          const center = this.getCenter(b);
          const halfW = b.shape === 'circle' ? b.radius : b.width * 0.5;
          const halfH = b.shape === 'circle' ? b.radius : b.height * 0.5;
          for (const tile of staticAABBs) {
            if (
              center.x + halfW <= tile.left ||
              center.x - halfW >= tile.right ||
              center.y + halfH <= tile.top ||
              center.y - halfH >= tile.bottom
            ) {
              continue;
            }
            const tileBody: PhysicsBody = {
              inst: { ...b.inst, x: (tile.left + tile.right) * 0.5, y: (tile.top + tile.bottom) * 0.5, angle: 0, objectType: { ...b.inst.objectType, plugin: 'Sprite' } },
              shape: 'box',
              radius: 0,
              width: tile.right - tile.left,
              height: tile.bottom - tile.top,
              invMass: 0,
              mass: Infinity,
              inertia: Infinity,
              invInertia: 0,
              vx: 0,
              vy: 0,
              vAng: 0,
              friction: 0.4,
              elasticity: 0.2,
              linearDamping: 0,
              angularDamping: 0,
              gravityScale: 0,
              immovable: true,
              fixedRotation: true,
              collisionMask: 1,
              sleeping: false,
              sleepTimer: 0,
            };
            const m = this.detectCollision(b, tileBody);
            if (m) manifolds.push(m);
          }
        }
      }

      // 5. Resolve collision manifolds
      for (const m of manifolds) {
        this.resolveManifold(m);
      }
    }

    // Decay recent collision pairs over time
    if (Math.random() < 0.1) {
      this.recentCollisionPairs.clear();
    }
  }

  private detectCollision(bA: PhysicsBody, bB: PhysicsBody): PhysicsManifold | null {
    // Quick AABB reject
    const boxA = getWorldAABB(this.getCollidable(bA.inst));
    const boxB = getWorldAABB(this.getCollidable(bB.inst));
    if (boxA.left > boxB.right || boxA.right < boxB.left || boxA.top > boxB.bottom || boxA.bottom < boxB.top) {
      return null;
    }

    if (bA.shape === 'circle' && bB.shape === 'circle') {
      return this.detectCircleCircle(bA, bB);
    }
    if (bA.shape === 'circle' && bB.shape === 'box') {
      const m = this.detectBoxCircle(bB, bA);
      if (m) {
        m.normalX = -m.normalX;
        m.normalY = -m.normalY;
        const tmp = m.bodyA;
        m.bodyA = m.bodyB;
        m.bodyB = tmp;
      }
      return m;
    }
    if (bA.shape === 'box' && bB.shape === 'circle') {
      return this.detectBoxCircle(bA, bB);
    }
    return this.detectBoxBox(bA, bB);
  }

  private getCenter(b: PhysicsBody): { x: number; y: number } {
    const isCentered = b.inst.objectType.plugin === 'Sprite';
    return {
      x: isCentered ? b.inst.x : b.inst.x + b.width * 0.5,
      y: isCentered ? b.inst.y : b.inst.y + b.height * 0.5,
    };
  }

  private detectCircleCircle(bA: PhysicsBody, bB: PhysicsBody): PhysicsManifold | null {
    const cA = this.getCenter(bA);
    const cB = this.getCenter(bB);
    const dx = cB.x - cA.x;
    const dy = cB.y - cA.y;
    const distSq = dx * dx + dy * dy;
    const rSum = bA.radius + bB.radius;
    if (distSq >= rSum * rSum) return null;

    const dist = Math.sqrt(distSq);
    if (dist < 1e-6) {
      return {
        bodyA: bA,
        bodyB: bB,
        normalX: 1,
        normalY: 0,
        penetration: rSum,
        contactX: cA.x,
        contactY: cA.y,
      };
    }

    const nx = dx / dist;
    const ny = dy / dist;
    return {
      bodyA: bA,
      bodyB: bB,
      normalX: nx,
      normalY: ny,
      penetration: rSum - dist,
      contactX: cA.x + nx * bA.radius,
      contactY: cA.y + ny * bA.radius,
    };
  }

  private detectBoxCircle(bBox: PhysicsBody, bCirc: PhysicsBody): PhysicsManifold | null {
    const cBox = this.getCenter(bBox);
    const cCirc = this.getCenter(bCirc);
    const rad = (-bBox.inst.angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // Transform circle center into box local space
    const rx = cCirc.x - cBox.x;
    const ry = cCirc.y - cBox.y;
    const lx = rx * cos - ry * sin;
    const ly = rx * sin + ry * cos;

    const halfW = bBox.width * 0.5;
    const halfH = bBox.height * 0.5;

    const closestX = Math.max(-halfW, Math.min(halfW, lx));
    const closestY = Math.max(-halfH, Math.min(halfH, ly));

    const dx = lx - closestX;
    const dy = ly - closestY;
    const distSq = dx * dx + dy * dy;

    if (distSq > bCirc.radius * bCirc.radius) return null;

    const dist = Math.sqrt(distSq);
    let lnx = 0;
    let lny = 0;
    let pen = 0;

    if (dist < 1e-6) {
      const edgeDistX = halfW - Math.abs(lx);
      const edgeDistY = halfH - Math.abs(ly);
      if (edgeDistX < edgeDistY) {
        lnx = lx >= 0 ? 1 : -1;
        lny = 0;
        pen = edgeDistX + bCirc.radius;
      } else {
        lnx = 0;
        lny = ly >= 0 ? 1 : -1;
        pen = edgeDistY + bCirc.radius;
      }
    } else {
      lnx = dx / dist;
      lny = dy / dist;
      pen = bCirc.radius - dist;
    }

    const wRad = (bBox.inst.angle * Math.PI) / 180;
    const wCos = Math.cos(wRad);
    const wSin = Math.sin(wRad);
    const nx = lnx * wCos - lny * wSin;
    const ny = lnx * wSin + lny * wCos;

    return {
      bodyA: bBox,
      bodyB: bCirc,
      normalX: nx,
      normalY: ny,
      penetration: pen,
      contactX: cCirc.x - nx * bCirc.radius,
      contactY: cCirc.y - ny * bCirc.radius,
    };
  }

  private detectBoxBox(bA: PhysicsBody, bB: PhysicsBody): PhysicsManifold | null {
    const cA = this.getCenter(bA);
    const cB = this.getCenter(bB);
    const dx = cB.x - cA.x;
    const dy = cB.y - cA.y;

    const halfWA = bA.width * 0.5;
    const halfHA = bA.height * 0.5;
    const halfWB = bB.width * 0.5;
    const halfHB = bB.height * 0.5;

    const overlapX = halfWA + halfWB - Math.abs(dx);
    if (overlapX <= 0) return null;

    const overlapY = halfHA + halfHB - Math.abs(dy);
    if (overlapY <= 0) return null;

    let nx = 0;
    let ny = 0;
    let pen = 0;

    if (overlapX < overlapY) {
      nx = dx >= 0 ? 1 : -1;
      ny = 0;
      pen = overlapX;
    } else {
      nx = 0;
      ny = dy >= 0 ? 1 : -1;
      pen = overlapY;
    }

    return {
      bodyA: bA,
      bodyB: bB,
      normalX: nx,
      normalY: ny,
      penetration: pen,
      contactX: cA.x + nx * halfWA,
      contactY: cA.y + ny * halfHA,
    };
  }

  private resolveManifold(m: PhysicsManifold): void {
    const bA = m.bodyA;
    const bB = m.bodyB;
    const totalInv = bA.invMass + bB.invMass;
    if (totalInv <= 0) return;

    // Positional correction (Baumgarte stabilization)
    const slop = 0.05;
    const percent = 0.4;
    const corr = Math.max(0, m.penetration - slop) * percent;
    const corrX = m.normalX * corr;
    const corrY = m.normalY * corr;

    if (!bA.immovable) {
      bA.inst.x -= corrX * (bA.invMass / totalInv);
      bA.inst.y -= corrY * (bA.invMass / totalInv);
    }
    if (!bB.immovable) {
      bB.inst.x += corrX * (bB.invMass / totalInv);
      bB.inst.y += corrY * (bB.invMass / totalInv);
    }

    // Relative velocity
    const rvx = bB.vx - bA.vx;
    const rvy = bB.vy - bA.vy;
    const velAlongNormal = rvx * m.normalX + rvy * m.normalY;
    if (velAlongNormal > 0) return; // Moving apart

    // Restitution impulse
    const e = Math.max(bA.elasticity, bB.elasticity);
    let j = -(1 + e) * velAlongNormal;
    j /= totalInv;

    const impulseX = m.normalX * j;
    const impulseY = m.normalY * j;

    if (!bA.immovable) {
      bA.vx -= impulseX * bA.invMass;
      bA.vy -= impulseY * bA.invMass;
    }
    if (!bB.immovable) {
      bB.vx += impulseX * bB.invMass;
      bB.vy += impulseY * bB.invMass;
    }

    // Friction impulse along tangent
    const tangentX = -m.normalY;
    const tangentY = m.normalX;
    const velAlongTangent = rvx * tangentX + rvy * tangentY;
    const mu = Math.sqrt(bA.friction * bB.friction);

    let jt = -velAlongTangent / totalInv;
    const maxFriction = j * mu;
    jt = Math.max(-maxFriction, Math.min(maxFriction, jt));

    const frictionImpulseX = tangentX * jt;
    const frictionImpulseY = tangentY * jt;

    if (!bA.immovable) {
      bA.vx -= frictionImpulseX * bA.invMass;
      bA.vy -= frictionImpulseY * bA.invMass;
      if (!bA.fixedRotation) {
        bA.vAng -= (jt * 180) / Math.PI * 0.05;
      }
    }
    if (!bB.immovable) {
      bB.vx += frictionImpulseX * bB.invMass;
      bB.vy += frictionImpulseY * bB.invMass;
      if (!bB.fixedRotation) {
        bB.vAng += (jt * 180) / Math.PI * 0.05;
      }
    }
  }

  private getCollidable(inst: RuntimeInstance): CollidableRect {
    const isSprite = inst.objectType.plugin === 'Sprite';
    return {
      x: inst.x,
      y: inst.y,
      width: inst.width,
      height: inst.height,
      angle: inst.angle,
      originX: isSprite ? 0.5 : 0,
      originY: isSprite ? 0.5 : 0,
    };
  }
}
