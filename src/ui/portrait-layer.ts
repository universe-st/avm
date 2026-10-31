import Phaser from 'phaser';
import { getViewportPlan } from '../app/viewport';
import { SCREEN_LAYERS } from '../render/layers';

/** 立绘从哪一侧滑入。 */
export type PortraitSide = 'left' | 'right';

/**
 * 半身立绘 cut-in。
 *
 * 只在"有人开口"时出场，旁白不出现——这样「有人说话 / 无人说话」在画面上能分得开。
 * 立绘是 720×900 的透明 PNG，底部对齐、按屏幕高度缩到 62%，不抢对话面板的位置。
 */
export class PortraitLayer {
  private readonly scene: Phaser.Scene;
  private readonly reduced: boolean;
  private image: Phaser.GameObjects.Image | null = null;
  private key: string | null = null;
  private breathTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, reduced: boolean) {
    this.scene = scene;
    this.reduced = reduced;
  }

  get currentKey(): string | null {
    return this.key;
  }

  /** 显示（同一张已经在场就只做一次呼吸，不重复入场）。 */
  show(key: string, side: PortraitSide = 'right'): void {
    if (!this.scene.textures.exists(key)) return;
    const plan = getViewportPlan();
    const height = Math.round(plan.designHeight * 0.46);
    const width = Math.round((height / 900) * 720);
    // 站在画面一侧、露出大半身：右侧人物靠右，左侧人物靠左
    const anchorX = side === 'right' ? plan.designWidth - width * 0.30 : width * 0.30;
    const baseY = plan.designHeight - 210;

    if (this.key === key && this.image) {
      this.image.setPosition(anchorX, baseY);
      return;
    }

    if (this.image) this.image.destroy();
    this.stopBreath();

    const image = this.scene.add
      .image(anchorX, baseY, key)
      .setOrigin(side === 'right' ? 0.5 : 0.5, 1)
      .setDepth(SCREEN_LAYERS.portrait)
      .setAlpha(this.reduced ? 1 : 0);
    image.setDisplaySize(width, height);
    if (side === 'left') image.setFlipX(true);

    this.image = image;
    this.key = key;

    if (this.reduced) {
      this.startBreath();
      return;
    }

    const fromX = anchorX + (side === 'right' ? 260 : -260);
    image.setX(fromX);
    this.scene.tweens.add({
      targets: image,
      x: anchorX,
      alpha: 1,
      duration: 220,
      ease: 'Expo.easeOut',
      onComplete: () => this.startBreath(),
    });
  }

  hide(ms = 180): void {
    const image = this.image;
    if (!image) return;
    this.stopBreath();
    this.image = null;
    this.key = null;
    if (this.reduced) {
      image.destroy();
      return;
    }
    this.scene.tweens.add({
      targets: image,
      alpha: 0,
      y: image.y + 26,
      duration: ms,
      onComplete: () => image.destroy(),
    });
  }

  destroy(): void {
    this.stopBreath();
    this.image?.destroy();
    this.image = null;
    this.key = null;
  }

  /** 站立时的呼吸：2px 上下，避免人物像一张贴纸。 */
  private startBreath(): void {
    if (this.reduced || !this.image) return;
    this.stopBreath();
    this.breathTween = this.scene.tweens.add({
      targets: this.image,
      y: this.image.y - 4,
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private stopBreath(): void {
    this.breathTween?.remove();
    this.breathTween = null;
  }
}
