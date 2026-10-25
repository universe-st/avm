import type { BundleId } from '../assets/types';

/** 舞台类别：普通场景、CG、战斗。 */
export type StageKind = 'scene' | 'cg' | 'battle';

/** ready = 已接入；planned = 目录里先占位，启动会明确拒绝。 */
export type StageStatus = 'ready' | 'planned';

/** 舞台被谁启动。写进上下文，方便场景区分正常流程与验收后门。 */
export type StageOrigin = 'url' | 'console' | 'hud' | 'code';

export const STAGE_KINDS: readonly StageKind[] = ['scene', 'cg', 'battle'];

export const STAGE_KIND_LABEL: Readonly<Record<StageKind, string>> = {
  scene: '场景',
  cg: 'CG',
  battle: '战斗',
};

/**
 * 舞台 ID 规则：`<kind>.<segment>[.<segment>...]`。
 * 允许小写字母、数字和连字符；不允许空格、中文、下划线和大小写混用。
 *
 * 例：`scene.prologue`、`cg.prologue.disaster`、`battle.ch01.crown-hall`。
 */
export const STAGE_ID_PATTERN =
  /^(scene|cg|battle)\.[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*$/;

export function isStageId(value: string): boolean {
  return STAGE_ID_PATTERN.test(value);
}

export function stageKindOf(stageId: string): StageKind | null {
  if (!isStageId(stageId)) return null;
  const kind = stageId.slice(0, stageId.indexOf('.'));
  return kind === 'scene' || kind === 'cg' || kind === 'battle' ? kind : null;
}

/** CG 的一帧。key 必须是 bundles.ts 里登记过的 image key。 */
export interface CgFrame {
  readonly key: string;
  readonly caption?: string;
  /** 自动连播时使用；当前手动查看器只把它展示给验收者。 */
  readonly holdMs?: number;
}

interface StageCommon {
  readonly id: string;
  readonly kind: StageKind;
  /** 给目录和加载页看的中文名。 */
  readonly title: string;
  readonly status: StageStatus;
  /** 进入舞台前必须就绪的 bundle；与正常流程使用同一个资源门禁。 */
  readonly requires: readonly BundleId[];
  readonly description?: string;
  readonly tags?: readonly string[];
  /** 改名时保留旧 ID，URL/控制台旧链接仍然可用。 */
  readonly aliases?: readonly string[];
}

export interface SceneStageDef extends StageCommon {
  readonly kind: 'scene';
  /** Phaser scene key；必须登记在 `src/app/scene-keys.ts`。 */
  readonly sceneKey: string;
}

export interface CgStageDef extends StageCommon {
  readonly kind: 'cg';
  /** 由通用 `CgStageScene` 全屏展示；至少一帧。 */
  readonly frames: readonly CgFrame[];
}

/**
 * 战斗舞台。
 *
 * 预览契约（接入真实战斗时必须满足）：
 * - 用 `init(data: StageLaunchContext)` 接收 seed/params；
 * - 同一 seed + params 得到同一开局（抽卡、敌人行动顺序、掉落）；
 * - 预览模式不写存档/进度；
 * - 能随时返回标题，不需要先打赢。
 */
export interface BattleStageDef extends StageCommon {
  readonly kind: 'battle';
  readonly sceneKey: string;
  /** 该战斗额外认识的 URL/控制台参数，仅用于文档与目录展示。 */
  readonly options?: readonly StageOptionDoc[];
}

export type StageDef = SceneStageDef | CgStageDef | BattleStageDef;

/** 给目录/HUD 展示的参数说明。 */
export interface StageOptionDoc {
  readonly name: string;
  readonly description: string;
  readonly example?: string;
}

/** 启动舞台时由调用方提供的可变部分；都会被固化进 `StageLaunchContext`。 */
export interface StageRunOptions {
  /** 确定性随机种子；缺省 1。 */
  readonly seed?: number;
  /** 跳过可跳过的演出/淡入；各舞台自己决定是否支持。 */
  readonly skip?: boolean;
  /** CG 从第几帧开始（0 起）；其他类型会原样传下去。 */
  readonly frame?: number;
  /** 舞台自定义参数（对应 URL 上除保留字之外的 query）。 */
  readonly params?: Readonly<Record<string, string>>;
  readonly origin?: StageOrigin;
}

/**
 * 注入给每个预览舞台的上下文。
 *
 * 场景实现 `init(data: StageLaunchContext)` 接收它；正常流程启动的场景不会收到这个对象，
 * 所以场景必须能在 `data` 为空时照常工作。
 */
export interface StageLaunchContext {
  readonly stageId: string;
  readonly kind: StageKind;
  /** 恒为 true；场景据此禁止写存档。 */
  readonly preview: true;
  readonly seed: number;
  readonly skip: boolean;
  readonly frame: number;
  readonly params: Readonly<Record<string, string>>;
  readonly origin: StageOrigin;
  readonly startedAt: number;
}

const TRUE_TOKENS = new Set(['1', 'true', 'yes', 'on']);
const FALSE_TOKENS = new Set(['0', 'false', 'no', 'off']);

export function parseBooleanToken(raw: string | null | undefined, fallback: boolean): boolean {
  if (raw === null || raw === undefined) return fallback;
  const token = raw.trim().toLowerCase();
  if (TRUE_TOKENS.has(token)) return true;
  if (FALSE_TOKENS.has(token)) return false;
  return fallback;
}

export function normalizeSeed(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 1;
  return Math.trunc(value) >>> 0;
}

export function createStageContext(
  stage: { readonly id: string; readonly kind: StageKind; readonly frames?: readonly CgFrame[] },
  options: StageRunOptions = {},
): StageLaunchContext {
  const maxFrame =
    stage.kind === 'cg' && stage.frames && stage.frames.length > 0 ? stage.frames.length - 1 : 0;
  const requestedFrame = options.frame ?? 0;
  const frame = Math.min(
    maxFrame,
    Math.max(0, Number.isFinite(requestedFrame) ? Math.trunc(requestedFrame) : 0),
  );

  return {
    stageId: stage.id,
    kind: stage.kind,
    preview: true,
    seed: normalizeSeed(options.seed),
    skip: options.skip === true,
    frame,
    params: { ...(options.params ?? {}) },
    origin: options.origin ?? 'code',
    startedAt: Date.now(),
  };
}

export function isStageLaunchContext(value: unknown): value is StageLaunchContext {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<StageLaunchContext>;
  return (
    candidate.preview === true &&
    typeof candidate.stageId === 'string' &&
    isStageId(candidate.stageId) &&
    (candidate.kind === 'scene' || candidate.kind === 'cg' || candidate.kind === 'battle') &&
    typeof candidate.seed === 'number' &&
    typeof candidate.skip === 'boolean' &&
    typeof candidate.frame === 'number' &&
    typeof candidate.origin === 'string' &&
    typeof candidate.params === 'object' &&
    candidate.params !== null
  );
}

/**
 * 场景侧读取上下文。正常情况下由启动器传入；直接 `scene.start('cg-stage')` 时
 * 用兜底舞台生成一份，保证手动调试不会白屏。
 */
export function readStageContext(data: unknown, fallback: Pick<StageDef, 'id' | 'kind'>): StageLaunchContext {
  if (isStageLaunchContext(data)) {
    return { ...data, stageId: fallback.id, kind: fallback.kind };
  }
  return createStageContext(fallback, { origin: 'code' });
}

export function stageParam(context: StageLaunchContext, key: string): string | undefined {
  const value = context.params[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function stageIntParam(
  context: StageLaunchContext,
  key: string,
  fallback: number,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
): number {
  const raw = stageParam(context, key);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function stageBoolParam(
  context: StageLaunchContext,
  key: string,
  fallback: boolean,
): boolean {
  return parseBooleanToken(stageParam(context, key), fallback);
}
