import Phaser from 'phaser';
import type { BundleId } from '../assets/types';
import { assetService } from './asset-service';

export interface SceneResourceGate {
  /** 加载页副标题，如「正在进入第一章 · 寝室」。 */
  readonly label: string;
  /** 加载页最短可见时长（毫秒）；省略用 AssetService 默认 520ms。 */
  readonly holdMs?: number;
}

/**
 * 场景资源门禁：进入任何内容场景前唯一允许的加载入口。
 *
 * 固定 `show: 'always'`，保证每次切换场景都有可见的加载/转场遮罩，
 * 而不是「缓存命中就闪进去、读盘慢就黑屏」。
 */
export function loadSceneResources(
  requires: readonly BundleId[],
  gate: SceneResourceGate,
): Promise<void> {
  return assetService.ensure(requires, {
    show: 'always',
    label: gate.label,
    ...(gate.holdMs === undefined ? {} : { holdMs: gate.holdMs }),
  });
}

/**
 * 目标场景 `create` 之后回收不属于它的 bundle。
 *
 * 时机必须是目标场景 create 之后：此时旧场景已经 shutdown、旧 GameObject 全部销毁，
 * 而目标场景需要的 bundle 仍在 keep 闭包里，不会误删正在使用的纹理。
 */
export function releaseSceneResourcesAfterCreate(
  scene: Phaser.Scene,
  requires: readonly BundleId[],
): void {
  scene.events.once(Phaser.Scenes.Events.CREATE, () => {
    // create() 里可能还会在首帧引用纹理；让这一帧先落地，再释放。
    window.setTimeout(() => {
      // 快速连续跳转时，本场景可能已经被下一个场景替换；此时由新的释放计划负责。
      if (!scene.scene.isActive()) return;
      void assetService.releaseExcept(requires).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[assets] 释放场景资源失败：${message}`);
      });
    }, 0);
  });
}
