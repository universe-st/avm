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
    // 床精灵（bed_zheng.png）按 9×22 格铺在 col 21–30 / 行 5–27；脸在行 11.2–15.2（中心 13.3）。
    // 判定点从行 13 下移到 14，marker 圆点落到脸侧床沿。
    expect(zheng?.at).toEqual([21, 14]);
    // 沿左侧过道走到头边（col 18 是可站的最右一列）。
    const besideHead = tileCenter(CH01_DORM_ROOM, 18, 14);
    expect(canStandAt(CH01_DORM_ROOM, besideHead, FOOT)).toBe(true);
    expect(findInteractableNear(CH01_DORM_ROOM, besideHead)?.id).toBe('zheng');
    const far = { x: 0, y: 0 };
    expect(findInteractableNear(CH01_DORM_ROOM, far)).toBeNull();
  });

  it('puts the window trigger in front of the desk, on the walkable row 11', () => {
    const window = CH01_DORM_ROOM.interactables.find((item) => item.id === 'window');
    // 窗玻璃实测 col 11.25–20.75、中心 col 16.0（dorm_q.png 按 32px 切格量像素）。
    expect(window?.at).toEqual([16, 11]);
    expect(isWalkableTile(CH01_DORM_ROOM, 16, 11)).toBe(true);
    // 第 11 行可走但站不住（脚盒上探针压在行 10 的墙/桌带），玩家实际站在第 12 行。
    expect(canStandAt(CH01_DORM_ROOM, tileCenter(CH01_DORM_ROOM, 16, 11), FOOT)).toBe(false);
    const front = tileCenter(CH01_DORM_ROOM, 16, 12);
    expect(canStandAt(CH01_DORM_ROOM, front, FOOT)).toBe(true);
    expect(findInteractableNear(CH01_DORM_ROOM, front)?.id).toBe('window');
  });

  it('puts the desk trigger in front of the novel and keeps it off the window', () => {
    const desk = CH01_DORM_ROOM.interactables.find((item) => item.id === 'desk');
    // 桌上的小说实测 col 12.8–14.6、中心 col 13.7 → marker 取 col 13（书桌左半边）。
    expect(desk?.at).toEqual([13, 11]);
    expect(isWalkableTile(CH01_DORM_ROOM, 13, 11)).toBe(true);
    const front = tileCenter(CH01_DORM_ROOM, 14, 12);
    expect(canStandAt(CH01_DORM_ROOM, front, FOOT)).toBe(true);
    expect(findInteractableNear(CH01_DORM_ROOM, front)?.id).toBe('desk');
    // 站在各自的 marker 上都只命中自己：两个 marker 相隔 65.5，窗户 marker 离手机 48.8，都还在半径内，
    // 但命中只看最近距离（0 < 48.8 / 65.5），不会被对方吃掉。
    expect(findInteractableNear(CH01_DORM_ROOM, tileCenter(CH01_DORM_ROOM, 13, 11))?.id).toBe(
      'desk',
    );
    expect(findInteractableNear(CH01_DORM_ROOM, tileCenter(CH01_DORM_ROOM, 16, 11))?.id).toBe(
      'window',
    );
  });

  it('covers the whole desk frontage with window/desk picks (no dead spot)', () => {
    // 书桌前沿 col 14–18 都是可站格；每一格都要么「看向窗外」要么「翻看小说」。
    for (const col of [14, 15, 16, 17, 18]) {
      const feet = tileCenter(CH01_DORM_ROOM, col, 12);
      expect(canStandAt(CH01_DORM_ROOM, feet, FOOT)).toBe(true);
      expect(['window', 'desk']).toContain(findInteractableNear(CH01_DORM_ROOM, feet)?.id);
    }
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
