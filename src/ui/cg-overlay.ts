import Phaser from 'phaser';
import { getViewportPlan } from '../app/viewport';
import { LAYERS } from '../render/layers';
import type { DialogueFx } from '../story/dialogue';

/**
 * 全屏剧情 CG 层。
 *
 * 职责：只负责「显示/隐藏一张 CG + 轻量镜头特效」。
 * 不读剧情、不判断对话，场景在 line cue 里调用 `show()` / `hide()`。
 * depth 固定取 `LAYERS.cg`，保证盖住地图与角色；Compose UI 在它之上。
 */
export class CgOverlay {
  private readonly scene: Phaser.Scene;
  private readonly reduced: boolean;
  private image: Phaser.GameObjects.Image | null = null;
  private key: string | null = null;

  constructor(scene: Phaser.Scene, reduced = false) {
    this.scene = scene;
    this.reduced = reduced;
  }

  get currentKey(): string | null {
    return this.key;
  }

  show(key: string, fx?: DialogueFx): void {
    if (this.key !== key) {
      if (!this.scene.textures.exists(key)) {
        console.warn(`[cg] 缺少纹理：${key}`);
        return;
      }
      const plan = getViewportPlan();
      const image = this.scene.add
        .image(plan.designWidth / 2, plan.designHeight / 2, key)
        .setDepth(LAYERS.cg)
        .setAlpha(0);
      const cover = Math.max(plan.designWidth / image.width, plan.designHeight / image.height);
      image.setScale(cover * 1.02);

      const previous = this.image;
      this.image = image;
      this.key = key;

      if (previous && previous !== image) {
        this.scene.tweens.add({
          targets: previous,
          alpha: 0,
          duration: this.reduced ? 80 : 260,
          onComplete: () => previous.destroy(),
        });
      }
      this.scene.tweens.add({
        targets: image,
        alpha: 1,
        duration: this.reduced ? 80 : 420,
        ease: 'Sine.easeOut',
      });
      if (!this.reduced) {
        this.scene.tweens.add({
          targets: image,
          scaleX: cover * 1.06,
          scaleY: cover * 1.06,
          duration: 6200,
          ease: 'Sine.easeInOut',
        });
      }
    }

    this.applyFx(fx);
  }

  hide(): void {
    const image = this.image;
    if (!image) return;
    this.image = null;
    this.key = null;
    this.scene.tweens.add({
      targets: image,
      alpha: 0,
      duration: this.reduced ? 80 : 240,
      onComplete: () => image.destroy(),
    });
  }

  destroy(): void {
    if (this.image) {
      this.scene.tweens.killTweensOf(this.image);
      this.image.destroy();
    }
    this.image = null;
    this.key = null;
  }

  private applyFx(fx: DialogueFx | undefined): void {
    if (fx === undefined) return;
    if (fx === 'flash') {
      if (!this.reduced) this.scene.cameras.main.flash(240, 255, 255, 255);
      return;
    }
    if (fx === 'shake') {
      if (!this.reduced) this.scene.cameras.main.shake(140, 0.004);
      return;
    }
    if (fx === 'glitch') this.glitch();
  }

  private glitch(): void {
    const image = this.image;
    if (!image || this.reduced) return;
    this.scene.tweens.add({
      targets: image,
      x: image.x + 5,
      alpha: 0.72,
      duration: 55,
      yoyo: true,
      repeat: 3,
      onComplete: () => {
        image.setX(getViewportPlan().designWidth / 2);
        image.setAlpha(1);
      },
    });
  }
}
