import { describe, expect, it } from 'vitest';
import {
  SAVE_SLOT_IDS,
  SAVE_VERSION,
  createSaveData,
  formatSavedAt,
  parseSave,
  parseSaveValue,
  readRestorePayload,
  saveSlotMeta,
  serializeSave,
  type SaveDataV1,
} from '../src/app/save/schema';

/** 一份合法存档的最小构造（测试要改哪个字段就覆盖哪个）。 */
function sample(overrides: Partial<SaveDataV1> = {}): SaveDataV1 {
  return {
    version: 1,
    savedAt: 1_763_000_000_000,
    slot: 2,
    chapter: 'ch01',
    module: 'ch01Dorm',
    checkpoint: 'dorm.explore',
    sceneLabel: '寝室',
    chapterLabel: '第一章 · 第一节',
    objective: '叫醒郑卿',
    bgmId: 'ch01Dorm',
    player: { x: 320.5, y: 480.25, facing: 'upRight' },
    dorm: { talkedZheng: true, phoneFound: false },
    flags: {},
    ...overrides,
  };
}

describe('正式存档 · 序列化往返', () => {
  it('serialize → parse 得到同一份数据', () => {
    const save = sample();
    const parsed = parseSave(serializeSave(save), 2);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.save).toEqual(save);
  });

  it('坐标先取整到 0.01：不会因为浮点尾巴让文件抖', () => {
    const save = sample({ player: { x: 320.123456, y: 480.987654, facing: 'down' } });
    const text = serializeSave(save);
    const parsed = parseSave(text, 2);
    if (!parsed.ok) throw new Error('应当解析成功');
    expect(parsed.save.player).toEqual({ x: 320.12, y: 480.99, facing: 'down' });
  });

  it('bgmId 允许 null（静场存档）', () => {
    const parsed = parseSave(serializeSave(sample({ bgmId: null })), 2);
    if (!parsed.ok) throw new Error('应当解析成功');
    expect(parsed.save.bgmId).toBeNull();
  });
});

describe('正式存档 · 损坏与不兼容', () => {
  it('空/坏 JSON 有明确失败原因', () => {
    expect(parseSave(null)).toMatchObject({ ok: false, reason: 'empty' });
    expect(parseSave('   ')).toMatchObject({ ok: false, reason: 'empty' });
    expect(parseSave('{')).toMatchObject({ ok: false, reason: 'json' });
    expect(parseSave('null')).toMatchObject({ ok: false, reason: 'shape' });
  });

  it('未知版本一律不可读（不迁移、不猜字段）', () => {
    const raw = JSON.stringify({ ...sample(), version: 2 });
    expect(parseSave(raw, 2)).toMatchObject({ ok: false, reason: 'version' });
    const v0 = JSON.stringify({ ...sample(), version: 0 });
    expect(parseSave(v0, 2)).toMatchObject({ ok: false, reason: 'version' });
  });

  it('缺字段/类型不对/取值不合法都算 shape', () => {
    const cases: unknown[] = [
      {},
      { ...sample(), savedAt: 'yesterday' },
      { ...sample(), savedAt: -1 },
      { ...sample(), slot: 0 },
      { ...sample(), slot: 9 },
      { ...sample(), chapter: 'ch02' },
      { ...sample(), module: 'ch01Palace' },
      { ...sample(), checkpoint: 'dorm.nowhere' },
      { ...sample(), objective: '   ' },
      { ...sample(), bgmId: 'ch01Nope' },
      { ...sample(), player: { x: 1, y: 2 } },
      { ...sample(), player: { x: 1, y: 2, facing: 'north' } },
      { ...sample(), dorm: { talkedZheng: true } },
    ];
    for (const value of cases) {
      expect(parseSaveValue(value), JSON.stringify(value)).toMatchObject({ ok: false, reason: 'shape' });
    }
  });

  it('槽位号与存储位置不一致 = 串档，视为损坏', () => {
    const raw = serializeSave(sample({ slot: 2 }));
    expect(parseSave(raw, 1)).toMatchObject({ ok: false, reason: 'slot' });
    expect(parseSave(raw, 2).ok).toBe(true);
  });

  it('未知字段被丢掉（向前兼容删字段/手工加字段的旧档）', () => {
    const raw = JSON.stringify({ ...sample(), legacyCapture: 'x', extra: { nested: 1 } });
    const parsed = parseSave(raw, 2);
    if (!parsed.ok) throw new Error('应当解析成功');
    expect(parsed.save).not.toHaveProperty('legacyCapture');
    expect(parsed.save).not.toHaveProperty('extra');
  });

  it('flags 只留标量，对象/null 一律丢弃', () => {
    const parsed = parseSaveValue({
      ...sample(),
      flags: { a: 1, b: 'two', c: true, d: { nested: 1 }, e: null, f: [1] },
    }, 2);
    if (!parsed.ok) throw new Error('应当解析成功');
    expect(parsed.save.flags).toEqual({ a: 1, b: 'two', c: true });
  });
});

describe('正式存档 · 构造与元信息', () => {
  it('createSaveData 从场景变量补齐标签/检查点/版本', () => {
    const save = createSaveData({
      slot: 1,
      module: 'ch01Kitchen',
      objective: '摸清通往传膳门的路',
      bgmId: 'ch01Crisis',
      player: { x: 10, y: 20, facing: 'left' },
      dorm: { talkedZheng: true, phoneFound: true },
      now: 1_000,
    });
    expect(save).toMatchObject({
      version: SAVE_VERSION,
      savedAt: 1000,
      slot: 1,
      chapter: 'ch01',
      module: 'ch01Kitchen',
      checkpoint: 'kitchen.explore',
      sceneLabel: '御膳房',
      chapterLabel: '第一章 · 第二节',
      objective: '摸清通往传膳门的路',
      flags: {},
    });
    // 立刻可往返
    expect(parseSave(serializeSave(save), 1).ok).toBe(true);
  });

  it('元信息给列表用：时间/章节/场景/目标', () => {
    const meta = saveSlotMeta(sample());
    expect(meta.slot).toBe(2);
    expect(meta.chapterLabel).toBe('第一章 · 第一节');
    expect(meta.sceneLabel).toBe('寝室');
    expect(meta.objective).toBe('叫醒郑卿');
    expect(meta.timeLabel).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it('时间标签是固定格式（不依赖 ICU 的 toLocaleString）', () => {
    const date = new Date(2026, 10, 17, 18, 5, 0);
    expect(formatSavedAt(date.getTime(), date)).toBe('2026-11-17 18:05');
    expect(formatSavedAt(Number.NaN)).toBe('时间未知');
  });

  it('槽位 id 是 1..3（UI 与存储共用一份）', () => {
    expect([...SAVE_SLOT_IDS]).toEqual([1, 2, 3]);
  });
});

describe('正式存档 · 读档载荷守卫', () => {
  it('认 { restore } 且字段合法', () => {
    const save = sample();
    expect(readRestorePayload({ restore: save })).toEqual(save);
  });

  it('不认非法形状（普通启动 / 手工改过的数据）', () => {
    expect(readRestorePayload(null)).toBeNull();
    expect(readRestorePayload({})).toBeNull();
    expect(readRestorePayload({ restore: { version: 1 } })).toBeNull();
    expect(readRestorePayload({ restore: { ...sample(), version: 3 } })).toBeNull();
    expect(readRestorePayload({ resume: 'explore' })).toBeNull();
  });
});
