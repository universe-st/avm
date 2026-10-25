import Phaser from 'phaser';
import { getTheme, prefersReducedMotion } from '@phaser-mvvm/phaser';
import { getViewportPlan } from '../app/viewport';

export const INK = 0x05060a;
export const PAPER = 0xf2efe6;
export const GOLD = 0xd8b76a;
export const MUTED = 0x9b9486;
export const DANGER = 0xc0392b;

const colorCss = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

export interface SceneTextOptions {
  readonly size: number;
  readonly color?: number;
  readonly align?: 'left' | 'center' | 'right';
  readonly originX?: number;
  readonly originY?: number;
  readonly stroke?: number;
  readonly alpha?: number;
  readonly depth?: number;
  readonly fixedWidth?: number;
  readonly fixedHeight?: number;
  readonly lineSpacing?: number;
  readonly letterSpacing?: number;
  readonly bold?: boolean;
}

/**
 * 开幕剧情里的原生文字。
 *
 * 不把长句烘焙进图片，也不走 Compose 的逐字重排；固定文本盒 + `setResolution`
 * 保证逐字变化时只改字形、不跳版。
 */
export function makeSceneText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  value: string,
  options: SceneTextOptions,
): Phaser.GameObjects.Text {
  const theme = getTheme();
  const style: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: theme.fontFamily,
    fontSize: `${options.size}px`,
    color: colorCss(options.color ?? PAPER),
    align: options.align ?? 'center',
    lineSpacing: options.lineSpacing ?? Math.round(options.size * 0.32),
    stroke: colorCss(INK),
    strokeThickness: options.stroke ?? Math.max(2, Math.round(options.size * 0.09)),
    shadow: {
      offsetX: 0,
      offsetY: 3,
      color: '#000000',
      blur: 10,
      fill: true,
    },
  };
  if (options.bold === true) style.fontStyle = 'bold';

  const obj = scene.add
    .text(x, y, value, style)
    .setOrigin(options.originX ?? 0.5, options.originY ?? 0.5);
  obj.setResolution(getViewportPlan().scale);
  if (options.fixedWidth !== undefined && options.fixedHeight !== undefined) {
    obj.setFixedSize(options.fixedWidth, options.fixedHeight);
  }
  if (options.letterSpacing !== undefined) obj.setLetterSpacing(options.letterSpacing);
  obj.setAlpha(options.alpha ?? 1);
  obj.setDepth(options.depth ?? 10);
  return obj;
}

/**
 * 背景层：双缓冲交叉淡化 + 缓慢 Ken Burns。
 * 同 key 不重复切换；找不到纹理时保留上一张（首张则露出场景底色与静态星野）。
 */
export class CinematicBackdrop {
  private readonly scene: Phaser.Scene;
  private readonly reduced: boolean;
  private layers: Phaser.GameObjects.Image[] = [];
  private currentKey: string | null = null;
  private readonly drift = new Map<Phaser.GameObjects.Image, Phaser.Tweens.Tween>();

  constructor(scene: Phaser.Scene, reduced = prefersReducedMotion()) {
    this.scene = scene;
    this.reduced = reduced;
  }

  show(key: string, fadeMs = 900): void {
    if (this.currentKey === key) return;
    this.currentKey = key;

    if (!this.scene.textures.exists(key)) {
      // 本地包缺图属于打包错误；这里只保证剧情还能继续读下去。
      console.warn(`[prologue] 缺少背景纹理：${key}`);
      return;
    }

    const plan = getViewportPlan();
    const image = this.scene.add
      .image(plan.designWidth / 2, plan.designHeight / 2, key)
      .setOrigin(0.5)
      .setDepth(2)
      .setAlpha(0);
    image.setScale(this.coverScale(image) * 1.06);

    const previous = this.layers;
    this.layers = [image];

    for (const old of previous) {
      this.scene.tweens.add({
        targets: old,
        alpha: 0,
        duration: Math.max(120, fadeMs),
        ease: 'Sine.easeInOut',
        onComplete: () => {
          this.drift.get(old)?.stop();
          this.drift.delete(old);
          old.destroy();
        },
      });
    }

    this.scene.tweens.add({
      targets: image,
      alpha: 1,
      duration: this.reduced ? Math.min(220, fadeMs) : Math.max(120, fadeMs),
      ease: 'Sine.easeInOut',
    });

    if (this.reduced) return;
    const from = image.scaleX;
    const to = from * 1.045;
    const drift = this.scene.tweens.add({
      targets: image,
      scaleX: to,
      scaleY: to,
      duration: 9000,
      ease: 'Sine.easeInOut',
    });
    this.drift.set(image, drift);
  }

  destroy(): void {
    for (const tween of this.drift.values()) tween.stop();
    this.drift.clear();
    for (const layer of this.layers) layer.destroy();
    this.layers = [];
    this.currentKey = null;
  }

  private coverScale(image: Phaser.GameObjects.Image): number {
    const plan = getViewportPlan();
    return Math.max(plan.designWidth / image.width, plan.designHeight / image.height);
  }
}

/** 画面很暗时也能看见的底纹；同时作为缺图兜底。 */
export function addStaticStarfield(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const plan = getViewportPlan();
  const graphics = scene.add.graphics().setDepth(0);
  let seed = 20260907;
  const random = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  graphics.fillStyle(0xdfe6ff, 0.42);
  for (let i = 0; i < 110; i += 1) {
    const x = random() * plan.designWidth;
    const y = random() * plan.designHeight;
    const r = random() > 0.9 ? 1.5 : 0.9;
    graphics.fillCircle(x, y, r);
  }
  return graphics;
}

/** 上下压暗 + 暗角。用 Canvas 纹理，避免硬边矩形。 */
export function addCinematicScrim(scene: Phaser.Scene): void {
  const plan = getViewportPlan();
  const { designWidth: w, designHeight: h } = plan;
  const scrimKey = `__avm.cine.scrim.${h}`;

  if (!scene.textures.exists(scrimKey)) {
    const texture = scene.textures.createCanvas(scrimKey, 8, h);
    if (texture) {
      const ctx = texture.context;
      const gradient = ctx.createLinearGradient(0, 0, 0, h);
      gradient.addColorStop(0, 'rgba(5, 6, 10, 0.58)');
      gradient.addColorStop(0.2, 'rgba(5, 6, 10, 0.08)');
      gradient.addColorStop(0.44, 'rgba(5, 6, 10, 0.06)');
      gradient.addColorStop(0.58, 'rgba(5, 6, 10, 0.44)');
      gradient.addColorStop(0.7, 'rgba(5, 6, 10, 0.7)');
      gradient.addColorStop(0.82, 'rgba(5, 6, 10, 0.86)');
      gradient.addColorStop(1, 'rgba(5, 6, 10, 0.97)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 8, h);
      texture.refresh();
    }
  }

  if (scene.textures.exists(scrimKey)) {
    scene.add
      .image(0, 0, scrimKey)
      .setOrigin(0, 0)
      .setDisplaySize(w, h)
      .setDepth(4);
  }

  const vignetteKey = '__avm.cine.vignette';
  if (!scene.textures.exists(vignetteKey)) {
    const texture = scene.textures.createCanvas(vignetteKey, 256, 256);
    if (texture) {
      const ctx = texture.context;
      const gradient = ctx.createRadialGradient(128, 128, 32, 128, 128, 128);
      gradient.addColorStop(0, 'rgba(5, 6, 10, 0)');
      gradient.addColorStop(0.62, 'rgba(5, 6, 10, 0.06)');
      gradient.addColorStop(1, 'rgba(5, 6, 10, 0.78)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 256, 256);
      texture.refresh();
    }
  }

  if (scene.textures.exists(vignetteKey)) {
    scene.add
      .image(w / 2, h / 2, vignetteKey)
      .setDisplaySize(w, h)
      .setDepth(5)
      .setAlpha(0.9);
  }
}

export interface SparkOptions {
  readonly count?: number;
  readonly color?: number;
  readonly depth?: number;
  readonly speed?: number;
  readonly alpha?: number;
  readonly reduced?: boolean;
}

/** 梦境/星尘浮点：一张 Graphics 逐帧重绘，不占额外纹理。 */
export class SparkField {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly dots: { x: number; y: number; r: number; speed: number; phase: number }[] = [];
  private readonly reduced: boolean;
  private readonly color: number;
  private readonly alpha: number;
  private elapsed = 0;

  constructor(scene: Phaser.Scene, options: SparkOptions = {}) {
    const plan = getViewportPlan();
    const count = options.count ?? 38;
    this.reduced = options.reduced ?? prefersReducedMotion();
    this.color = options.color ?? 0xdfe6ff;
    this.alpha = options.alpha ?? 0.48;

    let seed = 7241;
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < count; i += 1) {
      this.dots.push({
        x: random() * plan.designWidth,
        y: random() * plan.designHeight,
        r: 0.8 + random() * 1.8,
        speed: 5 + random() * 16,
        phase: random() * Math.PI * 2,
      });
    }

    this.graphics = scene.add.graphics().setDepth(options.depth ?? 6);
    this.draw();
  }

  update(deltaMs: number): void {
    if (this.reduced) return;
    const plan = getViewportPlan();
    this.elapsed += deltaMs;
    for (const dot of this.dots) {
      dot.y -= (dot.speed * deltaMs) / 1000;
      if (dot.y < -4) {
        dot.y = plan.designHeight + 4;
        dot.x = (dot.x + 137.3) % plan.designWidth;
      }
    }
    this.draw();
  }

  setAlpha(alpha: number): void {
    this.graphics.setAlpha(alpha);
  }

  destroy(): void {
    this.graphics.destroy();
  }

  private draw(): void {
    this.graphics.clear();
    for (const dot of this.dots) {
      const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(this.elapsed / 900 + dot.phase));
      this.graphics.fillStyle(this.color, this.alpha * twinkle);
      this.graphics.fillCircle(dot.x, dot.y, dot.r);
    }
  }
}

/** 开场流星：局部拖尾 + 头点，沿对角线掠过。 */
export class MeteorSweep {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly reduced: boolean;

  constructor(scene: Phaser.Scene, reduced = prefersReducedMotion()) {
    this.scene = scene;
    this.reduced = reduced;
    const plan = getViewportPlan();
    const graphics = scene.add.graphics();
    for (let i = 0; i < 7; i += 1) {
      const reach = 18 + i * 15;
      graphics.lineStyle(Math.max(1, 5 - i * 0.6), PAPER, 0.18 - i * 0.02);
      graphics.beginPath();
      graphics.moveTo(0, 0);
      graphics.lineTo(-reach, -reach * 0.42);
      graphics.strokePath();
    }
    graphics.fillStyle(PAPER, 0.96);
    graphics.fillCircle(0, 0, 3.2);
    graphics.fillStyle(PAPER, 0.18);
    graphics.fillCircle(0, 0, 10);

    this.container = scene.add
      .container(plan.designWidth * 0.12, plan.designHeight * 0.1, [graphics])
      .setDepth(8)
      .setAlpha(0);
  }

  play(): void {
    const plan = getViewportPlan();
    if (this.reduced) {
      this.container.setPosition(plan.designWidth * 0.54, plan.designHeight * 0.2).setAlpha(0);
      this.scene.tweens.add({
        targets: this.container,
        alpha: 0.55,
        duration: 500,
        yoyo: true,
        hold: 700,
      });
      return;
    }

    this.scene.tweens.add({
      targets: this.container,
      x: plan.designWidth * 0.86,
      y: plan.designHeight * 0.36,
      alpha: 1,
      duration: 1300,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        this.scene.tweens.add({
          targets: this.container,
          alpha: 0,
          duration: 420,
          ease: 'Sine.easeOut',
        });
      },
    });
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.container);
    this.container.destroy(true);
  }
}

/** 白闪：换图/灾难段落的电影切点。 */
export function flashScreen(
  scene: Phaser.Scene,
  options: { color?: number; alpha?: number; duration?: number; reduced?: boolean } = {},
): void {
  const reduced = options.reduced ?? prefersReducedMotion();
  if (reduced) return;
  const plan = getViewportPlan();
  const rect = scene.add
    .rectangle(0, 0, plan.designWidth, plan.designHeight, options.color ?? PAPER, 1)
    .setOrigin(0, 0)
    .setDepth(20)
    .setAlpha(0);
  scene.tweens.add({
    targets: rect,
    alpha: options.alpha ?? 0.42,
    duration: Math.max(80, (options.duration ?? 460) * 0.35),
    yoyo: true,
    ease: 'Sine.easeOut',
    onComplete: () => rect.destroy(),
  });
}

export function shakeScreen(scene: Phaser.Scene, reduced = prefersReducedMotion()): void {
  if (reduced) return;
  scene.cameras.main.shake(420, 0.0035);
}

/** 「无声的战争」叠加：红脉冲 + 扫描线 + 逐个亮起的电子眼。 */
export class WarOverlay {
  private readonly scene: Phaser.Scene;
  private readonly pulse: Phaser.GameObjects.Rectangle;
  private readonly scanline: Phaser.GameObjects.Rectangle;
  private readonly eyes: Phaser.GameObjects.Graphics;
  private readonly eyePositions: { x: number; y: number; r: number }[] = [];
  private readonly tweens: Phaser.Tweens.Tween[] = [];
  private eyeTimer: Phaser.Time.TimerEvent | null = null;
  private litEyes = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const plan = getViewportPlan();
    const { designWidth: w, designHeight: h } = plan;

    this.pulse = scene.add
      .rectangle(0, 0, w, h, DANGER, 1)
      .setOrigin(0, 0)
      .setDepth(6)
      .setAlpha(0);
    this.scanline = scene.add
      .rectangle(0, -4, w, 3, DANGER, 0.22)
      .setOrigin(0, 0)
      .setDepth(7);
    this.eyes = scene.add.graphics().setDepth(7);

    const points: readonly [number, number, number][] = [
      [0.19, 0.34, 3.2],
      [0.3, 0.28, 2.4],
      [0.72, 0.31, 3.6],
      [0.81, 0.45, 2.8],
      [0.64, 0.56, 2.2],
      [0.38, 0.49, 2.6],
    ];
    for (const [x, y, r] of points) {
      this.eyePositions.push({ x: x * w, y: y * h, r });
    }
    this.stop();
  }

  start(): void {
    this.stop();
    this.pulse.setVisible(true).setAlpha(0);
    this.scanline.setVisible(true).setPosition(0, -4);
    this.eyes.setVisible(true);
    this.litEyes = 0;
    this.drawEyes();

    this.tweens.push(
      this.scene.tweens.add({
        targets: this.pulse,
        alpha: 0.11,
        duration: 1100,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      }),
    );
    this.tweens.push(
      this.scene.tweens.add({
        targets: this.scanline,
        y: getViewportPlan().designHeight + 4,
        duration: 6200,
        repeat: -1,
        ease: 'Linear',
      }),
    );

    this.eyeTimer = this.scene.time.addEvent({
      delay: 320,
      repeat: this.eyePositions.length - 1,
      callback: () => {
        this.litEyes = Math.min(this.eyePositions.length, this.litEyes + 1);
        this.drawEyes();
      },
    });
  }

  stop(): void {
    this.eyeTimer?.remove();
    this.eyeTimer = null;
    for (const tween of this.tweens) tween.stop();
    this.tweens.length = 0;
    this.pulse.setVisible(false).setAlpha(0);
    this.scanline.setVisible(false);
    this.eyes.setVisible(false);
  }

  destroy(): void {
    this.stop();
    this.pulse.destroy();
    this.scanline.destroy();
    this.eyes.destroy();
  }

  private drawEyes(): void {
    this.eyes.clear();
    for (const [index, eye] of this.eyePositions.entries()) {
      if (index >= this.litEyes) break;
      this.eyes.fillStyle(DANGER, 0.12);
      this.eyes.fillCircle(eye.x, eye.y, eye.r * 3.2);
      this.eyes.fillStyle(0xf26b5e, 0.82);
      this.eyes.fillCircle(eye.x, eye.y, eye.r);
    }
  }
}

/** 最后的日期/校名卡：金线展开 + 两行错峰淡入。 */
export class TitleCard {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly rule: Phaser.GameObjects.Rectangle;
  private readonly date: Phaser.GameObjects.Text;
  private readonly school: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, options: { depth?: number } = {}) {
    this.scene = scene;
    const plan = getViewportPlan();
    this.container = scene.add
      .container(plan.designWidth / 2, plan.designHeight * 0.7)
      .setDepth(options.depth ?? 12)
      .setAlpha(0)
      .setVisible(false);

    this.rule = scene.add
      .rectangle(0, 0, 520, 3, GOLD, 1)
      .setOrigin(0.5, 0.5)
      .setScale(0, 1);
    this.date = makeSceneText(scene, 0, 52, '', {
      size: 34,
      color: GOLD,
      letterSpacing: 4,
      originX: 0.5,
      originY: 0.5,
      depth: 0,
      alpha: 0,
    });
    this.school = makeSceneText(scene, 0, 122, '', {
      size: 44,
      color: PAPER,
      letterSpacing: 2,
      originX: 0.5,
      originY: 0.5,
      depth: 0,
      alpha: 0,
    });
    this.container.add([this.rule, this.date, this.school]);
  }

  show(lines: readonly string[]): void {
    this.date.setText(lines[0] ?? '');
    this.school.setText(lines[1] ?? '');
    this.container.setVisible(true).setAlpha(1);
    this.date.setAlpha(0).setY(62);
    this.school.setAlpha(0).setY(132);
    this.rule.setScale(0, 1);

    this.scene.tweens.add({
      targets: this.rule,
      scaleX: 1,
      duration: 700,
      ease: 'Cubic.easeOut',
    });
    this.scene.tweens.add({
      targets: this.date,
      alpha: 1,
      y: 52,
      delay: 220,
      duration: 520,
      ease: 'Sine.easeOut',
    });
    this.scene.tweens.add({
      targets: this.school,
      alpha: 1,
      y: 122,
      delay: 420,
      duration: 560,
      ease: 'Sine.easeOut',
    });
  }

  hide(): void {
    this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      duration: 260,
      ease: 'Sine.easeInOut',
      onComplete: () => this.container.setVisible(false),
    });
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.container);
    this.scene.tweens.killTweensOf(this.rule);
    this.scene.tweens.killTweensOf(this.date);
    this.scene.tweens.killTweensOf(this.school);
    this.container.destroy(true);
  }
}
