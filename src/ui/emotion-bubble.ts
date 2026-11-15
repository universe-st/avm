import Phaser from 'phaser';
import { audioDirector } from '../audio/audio-director';
import { CH01_ASSET_KEYS } from '../assets/keys';
import { LAYERS } from '../render/layers';
import type { EmotionKind } from '../story/dialogue';
import {
  BUBBLE_ACCENT_LINE_Y,
  BUBBLE_FILL,
  BUBBLE_FRAME,
  BUBBLE_LINE,
  BUBBLE_LINE_WIDTH,
  BUBBLE_TAIL,
  EMOTION_ICONS,
  ICON_FILL_OUTLINE_WIDTH,
  ICON_STROKE_WIDTH,
  type EmotionIcon,
  type IconPoint,
} from './emotion-bubble-model';
import {
  BUBBLE_POP_MIN_INTERVAL_MS,
  BUBBLE_POP_RATE,
  BUBBLE_POP_VOLUME,
} from './emotion-bubble-sfx';

const DEG_TO_RAD = Math.PI / 180;

/**
 * 角色头顶的表情气泡。
 *
 * 先冒气泡、再开始打字，属于世界内 UI（effects 层）：盖住角色，但低于 CG/Compose UI。
 * 气泡与图标全部是 Graphics 路径（2026-11 用户要求「表情不要用汉字，用图画」后，
 * 连 `?` / `!` 也从 Text 换成了矢量笔画）：零图片资源、任意 DPR 都清晰，
 * 六个情绪的几何定义在 `emotion-bubble-model.ts`，本文件只负责画。
 */
export class EmotionBubble {
  private readonly scene: Phaser.Scene;
  private readonly reduced: boolean;
  private readonly container: Phaser.GameObjects.Container;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private timer: Phaser.Time.TimerEvent | null = null;
  /** 上一记「啵」的场景时间（ms）；用于 `BUBBLE_POP_MIN_INTERVAL_MS` 节流。 */
  private lastPopAt = Number.NEGATIVE_INFINITY;

  constructor(scene: Phaser.Scene, reduced = false) {
    this.scene = scene;
    this.reduced = reduced;
    this.graphics = scene.add.graphics();
    this.container = scene.add
      .container(0, 0, [this.graphics])
      .setDepth(LAYERS.effects + 40)
      .setVisible(false);
  }

  get visible(): boolean {
    return this.container.visible;
  }

  show(kind: EmotionKind, x: number, y: number, holdMs = 980): void {
    this.draw(EMOTION_ICONS[kind]);

    this.timer?.remove();
    this.timer = null;
    this.scene.tweens.killTweensOf(this.container);
    const bubbleY = y - 24;
    this.container
      .setPosition(x, bubbleY + 8)
      .setAlpha(0)
      .setScale(this.reduced ? 1 : 0.72)
      .setVisible(true);

    // 气泡冒出这一帧响一记「啵」（reduced 也照常响：音效与动效是两件事）。
    // 走 audioDirector 而不是裸 scene.sound.add：静音/音量设置自动生效，
    // 未 attach 场景时 playSfxAt 返回 null，不会抛。
    const now = this.scene.time.now;
    if (now - this.lastPopAt >= BUBBLE_POP_MIN_INTERVAL_MS) {
      this.lastPopAt = now;
      audioDirector.playSfxAt(CH01_ASSET_KEYS.audio.bubblePop, {
        volume: BUBBLE_POP_VOLUME,
        rate: BUBBLE_POP_RATE[kind],
      });
    }

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

  private draw(icon: EmotionIcon): void {
    const accent = Phaser.Display.Color.HexStringToColor(icon.color).color;
    const g = this.graphics;
    g.clear();
    this.drawFrame(accent);
    this.drawIcon(icon, accent);
  }

  /** 圆角框 + 尾巴 + 底部一条 accent 短线。 */
  private drawFrame(accent: number): void {
    const g = this.graphics;
    const { x, y, width, height, radius } = BUBBLE_FRAME;
    g.fillStyle(BUBBLE_FILL, 0.98);
    g.lineStyle(BUBBLE_LINE_WIDTH, BUBBLE_LINE, 0.96);
    g.fillRoundedRect(x, y, width, height, radius);
    g.strokeRoundedRect(x, y, width, height, radius);
    const [left, right, tip] = BUBBLE_TAIL;
    g.fillTriangle(left.x, left.y, right.x, right.y, tip.x, tip.y);
    g.lineBetween(left.x, left.y, tip.x, tip.y);
    g.lineBetween(tip.x, tip.y, right.x, right.y);
    g.lineStyle(BUBBLE_LINE_WIDTH, accent, 0.55);
    g.lineBetween(-18, BUBBLE_ACCENT_LINE_Y, 18, BUBBLE_ACCENT_LINE_Y);
  }

  /**
   * 按模型里的笔画顺序画图标。描边类（弧/折线）用 accent 线；实心类（水滴/眼点）
   * 用 accent 填充 + 一圈细的 BUBBLE_LINE 描边，和气泡的深色轮廓同一个色系。
   */
  private drawIcon(icon: EmotionIcon, accent: number): void {
    const g = this.graphics;
    for (const shape of icon.shapes) {
      switch (shape.kind) {
        case 'arc': {
          g.lineStyle(ICON_STROKE_WIDTH, accent, 1);
          g.beginPath();
          // 弧度按「屏幕坐标顺时针」给：0° 右、90° 下、270° 上。
          g.arc(
            shape.cx,
            shape.cy,
            shape.radius,
            shape.fromDeg * DEG_TO_RAD,
            shape.toDeg * DEG_TO_RAD,
            false,
          );
          g.strokePath();
          break;
        }
        case 'polyline': {
          g.lineStyle(ICON_STROKE_WIDTH, accent, 1);
          this.tracePath(shape.points, false);
          g.strokePath();
          break;
        }
        case 'fillCircle': {
          g.fillStyle(accent, 1);
          g.fillCircle(shape.cx, shape.cy, shape.radius);
          g.lineStyle(ICON_FILL_OUTLINE_WIDTH, BUBBLE_LINE, 0.9);
          g.strokeCircle(shape.cx, shape.cy, shape.radius);
          break;
        }
        case 'fillPolygon': {
          g.fillStyle(accent, 1);
          this.tracePath(shape.points, true);
          g.fillPath();
          g.lineStyle(ICON_FILL_OUTLINE_WIDTH, BUBBLE_LINE, 0.9);
          g.strokePath();
          break;
        }
      }
    }
  }

  private tracePath(points: readonly IconPoint[], close: boolean): void {
    const g = this.graphics;
    g.beginPath();
    let started = false;
    for (const point of points) {
      if (started) g.lineTo(point.x, point.y);
      else {
        g.moveTo(point.x, point.y);
        started = true;
      }
    }
    if (started && close) g.closePath();
  }
}
