import { describe, expect, it } from 'vitest';
import {
  CODEX_STORAGE_KEY,
  loadKnownEnemies,
  markEnemyKnown,
  parseCodex,
  serializeCodex,
  type CodexStorage,
} from '../src/battle/codex';

class FakeStorage implements CodexStorage {
  private readonly data = new Map<string, string>();
  writes = 0;

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.writes += 1;
    this.data.set(key, value);
  }

  raw(key = CODEX_STORAGE_KEY): string | null {
    return this.data.get(key) ?? null;
  }
}

describe('battle codex', () => {
  it('parses only string arrays, dedupes, and rejects broken/old formats', () => {
    expect(parseCodex(null)).toEqual([]);
    expect(parseCodex('')).toEqual([]);
    expect(parseCodex('{')).toEqual([]);
    expect(parseCodex('{"version":0,"known":["a"]}')).toEqual([]);
    expect(parseCodex('[1,"a",null,"a","b"]')).toEqual(['a', 'b']);
    expect(parseCodex('"a"')).toEqual([]);
  });

  it('serializes deterministically and drops invalid ids', () => {
    expect(serializeCodex(['b', 'a', 'a', '', 'c'])).toBe('["a","b","c"]');
    expect(parseCodex(serializeCodex(['cook-a', 'cook-b']))).toEqual(['cook-a', 'cook-b']);
  });

  it('loads from the v1 key and returns empty for corrupt storage', () => {
    const storage = new FakeStorage();
    storage.setItem(CODEX_STORAGE_KEY, '["cook-phantom-a"]');
    expect([...loadKnownEnemies(storage)]).toEqual(['cook-phantom-a']);

    const broken = new FakeStorage();
    broken.setItem(CODEX_STORAGE_KEY, 'not-json');
    expect(loadKnownEnemies(broken).size).toBe(0);
  });

  it('marks an enemy known and persists it across loads', () => {
    const storage = new FakeStorage();
    const known = markEnemyKnown('cook-phantom-b', { storage });
    expect([...known]).toEqual(['cook-phantom-b']);
    expect(storage.writes).toBe(1);
    expect([...loadKnownEnemies(storage)]).toEqual(['cook-phantom-b']);

    const second = markEnemyKnown('cook-phantom-a', { storage });
    expect([...second].sort()).toEqual(['cook-phantom-a', 'cook-phantom-b']);
    expect([...loadKnownEnemies(storage)].sort()).toEqual([
      'cook-phantom-a',
      'cook-phantom-b',
    ]);
  });

  it('preview marks only memory and never writes storage', () => {
    const storage = new FakeStorage();
    const known = markEnemyKnown('miner.clear-unit', { preview: true, storage });
    expect([...known]).toEqual(['miner.clear-unit']);
    expect(storage.writes).toBe(0);
    expect(storage.raw()).toBeNull();
    expect(loadKnownEnemies(storage).size).toBe(0);
  });

  it('does not throw when storage is unavailable', () => {
    expect(loadKnownEnemies(null).size).toBe(0);
    expect([...markEnemyKnown('x', { storage: null })]).toEqual(['x']);
  });
});
