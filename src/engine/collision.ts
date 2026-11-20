import { Point2D } from './types';

export interface CollidableRect {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number; // degrees
  originX: number; // 0..1
  originY: number; // 0..1
  mirrored?: boolean;
  flipped?: boolean;
  collisionPoly?: Point2D[]; // normalized 0..1 vertices
}

export interface AABB {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const DEG_TO_RAD = Math.PI / 180;

export function getWorldPolygon(obj: CollidableRect): Point2D[] {
  const localPoly: Point2D[] =
    obj.collisionPoly && obj.collisionPoly.length >= 3
      ? obj.collisionPoly
      : [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ];

  const rad = obj.angle * DEG_TO_RAD;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const ox = obj.originX * obj.width;
  const oy = obj.originY * obj.height;

  return localPoly.map((p) => {
    const px = obj.mirrored ? 1 - p.x : p.x;
    const py = obj.flipped ? 1 - p.y : p.y;
    const lx = px * obj.width - ox;
    const ly = py * obj.height - oy;
    return {
      x: obj.x + lx * cos - ly * sin,
      y: obj.y + lx * sin + ly * cos,
    };
  });
}

export function getWorldAABB(obj: CollidableRect): AABB {
  if (obj.angle === 0 && (!obj.collisionPoly || obj.collisionPoly.length < 3)) {
    const ox = (obj.mirrored ? 1 - obj.originX : obj.originX) * obj.width;
    const oy = (obj.flipped ? 1 - obj.originY : obj.originY) * obj.height;
    const left = obj.x - ox;
    const top = obj.y - oy;
    return {
      left,
      top,
      right: left + obj.width,
      bottom: top + obj.height,
    };
  }
  const poly = getWorldPolygon(obj);
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const p of poly) {
    if (p.x < left) left = p.x;
    if (p.y < top) top = p.y;
    if (p.x > right) right = p.x;
    if (p.y > bottom) bottom = p.y;
  }
  return { left, top, right, bottom };
}

export function aabbOverlap(a: AABB, b: AABB): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function projectPoly(poly: Point2D[], ax: number, ay: number): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const p of poly) {
    const d = p.x * ax + p.y * ay;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return [min, max];
}

export function polygonsOverlap(polyA: Point2D[], polyB: Point2D[]): boolean {
  const polys = [polyA, polyB];
  for (let pIdx = 0; pIdx < 2; pIdx++) {
    const poly = polys[pIdx];
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      const nx = -(p2.y - p1.y);
      const ny = p2.x - p1.x;
      const len = Math.hypot(nx, ny);
      if (len < 1e-6) continue;
      const ax = nx / len;
      const ay = ny / len;
      const [minA, maxA] = projectPoly(polyA, ax, ay);
      const [minB, maxB] = projectPoly(polyB, ax, ay);
      if (maxA <= minB || maxB <= minA) {
        return false;
      }
    }
  }
  return true;
}

export function testOverlap(a: CollidableRect, b: CollidableRect): boolean {
  const boxA = getWorldAABB(a);
  const boxB = getWorldAABB(b);
  if (!aabbOverlap(boxA, boxB)) return false;

  // Fast path if both are axis-aligned boxes without custom polys
  if (
    a.angle === 0 &&
    b.angle === 0 &&
    (!a.collisionPoly || a.collisionPoly.length < 3) &&
    (!b.collisionPoly || b.collisionPoly.length < 3)
  ) {
    return true;
  }

  return polygonsOverlap(getWorldPolygon(a), getWorldPolygon(b));
}

export function pointInInstance(px: number, py: number, obj: CollidableRect): boolean {
  const box = getWorldAABB(obj);
  if (px < box.left || px > box.right || py < box.top || py > box.bottom) return false;
  if (obj.angle === 0 && (!obj.collisionPoly || obj.collisionPoly.length < 3)) return true;

  const poly = getWorldPolygon(obj);
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function segmentsIntersect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number
): boolean {
  const rX = bx - ax;
  const rY = by - ay;
  const sX = dx - cx;
  const sY = dy - cy;
  const denom = rX * sY - rY * sX;
  if (Math.abs(denom) < 1e-9) return false;
  const u = ((cx - ax) * rY - (cy - ay) * rX) / denom;
  const t = ((cx - ax) * sY - (cy - ay) * sX) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

export function segmentIntersectsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rect: CollidableRect
): boolean {
  // Fast AABB reject on segment bounding box
  const segMinX = Math.min(x1, x2);
  const segMaxX = Math.max(x1, x2);
  const segMinY = Math.min(y1, y2);
  const segMaxY = Math.max(y1, y2);
  const box = getWorldAABB(rect);
  if (segMaxX < box.left || segMinX > box.right || segMaxY < box.top || segMinY > box.bottom) {
    return false;
  }

  // If either endpoint is inside the polygon, the segment intersects
  if (pointInInstance(x1, y1, rect) || pointInInstance(x2, y2, rect)) {
    return true;
  }

  const poly = getWorldPolygon(rect);
  for (let i = 0; i < poly.length; i++) {
    const p1 = poly[i];
    const p2 = poly[(i + 1) % poly.length];
    if (segmentsIntersect(x1, y1, x2, y2, p1.x, p1.y, p2.x, p2.y)) {
      return true;
    }
  }
  return false;
}
