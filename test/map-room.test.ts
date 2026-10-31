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
import { PLAYER_FOOT } from '../src/map/player-foot';
import type { RoomDef } from '../src/map/types';

const FOOT = PLAYER_FOOT;

describe('ch01 dorm room', () => {
  it('passes structural validation', () => {
    expect(validateRoom(CH01_DORM_ROOM)).toEqual([]);
  });

  it('is a 33x54 room with one spawn below the desk, on the left-bed side', () => {
    expect(CH01_DORM_ROOM.size).toEqual([33, 54]);
    expect(CH01_DORM_ROOM.ascii).toHaveLength(54);
    for (const line of CH01_DORM_ROOM.ascii) expect(line).toHaveLength(33);
    expect(CH01_DORM_ROOM.spawn.at).toEqual([14, 12]);
    expect(CH01_DORM_ROOM.spawn.facing).toBe('down');
    expect(isWalkableTile(CH01_DORM_ROOM, 14, 12)).toBe(true);
    expect(canStandAt(CH01_DORM_ROOM, tileCenter(CH01_DORM_ROOM, 14, 12), FOOT)).toBe(true);
  });

  it('keeps furniture and walls solid', () => {
    expect(isWalkableTile(CH01_DORM_ROOM, 0, 0)).toBe(false);
    expect(isWalkableTile(CH01_DORM_ROOM, 25, 15)).toBe(false); // 郑卿床（北窗下）
    expect(isWalkableTile(CH01_DORM_ROOM, 14, 8)).toBe(false); // 书桌
    expect(isWalkableTile(CH01_DORM_ROOM, 18, 15)).toBe(true); // 中央地板
    expect(isWalkableTile(CH01_DORM_ROOM, 16, 30)).toBe(true);
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

  it('puts Zheng\'s trigger beside his head and still reachable from the corridor', () => {
    const zheng = CH01_DORM_ROOM.interactables.find((item) => item.id === 'zheng');
    expect(zheng?.at).toEqual([21, 13]);
    // 沿左侧过道走到头边（col 18 是可站的最右一列）。
    const besideHead = tileCenter(CH01_DORM_ROOM, 18, 13);
    expect(findInteractableNear(CH01_DORM_ROOM, besideHead)?.id).toBe('zheng');
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
