import { describe, expect, it } from 'vitest';
import { castRay, castVisionPolygon, hasLineOfSight, tileKey, tilesInPolygon } from '../src/map/core/vision';
import { CH01_KITCHEN_ROOM as ROOM } from '../src/map/rooms/ch01-kitchen';
import { tileCenter } from '../src/map/core/room';

const T = ROOM.tileSize;

describe('vision polygon (ray cast)', () => {
  it('stops at the wall instead of passing through it', () => {
    // 柴房里从 (7,55) 往正北打：列 7 一路通畅到行 49，行 49 是整条横墙（缺口在 14-17）。
    const origin = tileCenter(ROOM, 7, 55);
    const hit = castRay(ROOM, origin, -Math.PI / 2, 20 * T);
    // 行 49 是实墙，射线上行时撞到的是它的**下边界**，即 y = 50 * T。
    expect(hit.y).toBeCloseTo(50 * T, 5);
    expect(Math.floor(hit.y / T) - 1).toBe(49);
  });

  it('runs the full range when nothing blocks the way', () => {
    // 柴房内部横向开阔，4 格射程内无墙。
    const origin = tileCenter(ROOM, 6, 55);
    const hit = castRay(ROOM, origin, 0, 4 * T);
    expect(hit.x).toBeCloseTo(origin.x + 4 * T, 5);
    expect(hit.y).toBeCloseTo(origin.y, 5);
  });

  it('produces a fan with one vertex per ray plus the two edges', () => {
    const origin = tileCenter(ROOM, 15, 36);
    const polygon = castVisionPolygon(ROOM, origin, -Math.PI / 2, {
      fovDeg: 120,
      range: 7.5 * T,
      rays: 48,
    });
    expect(polygon.points).toHaveLength(49);
  });

  it('keeps every vertex inside the fov', () => {
    const origin = tileCenter(ROOM, 15, 36);
    const heading = 0.4;
    const half = (120 * Math.PI) / 360;
    const polygon = castVisionPolygon(ROOM, origin, heading, {
      fovDeg: 120,
      range: 7.5 * T,
      rays: 32,
    });
    for (const point of polygon.points) {
      const angle = Math.atan2(point.y - origin.y, point.x - origin.x);
      let delta = angle - heading;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      expect(Math.abs(delta)).toBeLessThanOrEqual(half + 1e-6);
    }
  });

  it('covers a full circle when fov is 360', () => {
    const origin = tileCenter(ROOM, 15, 36);
    const polygon = castVisionPolygon(ROOM, origin, 0, {
      fovDeg: 360,
      range: 3 * T,
      rays: 24,
    });
    expect(polygon.points).toHaveLength(24);
    const radii = polygon.points.map((p) => Math.hypot(p.x - origin.x, p.y - origin.y));
    for (const r of radii) expect(r).toBeLessThanOrEqual(3 * T + 1e-6);
  });

  it('does not light the inside of a wall the ray hits', () => {
    // 射线停在墙的迎光面上，墙心必须落在多边形外面（否则会把墙后照亮）。
    const origin = tileCenter(ROOM, 7, 55);
    const polygon = castVisionPolygon(ROOM, origin, -Math.PI / 2, {
      fovDeg: 120,
      range: 10 * T,
      rays: 96,
    });
    const inside = (x: number, y: number): boolean => {
      let hit = false;
      for (let i = 0, j = polygon.points.length - 1; i < polygon.points.length; j = i, i += 1) {
        const a = polygon.points[i]!;
        const b = polygon.points[j]!;
        if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
      }
      return hit;
    };
    // 行 49 的墙心在 (7*T+48, 49*T+48)，射线刚好停在 y=50*T，所以它应当在外面。
    expect(inside(7 * T + T / 2, 49 * T + T / 2)).toBe(false);
    // 而墙前一行（行 50 的格心）应当在里面。
    expect(inside(7 * T + T / 2, 50 * T + T / 2)).toBe(true);
  });

  it('never sees through a wall', () => {
    const origin = tileCenter(ROOM, 15, 36);
    for (let i = 0; i < 64; i += 1) {
      const angle = (i / 64) * Math.PI * 2;
      const hit = castRay(ROOM, origin, angle, 8 * T);
      expect(hasLineOfSight(ROOM, origin, hit)).toBe(true);
    }
  });
});

describe('ray cast dda (all four quadrants)', () => {
  // 曾经的 bug：正方向分支把"格线绝对坐标"当成了"到格线的距离"，
  // 于是朝右/朝下的射线永远打空，扇形只剩脚下那圈环境光。
  it('hits the wall when casting right', () => {
    // 柴房里 (6,58) 往东：列 29 是外墙。
    const origin = tileCenter(ROOM, 6, 58);
    const hit = castRay(ROOM, origin, 0, 40 * T);
    expect(Math.floor(hit.x / T)).toBe(29);
    expect(hit.x).toBeCloseTo(29 * T, 5);
  });

  it('hits the wall when casting down', () => {
    const origin = tileCenter(ROOM, 6, 55);
    const hit = castRay(ROOM, origin, Math.PI / 2, 40 * T);
    expect(Math.floor(hit.y / T)).toBe(63);
    expect(hit.y).toBeCloseTo(63 * T, 5);
  });

});

describe('infinite range (walls are the only limit)', () => {
  const ROOM_DIAG = Math.hypot(ROOM.size[0] * T, ROOM.size[1] * T);

  it('reaches across the whole corridor until a wall stops it', () => {
    // 灶房正中往北：一路到行 28 的横墙为止，远超原来的 7.5 格。
    const origin = tileCenter(ROOM, 15, 44);
    const polygon = castVisionPolygon(ROOM, origin, -Math.PI / 2, {
      fovDeg: 120,
      range: ROOM_DIAG,
      rays: 64,
    });
    const maxReach = Math.max(
      ...polygon.points.map((p) => Math.hypot(p.x - origin.x, p.y - origin.y)),
    );
    expect(maxReach).toBeGreaterThan(10 * T);
    expect(maxReach).toBeLessThan(ROOM_DIAG);
  });

  it('still stops at a wall no matter how far the ray could go', () => {
    const origin = tileCenter(ROOM, 15, 44);
    for (let i = 0; i < 48; i += 1) {
      const angle = -Math.PI + (i / 48) * Math.PI * 2;
      const hit = castRay(ROOM, origin, angle, ROOM_DIAG);
      const reach = Math.hypot(hit.x - origin.x, hit.y - origin.y);
      expect(reach).toBeLessThanOrEqual(ROOM_DIAG + 1);
      // 落点所在的那一格（往内推 1px）必须是墙，或者已经摸到房间边界。
      const inside = { x: hit.x + Math.cos(angle) * 1, y: hit.y + Math.sin(angle) * 1 };
      const col = Math.floor(inside.x / T);
      const row = Math.floor(inside.y / T);
      const out = col < 0 || row < 0 || col >= ROOM.size[0] || row >= ROOM.size[1];
      if (!out) expect(ROOM.ascii[row]![col]).toBe('#');
    }
  });

  it('derives the same tiles from the polygon as a straight look would', () => {
    const origin = tileCenter(ROOM, 15, 44);
    const polygon = castVisionPolygon(ROOM, origin, -Math.PI / 2, {
      fovDeg: 120,
      range: ROOM_DIAG,
      rays: 96,
    });
    const tiles = tilesInPolygon(ROOM, origin, polygon.points);
    // 灶房到行 26 都是通的，行 25 才是横墙。
    expect(tiles.has(tileKey(15, 40))).toBe(true);
    expect(tiles.has(tileKey(15, 30))).toBe(true);
    expect(tiles.has(tileKey(15, 26))).toBe(true);
    expect(tiles.has(tileKey(15, 24))).toBe(true); // 从缺口穿过去
    // 行 24/25 的墙带：col 15 是缺口（通路），col 13 才是墙。
    expect(ROOM.ascii[25]![15]).toBe('.');
    // 墙本身可以算"看得见"（要照亮墙面），但墙那一侧绝对不行。
    expect(ROOM.ascii[25]![10]).toBe('#');
    expect(tiles.has(tileKey(10, 23))).toBe(false);
    // 顺着走廊能一直看到墙，说明射程已经远超原来的 7.5 格。
    expect(origin.y - tileCenter(ROOM, 15, 26).y).toBeGreaterThan(15 * T);
  });
});
