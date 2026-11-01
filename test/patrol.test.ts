import { describe, expect, it } from 'vitest';
import type { PatrolDef, RoomDef } from '../src/map/types';
import { PatrolUnit } from '../src/map/core/patrol';
import { tileCenter } from '../src/map/core/room';

const TILE = 64;
const ROOM: RoomDef = {
  id: 'test.patrol',
  chapter: 'test',
  title: '测试房',
  size: [10, 10],
  tileSize: TILE,
  origin: { x: 0, y: 0 },
  ascii: [
    '##########',
    '#........#',
    '#........#',
    '#........#',
    '#........#',
    '#........#',
    '#........#',
    '#........#',
    '#........#',
    '##########',
  ],
  spawn: { at: [1, 1], facing: 'down' },
  interactables: [],
};

const patrol = (patch: Partial<PatrolDef> = {}): PatrolDef => ({
  id: 'patrol.test',
  kind: 'phantom',
  path: [[2, 2], [7, 2], [7, 7], [2, 7]],
  speed: 100,
  pauseMs: 1000,
  scanDeg: 120,
  vision: { fovDeg: 100, rangeTiles: 4.5 },
  ...patch,
});

const at = (col: number, row: number) => tileCenter(ROOM, col, row);

describe('PatrolUnit', () => {
  it('walks the path and keeps the alert at zero when the player is unseen', () => {
    const unit = new PatrolUnit(ROOM, patrol());
    const start = unit.position;
    unit.update({ player: at(1, 8), playerVisible: false, playerPosture: 1, dtMs: 1000 });
    expect(unit.phase).toBe('patrol');
    expect(unit.alert).toBe(0);
    expect(unit.position.x).toBeGreaterThan(start.x);
  });

  it('raises the alert when the player is visible, then decays', () => {
    const unit = new PatrolUnit(ROOM, patrol({ path: [[2, 2]] }));
    const player = { x: unit.position.x + 100, y: unit.position.y };
    for (let i = 0; i < 10; i += 1) {
      unit.update({ player, playerVisible: true, playerPosture: 1, dtMs: 100 });
    }
    const raised = unit.alert;
    expect(raised).toBeGreaterThan(0.35);
    expect(['suspicious', 'chase']).toContain(unit.phase);

    for (let i = 0; i < 10; i += 1) {
      unit.update({ player, playerVisible: false, playerPosture: 1, dtMs: 100 });
    }
    expect(unit.alert).toBeLessThan(raised);
  });

  it('chases and catches a player standing on top of it', () => {
    const unit = new PatrolUnit(ROOM, patrol({ path: [[2, 2]], speed: 0 }));
    const player = unit.position;
    for (let i = 0; i < 40; i += 1) {
      unit.update({ player, playerVisible: true, playerPosture: 1, dtMs: 100 });
    }
    expect(unit.phase).toBe('chase');
    expect(unit.caught).toBe(true);
  });

  it('goes chase → search → return after losing sight', () => {
    const unit = new PatrolUnit(ROOM, patrol({ path: [[2, 2]], speed: 0 }));
    const player = { x: unit.position.x + 150, y: unit.position.y };
    for (let i = 0; i < 40; i += 1) {
      unit.update({ player, playerVisible: true, playerPosture: 1, dtMs: 100 });
    }
    expect(unit.phase).toBe('chase');

    for (let i = 0; i < 16; i += 1) {
      unit.update({ player, playerVisible: false, playerPosture: 1, dtMs: 100 });
    }
    expect(unit.phase).toBe('search');

    for (let i = 0; i < 45; i += 1) {
      unit.update({ player, playerVisible: false, playerPosture: 1, dtMs: 100 });
    }
    expect(['return', 'patrol']).toContain(unit.phase);
  });

  it('stands and scans on a single-point post', () => {
    const unit = new PatrolUnit(ROOM, patrol({ path: [[2, 2]], speed: 0, pauseMs: 60000 }));
    const startFacing = unit.facingRad;
    unit.update({ player: at(1, 8), playerVisible: false, playerPosture: 1, dtMs: 1000 });
    expect(unit.phase).toBe('patrol');
    expect(unit.position).toEqual(at(2, 2));
    expect(unit.facingRad).not.toBe(startFacing);
  });
});
