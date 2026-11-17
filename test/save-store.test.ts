import { describe, expect, it } from 'vitest';
import {
  SAVE_KEY_PREFIX,
  hasReadableSave,
  readAllSlots,
  readSlot,
  slotKey,
  slotLabel,
  writeSlot,
  type SaveStorage,
} from '../src/app/save/save-store';
import { createSaveData, serializeSave, type SaveDataV1 } from '../src/app/save/schema';

function memoryStorage(initial: Record<string, string> = {}): SaveStorage & {
  readonly data: Record<string, string>;
} {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

function sample(slot: 1 | 2 | 3, overrides: Partial<SaveDataV1> = {}): SaveDataV1 {
  return createSaveData({
    slot,
    module: 'ch01Dorm',
    objective: '叫醒郑卿',
    bgmId: 'ch01Dorm',
    player: { x: 100, y: 200, facing: 'down' },
    dorm: { talkedZheng: false, phoneFound: false },
    now: 1_763_000_000_000,
    ...overrides,
  });
}

function rawOf(save: SaveDataV1): string {
  return serializeSave(save);
}

describe('存档槽位 · 读取', () => {
  it('key 带版本号，槽位 1..3 固定', () => {
    expect(slotKey(1)).toBe(`${SAVE_KEY_PREFIX}1`);
    expect(slotKey(3)).toBe('avm.save.v1.slot3');
  });

  it('空槽可见（不抛、不算损坏）', () => {
    const slots = readAllSlots(memoryStorage());
    expect(slots.map((slot) => slot.status)).toEqual(['empty', 'empty', 'empty']);
    expect(slots[0]?.save).toBeNull();
  });

  it('逐槽解析：一槽坏掉不影响另外两槽', () => {
    const storage = memoryStorage({
      [slotKey(1)]: rawOf(sample(1)),
      [slotKey(2)]: '{ broken',
      [slotKey(3)]: rawOf(sample(3)),
    });
    const slots = readAllSlots(storage);
    expect(slots.map((slot) => slot.status)).toEqual(['ok', 'corrupt', 'ok']);
    expect(slots[1]?.failure).toBe('json');
    expect(slots[2]?.meta?.sceneLabel).toBe('寝室');
  });

  it('未知版本显示为「版本不兼容」而不是损坏', () => {
    const storage = memoryStorage({
      [slotKey(2)]: JSON.stringify({ ...sample(2), version: 9 }),
    });
    const slot = readSlot(2, storage);
    expect(slot.status).toBe('unsupported-version');
    expect(slotLabel(slot)).toContain('版本不兼容');
  });

  it('串槽（key 1 里放 slot 2）按损坏处理', () => {
    const storage = memoryStorage({ [slotKey(1)]: rawOf(sample(2)) });
    expect(readSlot(1, storage).status).toBe('corrupt');
  });

  it('拿不到存储时全部按空处理', () => {
    expect(readSlot(1, null).status).toBe('empty');
    expect(hasReadableSave(null)).toBe(false);
  });
});

describe('存档槽位 · 写入', () => {
  it('写入后可读回，覆盖旧档不需要先删', () => {
    const storage = memoryStorage();
    expect(writeSlot(sample(1), { storage })).toEqual({ ok: true, slot: 1 });
    const first = readSlot(1, storage);
    expect(first.status).toBe('ok');

    const second = sample(1, { objective: '找到手机' });
    expect(writeSlot(second, { storage }).ok).toBe(true);
    expect(readSlot(1, storage).meta?.objective).toBe('找到手机');
  });

  it('损坏槽可以被覆盖（写盘不看旧内容）', () => {
    const storage = memoryStorage({ [slotKey(3)]: 'not json' });
    expect(readSlot(3, storage).status).toBe('corrupt');
    expect(writeSlot(sample(3), { storage }).ok).toBe(true);
    expect(readSlot(3, storage).status).toBe('ok');
  });

  it('存储不可用 → unavailable', () => {
    expect(writeSlot(sample(1), { storage: null })).toEqual({
      ok: false,
      slot: 1,
      reason: 'unavailable',
    });
  });

  it('配额满 → quota（而不是抛异常）', () => {
    const storage: SaveStorage = {
      getItem: () => null,
      setItem: () => {
        const error = new Error('full');
        (error as { name: string }).name = 'QuotaExceededError';
        throw error;
      },
      removeItem: () => undefined,
    };
    expect(writeSlot(sample(1), { storage })).toEqual({ ok: false, slot: 1, reason: 'quota' });
  });

  it('其他写入异常 → io', () => {
    const storage: SaveStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('blocked by policy');
      },
      removeItem: () => undefined,
    };
    expect(writeSlot(sample(1), { storage })).toEqual({ ok: false, slot: 1, reason: 'io' });
  });
});

describe('存档槽位 · 标题入口条件', () => {
  it('至少一槽可读才点亮「读取存档」', () => {
    expect(hasReadableSave(memoryStorage())).toBe(false);
    expect(hasReadableSave(memoryStorage({ [slotKey(3)]: rawOf(sample(3)) }))).toBe(true);
    // 只有坏档不算
    expect(hasReadableSave(memoryStorage({ [slotKey(1)]: '{}' }))).toBe(false);
  });

  it('槽位标题按状态给中文', () => {
    expect(slotLabel({ slot: 1, status: 'empty', save: null, meta: null })).toBe('第 1 槽 · 空档位');
    expect(slotLabel({ slot: 2, status: 'corrupt', save: null, meta: null })).toContain('损坏');
  });
});
