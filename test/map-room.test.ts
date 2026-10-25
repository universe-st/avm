import { describe, expect, it } from 'vitest';
import {
  canStandAt,
  findInteractableNear,
  isWalkableTile,
  reachableTiles,
  tileCenter,
  validateRoom,
  worldToTile,
} from '../src/map/core/room';
import { CH01_DORM_ROOM } from '../src/map/rooms/ch01-dorm';
import type { RoomDef } from '../src/map/types';

const FOOT = { width: 58, height: 20 } as const;

describe('ch01 dorm room', () => {
  it('passes structural validation', () => {
    expect(validateRoom(CH01_DORM_ROOM)).toEqual([]);
  });

  it('is a 50x54 room with one spawn by the door', () => {
    expect(CH01_DORM_ROOM.size).toEqual([50, 54]);
    expect(CH01_DORM_ROOM.ascii).toHaveLength(54);
    for (const line of CH01_DORM_ROOM.ascii) expect(line).toHaveLength(50);
    expect(CH01_DORM_ROOM.spawn.at).toEqual([24, 50]);
    expect(isWalkableTile(CH01_DORM_ROOM, 24, 50)).toBe(true);
    expect(canStandAt(CH01_DORM_ROOM, tileCenter(CH01_DORM_ROOM, 24, 50), FOOT)).toBe(true);
  });

  it('keeps furniture and walls solid', () => {
    expect(isWalkableTile(CH01_DORM_ROOM, 0, 0)).toBe(false);
    expect(isWalkableTile(CH01_DORM_ROOM, 9, 15)).toBe(false); // 郑卿床
    expect(isWalkableTile(CH01_DORM_ROOM, 25, 25)).toBe(false); // 书桌
    expect(isWalkableTile(CH01_DORM_ROOM, 18, 15)).toBe(true); // 中央地板
    expect(isWalkableTile(CH01_DORM_ROOM, 24, 30)).toBe(true);
  });

  it('reaches every required interactable from the spawn', () => {
    const reachable = reachableTiles(CH01_DORM_ROOM);
    const byId = new Map(CH01_DORM_ROOM.interactables.map((item) => [item.id, item]));
    for (const id of ['zheng', 'phone', 'desk', 'window', 'door']) {
      const item = byId.get(id);
      expect(item, `缺少交互点 ${id}`).toBeDefined();
      if (!item) continue;
      const [col, row] = item.at;
      const cells = [
        [col, row],
        [col - 1, row],
        [col + 1, row],
        [col, row - 1],
        [col, row + 1],
      ] as const;
      expect(cells.some(([c, r]) => reachable.has(`${c},${r}`))).toBe(true);
    }
  });

  it('finds the nearest interactable and respects its radius', () => {
    const bed = tileCenter(CH01_DORM_ROOM, 14, 15);
    expect(findInteractableNear(CH01_DORM_ROOM, bed)?.id).toBe('zheng');
    const far = { x: 0, y: 0 };
    expect(findInteractableNear(CH01_DORM_ROOM, far)).toBeNull();
  });

  it('converts world coordinates to tiles and back', () => {
    const center = tileCenter(CH01_DORM_ROOM, 20, 25);
    expect(worldToTile(CH01_DORM_ROOM, center)).toEqual({ col: 20, row: 25 });
    expect(worldToTile(CH01_DORM_ROOM, { x: -1, y: -1 })).toBeNull();
  });
});

describe('room validation rejects broken data', () => {
  const patch = (overrides: Partial<RoomDef>): RoomDef => ({
    ...CH01_DORM_ROOM,
    ...overrides,
  });

  it('rejects wrong row widths', () => {
    const room = patch({ ascii: ['##', ...CH01_DORM_ROOM.ascii.slice(1)] });
    expect(validateRoom(room).some((error) => error.includes('长度'))).toBe(true);
  });

  it('rejects duplicate or misplaced spawns', () => {
    const rows = [...CH01_DORM_ROOM.ascii];
    rows[1] = '#'.repeat(50);
    rows[3] = '###.' + 'P'.repeat(44) + '.###';
    const room = patch({ ascii: rows });
    expect(validateRoom(room).some((error) => error.includes('P'))).toBe(true);
  });

  it('rejects an interactable with no walkable neighbour', () => {
    const room = patch({
      interactables: [{ id: 'wall', at: [0, 0] }],
    });
    expect(validateRoom(room).some((error) => error.includes('周围没有可走格'))).toBe(true);
  });

  it('rejects a non-wall border', () => {
    const rows = [...CH01_DORM_ROOM.ascii];
    rows[0] = '.' + '#'.repeat(48) + '#';
    const room = patch({ ascii: rows });
    expect(validateRoom(room).some((error) => error.includes('边界'))).toBe(true);
  });
});
