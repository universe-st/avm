/**
 * 单章节进度检查点（不是完整存档）。
 *
 * 只记「玩家走到第一章哪一段」，用来点亮标题的「继续游戏」。
 * 不记录战斗内状态、道具、选项；战斗重进就从该段的开头开始。
 *
 * 设计约束：
 * - 预览模式（`StageLaunchContext.preview`）**一律不写盘**；
 * - 损坏/旧版本数据当作没有进度，不抛错；
 * - 存储读写与纯解析分离，解析函数可在 Node 里单测。
 */

export const PROGRESS_KEY = 'avm.progress.v1';

export const CHECKPOINTS = [
  'dorm.explore',
  'dorm.palace',
  'dorm.after',
  'ch01.complete',
] as const;

export type CheckpointId = (typeof CHECKPOINTS)[number];

export interface ProgressV1 {
  readonly version: 1;
  readonly chapter: 'ch01';
  readonly checkpoint: CheckpointId;
  readonly updatedAt: number;
}

/** 标题「继续游戏」下面那行小字。 */
export const CHECKPOINT_LABELS: Readonly<Record<CheckpointId, string>> = {
  'dorm.explore': '寝室 · 正在叫醒郑卿',
  'dorm.palace': '梦域 · 金殿',
  'dorm.after': '战后 · 小白的征召',
  'ch01.complete': '第一章 · 第一节 完',
};

function isCheckpoint(value: unknown): value is CheckpointId {
  return typeof value === 'string' && (CHECKPOINTS as readonly string[]).includes(value);
}

/** 解析存储字符串；任何异常/旧版本都返回 null。 */
export function parseProgress(raw: string | null): ProgressV1 | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  const value = parsed as Partial<ProgressV1>;
  if (value.version !== 1) return null;
  if (value.chapter !== 'ch01') return null;
  if (!isCheckpoint(value.checkpoint)) return null;
  if (typeof value.updatedAt !== 'number' || !Number.isFinite(value.updatedAt)) return null;
  return {
    version: 1,
    chapter: 'ch01',
    checkpoint: value.checkpoint,
    updatedAt: value.updatedAt,
  };
}

export function serializeProgress(checkpoint: CheckpointId, now = Date.now()): string {
  const value: ProgressV1 = {
    version: 1,
    chapter: 'ch01',
    checkpoint,
    updatedAt: Number.isFinite(now) ? Math.floor(now) : Date.now(),
  };
  return JSON.stringify(value);
}

export interface ContinueDestination {
  readonly module: 'ch01Dorm' | 'ch01Palace';
  readonly data: Record<string, unknown>;
}

/** 检查点 → 进入哪个模块、带什么恢复参数。纯函数，单测覆盖。 */
export function continueDestination(checkpoint: CheckpointId): ContinueDestination {
  switch (checkpoint) {
    case 'dorm.palace':
      return { module: 'ch01Palace', data: {} };
    case 'dorm.after':
      return { module: 'ch01Dorm', data: { resume: 'afterBattle' } };
    case 'ch01.complete':
      return { module: 'ch01Dorm', data: { resume: 'complete' } };
    default:
      return { module: 'ch01Dorm', data: { resume: 'explore' } };
  }
}

/** 存储实现可注入，便于单测；默认用 localStorage。 */
export interface ProgressStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): ProgressStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadProgress(storage?: ProgressStorage | null): ProgressV1 | null {
  const store = storage === undefined ? defaultStorage() : storage;
  if (!store) return null;
  try {
    return parseProgress(store.getItem(PROGRESS_KEY));
  } catch {
    return null;
  }
}

export interface SaveProgressOptions {
  /** 舞台预览：不写盘，返回 false。 */
  readonly preview?: boolean;
  readonly now?: number;
  readonly storage?: ProgressStorage | null;
}

/** 返回是否真的写入了（预览/存储不可用时 false）。 */
export function saveProgress(checkpoint: CheckpointId, options: SaveProgressOptions = {}): boolean {
  if (options.preview === true) return false;
  const store = options.storage === undefined ? defaultStorage() : options.storage;
  if (!store) return false;
  try {
    store.setItem(PROGRESS_KEY, serializeProgress(checkpoint, options.now));
    return true;
  } catch {
    return false;
  }
}

export function clearProgress(storage?: ProgressStorage | null): void {
  const store = storage === undefined ? defaultStorage() : storage;
  if (!store) return;
  try {
    store.removeItem(PROGRESS_KEY);
  } catch {
    // 忽略：没进度可清。
  }
}
