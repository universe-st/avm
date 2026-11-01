import { describe, expect, it } from 'vitest';
import {
  canStandAt,
  isWalkableTile,
  tileCenter,
  worldToTile,
} from '../src/map/core/room';
import {
  facingFromVector,
  moveWithCollision,
  normalizeDirection,
} from '../src/map/core/collision';
import { CH01_DORM_ROOM } from '../src/map/rooms/ch01-dorm';
import { CH01_KITCHEN_ROOM } from '../src/map/rooms/ch01-kitchen';
import { KITCHEN_PLAYER_FOOT, PLAYER_FOOT } from '../src/map/player-foot';

const FOOT = PLAYER_FOOT;

describe('map collision', () => {
  it('does not stand inside furniture', () => {
    expect(canStandAt(CH01_DORM_ROOM, tileCenter(CH01_DORM_ROOM, 10, 25), FOOT)).toBe(false);
    expect(canStandAt(CH01_DORM_ROOM, tileCenter(CH01_DORM_ROOM, 16, 18), FOOT)).toBe(true);
  });

  it('blocks a straight step into a wall', () => {
    // 起点必须是合法位置：寝室通道可站范围是 col 14-18，东西两侧都是墙。
    const start = tileCenter(CH01_DORM_ROOM, 18, 12);
    expect(canStandAt(CH01_DORM_ROOM, start, FOOT)).toBe(true);
    const result = moveWithCollision(CH01_DORM_ROOM, start, { x: 40, y: 0 }, FOOT);
    expect(result.position).toEqual(start);
    expect(result.blocked).toBe(true);
  });

  it('stops at a concave corner instead of cutting through it', () => {
    // 起点必须是**合法**位置，否则测的是「起点本来就不合法」而不是拐角。
    // (14,12) 是纵向通道西南角可站的角落：西边是墙、北边也是墙。
    const start = tileCenter(CH01_DORM_ROOM, 14, 12);
    expect(canStandAt(CH01_DORM_ROOM, start, FOOT)).toBe(true);
    const result = moveWithCollision(CH01_DORM_ROOM, start, { x: -24, y: -24 }, FOOT);
    expect(result.blocked).toBe(true);
    expect(result.position).toEqual(start);
  });

  it('slides along a wall when only one axis is blocked', () => {
    const start = tileCenter(CH01_DORM_ROOM, 16, 11);
    expect(canStandAt(CH01_DORM_ROOM, start, FOOT)).toBe(false);
    // 合法起点：通道里贴着北墙往西走，Y 被挡、X 继续。
    const legal = tileCenter(CH01_DORM_ROOM, 16, 12);
    expect(canStandAt(CH01_DORM_ROOM, legal, FOOT)).toBe(true);
    const result = moveWithCollision(CH01_DORM_ROOM, legal, { x: -18, y: -18 }, FOOT);
    expect(result.blocked).toBe(true);
    expect(result.position.y).toBe(legal.y);
    expect(result.position.x).toBeLessThan(legal.x);
  });

  it('moves freely on the central floor', () => {
    const start = tileCenter(CH01_DORM_ROOM, 16, 30);
    const result = moveWithCollision(CH01_DORM_ROOM, start, { x: 20, y: 0 }, FOOT);
    expect(result.position.x).toBe(start.x + 20);
    expect(result.blocked).toBe(false);
  });

  it('walks the aisle between the two bed rows', () => {
    // 上下两排床之间的过道（北排床尾到南排床头）必须站得住、横着能走通。
    expect(canStandAt(CH01_DORM_ROOM, tileCenter(CH01_DORM_ROOM, 5, 27), FOOT)).toBe(true);
    let feet = tileCenter(CH01_DORM_ROOM, 16, 27);
    for (let i = 0; i < 400; i += 1) {
      feet = moveWithCollision(CH01_DORM_ROOM, feet, { x: -2, y: 0 }, FOOT).position;
    }
    const tile = worldToTile(CH01_DORM_ROOM, feet);
    expect(tile).not.toBeNull();
    expect(tile?.col ?? 99).toBeLessThanOrEqual(5);
  });

  it('enters the aisle from the central corridor', () => {
    let feet = tileCenter(CH01_DORM_ROOM, 16, 23);
    for (let i = 0; i < 200; i += 1) {
      feet = moveWithCollision(CH01_DORM_ROOM, feet, { x: 0, y: 2 }, FOOT).position;
    }
    const tile = worldToTile(CH01_DORM_ROOM, feet);
    expect(tile?.row ?? 0).toBeGreaterThanOrEqual(29);
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
    expect(isWalkableTile(CH01_DORM_ROOM, 16, 52)).toBe(true);
    expect(isWalkableTile(CH01_DORM_ROOM, 22, 52)).toBe(false);
  });

  it('keeps the kitchen foot narrower than one tile', () => {
    // 屏风躲藏点 (18,6) 西边一格就是挡路柱 (17,5)-(17,6)。
    // 脚盒（含 padding）一旦宽过一格，玩家被瞬移到格心后就再也走不动 —— 这是真发生过的软锁。
    const footWidth = KITCHEN_PLAYER_FOOT.width + (KITCHEN_PLAYER_FOOT.padding ?? 0) * 2;
    expect(footWidth).toBeLessThanOrEqual(CH01_KITCHEN_ROOM.tileSize);
    const screenSpot = tileCenter(CH01_KITCHEN_ROOM, 18, 6);
    expect(canStandAt(CH01_KITCHEN_ROOM, screenSpot, KITCHEN_PLAYER_FOOT)).toBe(true);
    const step = moveWithCollision(
      CH01_KITCHEN_ROOM,
      screenSpot,
      { x: 0, y: 8 },
      KITCHEN_PLAYER_FOOT,
    );
    expect(step.blocked).toBe(false);
    expect(step.position.y).toBeGreaterThan(screenSpot.y);
  });

  it('never hard-locks when the current foot is already illegal', () => {
    // 脚本瞬移/掩体贴墙会把脚盒摆进非法位置；这时必须还能移动，否则只能重开。
    const tile = CH01_KITCHEN_ROOM.tileSize;
    const spot = tileCenter(CH01_KITCHEN_ROOM, 18, 6);
    // 往西挪半格，脚盒左缘一定压进 (17,6) 的挡路柱。
    const illegal = { x: spot.x - tile / 2, y: spot.y };
    expect(canStandAt(CH01_KITCHEN_ROOM, illegal, KITCHEN_PLAYER_FOOT)).toBe(false);
    const step = moveWithCollision(
      CH01_KITCHEN_ROOM,
      illegal,
      { x: 8, y: 0 },
      KITCHEN_PLAYER_FOOT,
    );
    expect([step.position.x, step.position.y]).not.toEqual([illegal.x, illegal.y]);
  });
});
