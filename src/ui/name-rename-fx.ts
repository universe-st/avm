import Phaser from 'phaser';
import type { Label } from '@phaser-mvvm/widgets';
import { hashSeed, mulberry32 } from '../dev/random';
import {
  NAME_RENAME_FROM,
  NAME_RENAME_TIMELINE,
  NAME_RENAME_TO,
  NAME_RENAME_TOTAL_MS,
} from '../story/name-rename';

export { NAME_RENAME_FROM, NAME_RENAME_TIMELINE, NAME_RENAME_TO, NAME_RENAME_TOTAL_MS };

/**
 * 「说话人名字从『白色小精灵』变成『小白』」的命名确认演出（原生层，即用即弃）。
 *
 * 用户 2026-11-27 的要求：**白光划过名字，然后名字像数据一样发生马赛克渐变**，
 * 最后落成「小白」。位置就在底部对话面板左上角的说话人标签上——不是整屏特效，
 * 也不是换脸，只换那一行小字。
 *
 * ## 为什么挂在 Label 上
 *
 * 说话人标签是 Compose 的 `Text`（`Label` 内部只有一个 `Phaser.GameObjects.Text`）。
 * 本模块把整套特效作为 `Label` 容器的子对象创建在 `(0, 0)`——也就是**文字的左上角**，
 * 于是完全不用算面板坐标/视口坐标/安全区，HUD 在哪个视口、哪套布局下都自动对齐。
 * 演出期间把真正的 `textObject` 藏起来（视觉上由本模块画的 `from` 临摹接手），
 * 收尾时把它放回来（那时 `dialogueSpeaker` 已经是「小白」）。
 *
 * ## 马赛克是真马赛克，不是放大文字
 *
 * 名字先被画进一张离屏 canvas（用**标签自己的字号/字体**，见 `snapshot()`），
 * 再按 `block` 像素降采样到一张很小的 canvas，创建成 Phaser 贴图并 `NEAREST` 放大。
 * 所以看到的是「每个字被切成 6×6 的色块」，而不是糊掉的字。
 * 渐变分三段：粗块抖动（数据损坏）→ 从左往右按列换成新名字的块（数据覆写）→
 * 块变小一档（收敛）→ 交回真正的文字。
 *
 * ## 约定
 *
 * - 表现型：跳过/收尾必须 `destroy()`，不留图层（调用点在寝室的
 *   `clearDialoguePanel()` / `finishDialogue()` / `finishPrep()` / SHUTDOWN）。
 * - `reduced`（prefers-reduced-motion）：整段不演，名字直接是新值——没有闪、没有块。
 * - 随机只用 `src/dev/random.ts` 的 seed 流（同一 seed 复现同一串噪点块）。
 * - 时间线是纯数据 `NAME_RENAME_TIMELINE`，单测直接断言顺序与总时长。
 */

/** 抖动用到的「数据块」颜色：白 → 冷青 → 淡蓝，都是小白的语义色。 */
const GLITCH_COLORS = ['#ffffff', '#dff3ff', '#9fdcff'] as const;

export interface NameRenameFxOptions {
  readonly scene: Phaser.Scene;
  /** 说话人标签（`hud-kit` 的 `onSpeakerLabel` 交出来的那个）。 */
  readonly label: Label;
  readonly reduced?: boolean;
  readonly seed?: number;
  readonly from?: string;
  readonly to?: string;
}

/** 一块「被降采样的名字」：小 canvas + 贴图 + 放大后的 sprite。 */
interface Mosaic {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly texture: Phaser.Textures.CanvasTexture;
  readonly sprite: Phaser.GameObjects.Image;
}

let nextRigId = 1;

export class NameRenameFxRig {
  private readonly scene: Phaser.Scene;
  private readonly labelText: Phaser.GameObjects.Text;
  private readonly reduced: boolean;
  private readonly random: () => number;
  private readonly from: string;
  private readonly to: string;
  private readonly id = nextRigId++;

  /** 特效根容器：是 `Label` 的子对象，坐标即「文字左上角」（设计 px）。 */
  private readonly root: Phaser.GameObjects.Container;
  private readonly timers: Phaser.Time.TimerEvent[] = [];
  private readonly tweens: Phaser.Tweens.Tween[] = [];
  private readonly textureKeys: string[] = [];

  /** 两种名字各自的全分辨率临摹（用标签自己的字体画，见 `snapshot()`）。 */
  private readonly fullFrom: HTMLCanvasElement;
  private readonly fullTo: HTMLCanvasElement;
  /**
   * 全分辨率 canvas → 设计 px 的比例（Text 的 canvas 可能与显示尺寸不同）。
   *
   * **必须用临摹字自己的宽度算**：演出开始时 Compose 还没把新名字写进标签，
   * `labelText.width` 可能是 0（2026-11-27 实机踩过：ratio 变成整张画布宽，
   * 马赛克被缩成 1×1 像素的小方块，名字整段不见）。
   */
  private readonly ratio: number;
  private readonly width: number;
  private readonly height: number;

  /** 临摹字（粗马赛克里没有字的形态时先顶上，避免名字处空一拍）。 */
  private fromText: Phaser.GameObjects.Text | null = null;
  private mosaic: Mosaic | null = null;
  private disposed = false;

  constructor(options: NameRenameFxOptions) {
    this.scene = options.scene;
    this.labelText = options.label.textObject;
    this.reduced = options.reduced ?? false;
    this.random = mulberry32(hashSeed(`avm.rename:${options.seed ?? 0}`));
    this.from = options.from ?? NAME_RENAME_FROM;
    this.to = options.to ?? NAME_RENAME_TO;

    const fromSnapshot = this.snapshot(this.from);
    const toSnapshot = this.snapshot(this.to);
    this.fullFrom = fromSnapshot.canvas;
    this.fullTo = toSnapshot.canvas;
    this.ratio = this.fullFrom.width / Math.max(1, fromSnapshot.displayWidth);
    this.width = this.fullFrom.width / this.ratio;
    this.height = this.fullFrom.height / this.ratio;

    this.root = options.scene.add.container(0, 0);
    // 子对象加进 Label 容器：它自己的 `textObject` 就在 (0,0)，坐标天然对齐。
    options.label.add(this.root);

    // 先立起「白色小精灵」的临摹字，再把真字藏掉：切换不闪。
    this.fromText = this.newText(this.from);
    this.root.add(this.fromText);
    this.labelText.setAlpha(0);
  }

  /**
   * 开演。重复调用是空操作；`reduced` 下什么都不演（名字已经是新值）。
   *
   * 没有 `label` 的场景（战斗插入对话等）不会走到这里——调用方负责判空。
   */
  play(): void {
    if (this.disposed) return;
    if (this.reduced) {
      this.destroy();
      return;
    }
    const T = NAME_RENAME_TIMELINE;
    this.at(T.sweepDelay, () => this.startSweep());
    this.at(T.sweepDelay + T.sweep, () => {
      this.fromText?.setVisible(false);
      this.showMosaic(T.block);
      this.corrupt();
    });
    this.at(T.sweepDelay + T.sweep + T.corrupt, () => this.morph(0));
  }

  /** 收尾：还原标签、拆掉图层与贴图。跳过/切菜单/SHUTDOWN 都要调，重复调用无害。 */
  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const timer of this.timers) timer.remove();
    this.timers.length = 0;
    for (const tween of this.tweens) tween.remove();
    this.tweens.length = 0;
    if (this.labelText.scene) this.labelText.setAlpha(1);
    this.root.destroy(true);
    for (const key of this.textureKeys) {
      if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    }
    this.textureKeys.length = 0;
    this.fromText = null;
    this.mosaic = null;
  }

  // ── 演出分段 ───────────────────────────────────────────────────────────

  /** 白光从名字左侧扫到右侧：一条横向渐变亮带 + 一记短促的高光。 */
  private startSweep(): void {
    if (this.disposed) return;
    const sweepWidth = Math.max(96, this.width * 0.9);
    const height = this.height * 2.6;
    const key = `__avm.rename.${this.id}.sweep`;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.round(sweepWidth));
    canvas.height = Math.max(2, Math.round(height));
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
      gradient.addColorStop(0, 'rgba(255,255,255,0)');
      gradient.addColorStop(0.4, 'rgba(255,255,255,0.7)');
      gradient.addColorStop(0.58, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.72, 'rgba(214,243,255,0.75)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    const texture = this.scene.textures.addCanvas(key, canvas);
    if (!texture) return;
    texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.textureKeys.push(key);

    const sprite = this.scene.add
      .image(-sweepWidth * 0.6, this.height * 0.5, key)
      .setOrigin(0.5, 0.5)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0);
    this.root.add(sprite);

    const T = NAME_RENAME_TIMELINE;
    this.tweens.push(
      this.scene.tweens.add({
        targets: sprite,
        x: this.width + sweepWidth * 0.6,
        duration: T.sweep,
        ease: 'Cubic.easeIn',
      }),
    );
    this.tweens.push(
      this.scene.tweens.add({
        targets: sprite,
        alpha: { from: 0, to: 1 },
        duration: T.sweep * 0.45,
        yoyo: true,
        ease: 'Sine.easeOut',
        onComplete: () => {
          sprite.setVisible(false);
        },
      }),
    );
    // 真字被白光「擦掉」：临摹字轻微一亮，接着交棒给马赛克。
    const fromText = this.fromText;
    if (fromText) {
      this.tweens.push(
        this.scene.tweens.add({
          targets: fromText,
          alpha: { from: 1, to: 0.55 },
          duration: T.sweep,
          ease: 'Sine.easeIn',
        }),
      );
    }
  }

  /** 拆掉一层马赛克（贴图一起回收）；重复调用无害。 */
  private disposeMosaic(mosaic: Mosaic | null): void {
    if (!mosaic) return;
    mosaic.sprite.destroy();
    if (this.scene.textures.exists(mosaic.texture.key)) {
      this.scene.textures.remove(mosaic.texture.key);
    }
    const index = this.textureKeys.indexOf(mosaic.texture.key);
    if (index >= 0) this.textureKeys.splice(index, 1);
  }

  /**
   * 建立一层马赛克：把名字按 `block` 降采样成小 canvas，再 NEAREST 放大。
   *
   * `keepPrevious`：收敛那一步要把「粗块」淡出、同时淡入「细块」，
   * 所以不能一上来就把上一层拆掉（拆了就没有交叉淡入了）。
   */
  private showMosaic(block: number, keepPrevious = false): Mosaic | null {
    if (this.disposed) return null;
    const previous = this.mosaic;
    if (!keepPrevious) this.disposeMosaic(previous);
    this.mosaic = null;

    const source = this.fullFrom;
    const stepX = Math.max(1, Math.round(block * this.ratio));
    const sw = Math.max(2, Math.ceil(source.width / stepX));
    const sh = Math.max(2, Math.ceil(source.height / stepX));

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.imageSmoothingEnabled = false;

    const key = `__avm.rename.${this.id}.block${block}`;
    const texture = this.scene.textures.addCanvas(key, canvas);
    if (!texture) return null;
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.textureKeys.push(key);

    const sprite = this.scene.add
      .image(0, 0, key)
      .setOrigin(0, 0)
      .setScale(source.width / sw / this.ratio)
      .setAlpha(1);
    this.root.add(sprite);
    this.mosaic = { canvas, context, texture, sprite };
    this.drawMosaic('from', 0);
    return previous;
  }

  /** 把一整张名字画进小 canvas；`jitter`（小 canvas 像素）用来做横向错位。 */
  private drawMosaic(which: 'from' | 'to' | 'split', fraction = 0): void {
    const mosaic = this.mosaic;
    if (!mosaic) return;
    const { context: ctx, canvas: out } = mosaic;
    const from = this.fullFrom;
    const to = this.fullTo;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, out.width, out.height);
    if (which === 'from') {
      ctx.drawImage(from, 0, 0, from.width, from.height, 0, 0, out.width, out.height);
      return;
    }
    if (which === 'to') {
      ctx.drawImage(to, 0, 0, to.width, to.height, 0, 0, out.width, out.height);
      return;
    }
    // split：左边 fraction 已经换成新名字，右边还是旧名字（数据覆写）。
    const splitWidth = Math.round(out.width * Phaser.Math.Clamp(fraction, 0, 1));
    if (splitWidth > 0) {
      ctx.drawImage(to, 0, 0, to.width * fraction, to.height, 0, 0, splitWidth, out.height);
    }
    if (splitWidth < out.width) {
      ctx.drawImage(
        from,
        from.width * fraction,
        0,
        from.width * (1 - fraction),
        from.height,
        splitWidth,
        0,
        out.width - splitWidth,
        out.height,
      );
    }
  }

  /**
   * 随机亮块：让马赛克看起来是「数据在坏掉」，而不是单纯变糊。
   *
   * **只往字形上画**（先采这一块的 alpha）：撒在透明区会变成名字右边一串
   * 漂着的白点，像没擦干净的噪点（2026-11-27 实机第一次出来就是这样）。
   */
  private addNoise(count: number): void {
    const mosaic = this.mosaic;
    if (!mosaic) return;
    const { context: ctx, canvas } = mosaic;
    for (let i = 0; i < count * 4 && count > 0; i += 1) {
      const x = Math.floor(this.random() * canvas.width);
      const y = Math.floor(this.random() * canvas.height);
      let alpha = 0;
      try {
        alpha = ctx.getImageData(x, y, 1, 1).data[3] ?? 0;
      } catch {
        alpha = 0;
      }
      if (alpha < 40) continue;
      count -= 1;
      ctx.save();
      ctx.globalAlpha = 0.4 + this.random() * 0.5;
      ctx.fillStyle = GLITCH_COLORS[Math.floor(this.random() * GLITCH_COLORS.length)] ?? '#ffffff';
      ctx.fillRect(x, y, 1, 1 + Math.floor(this.random() * 2));
      ctx.restore();
    }
    mosaic.texture.refresh();
  }

  /** 粗块抖动：横向错位 + 随机亮块，一跳一跳地「坏掉」。 */
  private corrupt(): void {
    if (this.disposed) return;
    const T = NAME_RENAME_TIMELINE;
    const ticks = Math.max(1, Math.round(T.corrupt / T.glitchTick));
    for (let tick = 0; tick < ticks; tick += 1) {
      this.at(tick * T.glitchTick, () => {
        const mosaic = this.mosaic;
        if (!mosaic) return;
        const jitter = Math.round((this.random() - 0.5) * Math.max(1, mosaic.canvas.width * 0.12));
        const { context: ctx, canvas: out } = mosaic;
        const from = this.fullFrom;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, out.width, out.height);
        ctx.drawImage(from, 0, 0, from.width, from.height, jitter, 0, out.width, out.height);
        this.addNoise(1 + Math.floor(this.random() * 2));
      });
    }
  }

  /** 逐列覆写：从左往右把旧名字的块换成新名字的块，最后一步收敛到细块再交回文字。 */
  private morph(step: number): void {
    if (this.disposed) return;
    const T = NAME_RENAME_TIMELINE;
    const mosaic = this.mosaic;
    if (!mosaic) return;
    const fraction = (step + 1) / T.morphSteps;
    this.drawMosaic('split', fraction);
    // 覆写边界打一记短亮块，像扫描线推过去。
    const seam = Math.round(mosaic.canvas.width * fraction);
    if (step < T.morphSteps - 1 && seam > 0 && seam < mosaic.canvas.width) {
      mosaic.context.save();
      mosaic.context.globalAlpha = 0.85;
      mosaic.context.fillStyle = '#ffffff';
      mosaic.context.fillRect(seam - 1, 0, 1, mosaic.canvas.height);
      mosaic.context.restore();
    }
    this.addNoise(step < T.morphSteps - 1 ? 2 : 0);

    if (step < T.morphSteps - 1) {
      this.at(T.morphStep, () => this.morph(step + 1));
      return;
    }
    this.at(T.morphStep, () => this.refine());
  }

  /** 收敛：把块从 6 换到 3（同一张名字、更细一档），再交回真正的文字。 */
  private refine(): void {
    if (this.disposed) return;
    const T = NAME_RENAME_TIMELINE;
    const coarse = this.showMosaic(T.refineBlock, true);
    this.drawMosaic('to');
    const fine = this.mosaic;
    if (!fine) return;
    fine.texture.refresh();
    fine.sprite.setAlpha(0);
    if (coarse) {
      this.tweens.push(
        this.scene.tweens.add({
          targets: coarse.sprite,
          alpha: 0,
          duration: T.refine,
          ease: 'Sine.easeOut',
          onComplete: () => this.disposeMosaic(coarse),
        }),
      );
    }
    this.tweens.push(
      this.scene.tweens.add({
        targets: fine.sprite,
        alpha: { from: 0, to: 1 },
        duration: T.refine,
        ease: 'Sine.easeIn',
      }),
    );
    this.at(T.refine, () => this.reveal());
  }

  /** 交回真正的标签文字（此时 `dialogueSpeaker` 已经是「小白」），拆掉全部临摹层。 */
  private reveal(): void {
    if (this.disposed) return;
    const T = NAME_RENAME_TIMELINE;
    const mosaic = this.mosaic;
    if (mosaic) {
      this.tweens.push(
        this.scene.tweens.add({
          targets: mosaic.sprite,
          alpha: 0,
          duration: T.reveal,
          ease: 'Sine.easeIn',
        }),
      );
    }
    if (this.labelText.scene) {
      this.tweens.push(
        this.scene.tweens.add({
          targets: this.labelText,
          alpha: { from: 0, to: 1 },
          duration: T.reveal,
          ease: 'Sine.easeOut',
        }),
      );
    }
    this.at(T.reveal, () => this.destroy());
  }

  // ── 工具 ───────────────────────────────────────────────────────────────

  /** 用标签自己的字体画一张离屏临摹图（含 Phaser Text 自带的内边距，位置天然对齐）。 */
  private snapshot(text: string): { canvas: HTMLCanvasElement; displayWidth: number } {
    const style = this.labelText.style;
    const temp = this.scene.make.text(
      {
        x: 0,
        y: 0,
        text,
        style: {
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontStyle: style.fontStyle,
          color: style.color,
          align: 'left',
        },
      },
      false,
    );
    const source = temp.canvas;
    const displayWidth = temp.width;
    const copy = document.createElement('canvas');
    copy.width = Math.max(1, source.width);
    copy.height = Math.max(1, source.height);
    const ctx = copy.getContext('2d');
    if (ctx) ctx.drawImage(source, 0, 0);
    temp.destroy();
    return { canvas: copy, displayWidth };
  }

  /** 生成一个与标签同款的临摹字（演出期间顶上真字的位置）。 */
  private newText(text: string): Phaser.GameObjects.Text {
    const style = this.labelText.style;
    return this.scene.add.text(0, 0, text, {
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontStyle: style.fontStyle,
      color: style.color,
      align: 'left',
    });
  }

  private at(delayMs: number, run: () => void): void {
    this.timers.push(
      this.scene.time.delayedCall(Math.max(0, delayMs), () => {
        if (this.disposed) return;
        run();
      }),
    );
  }
}
