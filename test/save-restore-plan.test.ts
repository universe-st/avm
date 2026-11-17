import { describe, expect, it } from 'vitest';
import { evaluateSaveAvailability } from '../src/app/save/save-availability';
import {
  flowSnapshotFromSave,
  planBgmRestore,
  resolvePlayerRestore,
  saveLoadRoute,
} from '../src/app/save/restore-plan';
import { createSaveData, type SaveDataV1 } from '../src/app/save/schema';
import { tileCenter, worldToTile } from '../src/map/core/room';
import { KITCHEN_PLAYER_FOOT, PLAYER_FOOT } from '../src/map/player-foot';
import { CH01_DORM_ROOM } from '../src/map/rooms/ch01-dorm';
import { CH01_KITCHEN_ROOM } from '../src/map/rooms/ch01-kitchen';
import type { RoomDef } from '../src/map/types';

function save(overrides: Partial<SaveDataV1> = {}): SaveDataV1 {
  return createSaveData({
    slot: 1,
    module: 'ch01Dorm',
    objective: '叫醒郑卿',
    bgmId: 'ch01Dorm',
    player: { x: 100, y: 200, facing: 'down' },
    dorm: { talkedZheng: false, phoneFound: false },
    now: 1_000,
    ...overrides,
  });
}

/** 找一个不可走格的中心（用来验证「坐标在屋里但站不住」）。 */
function blockedPoint(room: RoomDef): { x: number; y: number } | null {
  for (let row = 0; row < room.size[1]; row += 1) {
    for (let col = 0; col < room.size[0]; col += 1) {
      const char = room.ascii[row]?.[col];
      if (char === '#') {
        const center = tileCenter(room, col, row);
        return { x: center.x - room.origin.x, y: center.y - room.origin.y };
      }
    }
  }
  return null;
}

describe('读档落点 · 玩家位置/朝向', () => {
  it('合法坐标精确落地', () => {
    const spawn = tileCenter(CH01_DORM_ROOM, 16, 26);
    const plan = resolvePlayerRestore(CH01_DORM_ROOM, PLAYER_FOOT, {
      x: spawn.x - CH01_DORM_ROOM.origin.x,
      y: spawn.y - CH01_DORM_ROOM.origin.y,
      facing: 'upLeft',
    });
    expect(plan.exact).toBe(true);
    expect(plan.reason).toBe('exact');
    expect(plan.facing).toBe('upLeft');
    expect(plan.position.x).toBeCloseTo(spawn.x, 5);
    expect(plan.position.y).toBeCloseTo(spawn.y, 5);
  });

  it('房间局部坐标会加回 origin（换视口不漂移的根据）', () => {
    const center = tileCenter(CH01_DORM_ROOM, 16, 26);
    const local = { x: center.x - CH01_DORM_ROOM.origin.x, y: center.y - CH01_DORM_ROOM.origin.y };
    const plan = resolvePlayerRestore(CH01_DORM_ROOM, PLAYER_FOOT, { ...local, facing: 'down' });
    expect(plan.exact).toBe(true);
    expect(plan.position.x).toBeCloseTo(local.x + CH01_DORM_ROOM.origin.x, 5);
    expect(plan.position.y).toBeCloseTo(local.y + CH01_DORM_ROOM.origin.y, 5);
    // 存档里存的是局部坐标（不含 origin），恢复时才加回去
    expect(CH01_DORM_ROOM.origin.y).toBeGreaterThan(0);
  });

  it('越界/非有限数回退出生点', () => {
    for (const player of [
      { x: 999_999, y: 0, facing: 'down' as const },
      { x: 0, y: -10, facing: 'down' as const },
      { x: Number.NaN, y: 10, facing: 'down' as const },
    ]) {
      const plan = resolvePlayerRestore(CH01_DORM_ROOM, PLAYER_FOOT, player);
      expect(plan.exact).toBe(false);
      expect(plan.reason).toBe('invalid');
      const spawn = tileCenter(CH01_DORM_ROOM, CH01_DORM_ROOM.spawn.at[0], CH01_DORM_ROOM.spawn.at[1]);
      expect(plan.position).toEqual(spawn);
      expect(plan.facing).toBe(CH01_DORM_ROOM.spawn.facing);
    }
  });

  it('坐标在屋里但压在墙上 → 回退出生点并标记 blocked', () => {
    const blockedLocal = blockedPoint(CH01_DORM_ROOM);
    expect(blockedLocal).not.toBeNull();
    if (!blockedLocal) return;
    const plan = resolvePlayerRestore(CH01_DORM_ROOM, PLAYER_FOOT, {
      ...blockedLocal,
      facing: 'right',
    });
    expect(plan.exact).toBe(false);
    expect(plan.reason).toBe('blocked');
    expect(worldToTile(CH01_DORM_ROOM, plan.position)).not.toBeNull();
  });

  it('御膳房用自己的脚盒（格子更大，脚盒不能串用）', () => {
    const spawn = tileCenter(CH01_KITCHEN_ROOM, 6, 55);
    const good = resolvePlayerRestore(CH01_KITCHEN_ROOM, KITCHEN_PLAYER_FOOT, {
      x: spawn.x,
      y: spawn.y,
      facing: 'up',
    });
    expect(good.exact).toBe(true);
    const blockedLocal = blockedPoint(CH01_KITCHEN_ROOM);
    if (blockedLocal) {
      const blocked = resolvePlayerRestore(CH01_KITCHEN_ROOM, KITCHEN_PLAYER_FOOT, {
        ...blockedLocal,
        facing: 'up',
      });
      expect(blocked.exact).toBe(false);
      expect(blocked.reason).toBe('blocked');
    }
  });
});

describe('读档恢复 · BGM 状态型 cue', () => {
  it('没存 BGM 时不动', () => {
    expect(planBgmRestore({ saved: null, currentId: 'ch01Dorm', playing: true })).toEqual({
      action: 'none',
      reason: 'no-saved-bgm',
    });
  });

  it('已经是同一首且在播 → 不重播（保住实例与进度）', () => {
    expect(planBgmRestore({ saved: 'ch01Dorm', currentId: 'ch01Dorm', playing: true })).toEqual({
      action: 'none',
      reason: 'already-current',
    });
  });

  it('存档是另一首 → 必须显式 play（场景绑定表只知道默认曲）', () => {
    expect(planBgmRestore({ saved: 'ch01Crisis', currentId: 'ch01Dorm', playing: true })).toEqual({
      action: 'play',
      id: 'ch01Crisis',
      reason: 'requested',
    });
  });

  it('同 id 但实例已停 → 也要 play（否则读档后静音）', () => {
    expect(planBgmRestore({ saved: 'ch01Dream', currentId: 'ch01Dream', playing: false })).toEqual({
      action: 'play',
      id: 'ch01Dream',
      reason: 'requested',
    });
  });

  it('空场（当前没有曲目）→ play 存档曲', () => {
    expect(planBgmRestore({ saved: 'ch01Crisis', currentId: null, playing: false })).toEqual({
      action: 'play',
      id: 'ch01Crisis',
      reason: 'requested',
    });
  });
});

describe('读档恢复 · 寝室流程快照', () => {
  it('寝室档生成 explore 快照（目标/叫醒/手机原样）', () => {
    const snapshot = flowSnapshotFromSave(
      save({
        objective: '找到手机',
        dorm: { talkedZheng: true, phoneFound: false },
      }),
    );
    expect(snapshot).toEqual({
      phase: 'explore',
      objective: '找到手机',
      talkedZheng: true,
      phoneFound: false,
    });
  });

  it('御膳房档不恢复寝室流程', () => {
    expect(
      flowSnapshotFromSave(
        save({ module: 'ch01Kitchen', dorm: { talkedZheng: true, phoneFound: true } }),
      ),
    ).toBeNull();
  });
});

describe('标题读档路由', () => {
  it('寝室档 → ch01Dorm + { restore }', () => {
    const data = save();
    const route = saveLoadRoute(data);
    expect(route?.module).toBe('ch01Dorm');
    expect(route?.data.restore).toBe(data);
  });

  it('御膳房档 → ch01Kitchen + { restore }', () => {
    const data = save({ module: 'ch01Kitchen', checkpoint: 'kitchen.explore' });
    expect(saveLoadRoute(data)?.module).toBe('ch01Kitchen');
  });

  it('不可读档的模块返回 null（防御性，不该出现）', () => {
    const broken = { ...save(), module: 'ch01Palace' } as unknown as SaveDataV1;
    expect(saveLoadRoute(broken)).toBeNull();
  });

  it('路由与存档判定一致：读档目标一定是「允许自由活动」的模块', () => {
    for (const module of ['ch01Dorm', 'ch01Kitchen'] as const) {
      const route = saveLoadRoute(save({ module }));
      expect(route).not.toBeNull();
      const availability = evaluateSaveAvailability({
        preview: false,
        module: route?.module ?? 'other',
        phase: 'explore',
      });
      expect(availability.allowed, module).toBe(true);
    }
  });
});
