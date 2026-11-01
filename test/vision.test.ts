import { describe, expect, it } from 'vitest';
import type { RoomDef } from '../src/map/types';
import { tileCenter } from '../src/map/core/room';
import {
  facingToRadians,
  hasLineOfSight,
  isAngleInCone,
  normalizeAngle,
  visibleTiles,
} from '../src/map/core/vision';

const TILE = 32;

const ROOM: RoomDef = {
  id: 'test.vision',
  chapter: 'test',
  title: '测试房',
  size: [9, 7],
  tileSize: TILE,
  origin: { x: 0, y: 0 },
  ascii: [
    '#########',
    '#.......#',
    '#...#...#',
    '#.......#',
    '#.......#',
    '#.......#',
    '#########',
  ],
  spawn: { at: [1, 1], facing: 'right' },
  interactables: [],
  sightBlockers: ['#'],
};

const point = (col: number, row: number) => tileCenter(ROOM, col, row);

describe('vision helpers', () => {
  it('maps the eight facings to screen radians (y down)', () => {
    expect(facingToRadians('right')).toBeCloseTo(0);
    expect(facingToRadians('down')).toBeCloseTo(Math.PI / 2);
    expect(facingToRadians('left')).toBeCloseTo(Math.PI);
    expect(facingToRadians('up')).toBeCloseTo(-Math.PI / 2);
    expect(facingToRadians('downRight')).toBeCloseTo(Math.PI / 4);
  });

  it('normalizes angles and checks the cone boundary', () => {
    expect(normalizeAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(isAngleInCone(0, 0, 120)).toBe(true);
    expect(isAngleInCone(Math.PI / 3, 0, 120)).toBe(true);
    expect(isAngleInCone(Math.PI / 3 + 0.01, 0, 120)).toBe(false);
  });

  it('blocks sight through a wall but still sees the wall surface', () => {
    const from = point(2, 2);
    const wall = point(4, 2);
    const behindWall = point(5, 2);
    const open = point(2, 4);
    expect(hasLineOfSight(ROOM, from, open)).toBe(true);
    expect(hasLineOfSight(ROOM, from, wall)).toBe(true);
    expect(hasLineOfSight(ROOM, from, behindWall)).toBe(false);
  });
});

describe('visibleTiles', () => {
  it('reveals the forward cone, keeps the origin, and stops at walls', () => {
    const origin = point(2, 2);
    const result = visibleTiles(ROOM, origin, facingToRadians('right'), {
      fovDeg: 120,
      range: 5 * TILE,
    });
    expect(result.tiles.has('2,2')).toBe(true);
    expect(result.tiles.has('3,1')).toBe(true); // 斜上前方
    expect(result.tiles.has('3,2')).toBe(true);
    expect(result.tiles.has('4,2')).toBe(true); // 墙面可见
    expect(result.tiles.has('5,2')).toBe(false); // 墙后被挡
    expect(result.tiles.has('1,2')).toBe(false); // 背后不在锥内
  });

  it('adds a 360° ambient ring around the feet', () => {
    const origin = point(2, 3);
    const result = visibleTiles(ROOM, origin, facingToRadians('right'), {
      fovDeg: 120,
      range: 5 * TILE,
      ambientRange: 1.5 * TILE,
    });
    expect(result.tiles.has('1,3')).toBe(true); // 背后但贴身
    expect(result.tiles.has('2,2')).toBe(true);
    expect(result.tiles.has('5,2')).toBe(false);
  });

  it('respects range', () => {
    const origin = point(1, 4);
    const result = visibleTiles(ROOM, origin, facingToRadians('right'), {
      fovDeg: 120,
      range: 1 * TILE,
    });
    expect(result.tiles.has('2,4')).toBe(true);
    expect(result.tiles.has('5,4')).toBe(false);
  });
});
