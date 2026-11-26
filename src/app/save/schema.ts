import { BGM_TRACKS, type BgmId } from '../../audio/bgm-tracks';
import type { Facing } from '../../map/types';
import { CHECKPOINTS, type CheckpointId } from '../progress';

/**
 * 正式存档的格式真值（纯数据 + 纯解析，不依赖 Phaser，可在 Node 里单测）。
 *
 * 设计要点：
 * - 每槽一份独立 JSON，key 带版本号（`avm.save.v1.slotN`）——以后换格式可以并存，不用迁移；
 * - **未知版本一律当作不可读**（不猜、不迁移）：宁可显示「版本不兼容」，也不要拿旧字段拼出一份错状态；
 * - 解析只认白名单字段：未知字段直接丢掉（向前兼容旧字段被删的情况），不放行任意对象；
 * - 损坏/缺字段/越界都返回结构化的失败原因，UI 按原因显示「空 / 损坏 / 版本不兼容」。
 *
 * 逐字段含义与「为什么存、怎么恢复」见 `docs/SAVE-SYSTEM.md` §4。
 */

export const SAVE_VERSION = 1;

/** 3 个存档位。改这个数组要同步改 `slotKey()` 的文档与 UI 文案。 */
export const SAVE_SLOT_IDS = [1, 2, 3] as const;
export type SaveSlotId = (typeof SAVE_SLOT_IDS)[number];

/**
 * 允许写存档的模块。
 *
 * 金殿（纯演出）与剧情战（回合制）不在这张表里：它们的状态不是「自由活动」，
 * 读一半的战斗/过场既没法存也没法恢复（见 `docs/SAVE-SYSTEM.md` §3）。
 */
export const SAVE_MODULES = ['ch01Dorm', 'ch01Kitchen'] as const;
export type SaveModule = (typeof SAVE_MODULES)[number];

export const SAVE_CHAPTER = 'ch01';

/** 八向朝向（与 `map/types.ts` 的 `Facing` 同源）。 */
export const SAVE_FACINGS = [
  'up',
  'upRight',
  'right',
  'downRight',
  'down',
  'downLeft',
  'left',
  'upLeft',
] as const satisfies readonly Facing[];

/** 预留的通用状态桶（M1a 没有道具，先写 `{}`）。 */
export type SaveFlagValue = string | number | boolean;
export type SaveFlags = Readonly<Record<string, SaveFlagValue>>;

export interface SavePlayerV1 {
  /**
   * **房间局部**设计像素坐标（房间左上角为原点），不是世界坐标。
   *
   * 设计高度随设备比例变化（`app/viewport.ts`），房间在屏幕上的 `origin.y` 会跟着变；
   * 存世界坐标会在换视口/换设备后整体偏移，存房间局部坐标才与视口无关。
   */
  readonly x: number;
  readonly y: number;
  readonly facing: Facing;
}

export interface SaveDormV1 {
  readonly talkedZheng: boolean;
  readonly phoneFound: boolean;
}

export interface SaveDataV1 {
  readonly version: typeof SAVE_VERSION;
  /** 写入时刻（毫秒时间戳）。 */
  readonly savedAt: number;
  readonly slot: SaveSlotId;
  readonly chapter: typeof SAVE_CHAPTER;
  readonly module: SaveModule;
  /** 写盘那一刻的检查点（`app/progress.ts`），用于与「继续游戏」对齐。 */
  readonly checkpoint: CheckpointId;
  /** UI 展示用：`寝室` / `御膳房`。 */
  readonly sceneLabel: string;
  /** UI 展示用：`第一章 · 第一节`。 */
  readonly chapterLabel: string;
  /** 写盘那一刻的目标文案（HUD 左上角显示的就是它）。 */
  readonly objective: string;
  /** 写盘那一刻的 BGM 曲目 id；静场/没播时为 null。状态型 cue 的恢复靠它。 */
  readonly bgmId: BgmId | null;
  readonly player: SavePlayerV1;
  readonly dorm: SaveDormV1;
  readonly flags: SaveFlags;
}

// ------------------------------------------------------------------ 展示常量

export interface SaveSceneInfo {
  readonly sceneLabel: string;
  readonly chapterLabel: string;
  readonly checkpoint: CheckpointId;
}

/**
 * 模块 → 展示文案与检查点。
 *
 * `checkpoint` 是「继续游戏」该落在哪一段：存档只发生在自由探索，所以就是该段的 explore 检查点。
 */
export const SAVE_SCENES: Readonly<Record<SaveModule, SaveSceneInfo>> = {
  ch01Dorm: {
    sceneLabel: '寝室',
    chapterLabel: '第一章 · 第一节',
    checkpoint: 'dorm.explore',
  },
  ch01Kitchen: {
    sceneLabel: '御膳房',
    chapterLabel: '第一章 · 第二节',
    checkpoint: 'kitchen.explore',
  },
};

// ------------------------------------------------------------------ 解析结果

export type SaveParseFailure =
  /** 没有这条 key。 */
  | 'empty'
  /** JSON 解析失败。 */
  | 'json'
  /** 结构/字段类型/取值不合法。 */
  | 'shape'
  /** version 不是本代码认识的版本。 */
  | 'version'
  /** `slot` 与存储位置不一致（被手工搬过槽/串档）。 */
  | 'slot';

export type SaveParseResult =
  | { readonly ok: true; readonly save: SaveDataV1 }
  | { readonly ok: false; readonly reason: SaveParseFailure };

const FAIL = (reason: SaveParseFailure): SaveParseResult => ({ ok: false, reason });

const FACING_SET = new Set<string>(SAVE_FACINGS);
const MODULE_SET = new Set<string>(SAVE_MODULES);
const CHECKPOINT_SET = new Set<string>(CHECKPOINTS);
const BGM_SET = new Set<string>(Object.keys(BGM_TRACKS));
const SLOT_SET = new Set<number>(SAVE_SLOT_IDS);

/** 文案字段的硬上限：存档是玩家数据，不要因为一句异常长的目标就撑爆配额。 */
const MAX_TEXT = 200;
const MAX_FLAGS = 64;
const MAX_FLAG_KEY = 40;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function text(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > MAX_TEXT ? trimmed.slice(0, MAX_TEXT) : trimmed;
}

function facingOf(value: unknown): Facing | null {
  return typeof value === 'string' && FACING_SET.has(value) ? (value as Facing) : null;
}

function sanitizeFlags(value: unknown): SaveFlags {
  if (!isRecord(value)) return {};
  const flags: Record<string, SaveFlagValue> = {};
  let count = 0;
  for (const [key, raw] of Object.entries(value)) {
    if (count >= MAX_FLAGS) break;
    if (key.length === 0 || key.length > MAX_FLAG_KEY) continue;
    if (typeof raw === 'string') flags[key] = raw.slice(0, MAX_TEXT);
    else if (typeof raw === 'number' && Number.isFinite(raw)) flags[key] = raw;
    else if (typeof raw === 'boolean') flags[key] = raw;
    // 其余类型（对象/数组/null）一律丢弃：预留桶不允许塞任意结构。
    else continue;
    count += 1;
  }
  return flags;
}

/**
 * 解析一个已经 `JSON.parse` 过的值。
 *
 * `expectedSlot` 由存储层传入：槽位号必须与文件名（key）一致，否则视为串档/损坏。
 */
export function parseSaveValue(value: unknown, expectedSlot?: SaveSlotId): SaveParseResult {
  if (!isRecord(value)) return FAIL('shape');
  // 版本比结构先判：**未知版本绝不做字段级降级**，否则 v2 的字段会被当成 v1 读歪。
  // 「根本没有 version」属于形状不对（手工写坏/别的东西），只有「数值版本的未来档」才叫不兼容。
  if (typeof value.version !== 'number') return FAIL('shape');
  if (value.version !== SAVE_VERSION) return FAIL('version');

  const slot = value.slot;
  if (typeof slot !== 'number' || !SLOT_SET.has(slot)) return FAIL('shape');
  if (expectedSlot !== undefined && slot !== expectedSlot) return FAIL('slot');

  if (value.chapter !== SAVE_CHAPTER) return FAIL('shape');
  if (typeof value.module !== 'string' || !MODULE_SET.has(value.module)) return FAIL('shape');
  if (typeof value.checkpoint !== 'string' || !CHECKPOINT_SET.has(value.checkpoint)) {
    return FAIL('shape');
  }

  const savedAt = finiteNumber(value.savedAt);
  if (savedAt === null || savedAt < 0) return FAIL('shape');

  const objective = text(value.objective);
  if (objective.length === 0) return FAIL('shape');

  const sceneLabel = text(value.sceneLabel);
  const chapterLabel = text(value.chapterLabel);
  if (sceneLabel.length === 0 || chapterLabel.length === 0) return FAIL('shape');

  const bgmRaw = value.bgmId;
  let bgmId: BgmId | null = null;
  if (bgmRaw === null || bgmRaw === undefined) bgmId = null;
  else if (typeof bgmRaw === 'string' && BGM_SET.has(bgmRaw)) bgmId = bgmRaw as BgmId;
  else return FAIL('shape');

  if (!isRecord(value.player)) return FAIL('shape');
  const x = finiteNumber(value.player.x);
  const y = finiteNumber(value.player.y);
  const facing = facingOf(value.player.facing);
  if (x === null || y === null || facing === null) return FAIL('shape');

  if (!isRecord(value.dorm)) return FAIL('shape');
  if (typeof value.dorm.talkedZheng !== 'boolean') return FAIL('shape');
  if (typeof value.dorm.phoneFound !== 'boolean') return FAIL('shape');

  return {
    ok: true,
    save: {
      version: SAVE_VERSION,
      savedAt: Math.floor(savedAt),
      slot: slot as SaveSlotId,
      chapter: SAVE_CHAPTER,
      module: value.module as SaveModule,
      checkpoint: value.checkpoint as CheckpointId,
      sceneLabel,
      chapterLabel,
      objective,
      bgmId,
      player: { x, y, facing },
      dorm: {
        talkedZheng: value.dorm.talkedZheng,
        phoneFound: value.dorm.phoneFound,
      },
      flags: sanitizeFlags(value.flags),
    },
  };
}

/** 解析存储里的原始字符串。 */
export function parseSave(raw: string | null, expectedSlot?: SaveSlotId): SaveParseResult {
  if (raw === null || raw.trim().length === 0) return FAIL('empty');
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return FAIL('json');
  }
  return parseSaveValue(value, expectedSlot);
}

/**
 * 序列化。字段顺序固定（diff/人工排查时稳定），数值先取整再落盘。
 *
 * 序列化**不做校验**：调用方拿到的 `SaveDataV1` 已经是构造期校验过的结构；
 * 想验证往返就用 `parseSave(serializeSave(x))`。
 */
export function serializeSave(save: SaveDataV1): string {
  const payload: SaveDataV1 = {
    version: SAVE_VERSION,
    savedAt: Math.floor(save.savedAt),
    slot: save.slot,
    chapter: SAVE_CHAPTER,
    module: save.module,
    checkpoint: save.checkpoint,
    sceneLabel: text(save.sceneLabel),
    chapterLabel: text(save.chapterLabel),
    objective: text(save.objective),
    bgmId: save.bgmId,
    player: {
      x: Math.round(save.player.x * 100) / 100,
      y: Math.round(save.player.y * 100) / 100,
      facing: save.player.facing,
    },
    dorm: {
      talkedZheng: save.dorm.talkedZheng === true,
      phoneFound: save.dorm.phoneFound === true,
    },
    flags: sanitizeFlags(save.flags),
  };
  return JSON.stringify(payload);
}

// ------------------------------------------------------------------ 元信息

export interface SaveSlotMeta {
  readonly slot: SaveSlotId;
  readonly savedAt: number;
  /** `2026-11-17 18:20`（本地时区，固定格式，不依赖 ICU）。 */
  readonly timeLabel: string;
  readonly chapterLabel: string;
  readonly sceneLabel: string;
  /** 目标摘要（单行展示，超长截断）。 */
  readonly objective: string;
}

const pad2 = (value: number): string => String(value).padStart(2, '0');

/**
 * 固定格式的时间标签。
 *
 * 不用 `toLocaleString()`：不同 WebView 的 ICU 数据不一样，同一份存档在两台机器上会显示成
 * 两种格式，截图验收也没法对比。这里只用 Date 的本地取值函数。
 */
export function formatSavedAt(timestamp: number, date = new Date(timestamp)): string {
  if (!Number.isFinite(timestamp)) return '时间未知';
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hour = pad2(date.getHours());
  const minute = pad2(date.getMinutes());
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

/** 列表里那行元信息：时间、章节、场景名、目标摘要。 */
export function saveSlotMeta(save: SaveDataV1): SaveSlotMeta {
  return {
    slot: save.slot,
    savedAt: save.savedAt,
    timeLabel: formatSavedAt(save.savedAt),
    chapterLabel: save.chapterLabel,
    sceneLabel: save.sceneLabel,
    objective: save.objective,
  };
}

/** 只有本代码认识的模块才允许读档（旧档里出现未知模块 → 不可读）。 */
export function isSaveModule(value: unknown): value is SaveModule {
  return typeof value === 'string' && MODULE_SET.has(value);
}

export interface CreateSaveInput {
  readonly slot: SaveSlotId;
  readonly module: SaveModule;
  /** 写盘那一刻 HUD 上的目标文案。 */
  readonly objective: string;
  readonly bgmId: BgmId | null;
  /** **房间局部**坐标（见 `SavePlayerV1`）。 */
  readonly player: SavePlayerV1;
  readonly dorm: SaveDormV1;
  /**
   * 写盘时的检查点覆盖（默认取 `SAVE_SCENES`）。
   *
   * 寝室准备阶段（`prep`）写的是 `dorm.after`：这一段属于「战后征召」，
   * 标题「继续游戏」应该回到战后，而不是回到寝室开头重新叫醒郑卿。
   */
  readonly checkpoint?: CheckpointId;
  /** 预留通用桶；M1a 传 `{}`。 */
  readonly flags?: SaveFlags;
  readonly now?: number;
}

/**
 * 把场景此刻的变量拼成一份完整存档。
 *
 * 章节名/场景名/检查点从 `SAVE_SCENES` 表里取，场景侧只提供「这一刻的状态」，
 * 避免两个场景各写一遍标签、将来改章节名时漏一个。
 */
export function createSaveData(input: CreateSaveInput): SaveDataV1 {
  const scene = SAVE_SCENES[input.module];
  const now = input.now ?? Date.now();
  return {
    version: SAVE_VERSION,
    savedAt: Number.isFinite(now) ? Math.floor(now) : Date.now(),
    slot: input.slot,
    chapter: SAVE_CHAPTER,
    module: input.module,
    checkpoint: input.checkpoint ?? scene.checkpoint,
    sceneLabel: scene.sceneLabel,
    chapterLabel: scene.chapterLabel,
    objective: text(input.objective, scene.sceneLabel),
    bgmId: input.bgmId,
    player: {
      x: Math.round(input.player.x * 100) / 100,
      y: Math.round(input.player.y * 100) / 100,
      facing: input.player.facing,
    },
    dorm: {
      talkedZheng: input.dorm.talkedZheng === true,
      phoneFound: input.dorm.phoneFound === true,
    },
    flags: sanitizeFlags(input.flags ?? {}),
  };
}

/** 场景 init 收 `{ restore: SaveDataV1 }` 时的守卫；对象本身也要过一遍字段校验。 */
export function readRestorePayload(data: unknown): SaveDataV1 | null {
  if (!isRecord(data)) return null;
  const value = data.restore;
  if (!isRecord(value)) return null;
  const parsed = parseSaveValue(value);
  return parsed.ok ? parsed.save : null;
}
