import type { Facing, MapPoint, RoomDef, TileChar } from '../types';
import { tileAt, tileCenter, worldToTile } from './room';

/**
 * 视野/视线纯逻辑（不 import Phaser）。
 *
 * 本期白盒用 **tile 级视野**：以玩家/敌人脚底为原点，沿朝向 ±fov/2 扫格，
 * 命中 `#` 即遮挡。最终美术版可以在这套接口上加多边形射线，场景不需要改判定。
 */

export interface VisionConfig {
  /** 视锥总角度（度）。 */
  readonly fovDeg: number;
  /** 视距（设计 px）。 */
  readonly range: number;
  /** 脚下全向环境光半径（设计 px）；0 = 无。 */
  readonly ambientRange?: number;
}

export interface VisionResult {
  /** `col,row` 集合；含墙/tile 本身，方便迷雾把墙面也揭开。 */
  readonly tiles: ReadonlySet<string>;
  /** 按距离排序的可见格，供调试/绘制。 */
  readonly ordered: readonly { readonly col: number; readonly row: number; readonly distance: number }[];
}

export function tileKey(col: number, row: number): string {
  return `${col},${row}`;
}

export function normalizeAngle(radians: number): number {
  let angle = Number.isFinite(radians) ? radians : 0;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

export function angleOf(dx: number, dy: number): number {
  return Math.atan2(dy, dx);
}

/** 8 向 → 弧度；世界 y 向下，所以「下」= +π/2。 */
export function facingToRadians(facing: Facing): number {
  switch (facing) {
    case 'right':
      return 0;
    case 'downRight':
      return Math.PI / 4;
    case 'down':
      return Math.PI / 2;
    case 'downLeft':
      return (Math.PI * 3) / 4;
    case 'left':
      return Math.PI;
    case 'upLeft':
      return (-Math.PI * 3) / 4;
    case 'up':
      return -Math.PI / 2;
    case 'upRight':
      return -Math.PI / 4;
  }
}

export function isAngleInCone(angle: number, facingRad: number, fovDeg: number): boolean {
  const half = (Math.max(0, Math.min(360, fovDeg)) * Math.PI) / 360;
  return Math.abs(normalizeAngle(angle - facingRad)) <= half + 1e-9;
}

export function blocksSight(room: RoomDef, char: TileChar): boolean {
  const blockers = room.sightBlockers ?? ['#'];
  return blockers.includes(char);
}

export function isSightBlockedAt(room: RoomDef, point: MapPoint): boolean {
  const tile = worldToTile(room, point);
  if (!tile) return true;
  const cell = tileAt(room, tile.col, tile.row);
  return cell !== null && blocksSight(room, cell.char);
}

/**
 * 两点之间是否无遮挡。
 *
 * 起点/终点所在的 tile 不算遮挡（墙面要能被看见；敌人站在墙后时，
 * 墙是中间格，仍会阻断）。4px 采样对 64px tile 足够，不会漏墙。
 */
export function hasLineOfSight(
  room: RoomDef,
  from: MapPoint,
  to: MapPoint,
  sampleStep = 4,
): boolean {
  const start = worldToTile(room, from);
  const end = worldToTile(room, to);
  if (!start || !end) return false;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance <= 0.0001) return true;
  const step = Math.max(2, sampleStep);
  const count = Math.ceil(distance / step);
  for (let index = 1; index < count; index += 1) {
    const t = index / count;
    const sample = { x: from.x + dx * t, y: from.y + dy * t };
    const tile = worldToTile(room, sample);
    if (!tile) return false;
    if (tile.col === start.col && tile.row === start.row) continue;
    if (tile.col === end.col && tile.row === end.row) continue;
    const cell = tileAt(room, tile.col, tile.row);
    if (cell !== null && blocksSight(room, cell.char)) return false;
  }
  return true;
}

/** 以脚底为圆心、朝向 fov 的可见格。tile 中心在视距内才算。 */
export function visibleTiles(
  room: RoomDef,
  origin: MapPoint,
  facingRad: number,
  config: VisionConfig,
): VisionResult {
  const range = Math.max(0, config.range);
  const ambient = Math.max(0, config.ambientRange ?? 0);
  const outer = Math.max(range, ambient);
  const tileSize = room.tileSize;
  const minCol = Math.max(0, Math.floor((origin.x - outer) / tileSize));
  const maxCol = Math.min(room.size[0] - 1, Math.floor((origin.x + outer) / tileSize));
  const minRow = Math.max(0, Math.floor((origin.y - outer) / tileSize));
  const maxRow = Math.min(room.size[1] - 1, Math.floor((origin.y + outer) / tileSize));

  const tiles = new Set<string>();
  const ordered: { col: number; row: number; distance: number }[] = [];

  for (let row = minRow; row <= maxRow; row += 1) {
    for (let col = minCol; col <= maxCol; col += 1) {
      const center = tileCenter(room, col, row);
      const dx = center.x - origin.x;
      const dy = center.y - origin.y;
      const distance = Math.hypot(dx, dy);
      if (distance > outer + tileSize * 0.5) continue;
      const inAmbient = ambient > 0 && distance <= ambient;
      if (!inAmbient) {
        if (distance > range) continue;
        if (!isAngleInCone(angleOf(dx, dy), facingRad, config.fovDeg)) continue;
      }
      if (!hasLineOfSight(room, origin, center)) continue;
      tiles.add(tileKey(col, row));
      ordered.push({ col, row, distance });
    }
  }

  // 玩家自己脚下的格永远算可见。
  const own = worldToTile(room, origin);
  if (own) {
    tiles.add(tileKey(own.col, own.row));
    if (!ordered.some((item) => item.col === own.col && item.row === own.row)) {
      ordered.push({ col: own.col, row: own.row, distance: 0 });
    }
  }

  ordered.sort((a, b) => a.distance - b.distance);
  return { tiles, ordered };
}

/* ------------------------------------------------------------------ *
 * 扇形视野的多边形版（渲染用；判定仍走上面的 tile 版）
 * ------------------------------------------------------------------ */

/**
 * 一条射线打到第一面遮光墙的交点。
 *
 * 用 DDA 逐格步进（不是小步采样）：每一步都正好跨过一条格线，
 * 所以不会像 4px 采样那样在墙角漏一点、也不会在斜向多穿一格。
 * 射程内的格子全空时，返回射程圆弧上的端点。
 */
export function castRay(
  room: RoomDef,
  origin: MapPoint,
  angleRad: number,
  range: number,
): MapPoint {
  const tile = room.tileSize;
  const dx = Math.cos(angleRad);
  const dy = Math.sin(angleRad);
  const maxRange = Math.max(0, range);

  let col = Math.floor(origin.x / tile);
  let row = Math.floor(origin.y / tile);
  const stepCol = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepRow = dy > 0 ? 1 : dy < 0 ? -1 : 0;

  // 到下一条竖直/水平格线的距离（都取绝对值，方向由 step 决定）
  const nextColEdge = stepCol === 0 ? 0 : Math.abs((col + (stepCol > 0 ? 1 : 0)) * tile - origin.x);
  const nextRowEdge = stepRow === 0 ? 0 : Math.abs((row + (stepRow > 0 ? 1 : 0)) * tile - origin.y);
  // t 的单位是「格」：t * tile = 实际走过的像素
  let tCol = stepCol === 0 ? Number.POSITIVE_INFINITY : nextColEdge / (Math.abs(dx) * tile);
  let tRow = stepRow === 0 ? Number.POSITIVE_INFINITY : nextRowEdge / (Math.abs(dy) * tile);
  const tColStep = stepCol === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dx);
  const tRowStep = stepRow === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dy);

  const blocked = (c: number, r: number): boolean => {
    if (c < 0 || r < 0 || c >= room.size[0] || r >= room.size[1]) return true;
    return isSightBlockedTile(room, c, r);
  };

  // 起点本身在墙里（极少见）：直接返回原点，别把整片照亮。
  if (blocked(col, row)) return { x: origin.x, y: origin.y };

  const maxSteps = Math.ceil((maxRange / tile) * 2) + 2;
  // 参数 t 以「整格」为单位：t * tile = 实际走了多少像素
  for (let i = 0; i < maxSteps; i += 1) {
    const t = Math.min(tCol, tRow);
    if (!Number.isFinite(t) || t * tile > maxRange) {
      return { x: origin.x + dx * maxRange, y: origin.y + dy * maxRange };
    }
    if (tCol < tRow) {
      col += stepCol;
      tCol += tColStep;
    } else {
      row += stepRow;
      tRow += tRowStep;
    }
    if (blocked(col, row)) {
      return { x: origin.x + dx * t * tile, y: origin.y + dy * t * tile };
    }
  }
  return { x: origin.x + dx * maxRange, y: origin.y + dy * maxRange };
}

/** 某格是否挡视线（越界算挡）。 */
export function isSightBlockedTile(room: RoomDef, col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= room.size[0] || row >= room.size[1]) return true;
  const cell = tileAt(room, col, row);
  return cell !== null && blocksSight(room, cell.char);
}

export interface VisionPolygon {
  /** 闭合多边形的顶点（世界坐标，首尾不重复）。 */
  readonly points: readonly MapPoint[];
  /** 脚下环境光的圆（没有就 null）。 */
  readonly ambient: { readonly radius: number } | null;
}

/**
 * 扇形视野的多边形：在 `fovDeg` 范围内均匀打 `rays` 条射线连起来。
 *
 * 墙后会真的出现「影子」（射线停在被撞的那一格边界上），
 * 这正是格子版做不出来的东西。
 */
export function castVisionPolygon(
  room: RoomDef,
  origin: MapPoint,
  headingRad: number,
  config: VisionConfig & { readonly rays?: number },
): VisionPolygon {
  const fov = Math.max(1, Math.min(360, config.fovDeg));
  const range = Math.max(0, config.range);
  const rays = Math.max(8, Math.min(512, config.rays ?? 96));
  const ambientRadius = Math.max(0, config.ambientRange ?? 0);
  const full = fov >= 359.5;
  const points: MapPoint[] = [];
  if (range <= 0) {
    return { points, ambient: ambientRadius > 0 ? { radius: ambientRadius } : null };
  }
  // 全向（360°）时不重复首尾射线，否则起点/终点重合会画出一道多余的接缝。
  const count = full ? rays : rays + 1;
  const half = (fov * Math.PI) / 360;
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1 || 1);
    const angle = full ? (i / count) * Math.PI * 2 : headingRad - half + t * 2 * half;
    points.push(castRay(room, origin, angle, range));
  }
  return { points, ambient: ambientRadius > 0 ? { radius: ambientRadius } : null };
}

/* ------------------------------------------------------------------ *
 * 多边形 → 格子集合（无限射程的视野用它替代 visibleTiles 的逐格采样）
 * ------------------------------------------------------------------ */

/** 多边形的轴对齐包围盒（世界坐标）。 */
export function polygonBounds(points: readonly MapPoint[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** 点是否在简单多边形内（射线交叉计数）。 */
export function pointInPolygon(points: readonly MapPoint[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i]!;
    const b = points[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * 扇形多边形覆盖到的格子（按格心判定，外加沿线经过的格子）。
 *
 * 无限射程时 `visibleTiles` 要做「全房间 × 每格一条 LOS 采样」，代价爆炸；
 * 视图多边形已经把遮挡算过了，直接拿它反推格子集合，一遍过。
 */
export function tilesInPolygon(
  room: RoomDef,
  origin: MapPoint,
  points: readonly MapPoint[],
): Set<string> {
  const tiles = new Set<string>();
  const tile = room.tileSize;
  if (points.length < 3) {
    const own = worldToTile(room, origin);
    if (own) tiles.add(tileKey(own.col, own.row));
    return tiles;
  }
  // 只给了弧上的点：先补上圆心，才是「扇形」而不是「弓形」。
  // 少了这一步，靠近玩家的那块会被判成"外面"（渲染时踩过同一个坑）。
  const pie: MapPoint[] = [origin, ...points];
  const box = polygonBounds(pie);
  const minCol = Math.max(0, Math.floor(box.minX / tile));
  const maxCol = Math.min(room.size[0] - 1, Math.floor(box.maxX / tile));
  const minRow = Math.max(0, Math.floor(box.minY / tile));
  const maxRow = Math.min(room.size[1] - 1, Math.floor(box.maxY / tile));
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let col = minCol; col <= maxCol; col += 1) {
      const center = tileCenter(room, col, row);
      // 扇形外面那圈墙本身也要算"看见"，否则墙面会一直黑着。
      if (pointInPolygon(pie, center.x, center.y) || touchesPolygon(pie, center)) {
        tiles.add(tileKey(col, row));
      }
    }
  }
  const own = worldToTile(room, origin);
  if (own) tiles.add(tileKey(own.col, own.row));
  return tiles;
}

/** 格心到多边形的最近边距离 < 半格 = 这格贴着视野边界，算看见。 */
function touchesPolygon(points: readonly MapPoint[], center: MapPoint): boolean {
  const half = 48;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i]!;
    const b = points[j]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 <= 0.0001) continue;
    let t = ((center.x - a.x) * dx + (center.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + dx * t;
    const py = a.y + dy * t;
    if (Math.hypot(center.x - px, center.y - py) <= half) return true;
  }
  return false;
}
