import { SCENE_KEYS, type SceneKey } from '../app/scene-keys';
import { CH01_ASSET_KEYS } from '../assets/keys';

/**
 * BGM 曲目表与「场景 → 曲子」映射（纯数据，不依赖 Phaser，便于单测）。
 *
 * 真正的播放/交叉淡化在 `bgm-manager.ts`；这里只回答「这个场景该放哪首」。
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
  ch01Dream: {
    key: CH01_ASSET_KEYS.audio.dreamBgm,
    label: '梦域金殿《清除协议》',
    fadeInMs: 900,
    fadeOutMs: 700,
  },
} as const satisfies Record<string, BgmTrack>;

export type BgmId = keyof typeof BGM_TRACKS;

/**
 * 场景 → BGM。
 *
 * 只登记「需要换曲」的场景：`undefined` 表示沿用当前曲目，`null` 表示淡出到静音。
 * CG 预览与战斗沙盒故意不登记，从标题进预览时不会被打断。
 */
export const BGM_BY_SCENE: Partial<Record<SceneKey, BgmId | null>> = {
  [SCENE_KEYS.title]: 'title',
  [SCENE_KEYS.prologue]: 'prologue',
  [SCENE_KEYS.placeholder]: null,
  // 开场先停音乐，等寝室进入探索后由场景手动 `bgmManager.play('ch01Dorm')`。
  [SCENE_KEYS.ch01Dorm]: null,
  [SCENE_KEYS.battleCh01]: 'ch01Dream',
};

/** 解析某个场景该放哪首；`undefined` = 没有登记，保持当前曲目。 */
export function bgmForScene(sceneKey: string): BgmId | null | undefined {
  return BGM_BY_SCENE[sceneKey as SceneKey];
}

/** 目标音量：静音时为 0，否则是设置里的音乐音量（钳制 0–1）。 */
export function bgmVolume(muted: boolean, bgm: number): number {
  const value = Number.isFinite(bgm) ? Math.min(1, Math.max(0, bgm)) : 0;
  return muted ? 0 : value;
}
