import {
  CONTENT_SCENE_KEYS,
  SCENE_KEYS,
  type ContentSceneKey,
} from '../app/scene-keys';
import { CH01_ASSET_KEYS } from '../assets/keys';

/**
 * BGM 曲目表与「场景 → 曲子」绑定（纯数据，不依赖 Phaser，便于单测）。
 *
 * 真正的播放/交叉淡化在 `bgm-manager.ts`，入场重播/场景内续播判定在 `bgm-plan.ts`；这里只回答
 * 「这个场景该放哪首」，并且**强制每个内容场景显式表态**（见 `SCENE_BGM`）。
 */
export interface BgmTrack {
  /** Phaser audio cache key，必须出现在 `bundles.ts` 的某个 bundle 里。 */
  readonly key: string;
  readonly label: string;
  readonly fadeInMs: number;
  readonly fadeOutMs: number;
}

export const BGM_TRACKS = {
  title: {
    key: 'audio.bgm.title',
    label: '标题曲《潜入》',
    fadeInMs: 1200,
    fadeOutMs: 700,
  },
  prologue: {
    key: 'audio.bgm.prologue',
    label: '开幕《星夜梦境》',
    fadeInMs: 1800,
    fadeOutMs: 900,
  },
  ch01Dorm: {
    key: CH01_ASSET_KEYS.audio.dormBgm,
    label: '校园日常《午后小憩》',
    fadeInMs: 1600,
    fadeOutMs: 900,
  },
  ch01Crisis: {
    key: CH01_ASSET_KEYS.audio.crisisBgm,
    label: '回忆《危机来临》',
    fadeInMs: 700,
    fadeOutMs: 1100,
  },
  ch01Dream: {
    key: CH01_ASSET_KEYS.audio.dreamBgm,
    label: '梦域金殿《清除协议》',
    fadeInMs: 900,
    fadeOutMs: 700,
  },
  /**
   * 金殿过场的「开场牌面」：诙谐宫廷古风。
   *
   * 这一段是荒诞戏（梦里的小皇帝、楚公公喊护驾、两个太监像打手），配乐要先把
   * 「庄严的早朝」摆出来、再让它滑稽。裂皮变矿工那一下用 `play(id, { hard: true })`
   * 硬切回《清除协议》——喜剧 BGM 拖到恐怖揭示里会把吓点抹平。
   */
  ch01Palace: {
    key: CH01_ASSET_KEYS.audio.palaceBgm,
    label: '金殿过场《小皇帝的早朝》',
    fadeInMs: 700,
    fadeOutMs: 500,
  },
  /**
   * 第一章战斗曲《刺王杀驾》。
   *
   * 金殿剧情战与御膳房遭遇战共用：节奏轻快激动的中国古风战斗曲。
   * **每个战斗场景进入时都从 0 开始**（enterScene 会重建实例），两场之间不续播；
   * **开场卡期间不提前起播**：battle 场景 create 时不 enterScene，intro 关闭/跳过开场后才从 0 起播。
   * 金殿过场在裂皮那一刻用《清除协议》铺恐怖，进战斗切到本曲并从 0 起播。
   */
  ch01Battle: {
    key: 'audio.bgm.ch01_battle',
    label: '第一章战斗《刺王杀驾》',
    fadeInMs: 900,
    fadeOutMs: 700,
  },
} as const satisfies Record<string, BgmTrack>;

export type BgmId = keyof typeof BGM_TRACKS;

/**
 * 场景音乐绑定的三态。
 *
 * - `track`：这个场景有自己的曲子，跨场景切过去；
 * - `silence`：这个场景明确静音，当前曲目淡出；
 * - `hold`：显式沿用进入这个场景前的曲目，不打断（CG 预览、战斗沙盒）。
 *
 * 三态都必须写出来：**没有**「没登记 = 沿用」这种默认值。
 */
export type SceneBinding =
  | { readonly kind: 'track'; readonly id: BgmId }
  | { readonly kind: 'silence' }
  | { readonly kind: 'hold' };

/** 写绑定表用的小工具，省掉 `{ kind: 'track', id: '…' }` 的重复。 */
export function sceneTrack(id: BgmId): SceneBinding {
  return { kind: 'track', id };
}

/** 明确静音的场景（当前曲目淡出）。 */
export const SCENE_SILENT: SceneBinding = { kind: 'silence' };

/** 明确沿用当前曲目的场景（不打断）。 */
export const SCENE_HOLD: SceneBinding = { kind: 'hold' };

/**
 * 场景 → 音乐绑定表。
 *
 * 类型是 `Record<ContentSceneKey, …>`：往 `CONTENT_SCENE_KEYS` 里加场景却忘了登记，
 * typecheck 会直接报错；`test/bgm.test.ts` 再兜一层运行时检查（红色门禁）。
 *
 * 改绑优先级：运行时 override（`BgmManager.bindScene`）> 这张表 > 无（非内容场景）。
 */
export const SCENE_BGM: Readonly<Record<ContentSceneKey, SceneBinding>> = {
  [SCENE_KEYS.title]: sceneTrack('title'),
  [SCENE_KEYS.prologue]: sceneTrack('prologue'),
  // 占位页只是资源门禁用，明确静音收尾。
  [SCENE_KEYS.placeholder]: SCENE_SILENT,
  // 开场 CG 自带环境声，且可能在标题页单点预览：沿用当前曲目（正常流程里是开幕曲的尾巴），
  // 不硬切成静音。以后若要给 CG 单独配曲，只改这一行。
  [SCENE_KEYS.ch01Opening]: SCENE_HOLD,
  // 寝室默认放校园日常；开头「睡觉戏」由场景显式传 `SCENE_SILENT` 作入口 cue（只有呼噜声）。
  [SCENE_KEYS.ch01Dorm]: sceneTrack('ch01Dorm'),
  // 御膳房是潜入戏：复用《危机来临》的冷脉冲/心跳底子，进战斗切《刺王杀驾》并从 0 起播。
  [SCENE_KEYS.ch01Kitchen]: sceneTrack('ch01Crisis'),
  // 金殿过场前半段是荒诞早朝，配诙谐宫廷古风；太监裂皮翻脸那一刻由剧本 cue 硬切
  // 到《清除协议》，随后进战斗切《刺王杀驾》并从 0 起播。
  [SCENE_KEYS.ch01Palace]: sceneTrack('ch01Palace'),
  [SCENE_KEYS.battleCh01]: sceneTrack('ch01Battle'),
  // CG 预览 / 战斗沙盒是调试入口，从标题点进去时不打断标题曲。
  [SCENE_KEYS.cgStage]: SCENE_HOLD,
  [SCENE_KEYS.battleSandbox]: SCENE_HOLD,
};

/** 运行时改绑表：只存被显式改过的场景，删掉 key 就回落到 `SCENE_BGM`。 */
export type SceneBindingOverrides = Partial<Record<ContentSceneKey, SceneBinding>>;

/**
 * 解析某个场景该用什么音乐。
 *
 * `undefined` 只可能出现在内容场景之外（boot/loader/未知 key）；管理器把它当作
 * 「保持当前曲目」，但内容场景永远走不到这个分支。
 */
export function resolveSceneTrack(
  sceneKey: string,
  overrides?: SceneBindingOverrides | null,
): SceneBinding | undefined {
  const key = sceneKey as ContentSceneKey;
  const override = overrides?.[key];
  if (override !== undefined) return override;
  return SCENE_BGM[key];
}

/**
 * 生成一份新的改绑表（不修改入参）。
 *
 * `binding === null` 表示撤销改绑、回落到 `SCENE_BGM` 里的默认值。
 */
export function withSceneBinding(
  overrides: SceneBindingOverrides,
  sceneKey: ContentSceneKey,
  binding: SceneBinding | null,
): SceneBindingOverrides {
  const next: SceneBindingOverrides = { ...overrides };
  if (binding === null) delete next[sceneKey];
  else next[sceneKey] = binding;
  return next;
}

/** 绑定里代表的曲目 id；`silence`/`hold`/未登记都返回 null。 */
export function bindingTrackId(binding: SceneBinding | undefined): BgmId | null {
  return binding?.kind === 'track' ? binding.id : null;
}

/** 所有内容场景都必须有显式绑定；供单测断言「表里没有漏」。 */
export function missingSceneBindings(): readonly string[] {
  const table: Readonly<Record<string, SceneBinding | undefined>> = SCENE_BGM;
  return CONTENT_SCENE_KEYS.filter((key) => table[key] === undefined);
}

/** 目标音量：静音时为 0，否则是设置里的音乐音量（钳制 0–1）。 */
export function bgmVolume(muted: boolean, bgm: number): number {
  const value = Number.isFinite(bgm) ? Math.min(1, Math.max(0, bgm)) : 0;
  return muted ? 0 : value;
}
