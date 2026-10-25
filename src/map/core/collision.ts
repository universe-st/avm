import type { Facing, FootBox, MapPoint, RoomDef } from '../types';
import { canStandAt } from './room';

export interface MoveResult {
  /** 解算后的脚底位置。 */
  readonly position: MapPoint;
  /** 是否因为碰撞被挡住（任轴）。 */
  readonly blocked: boolean;
}

/**
 * 分轴解算：先 X 后 Y。
 *
 * - 单轴撞墙时另一轴仍可移动，自动贴墙滑行；
 * - 两轴都不可走时不移动，避免从家具角斜穿过去；
 * - 不在这里做速度/加速度，调用方按 delta 传位移。
 */
export function moveWithCollision(
  room: RoomDef,
  feet: MapPoint,
  delta: MapPoint,
  foot: FootBox,
): MoveResult {
  let x = feet.x;
  let y = feet.y;
  let blocked = false;

  if (Number.isFinite(delta.x) && delta.x !== 0) {
    const nextX = x + delta.x;
    if (canStandAt(room, { x: nextX, y }, foot)) x = nextX;
    else blocked = true;
  }

  if (Number.isFinite(delta.y) && delta.y !== 0) {
    const nextY = y + delta.y;
    if (canStandAt(room, { x, y: nextY }, foot)) y = nextY;
    else blocked = true;
  }

  return { position: { x, y }, blocked };
}

/** 把设计位移归一化到 8 方向，避免斜向比直向快。 */
export function normalizeDirection(x: number, y: number): MapPoint {
  const length = Math.hypot(x, y);
  if (!Number.isFinite(length) || length <= 0) return { x: 0, y: 0 };
  return { x: x / length, y: y / length };
}

/** 由输入主轴/两轴占比决定八向朝向；没有输入时保留 fallback。 */
export function facingFromVector(x: number, y: number, fallback: Facing): Facing {
  if (Math.abs(x) < 0.0001 && Math.abs(y) < 0.0001) return fallback;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  // 两轴都占到 35% 才判斜向，避免摇杆轻微偏斜时来回跳。
  const diagonal = Math.min(ax, ay) >= 0.35 * Math.max(ax, ay);
  if (diagonal) {
    if (y < 0) return x < 0 ? 'upLeft' : 'upRight';
    return x < 0 ? 'downLeft' : 'downRight';
  }
  if (ax > ay) return x < 0 ? 'left' : 'right';
  return y < 0 ? 'up' : 'down';
}

/** 设计坐标是否在房间外框内（用于把玩家拉回房间）。 */
export function clampToRoom(room: RoomDef, feet: MapPoint): MapPoint {
  const width = room.size[0] * room.tileSize;
  const height = room.size[1] * room.tileSize;
  const margin = room.tileSize / 2;
  return {
    x: Math.min(room.origin.x + width - margin, Math.max(room.origin.x + margin, feet.x)),
    y: Math.min(room.origin.y + height - margin, Math.max(room.origin.y + margin, feet.y)),
  };
}
