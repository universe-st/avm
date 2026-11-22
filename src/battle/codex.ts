/**
 * 小白图鉴：跨战斗/跨会话记录「被玩家攻击过的敌人 id」。
 *
 * 纯逻辑，不 import Phaser；storage 可注入，便于单测。预览模式只更新内存、
 * 不写盘（见 `markEnemyKnown` 的 preview 选项）。
 */

export const CODEX_STORAGE_KEY = 'avm.battle.codex.v1';

export interface CodexStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** 解析存档：损坏/旧版本/非字符串数组一律返回空；去重。 */
export function parseCodex(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const ids = data.filter(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    );
    return [...new Set(ids)];
  } catch {
    return [];
  }
}

/** 序列化：去重 + 排序，输出稳定 JSON 数组。 */
export function serializeCodex(ids: readonly string[]): string {
  const unique = [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))];
  unique.sort();
  return JSON.stringify(unique);
}

function defaultStorage(): CodexStorage | null {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return null;
    return storage;
  } catch {
    return null;
  }
}

/** 读取已解锁敌人；没有 storage / 损坏时返回空集合。 */
export function loadKnownEnemies(storage?: CodexStorage | null): Set<string> {
  const target = storage === undefined ? defaultStorage() : storage;
  if (!target) return new Set();
  try {
    return new Set(parseCodex(target.getItem(CODEX_STORAGE_KEY)));
  } catch {
    return new Set();
  }
}

/**
 * 标记敌人已解锁，返回新的集合。
 *
 * - `preview: true` 只更新返回集合，不写 storage；
 * - storage 写入失败（隐私模式/配额）静默忽略，不阻断战斗。
 */
export function markEnemyKnown(
  id: string,
  options: { readonly preview?: boolean; readonly storage?: CodexStorage | null } = {},
): Set<string> {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const known = loadKnownEnemies(storage);
  known.add(id);
  if (!options.preview && storage) {
    try {
      storage.setItem(CODEX_STORAGE_KEY, serializeCodex([...known]));
    } catch {
      /* 存储不可用不阻断战斗 */
    }
  }
  return known;
}
