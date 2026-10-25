import type Phaser from 'phaser';
import {
  loadSceneResources,
  releaseSceneResourcesAfterCreate,
} from '../resource/scene-resources';
import { MODULES, type ModuleId } from './modules';

/** 防止双击/连续剧情事件在同一帧里发起两次跳转。 */
let transitioning = false;

/**
 * 场景门禁：先保证资源就绪并显示加载页，再切场景，最后回收旧场景的资源。
 *
 * 调用方必须传当前场景，用 `scene.start()` 让 Phaser 正确停掉旧场景；
 * 全局 `game.scene.start()` 不会停旧场景，容易留下重叠的 UIRoot。
 *
 * 资源生命周期：
 * 1. `loadSceneResources()` 加载目标 bundle 闭包（常驻包自动带上）；
 * 2. `from.scene.start()` 切场景；
 * 3. 目标场景 `create` 后释放不属于它的非常驻 bundle。
 *
 * `data` 会原样传给目标场景的 `init()`：地图 → 战斗、战斗 → 地图的剧情状态
 * 都走这里，不另开一套 `scene.start`。
 */
export async function enterModule(
  from: Phaser.Scene,
  id: ModuleId,
  data?: unknown,
): Promise<void> {
  if (transitioning) {
    console.warn(`[director] 场景切换进行中，忽略重复请求：${id}`);
    return;
  }
  transitioning = true;

  try {
    const module = MODULES[id];
    await loadSceneResources(module.requires, {
      label: module.gate.title,
      ...(module.gate.holdMs === undefined ? {} : { holdMs: module.gate.holdMs }),
    });

    const target = from.scene.manager.getScene(module.sceneKey);
    if (target) {
      releaseSceneResourcesAfterCreate(target, module.requires);
    } else {
      console.warn(`[director] 找不到目标场景：${module.sceneKey}，跳过资源回收`);
    }

    from.scene.start(module.sceneKey, data as object | undefined);
  } finally {
    transitioning = false;
  }
}
