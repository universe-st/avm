import Phaser from 'phaser';
import { getViewportPlan } from '../app/viewport';

/**
 * 全屏封面图：等比放大到覆盖设计框（多出的部分裁掉）。
 * 素材按「中心安全构图区」画，竖屏 16:9～20:9 都不会丢掉主体。
 */
export function addCoverImage(
  scene: Phaser.Scene,
  key: string,
): Phaser.GameObjects.Image | null {
  if (!scene.textures.exists(key)) return null;
  const plan = getViewportPlan();
  const image = scene.add
    .image(plan.designWidth / 2, plan.designHeight / 2, key)
    .setOrigin(0.5);
  const cover = Math.max(plan.designWidth / image.width, plan.designHeight / image.height);
  image.setScale(cover);
  return image;
}

/**
 * 上下压暗：用一张 8×designH 的渐变画布纹理，而不是两条硬边矩形。
 * 中间的裂隙要留给主视觉，所以 0.35–0.5 处几乎不压。
 */
export function addScrims(scene: Phaser.Scene): void {
  const plan = getViewportPlan();
  const key = `__avm.scrim.${plan.designHeight}`;

  if (!scene.textures.exists(key)) {
    const texture = scene.textures.createCanvas(key, 8, plan.designHeight);
    if (texture) {
      const ctx = texture.context;
      const gradient = ctx.createLinearGradient(0, 0, 0, plan.designHeight);
      gradient.addColorStop(0, 'rgba(5, 6, 10, 0.92)');
      gradient.addColorStop(0.28, 'rgba(5, 6, 10, 0.42)');
      gradient.addColorStop(0.48, 'rgba(5, 6, 10, 0.08)');
      gradient.addColorStop(0.66, 'rgba(5, 6, 10, 0.58)');
      gradient.addColorStop(1, 'rgba(5, 6, 10, 0.96)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 8, plan.designHeight);
      texture.refresh();
    }
  }

  if (scene.textures.exists(key)) {
    scene.add
      .image(0, 0, key)
      .setOrigin(0, 0)
      .setDisplaySize(plan.designWidth, plan.designHeight);
  }
}
