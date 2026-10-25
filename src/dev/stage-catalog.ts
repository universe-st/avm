import { BUNDLES, collectAssets } from '../assets/bundles';
import type { AssetDef, BundleId } from '../assets/types';
import { SCENE_KEYS, isContentSceneKey } from '../app/scene-keys';
import { CH01_FIRST_BATTLE_ID } from '../battle/data/ch01-first';
import { CH01_ASSET_KEYS } from '../assets/keys';
import {
  isStageId,
  stageKindOf,
  type BattleStageDef,
  type CgFrame,
  type CgStageDef,
  type SceneStageDef,
  type StageDef,
  type StageKind,
  type StageStatus,
} from './stage-types';

const KIND_ORDER: Readonly<Record<StageKind, number>> = { scene: 0, cg: 1, battle: 2 };

const PROLOGUE_CG_FRAMES: readonly CgFrame[] = [
  {
    key: 'img.prologue.sky',
    caption: '夜空',
    holdMs: 2600,
  },
  {
    key: 'img.prologue.dream',
    caption: '梦的本源',
    holdMs: 2400,
  },
  {
    key: 'img.prologue.disaster',
    caption: '梦坠',
    holdMs: 2400,
  },
  {
    key: 'img.prologue.war',
    caption: '无声的战争',
    holdMs: 2400,
  },
  {
    key: 'img.prologue.school',
    caption: '群英高中',
    holdMs: 2400,
  },
];

/**
 * 舞台目录：所有可以「单独显示」的场景、CG、战斗都在这里登记。
 *
 * - 正常流程仍然走 `enterModule` / `BootScene`，这个目录不会改变游戏本身的流程。
 * - 预览启动器 `launchStage()` 只认这个目录；不在目录里的场景没有 URL 后门。
 * - `stage-catalog` 单测会校验：ID 唯一、bundle 存在、每个内容场景至少有一个入口。
 */
export const STAGE_CATALOG: readonly StageDef[] = [
  {
    id: 'scene.title',
    kind: 'scene',
    sceneKey: SCENE_KEYS.title,
    title: '标题界面',
    status: 'ready',
    requires: ['core', 'title'],
    description: '竖屏标题、设置弹窗、制作名单；不依赖任何存档。',
    tags: ['menu'],
  },
  {
    id: 'scene.prologue',
    kind: 'scene',
    sceneKey: SCENE_KEYS.prologue,
    title: '开幕剧情',
    status: 'ready',
    requires: ['core', 'cutscene.prologue'],
    description: '完整开幕：5 张配图、逐字文案、流星/白闪/震屏/日期卡。',
    tags: ['story'],
  },
  {
    id: 'scene.placeholder',
    kind: 'scene',
    sceneKey: SCENE_KEYS.placeholder,
    title: '序章占位页',
    status: 'ready',
    requires: ['ch.00'],
    description: '开幕结束后的落点，用来验证资源门禁与「返回标题」。',
    tags: ['placeholder'],
  },
  {
    id: 'scene.ch01.dorm',
    kind: 'scene',
    sceneKey: SCENE_KEYS.ch01Dorm,
    title: '第一章 · 第一节 寝室',
    status: 'ready',
    requires: ['core', 'ui', 'ch.01'],
    description:
      '寝室小地图：移动、碰撞、叫醒郑卿、找手机、小白登场。phase=opening|explore|after|complete，debug=1 显示碰撞。',
    tags: ['ch01', 'map'],
  },
  {
    id: CH01_FIRST_BATTLE_ID,
    kind: 'battle',
    sceneKey: SCENE_KEYS.battleCh01,
    title: '战斗 · 初次接触',
    status: 'ready',
    requires: ['core', 'battle.common', 'battle.ch01'],
    description:
      '第一章剧情战：1v1 矿工，主角伤害固定 1，最多 3 回合必败。phase=opening|mid|defeat。',
    tags: ['ch01', 'scripted'],
    options: [
      { name: 'seed', description: '确定性种子（默认 1）', example: '7' },
      { name: 'phase', description: 'opening / mid / defeat', example: 'defeat' },
    ],
  },
  {
    id: 'cg.prologue.sequence',
    kind: 'cg',
    title: '开幕 CG 连看',
    status: 'ready',
    requires: ['cutscene.prologue'],
    description: '5 张开幕配图按顺序手动翻页；用 frame 参数从任意一张开始。',
    tags: ['prologue'],
    frames: PROLOGUE_CG_FRAMES,
  },
  {
    id: 'cg.prologue.sky',
    kind: 'cg',
    title: 'CG · 深夜天幕',
    status: 'ready',
    requires: ['cutscene.prologue'],
    tags: ['prologue'],
    frames: [PROLOGUE_CG_FRAMES[0]!],
  },
  {
    id: 'cg.prologue.dream',
    kind: 'cg',
    title: 'CG · 梦的本源',
    status: 'ready',
    requires: ['cutscene.prologue'],
    tags: ['prologue'],
    frames: [PROLOGUE_CG_FRAMES[1]!],
  },
  {
    id: 'cg.prologue.disaster',
    kind: 'cg',
    title: 'CG · 梦坠',
    status: 'ready',
    requires: ['cutscene.prologue'],
    tags: ['prologue'],
    frames: [PROLOGUE_CG_FRAMES[2]!],
  },
  {
    id: 'cg.prologue.war',
    kind: 'cg',
    title: 'CG · 无声的战争',
    status: 'ready',
    requires: ['cutscene.prologue'],
    tags: ['prologue'],
    frames: [PROLOGUE_CG_FRAMES[3]!],
  },
  {
    id: 'cg.prologue.school',
    kind: 'cg',
    title: 'CG · 群英高中',
    status: 'ready',
    requires: ['cutscene.prologue'],
    tags: ['prologue'],
    frames: [PROLOGUE_CG_FRAMES[4]!],
  },
  {
    id: 'cg.ch01.phone',
    kind: 'cg',
    title: 'CG · 手机白光',
    status: 'ready',
    requires: ['ch.01'],
    tags: ['ch01', 'cg'],
    frames: [{ key: CH01_ASSET_KEYS.cg.phone, caption: '手机白光', holdMs: 2400 }],
  },
  {
    id: 'cg.ch01.xiaobai',
    kind: 'cg',
    title: 'CG · 小白登场',
    status: 'ready',
    requires: ['ch.01'],
    tags: ['ch01', 'cg'],
    frames: [{ key: CH01_ASSET_KEYS.cg.xiaobai, caption: '小白登场', holdMs: 2400 }],
  },
  {
    id: 'cg.ch01.wake',
    kind: 'cg',
    title: 'CG · 醒来',
    status: 'ready',
    requires: ['ch.01'],
    tags: ['ch01', 'cg'],
    frames: [{ key: CH01_ASSET_KEYS.cg.wake, caption: '醒来', holdMs: 2400 }],
  },
  {
    id: 'battle.sandbox',
    kind: 'battle',
    sceneKey: SCENE_KEYS.battleSandbox,
    title: '战斗舞台 · 契约沙盒',
    status: 'ready',
    requires: ['ui'],
    description:
      '不是战斗玩法：用来验证 seed、参数、返回标题和资源门禁。真实战斗接入后新增 battle.* 条目。',
    tags: ['sandbox', 'contract'],
    options: [
      { name: 'seed', description: '确定性随机种子（默认 1）', example: '7' },
      { name: 'enemies', description: '逗号分隔的敌人 id，最多 12 个', example: 'miner.mask,miner.core' },
      { name: 'turns', description: '沙盒展示的回合上限（1–99）', example: '10' },
    ],
  },
];

function buildStageIndex(stages: readonly StageDef[]): ReadonlyMap<string, StageDef> {
  const index = new Map<string, StageDef>();
  for (const stage of stages) {
    index.set(stage.id, stage);
    for (const alias of stage.aliases ?? []) index.set(alias, stage);
  }
  return index;
}

const STAGE_INDEX = buildStageIndex(STAGE_CATALOG);
const BUNDLE_IDS = new Set<string>(Object.keys(BUNDLES));

/** 按 id 或 alias 查舞台；大小写和首尾空格宽容，其余必须完全匹配。 */
export function findStage(stageId: string): StageDef | undefined {
  return STAGE_INDEX.get(stageId.trim().toLowerCase());
}

/** 供目录/HUD/控制台使用的稳定排序：场景 → CG → 战斗，同类按 id。 */
export function listStages(includePlanned = true): readonly StageDef[] {
  return [...STAGE_CATALOG]
    .filter((stage) => includePlanned || stage.status === 'ready')
    .sort((left, right) => {
      const byKind = KIND_ORDER[left.kind] - KIND_ORDER[right.kind];
      return byKind !== 0 ? byKind : left.id.localeCompare(right.id);
    });
}

export interface StageSummary {
  readonly id: string;
  readonly kind: StageKind;
  readonly title: string;
  readonly status: StageStatus;
  readonly requires: readonly BundleId[];
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly aliases?: readonly string[];
  readonly sceneKey?: string;
  readonly frameCount?: number;
}

export function toStageSummary(stage: StageDef): StageSummary {
  return {
    id: stage.id,
    kind: stage.kind,
    title: stage.title,
    status: stage.status,
    requires: stage.requires,
    ...(stage.description === undefined ? {} : { description: stage.description }),
    ...(stage.tags === undefined ? {} : { tags: stage.tags }),
    ...(stage.aliases === undefined ? {} : { aliases: stage.aliases }),
    ...(stage.kind === 'cg'
      ? { frameCount: stage.frames.length }
      : { sceneKey: stage.sceneKey }),
  };
}

/**
 * 结构校验：ID/别名唯一、类型前缀匹配、bundle 存在、场景 key 在白名单里、
 * CG 帧的纹理真的在 `requires` 的依赖闭包里。
 *
 * 返回空数组表示通过。启动器和单测都用它，避免目录悄悄腐烂。
 */
export function validateStageCatalog(stages: readonly StageDef[] = STAGE_CATALOG): string[] {
  const errors: string[] = [];
  const ids = new Map<string, string>();
  const aliases = new Map<string, string>();

  const addId = (value: string, owner: string, kind: StageKind): void => {
    if (!isStageId(value)) {
      errors.push(`[${owner}] id 不合法：${value}（必须形如 ${kind}.foo.bar）`);
      return;
    }
    if (stageKindOf(value) !== kind) {
      errors.push(`[${owner}] id 前缀与 kind 不一致：${value}（kind=${kind}）`);
    }
    const existing = ids.get(value);
    if (existing !== undefined) {
      errors.push(`[${owner}] id 重复：${value}（已属于 ${existing}）`);
      return;
    }
    const aliasOwner = aliases.get(value);
    if (aliasOwner !== undefined) {
      errors.push(`[${owner}] id 与已有 alias 冲突：${value}（alias 属于 ${aliasOwner}）`);
    }
    ids.set(value, owner);
  };

  for (const stage of stages) {
    addId(stage.id, stage.id, stage.kind);

    if (stage.title.trim().length === 0) errors.push(`[${stage.id}] title 不能为空`);
    if (stage.status !== 'ready' && stage.status !== 'planned') {
      errors.push(`[${stage.id}] status 不合法：${String(stage.status)}`);
    }

    for (const bundleId of stage.requires) {
      if (!BUNDLE_IDS.has(bundleId)) {
        errors.push(`[${stage.id}] 未知 bundle：${bundleId}`);
      }
    }

    const available = new Map<string, AssetDef>();
    const knownRequires = stage.requires.filter((id) => BUNDLE_IDS.has(id));
    for (const asset of collectAssets(knownRequires)) available.set(asset.key, asset);

    if (stage.kind === 'cg') {
      if (stage.frames.length === 0) {
        errors.push(`[${stage.id}] CG 至少需要一帧`);
      }
      for (const frame of stage.frames) {
        const asset = available.get(frame.key);
        if (!asset) {
          errors.push(`[${stage.id}] CG 纹理不在 requires 的资源闭包里：${frame.key}`);
        } else if (asset.kind !== 'image') {
          errors.push(`[${stage.id}] CG 纹理不是 image：${frame.key}（${asset.kind}）`);
        }
      }
    } else if (!isContentSceneKey(stage.sceneKey)) {
      errors.push(
        `[${stage.id}] sceneKey 未登记为内容场景：${stage.sceneKey}（见 src/app/scene-keys.ts）`,
      );
    }

    for (const alias of stage.aliases ?? []) {
      if (!isStageId(alias)) {
        errors.push(`[${stage.id}] alias 不合法：${alias}（必须形如 ${stage.kind}.foo.bar）`);
        continue;
      }
      if (stageKindOf(alias) !== stage.kind) {
        errors.push(`[${stage.id}] alias 前缀与 kind 不一致：${alias}（kind=${stage.kind}）`);
      }
      if (alias === stage.id) {
        errors.push(`[${stage.id}] alias 不能与 id 相同`);
        continue;
      }
      const idOwner = ids.get(alias);
      if (idOwner !== undefined) {
        errors.push(`[${stage.id}] alias 与已有 id 冲突：${alias}（id 属于 ${idOwner}）`);
        continue;
      }
      const aliasOwner = aliases.get(alias);
      if (aliasOwner !== undefined) {
        errors.push(`[${stage.id}] alias 重复：${alias}（已属于 ${aliasOwner}）`);
        continue;
      }
      aliases.set(alias, stage.id);
    }
  }

  return errors;
}

/** 供控制台展示：当前目录的简要统计。 */
export function stageCatalogStats(): { readonly total: number; readonly byKind: Record<StageKind, number> } {
  const byKind: Record<StageKind, number> = { scene: 0, cg: 0, battle: 0 };
  for (const stage of STAGE_CATALOG) byKind[stage.kind] += 1;
  return { total: STAGE_CATALOG.length, byKind };
}

export type { BattleStageDef, CgStageDef, SceneStageDef };
