import type Phaser from 'phaser';
import { enterModule } from '../director';
import { MODULES } from '../modules';
import { saveLoadRoute } from './restore-plan';
import type { SaveDataV1 } from './schema';

/**
 * 读档的场景跳转胶水（唯一入口）。
 *
 * - 目标模块与当前场景不同：走 `enterModule()`（资源门禁 + 资源生命周期 + `from.scene.start()`）；
 * - 目标就是当前场景：`scene.restart(data)`，避免「从寝室点读档」先绕一圈加载页。
 *
 * 数据形状恒定是 `{ restore: SaveDataV1 }`：场景 `init()` 用
 * `readRestorePayload()` 认它，认不到就当作普通启动（不写存档也不会崩）。
 */
export async function restoreSaveFromScene(
  scene: Phaser.Scene,
  save: SaveDataV1,
): Promise<boolean> {
  const route = saveLoadRoute(save);
  if (!route) {
    console.warn(`[save] 存档模块不可读档：${String(save.module)}`);
    return false;
  }
  if (scene.scene.key === MODULES[route.module].sceneKey) {
    scene.scene.restart(route.data);
    return true;
  }
  await enterModule(scene, route.module, route.data);
  return true;
}
