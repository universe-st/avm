import type { BundleId } from '../assets/types';
import { SCENE_KEYS, type SceneKey } from './scene-keys';

/** 场景门禁同时服务普通场景与独立战斗场景。 */
export type ModuleKind = 'scene' | 'battle';

export type ModuleId = 'title' | 'prologue' | 'placeholder' | 'ch01Dorm' | 'battleCh01';

export interface GameModule {
  readonly id: ModuleId;
  readonly kind: ModuleKind;
  /** Phaser scene key。 */
  readonly sceneKey: SceneKey;
  /** 进入前必须就绪的 bundle（依赖闭包由 AssetService 展开）。 */
  readonly requires: readonly BundleId[];
  /**
   * 加载页文案。内容场景一律 `show: 'always'`（由 `loadSceneResources` 固定），
   * 这里不提供降级开关，避免又出现「有的场景不显示加载页」。
   */
  readonly gate: {
    readonly title: string;
    /** 加载页最短可见时长；省略用 AssetService 默认值。 */
    readonly holdMs?: number;
  };
}

export const MODULES: Record<ModuleId, GameModule> = {
  title: {
    id: 'title',
    kind: 'scene',
    sceneKey: SCENE_KEYS.title,
    requires: ['core', 'title'],
    gate: { title: '正在进入梦域' },
  },
  placeholder: {
    id: 'placeholder',
    kind: 'scene',
    sceneKey: SCENE_KEYS.placeholder,
    requires: ['ch.00'],
    gate: { title: '正在载入序章' },
  },
  prologue: {
    id: 'prologue',
    kind: 'scene',
    sceneKey: SCENE_KEYS.prologue,
    requires: ['core', 'cutscene.prologue'],
    gate: { title: '正在开启序章' },
  },
  ch01Dorm: {
    id: 'ch01Dorm',
    kind: 'scene',
    sceneKey: SCENE_KEYS.ch01Dorm,
    requires: ['core', 'ui', 'ch.01'],
    gate: { title: '正在进入第一章 · 寝室' },
  },
  battleCh01: {
    id: 'battleCh01',
    kind: 'battle',
    sceneKey: SCENE_KEYS.battleCh01,
    requires: ['core', 'battle.common', 'battle.ch01'],
    gate: { title: '正在进入梦域金殿' },
  },
};
