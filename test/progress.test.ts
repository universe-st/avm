import { describe, expect, it } from 'vitest';
import {
  CHECKPOINTS,
  PROGRESS_KEY,
  clearProgress,
  continueDestination,
  loadProgress,
  parseProgress,
  saveProgress,
  serializeProgress,
  type CheckpointId,
  type ProgressStorage,
} from '../src/app/progress';

function memoryStorage(initial: Record<string, string> = {}): ProgressStorage & {
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

describe('进度检查点 · 解析', () => {
  it('往返序列化', () => {
    const raw = serializeProgress('dorm.palace', 1234);
    expect(parseProgress(raw)).toEqual({
      version: 1,
      chapter: 'ch01',
      checkpoint: 'dorm.palace',
      updatedAt: 1234,
    });
  });

  it('损坏/旧版本/未知检查点一律视为无进度', () => {
    expect(parseProgress(null)).toBeNull();
    expect(parseProgress('')).toBeNull();
    expect(parseProgress('{')).toBeNull();
    expect(parseProgress('{}')).toBeNull();
    expect(parseProgress(JSON.stringify({ version: 2, chapter: 'ch01', checkpoint: 'dorm.explore', updatedAt: 1 }))).toBeNull();
    expect(parseProgress(JSON.stringify({ version: 1, chapter: 'ch02', checkpoint: 'dorm.explore', updatedAt: 1 }))).toBeNull();
    expect(parseProgress(JSON.stringify({ version: 1, chapter: 'ch01', checkpoint: 'dorm.nowhere', updatedAt: 1 }))).toBeNull();
    expect(parseProgress(JSON.stringify({ version: 1, chapter: 'ch01', checkpoint: 'dorm.explore' }))).toBeNull();
  });
});

describe('进度检查点 · 读写', () => {
  it('预览模式绝不写盘', () => {
    const storage = memoryStorage();
    expect(saveProgress('dorm.explore', { preview: true, storage })).toBe(false);
    expect(storage.data[PROGRESS_KEY]).toBeUndefined();
    expect(loadProgress(storage)).toBeNull();
  });

  it('正常写入后可读回，清除后为 null', () => {
    const storage = memoryStorage();
    expect(saveProgress('dorm.after', { storage, now: 99 })).toBe(true);
    expect(loadProgress(storage)).toMatchObject({ checkpoint: 'dorm.after', updatedAt: 99 });
    clearProgress(storage);
    expect(loadProgress(storage)).toBeNull();
  });

  it('存储不可用时返回 false 而不是抛错', () => {
    expect(saveProgress('dorm.explore', { storage: null })).toBe(false);
    expect(loadProgress(null)).toBeNull();
  });
});

describe('继续游戏的目标映射', () => {
  it('覆盖所有检查点', () => {
    const expected: Record<CheckpointId, { module: string; resume?: string }> = {
      'dorm.explore': { module: 'ch01Dorm', resume: 'explore' },
      'dorm.palace': { module: 'ch01Palace' },
      'dorm.after': { module: 'ch01Dorm', resume: 'afterBattle' },
      'ch01.complete': { module: 'ch01Dorm', resume: 'complete' },
    };
    for (const checkpoint of CHECKPOINTS) {
      const destination = continueDestination(checkpoint);
      expect(destination.module).toBe(expected[checkpoint].module);
      expect(destination.data.resume).toBe(expected[checkpoint].resume);
    }
  });
});
