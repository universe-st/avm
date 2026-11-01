import { describe, expect, it } from 'vitest';
import { reachableTiles, tileCenter, validateRoom } from '../src/map/core/room';
import { blocksSight } from '../src/map/core/vision';
import { CH01_KITCHEN_ROOM, KITCHEN_ZONES } from '../src/map/rooms/ch01-kitchen';
import type { RoomDef } from '../src/map/types';

const reachable = (col: number, row: number): boolean =>
  reachableTiles(CH01_KITCHEN_ROOM).has(`${col},${row}`);

describe('ch01 kitchen room', () => {
  it('passes structural validation', () => {
    expect(validateRoom(CH01_KITCHEN_ROOM)).toEqual([]);
  });

  it('is a 32x64 continuous map with one spawn', () => {
    expect(CH01_KITCHEN_ROOM.size).toEqual([32, 64]);
    // 2026-10-31 地图放大 1.5×：tileSize 64 → 96，一屏横向可见 ~7.5 格。
    expect(CH01_KITCHEN_ROOM.tileSize).toBe(96);
    expect(CH01_KITCHEN_ROOM.ascii).toHaveLength(64);
    for (const line of CH01_KITCHEN_ROOM.ascii) expect(line).toHaveLength(32);
    expect(CH01_KITCHEN_ROOM.spawn.at).toEqual([6, 55]);
    expect(CH01_KITCHEN_ROOM.spawn.facing).toBe('up');
  });

  it('keeps walls and low counters distinct', () => {
    expect(reachable(6, 55)).toBe(true);
    expect(reachable(15, 5)).toBe(true);
    expect(reachable(5, 45)).toBe(true); // 干草堆
    expect(reachable(26, 45)).toBe(true); // 橱柜前
    expect(reachable(8, 36)).toBe(false); // 矮案台不可走
    expect(reachable(0, 0)).toBe(false);
    expect(blocksSight(CH01_KITCHEN_ROOM, '#')).toBe(true);
    expect(blocksSight(CH01_KITCHEN_ROOM, 'o')).toBe(false);
  });

  it('reaches every key location from the spawn', () => {
    const points: readonly [number, number][] = [
      [15, 5], // 门触发
      [18, 6], // 屏风后
      [5, 45], // 干草堆
      [26, 45], // 橱柜
      [10, 62], // 后门
      [7, 10], // 库房
      [7, 30], // 西巡逻起点
      [24, 30], // 东巡逻起点
      [12, 16], // 备膳间巡逻起点
    ];
    for (const [col, row] of points) {
      const tile = tileCenter(CH01_KITCHEN_ROOM, col, row);
      expect(Number.isFinite(tile.x) && Number.isFinite(tile.y)).toBe(true);
      expect(reachable(col, row), `不可达：(${col},${row})`).toBe(true);
    }
  });

  it('declares five zones in order', () => {
    expect(KITCHEN_ZONES.map((zone) => zone.title)).toEqual([
      '柴房',
      '灶房',
      '备膳间',
      '库房',
      '传膳廊',
    ]);
  });

  it('rejects a patrol path that crosses an obstacle or turns diagonally', () => {
    const badObstacle: RoomDef = {
      ...CH01_KITCHEN_ROOM,
      patrols: [
        {
          id: 'bad',
          kind: 'phantom',
          path: [[7, 30], [8, 36]],
          speed: 100,
          pauseMs: 0,
          scanDeg: 120,
          vision: { fovDeg: 100, rangeTiles: 4.5 },
        },
      ],
    };
    expect(validateRoom(badObstacle)).toEqual(
      expect.arrayContaining([expect.stringContaining('不可走')]),
    );

    const diagonal: RoomDef = {
      ...CH01_KITCHEN_ROOM,
      patrols: [
        {
          id: 'bad2',
          kind: 'phantom',
          path: [[7, 30], [12, 44]],
          speed: 100,
          pauseMs: 0,
          scanDeg: 120,
          vision: { fovDeg: 100, rangeTiles: 4.5 },
        },
      ],
    };
    expect(validateRoom(diagonal)).toEqual(
      expect.arrayContaining([expect.stringContaining('必须横/竖')]),
    );
  });

  it('rejects a hide on a wall and a trigger out of bounds', () => {
    const badHide: RoomDef = {
      ...CH01_KITCHEN_ROOM,
      hides: [
        {
          id: 'bad.hide',
          at: [0, 0],
          kind: 'cabinet',
          peek: false,
          enterMs: 250,
          exitMs: 250,
        },
      ],
    };
    expect(validateRoom(badHide)).toEqual(
      expect.arrayContaining([expect.stringContaining('站位格不可走')]),
    );

    const badTrigger: RoomDef = {
      ...CH01_KITCHEN_ROOM,
      triggers: [{ id: 'bad.trigger', rect: [30, 60, 40, 70], once: true, event: 'x' }],
    };
    expect(validateRoom(badTrigger)).toEqual(
      expect.arrayContaining([expect.stringContaining('越界')]),
    );
  });
});
