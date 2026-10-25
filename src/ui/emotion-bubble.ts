import Phaser from 'phaser';
import { LAYERS } from '../render/layers';
import type { EmotionKind } from '../story/dialogue';

const BUBBLE_FILL = 0xfff9e8;
const BUBBLE_LINE = 0x3a2e28;

const EMOTIONS: Record<EmotionKind, { glyph: string; color: string }> = {
  confused: { glyph: '?', color: '#2f6fed' },
  angry: { glyph: '怒', color: '#c0392b' },
  happy: { glyph: '笑', color: '#c28a12' },
  surprised: { glyph: '!', color: '#d35400' },
  sad: { glyph: '泪', color: '#2f6fed' },
  annoyed: { glyph: '汗', color: '#6b5bb5' },
};

/**
 * 角色头顶的表情气泡。
 *
 * 先冒气泡、再开始打字，属于世界内 UI（effects 层）：盖住角色，但低于 CG/Compose UI。
 * 气泡不走图片资源，用 Graphics + Text 生成，避免六个情绪各占一张图。
 */
export class EmotionBubble {
  private readonly scene: Phaser.Scene;
  private readonly reduced: boolean;
  private readonly container: Phaser.GameObjects.Container;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly glyph: Phaser.GameObjects.Text;
  private timer: Phaser.Time.TimerEvent | null = null;

  constructor(scene: Phaser.Scene, reduced = false) {
    this.scene = scene;
    this.reduced = reduced;
    this.graphics = scene.add.graphics();
    this.glyph = scene.add
      .text(0, -2, '?', {
        fontFamily: '"Noto Sans SC", "PingFang SC", system-ui, sans-serif',
        fontSize: '28px',
        fontStyle: 'bold',
        color: '#2f6fed',
        align: 'center',
      })
      .setOrigin(0.5);
    this.container = scene.add
      .container(0, 0, [this.graphics, this.glyph])
      .setDepth(LAYERS.effects + 40)
      .setVisible(false);
  }

  get visible(): boolean {
    return this.container.visible;
  }

  show(kind: EmotionKind, x: number, y: number, holdMs = 980): void {
    const meta = EMOTIONS[kind];
    this.glyph.setText(meta.glyph).setColor(meta.color);
    this.drawBubble(meta.color);

    this.timer?.remove();
    this.timer = null;
    this.scene.tweens.killTweensOf(this.container);
    const bubbleY = y - 24;
    this.container
      .setPosition(x, bubbleY + 8)
      .setAlpha(0)
      .setScale(this.reduced ? 1 : 0.72)
      .setVisible(true);

    if (!this.reduced) {
      this.scene.tweens.add({
        targets: this.container,
        y: bubbleY,
        alpha: 1,
        scaleX: 1,
        scaleY: 1,
        duration: 180,
        ease: 'Back.easeOut',
      });
    } else {
      this.container.setPosition(x, bubbleY).setAlpha(1);
    }

    this.timer = this.scene.time.delayedCall(Math.max(320, holdMs), () => this.hide());
  }

  hide(): void {
    this.timer?.remove();
    this.timer = null;
    if (!this.container.visible) return;
    this.scene.tweens.killTweensOf(this.container);
    if (this.reduced) {
      this.container.setVisible(false);
      return;
    }
    this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      y: this.container.y - 6,
      scaleX: 0.86,
      scaleY: 0.86,
      duration: 140,
      ease: 'Sine.easeIn',
      onComplete: () => this.container.setVisible(false),
    });
  }

  destroy(): void {
    this.timer?.remove();
    this.timer = null;
    this.scene.tweens.killTweensOf(this.container);
    this.container.destroy(true);
  }

  private drawBubble(accent: string): void {
    const g = this.graphics;
    g.clear();
    g.fillStyle(BUBBLE_FILL, 0.98);
    g.lineStyle(2, BUBBLE_LINE, 0.96);
    g.fillRoundedRect(-31, -31, 62, 52, 13);
    g.strokeRoundedRect(-31, -31, 62, 52, 13);
    g.fillTriangle(-9, 19, 9, 19, 0, 34);
    g.lineBetween(-9, 19, 0, 34);
    g.lineBetween(0, 34, 9, 19);
    g.lineStyle(2, Phaser.Display.Color.HexStringToColor(accent).color, 0.55);
    g.lineBetween(-18, 17, 18, 17);
  }
}
