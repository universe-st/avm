import {
  SAVE_SLOT_IDS,
  parseSave,
  saveSlotMeta,
  serializeSave,
  type SaveDataV1,
  type SaveParseFailure,
  type SaveSlotId,
  type SaveSlotMeta,
} from './schema';

/**
 * 3 个存档位的本地存储层（localStorage）。
 *
 * 每条槽位一份 JSON（`avm.save.v1.slot1..3`），逐槽独立解析：
 * 一个槽坏掉不影响另外两个，空槽/损坏槽都能在 UI 里显示、也都可以被覆盖。
 *
 * 存储对象可注入（单测用内存实现）；`window.localStorage` 不可用（隐私模式/被禁用）时
 * 所有读返回空、写返回明确失败原因，调用方据此提示，不抛异常。
 */

export const SAVE_KEY_PREFIX = 'avm.save.v1.slot';

export function slotKey(slot: SaveSlotId): string {
  return `${SAVE_KEY_PREFIX}${slot}`;
}

/** 只读存储接口（`localStorage` 满足它，内存实现也满足）。 */
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type SaveSlotStatus =
  /** 没有这条 key。 */
  | 'empty'
  /** 可读。 */
  | 'ok'
  /** JSON/字段不合法（含串槽）。 */
  | 'corrupt'
  /** 版本不是本代码认识的版本。 */
  | 'unsupported-version';

export interface SaveSlotSummary {
  readonly slot: SaveSlotId;
  readonly status: SaveSlotStatus;
  /** 只有 `status === 'ok'` 时有值。 */
  readonly save: SaveDataV1 | null;
  /** 只有 ok 时有值。 */
  readonly meta: SaveSlotMeta | null;
  /** 解析失败原因（排查用；UI 只按 status 显示）。 */
  readonly failure?: SaveParseFailure;
}

export function defaultSaveStorage(): SaveStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function statusOf(failure: SaveParseFailure): SaveSlotStatus {
  if (failure === 'empty') return 'empty';
  if (failure === 'version') return 'unsupported-version';
  return 'corrupt';
}

/** 读一个槽位；任何异常都折算成 `corrupt`，绝不抛。 */
export function readSlot(slot: SaveSlotId, storage?: SaveStorage | null): SaveSlotSummary {
  const store = storage === undefined ? defaultSaveStorage() : storage;
  if (!store) return { slot, status: 'empty', save: null, meta: null };
  let raw: string | null = null;
  try {
    raw = store.getItem(slotKey(slot));
  } catch {
    return { slot, status: 'corrupt', save: null, meta: null, failure: 'shape' };
  }
  const parsed = parseSave(raw, slot);
  if (parsed.ok) {
    return { slot, status: 'ok', save: parsed.save, meta: saveSlotMeta(parsed.save) };
  }
  return {
    slot,
    status: statusOf(parsed.reason),
    save: null,
    meta: null,
    failure: parsed.reason,
  };
}

/** 读全部槽位（顺序固定 1→2→3，UI 不另排序）。 */
export function readAllSlots(storage?: SaveStorage | null): readonly SaveSlotSummary[] {
  const store = storage === undefined ? defaultSaveStorage() : storage;
  return SAVE_SLOT_IDS.map((slot) => readSlot(slot, store));
}

/** 至少有一个可读存档（标题「读取存档」按钮的启用条件）。 */
export function hasReadableSave(storage?: SaveStorage | null): boolean {
  return readAllSlots(storage).some((slot) => slot.status === 'ok');
}

export type SaveWriteFailure =
  /** 当前环境拿不到 localStorage。 */
  | 'unavailable'
  /** 配额写满（QuotaExceededError）。 */
  | 'quota'
  /** 其他写入异常（被策略拦截等）。 */
  | 'io'
  /** 数据本身序列化失败（理论上不会发生，兜底）。 */
  | 'serialize';

export type SaveWriteResult =
  | { readonly ok: true; readonly slot: SaveSlotId }
  | { readonly ok: false; readonly slot: SaveSlotId; readonly reason: SaveWriteFailure };

export const SAVE_WRITE_MESSAGES: Readonly<Record<SaveWriteFailure, string>> = {
  unavailable: '当前环境不能写本地存储（无痕模式或浏览器拦截）',
  quota: '本地存储空间不足，先删掉一些存档再试',
  io: '写入本地存储失败',
  serialize: '存档数据异常，写入失败',
};

function isQuotaError(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false;
  const candidate = error as { name?: unknown; code?: unknown };
  if (candidate.name === 'QuotaExceededError' || candidate.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return true;
  }
  // 旧 WebView：code 22（Chrome/Safari）/ 1014（Firefox）。
  return candidate.code === 22 || candidate.code === 1014;
}

export interface WriteSlotOptions {
  readonly storage?: SaveStorage | null;
}

/** 写一个槽位。损坏/旧的槽位直接覆盖（不需要先删）。 */
export function writeSlot(
  save: SaveDataV1,
  options: WriteSlotOptions = {},
): SaveWriteResult {
  const store = options.storage === undefined ? defaultSaveStorage() : options.storage;
  if (!store) return { ok: false, slot: save.slot, reason: 'unavailable' };
  let raw: string;
  try {
    raw = serializeSave(save);
  } catch {
    return { ok: false, slot: save.slot, reason: 'serialize' };
  }
  try {
    store.setItem(slotKey(save.slot), raw);
    return { ok: true, slot: save.slot };
  } catch (error) {
    return { ok: false, slot: save.slot, reason: isQuotaError(error) ? 'quota' : 'io' };
  }
}

/** 删一个槽位（UI 暂未提供入口；给测试与将来「删档」用）。 */
export function clearSlot(slot: SaveSlotId, storage?: SaveStorage | null): void {
  const store = storage === undefined ? defaultSaveStorage() : storage;
  if (!store) return;
  try {
    store.removeItem(slotKey(slot));
  } catch {
    // 忽略：本来就没有。
  }
}

/** 存档槽位的展示标题（中括号内是状态）。 */
export function slotLabel(summary: SaveSlotSummary): string {
  switch (summary.status) {
    case 'ok':
      return `第 ${summary.slot} 槽`;
    case 'unsupported-version':
      return `第 ${summary.slot} 槽 · 版本不兼容`;
    case 'corrupt':
      return `第 ${summary.slot} 槽 · 存档损坏`;
    default:
      return `第 ${summary.slot} 槽 · 空档位`;
  }
}
