/**
 * 场景 key 的唯一真值。
 *
 * 这些字符串同时被 Phaser 场景构造器、模块表、舞台预览目录和 URL 后门使用。
 * 新增可玩场景时必须同时在这里、`stage-catalog.ts` 和 `main.ts` 登记；
 * `stage-catalog` 单测会检查「每个内容场景至少有一个舞台入口」。
 */
export const SCENE_KEYS = {
  boot: 'boot',
  loader: 'loader',
  title: 'title',
  prologue: 'prologue',
  placeholder: 'placeholder',
  ch01Dorm: 'ch01-dorm',
  battleCh01: 'battle-ch01',
  cgStage: 'cg-stage',
  battleSandbox: 'battle-sandbox',
} as const;

export type SceneKey = (typeof SCENE_KEYS)[keyof typeof SCENE_KEYS];

/** 不参与内容预览的基础设施场景。 */
export const INFRA_SCENE_KEYS: readonly SceneKey[] = [SCENE_KEYS.boot, SCENE_KEYS.loader];

/** 可以被舞台预览目录直接启动的场景宿主（一个宿主可以承载多个舞台条目）。 */
export const CONTENT_SCENE_KEYS: readonly SceneKey[] = [
  SCENE_KEYS.title,
  SCENE_KEYS.prologue,
  SCENE_KEYS.placeholder,
  SCENE_KEYS.ch01Dorm,
  SCENE_KEYS.battleCh01,
  SCENE_KEYS.cgStage,
  SCENE_KEYS.battleSandbox,
];

const CONTENT_SET = new Set<string>(CONTENT_SCENE_KEYS);

export function isContentSceneKey(value: string): value is SceneKey {
  return CONTENT_SET.has(value);
}
