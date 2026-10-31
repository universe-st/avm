import Phaser from 'phaser';
import { getViewportPlan } from '../app/viewport';
import { SCREEN_LAYERS } from '../render/layers';
import { DANGER, GOLD, INK, PAPER } from './cinematic';

/**
 * 过场的镜头与画面语言。
 *
 * 一个场景一个实例；所有方法都自带 `prefers-reduced-motion` 降级（位移/抖动/速度线
 * 直接跳过，只保留字卡与遮幅这类"信息层"，否则节奏会崩）。
 *
 * 约定：镜头缩放一律相对 `plan.scale`（720 设计宽的基准），所以推拉幅度写成倍率，
 * 不写绝对 zoom，换设备比例也不会跑。
 */
export class CinematicDirector {
  private readonly scene: Phaser.Scene;
  private readonly baseZoom: number;
  private readonly designWidth: number;
  private readonly designHeight: number;
  private readonly reduced: boolean;
  private letterboxTop: Phaser.GameObjects.Rectangle | null = null;
  private letterboxBottom: Phaser.GameObjects.Rectangle | null = null;
  private letterboxRatio = 0.09;
  private effects: Phaser.GameObjects.GameObject[] = [];

  private readonly worldRoot: Phaser.GameObjects.Container | null;

  constructor(
    scene: Phaser.Scene,
    reduced: boolean,
    worldRoot: Phaser.GameObjects.Container | null = null,
  ) {
    this.scene = scene;
    this.worldRoot = worldRoot;
    const plan = getViewportPlan();
    this.baseZoom = scene.cameras.main.zoom || 1;
    this.designWidth = plan.designWidth;
    this.designHeight = plan.designHeight;
    this.reduced = reduced;
  }

  // ---------------------------------------------------------------- 镜头

  /** 推近/拉远到「基准的 k 倍」。k<1 是拉远。 */
  zoomTo(k: number, ms: number, ease: 'Sine.easeInOut' | 'Quad.easeOut' | 'Expo.easeOut' = 'Sine.easeInOut'): void {
    if (this.worldRoot) {
      this.zoomWorld(k, ms, ease);
      return;
    }
    if (this.reduced) {
      this.scene.cameras.main.setZoom(this.baseZoom * k);
      return;
    }
    const camera = this.scene.cameras.main;
    const from = camera.zoom;
    const to = this.baseZoom * k;
    this.scene.tweens.addCounter({
      from,
      to,
      duration: Math.max(1, ms),
      ease,
      onUpdate: (tween) => camera.setZoom(tween.getValue() ?? to),
    });
  }

  /**
   * 推拉世界层：缩放 `worldRoot` 并以屏幕中心为锚点。
   *
   * 不动相机，所以 Compose 页面（对话框）和屏幕层特效都不会被一起放大——这正是之前
   * 「一放大对话框就飞出屏幕」的根因：相机 zoom 会连带 UI 一起缩。
   */
  private zoomWorld(k: number, ms: number, ease: string): void {
    const root = this.worldRoot;
    if (!root) return;
    const cx = this.designWidth / 2;
    const cy = this.designHeight / 2;
    const from = root.scaleX;
    const to = k;
    const apply = (v: number): void => {
      root.setScale(v);
      root.setPosition(cx - cx * v, cy - cy * v);
    };
    if (this.reduced) {
      apply(to);
      return;
    }
    this.scene.tweens.addCounter({
      from,
      to,
      duration: Math.max(1, ms),
      ease,
      onUpdate: (tween) => apply(tween.getValue() ?? to),
    });
  }

  /** 轻微上摇/下摇：按设计像素偏移镜头中心。 */
  panBy(dx: number, dy: number, ms: number): void {
    if (this.worldRoot) {
      const root = this.worldRoot;
      const fromX = root.x;
      const fromY = root.y;
      if (this.reduced) return;
      this.scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: Math.max(1, ms),
        ease: 'Sine.easeInOut',
        onUpdate: (tween) => {
          const t = tween.getValue() ?? 1;
          root.setPosition(fromX + dx * t, fromY + dy * t);
        },
      });
      return;
    }
    if (this.reduced) return;
    const camera = this.scene.cameras.main;
    const fromX = camera.scrollX;
    const fromY = camera.scrollY;
    this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: Math.max(1, ms),
      ease: 'Sine.easeInOut',
      onUpdate: (tween) => {
        const t = tween.getValue() ?? 1;
        camera.setScroll(fromX + dx * t, fromY + dy * t);
      },
    });
  }

  /** 回到初始机位。 */
  resetCamera(ms = 0): void {
    if (this.worldRoot) {
      this.worldRoot.setScale(1).setPosition(0, 0);
      return;
    }
    const camera = this.scene.cameras.main;
    camera.setZoom(this.baseZoom);
    camera.centerOn(this.designWidth / 2, this.designHeight / 2);
    if (ms > 0 && !this.reduced) this.scene.cameras.main.flash(0, 0, 0, 0);
  }

  // ---------------------------------------------------------------- 画幅

  /**
   * 上下遮幅：进入「电影画幅」。
   *
   * 注意：这里是**世界空间**的物件，会被相机 zoom 一起放大，所以每帧由
   * `syncOverlays()` 按 `camera.worldView` 重新贴合可视区域，尺寸也除以 zoom，
   * 看起来才是"贴在屏幕上"的两条黑边。
   */
  letterbox(on: boolean, ms = 260): void {
    if (on) {
      if (this.letterboxTop) return;
      const camera = this.scene.cameras.main;
      const view = camera.worldView;
      const barHeight = view.height * this.letterboxRatio;
      this.letterboxTop = this.scene.add
        .rectangle(view.x, view.y, view.width, barHeight, INK, 1)
        .setOrigin(0, 0)
        .setDepth(SCREEN_LAYERS.letterbox);
      this.letterboxBottom = this.scene.add
        .rectangle(view.x, view.bottom - barHeight, view.width, barHeight, INK, 1)
        .setOrigin(0, 0)
        .setDepth(SCREEN_LAYERS.letterbox);
      if (!this.reduced && ms > 0) {
        this.letterboxTop.setScale(1, 0);
        this.letterboxBottom.setScale(1, 0);
        this.scene.tweens.add({
          targets: [this.letterboxTop, this.letterboxBottom],
          scaleY: 1,
          duration: ms,
          ease: 'Sine.easeOut',
        });
      }
      return;
    }

    const top = this.letterboxTop;
    const bottom = this.letterboxBottom;
    this.letterboxTop = null;
    this.letterboxBottom = null;
    if (!top || !bottom) return;
    if (this.reduced) {
      top.destroy();
      bottom.destroy();
      return;
    }
    this.scene.tweens.add({
      targets: [top, bottom],
      alpha: 0,
      duration: ms,
      onComplete: () => {
        top.destroy();
        bottom.destroy();
      },
    });
  }

  /**
   * 每帧调用：把遮幅贴回可视区域。
   * 相机的 zoom 一改，worldView 就变，这里跟着重算，避免出现「跑到左上角的小黑块」。
   */
  syncOverlays(): void {
    const view = this.scene.cameras.main.worldView;
    const barHeight = view.height * this.letterboxRatio;
    if (this.letterboxTop) {
      this.letterboxTop.setPosition(view.x, view.y).setSize(view.width, barHeight);
    }
    if (this.letterboxBottom) {
      this.letterboxBottom
        .setPosition(view.x, view.bottom - barHeight)
        .setSize(view.width, barHeight);
    }
  }

  // ---------------------------------------------------------------- 特效

  /** 集中线：从画面外缘指向中心的一次性冲击（世界空间绘制，按 zoom 反算尺寸）。 */
  speedLines(color: 'white' | 'red', ms = 420): void {
    if (this.reduced) return;
    const camera = this.scene.cameras.main;
    const view = camera.worldView;
    const zoom = camera.zoom || 1;
    const cx = view.centerX;
    const cy = view.y + view.height * 0.46;
    const g = this.scene.add.graphics().setDepth(SCREEN_LAYERS.speedlines);
    const tint = color === 'red' ? 0xd6453c : 0xfff4e2;
    const unit = view.height / zoom / 720; // 以 720 设计宽为基准换算
    for (let i = 0; i < 46; i += 1) {
      const angle = (i / 46) * Math.PI * 2 + (i % 3) * 0.04;
      const inner = (150 + (i % 5) * 26) * (view.width / zoom) / 720;
      const outer = (620 + (i % 7) * 60) * (view.width / zoom) / 720;
      g.lineStyle((2 + (i % 3)) * unit * 2, tint, 0.5 + (i % 4) * 0.12);
      g.beginPath();
      g.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner * 1.35);
      g.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer * 1.35);
      g.strokePath();
    }
    g.setAlpha(0);
    this.scene.tweens.add({
      targets: g,
      alpha: { from: 0, to: 0.85 },
      duration: Math.max(60, ms * 0.22),
      yoyo: true,
      hold: Math.max(40, ms * 0.18),
      onComplete: () => g.destroy(),
    });
  }

  /**
   * 定格字卡：屏幕中偏上的大字（描边 + 轻微上浮 + 淡出）。
   * reduced 时保留（信息层），只去掉位移。
   */
  stamp(text: string, tone: 'gold' | 'danger' = 'gold', ms = 900): void {
    const camera = this.scene.cameras.main;
    const view = camera.worldView;
    const zoom = camera.zoom || 1;
    const label = this.scene.add
      .text(view.centerX, view.y + view.height * 0.34, text, {
        fontFamily: '"Noto Serif SC", "Songti SC", serif',
        fontSize: '64px',
        color: `#${(tone === 'danger' ? DANGER : GOLD).toString(16).padStart(6, '0')}`,
        stroke: `#${INK.toString(16).padStart(6, '0')}`,
        strokeThickness: 10,
        align: 'center',
      })
      .setOrigin(0.5, 0.5)
      .setDepth(SCREEN_LAYERS.stamp)
      .setScale(1 / zoom)
      .setAlpha(0);

    if (this.reduced) {
      label.setAlpha(1);
      this.scene.time.delayedCall(ms, () => label.destroy());
      return;
    }

    label.setScale(1.35);
    this.scene.tweens.add({
      targets: label,
      alpha: 1,
      scale: 1,
      y: label.y - 14,
      duration: 180,
      ease: 'Expo.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: label,
          alpha: 0,
          y: label.y - 18,
          delay: Math.max(120, ms - 420),
          duration: 260,
          onComplete: () => label.destroy(),
        });
      },
    });
  }

  /** 硬切：全屏色块瞬间盖住再放开，用于场景内的"换气"。 */
  cut(color: 'black' | 'white' = 'black', ms = 320): void {
    const view = this.scene.cameras.main.worldView;
    const rect = this.scene.add
      .rectangle(view.x, view.y, view.width, view.height, color === 'black' ? INK : PAPER, 1)
      .setOrigin(0, 0)
      .setDepth(SCREEN_LAYERS.cut)
      .setAlpha(1);
    if (this.reduced) {
      this.scene.time.delayedCall(80, () => rect.destroy());
      return;
    }
    this.scene.tweens.add({
      targets: rect,
      alpha: 0,
      duration: ms,
      ease: 'Quad.easeOut',
      onComplete: () => rect.destroy(),
    });
  }

  /** 短促的"停一拍"：让冲击动作有余味。 */
  hitstop(ms = 90): void {
    if (this.reduced) return;
    const tweens = this.scene.tweens;
    const time = this.scene.time;
    tweens.timeScale = 0.05;
    time.timeScale = 0.05;
    this.scene.time.delayedCall(ms, () => {
      tweens.timeScale = 1;
      time.timeScale = 1;
    });
  }

  /** 场景关闭时清干净：镜头回位、遮幅与临时特效销毁。 */
  destroy(): void {
    this.resetCamera();
    this.letterboxTop?.destroy();
    this.letterboxBottom?.destroy();
    this.letterboxTop = null;
    this.letterboxBottom = null;
    for (const effect of this.effects) effect.destroy();
    this.effects = [];
  }
}
