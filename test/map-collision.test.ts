import { describe, expect, it } from 'vitest';
import {
  canStandAt,
  isWalkableTile,
  tileCenter,
} from '../src/map/core/room';
import {
  facingFromVector,
  moveWithCollision,
  normalizeDirection,
} from '../src/map/core/collision';
import { CH01_DORM_ROOM } from '../src/map/rooms/ch01-dorm';

const FOOT = { width: 58, height: 20 } as const;

describe('map collision', () => {
  it('does not stand inside furniture', () => {
    expect(canStandAt(CH01_DORM_ROOM, tileCenter(CH01_DORM_ROOM, 9, 15), FOOT)).toBe(false);
    expect(canStandAt(CH01_DORM_ROOM, tileCenter(CH01_DORM_ROOM, 19, 15), FOOT)).toBe(true);
  });

  it('blocks a straight step into the bed', () => {
    const start = tileCenter(CH01_DORM_ROOM, 19, 15);
    const result = moveWithCollision(
      CH01_DORM_ROOM,
      start,
      { x: -60, y: 0 },
      FOOT,
    );
    expect(result.position).toEqual(start);
    expect(result.blocked).toBe(true);
  });

  it('stops at a concave corner instead of cutting through it', () => {
    const start = tileCenter(CH01_DORM_ROOM, 3, 3);
    const result = moveWithCollision(CH01_DORM_ROOM, start, { x: -24, y: -24 }, FOOT);
    expect(result.blocked).toBe(true);
  });

  it('moves freely on the central floor', () => {
    const start = tileCenter(CH01_DORM_ROOM, 24, 30);
    const result = moveWithCollision(CH01_DORM_ROOM, start, { x: 20, y: 0 }, FOOT);
    expect(result.position.x).toBe(start.x + 20);
    expect(result.blocked).toBe(false);
  });

  it('normalizes diagonal input and derives facing', () => {
    const dir = normalizeDirection(1, 1);
    expect(Math.hypot(dir.x, dir.y)).toBeCloseTo(1);
    expect(facingFromVector(-1, 0, 'down')).toBe('left');
    expect(facingFromVector(0.2, -1, 'down')).toBe('up');
    expect(facingFromVector(0, 0, 'left')).toBe('left');
    expect(facingFromVector(0.707, 0.707, 'down')).toBe('downRight');
    expect(facingFromVector(-0.707, 0.707, 'down')).toBe('downLeft');
    expect(facingFromVector(0.707, -0.707, 'up')).toBe('upRight');
    expect(facingFromVector(-0.707, -0.707, 'up')).toBe('upLeft');
    expect(facingFromVector(0.95, 0.3, 'down')).toBe('right');
  });

  it('treats the door tile as walkable but keeps the outer frame solid', () => {
    expect(isWalkableTile(CH01_DORM_ROOM, 24, 52)).toBe(true);
    expect(isWalkableTile(CH01_DORM_ROOM, 21, 52)).toBe(false);
  });
});
