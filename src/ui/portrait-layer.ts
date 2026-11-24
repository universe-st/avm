import Phaser from 'phaser';
import { getViewportPlan } from '../app/viewport';
import { SCREEN_LAYERS } from '../render/layers';
import { portraitMetrics, type PortraitSide } from './portrait-metrics';

export type { PortraitSide } from './portrait-metrics';

/**
 * 半身立绘 cut-in。
 *
 * 只在"有人开口"时出场，旁白不出现——这样「有人说话 / 无人说话」在画面上能分得开。
 * 尺寸与站位全部由 `portraitMetrics()` 算（纯逻辑、可单测）：720×900 的透明 PNG
 * 宽度**是改版前的一半**，比例不变，底部对齐、不抢对话面板的位置。
 * 本类只负责建 image、播入场 tween 和呼吸。
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

  /**
   * 显示（同一张已经在场就只做一次呼吸，不重复入场）。
   *
   * `soft` = 同一个人换表情（情绪差分）：原地换贴图，不滑入、不重建、不打断呼吸。
   * 否则每换一次表情，人都要从画面外飞进来一次。
   */
  show(key: string, side: PortraitSide = 'right', options: { soft?: boolean } = {}): void {
    if (!this.scene.textures.exists(key)) return;
    const plan = getViewportPlan();
    const metrics = portraitMetrics(plan, side);

    if (this.key === key && this.image) {
      this.image.setPosition(metrics.anchorX, metrics.baseY);
      return;
    }

    if (options.soft === true && this.image) {
      const image = this.image;
      image.setTexture(key);
      image.setDisplaySize(metrics.width, metrics.height);
      image.setPosition(metrics.anchorX, metrics.baseY);
      image.setFlipX(side === 'left');
      this.key = key;
      this.scene.tweens.killTweensOf(image);
      if (this.reduced) {
        image.setAlpha(1);
      } else {
        this.scene.tweens.add({
          targets: image,
          alpha: 1,
          y: metrics.baseY,
          duration: 160,
          ease: 'Sine.easeOut',
          onComplete: () => this.startBreath(),
        });
        return;
      }
      this.startBreath();
      return;
    }

    if (this.image) this.image.destroy();
    this.stopBreath();

    const image = this.scene.add
      .image(metrics.anchorX, metrics.baseY, key)
      .setOrigin(0.5, 1)
      // 屏幕层：**不随相机滚动**。御膳房的相机会跟着玩家走，没这行立绘会被滚出画面
      // （2026-11-24 实测：寝室/金殿固定镜头正常，御膳房只剩一条黑边）。
      .setScrollFactor(0)
      .setDepth(SCREEN_LAYERS.portrait)
      .setAlpha(this.reduced ? 1 : 0);
    image.setDisplaySize(metrics.width, metrics.height);
    if (side === 'left') image.setFlipX(true);

    this.image = image;
    this.key = key;

    if (this.reduced) {
      this.startBreath();
      return;
    }

    image.setX(metrics.fromX);
    this.scene.tweens.add({
      targets: image,
      x: metrics.anchorX,
      alpha: 1,
      duration: 220,
      ease: 'Expo.easeOut',
      onComplete: () => this.startBreath(),
    });
  }

  /**
   * 收脸：淡出但**保留 image 对象**（alpha=0、key 置空）。
   *
   * 保留的理由是旁白：2026-11-25 起旁白不挂立绘，旁白结束同一个人再开口时要原地淡回来
   * （`soft`），不能每次从画面外滑进来。换人时 `show()` 会把旧 image 销毁重建。
   */
  hide(ms = 180): void {
    const image = this.image;
    if (!image) return;
    this.stopBreath();
    this.key = null;
    if (this.reduced) {
      image.setAlpha(0);
      return;
    }
    this.scene.tweens.add({
      targets: image,
      alpha: 0,
      y: image.y + 26,
      duration: ms,
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
