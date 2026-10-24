import type Phaser from 'phaser';
import { assetService } from '../resource/asset-service';
import { MODULES, type ModuleId } from './modules';

/**
 * 场景门禁：先保证资源就绪，再切场景。
 *
 * 调用方必须传当前场景，用 `scene.start()` 让 Phaser 正确停掉旧场景；
 * 全局 `game.scene.start()` 不会停旧场景，容易留下重叠的 UIRoot。
 */
export async function enterModule(from: Phaser.Scene, id: ModuleId): Promise<void> {
  const module = MODULES[id];
  await assetService.ensure(module.requires, {
    show: module.gate.showProgress,
    label: module.gate.title,
  });
  from.scene.start(module.sceneKey);
}
