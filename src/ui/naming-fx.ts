import Phaser from 'phaser';
import { hashSeed, mulberry32 } from '../dev/random';
import { LAYERS } from '../render/layers';

/**
 * 「命名小白」那一段的**光雾运算**演出（原生层，即用即弃）。
 *
 * 剧本：
 * ```
 * 小白：小白……
 * 旁白：这白色的小家伙似乎陷入了思索，银白色的光雾瞬间在小天使头顶剧烈翻涌，
 *       凝聚成几个不断扭曲、坍塌的复杂数学符号，又猛地消散。
 * 小白：……采纳此命名造成的效率损失……处于可容忍阈值内。
 * 旁白：光雾平息。小天使平静地悬浮着。
 * ```
 *
 * 为什么不用全屏 CG：这一段的主角是**悬浮在寝室里的一只 43px 小精灵**，
 * 整屏 CG 会把房间、光照、角色比例全换掉（2026-11-26 那版命名 CG 就是这个毛病，
 * 用户随即回滚）。这里全部做成 in-scene 的原生层：光雾、符号、光晕都围着她头顶，
 * 镜头、寝室、角色构图一格不动，跳过后也不留下任何东西。
 *
 * 三拍（对应三条行 cue，全部是表现型）：
 * - `flourish`：光雾翻涌 + 符号由淡到亮地凝聚成环；
 * - `collapse`：符号被吸向中心、扭曲坍塌，光雾被搅动；
 * - `settle`：光雾散开淡出、光晕收回——「光雾平息」。
 *
 * 预算：16 团雾 + 10 个符号 + 1 层光晕 = 27 个 GameObject（`FX_MAX_OBJECTS` 40 以内）。
 * 全部贴图都是 canvas 径向渐变（不是同心圆 Graphics，不会出色带），按 key 复用。
 * `reduced`（prefers-reduced-motion）：保留静态光雾与符号环，只做淡入淡出。
 */

const MIST_TEXTURE = '__avm.naming.mist';
const HALO_TEXTURE = '__avm.naming.halo';

/** 符号表：都是「数学感」而不是「乱码感」的字形，Georgia/serif 都有。 */
const GLYPHS = ['Σ', '∫', '∂', '∞', '≠', '√', 'ℏ', 'π', '∑', '∇'] as const;

const PUFF_COUNT = 18;

/** 符号环的半径（设计像素）：中心留出小白的头顶。 */
const GLYPH_RING = { min: 36, max: 92 } as const;

export interface NamingFxOptions {
  readonly scene: Phaser.Scene;
  /** 场景里那只小白（贴图已经加载、已经显示）。 */
  readonly xiaobai: Phaser.GameObjects.Image;
  readonly reduced?: boolean;
  readonly seed?: number;
}

export class NamingFxRig {
  private readonly scene: Phaser.Scene;
  private readonly xiaobai: Phaser.GameObjects.Image;
  private readonly reduced: boolean;
  private readonly random: () => number;
  /** 光雾锚点：小白头顶上方一点（不跟随 bob，短时间看不出差）。 */
  private readonly anchor: { readonly x: number; readonly y: number };

  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private readonly tweens: Phaser.Tweens.Tween[] = [];
  private readonly timers: Phaser.Time.TimerEvent[] = [];
  private puffs: Phaser.GameObjects.Image[] = [];
  private glyphLayer: Phaser.GameObjects.Container | null = null;
  private glyphs: Phaser.GameObjects.Text[] = [];
  private halo: Phaser.GameObjects.Image | null = null;

  private active = false;
  private disposed = false;

  constructor(options: NamingFxOptions) {
    this.scene = options.scene;
    this.xiaobai = options.xiaobai;
    this.reduced = options.reduced ?? false;
    this.random = mulberry32(hashSeed(`avm.naming:${options.seed ?? 0}`));
    this.anchor = { x: this.xiaobai.x, y: this.xiaobai.y - 34 };
  }

  /** 光雾翻涌 + 符号凝聚。重复调用是空操作。 */
  flourish(): void {
    if (this.disposed || this.active) return;
    this.active = true;
    this.ensureTextures();
    this.buildHalo();
    this.buildPuffs();
    this.buildGlyphs();
  }

  /** 符号被吸向中心、扭曲坍塌（「又猛地消散」）。幂等。 */
  collapse(): void {
    if (this.disposed || !this.active) return;
    const layer = this.glyphLayer;
    if (layer) {
      // 先停掉环的整体旋转，否则 tween 会跟「吸向中心」抢 x/y。
      this.scene.tweens.killTweensOf(layer);
    }
    this.glyphs.forEach((glyph, index) => {
      this.scene.tweens.killTweensOf(glyph);
      if (this.reduced) {
        glyph.setAlpha(0);
        return;
      }
      this.addTween(
        this.scene.tweens.add({
          targets: glyph,
          x: glyph.x * 0.16,
          y: glyph.y * 0.16,
          scale: 0.2,
          angle: glyph.angle + 70,
          alpha: 0,
          duration: 280 + index * 16,
          delay: index * 14,
          ease: 'Back.easeIn',
        }),
      );
    });
    // 光雾被搅动：向外鼓一圈再收，别让「坍塌」只发生在符号上。
    if (!this.reduced) {
      this.puffs.forEach((puff, index) => {
        this.scene.tweens.killTweensOf(puff);
        const dx = puff.x + (this.random() - 0.5) * 26;
        const dy = puff.y - 6 - this.random() * 18;
        this.addTween(
          this.scene.tweens.add({
            targets: puff,
            x: dx,
            y: dy,
            scale: puff.scale * 1.12,
            alpha: Math.min(0.42, puff.alpha + 0.1),
            duration: 240 + index * 12,
            ease: 'Sine.easeOut',
          }),
        );
      });
    }
  }

  /** 光雾平息：整束雾散开淡出、光晕收回，随后自毁。幂等。 */
  settle(): void {
    if (this.disposed || !this.active) return;
    this.active = false;
    const fade = this.reduced ? 0 : 300;
    for (const puff of this.puffs) {
      this.scene.tweens.killTweensOf(puff);
      this.addTween(
        this.scene.tweens.add({
          targets: puff,
          alpha: 0,
          scale: puff.scale * (this.reduced ? 1 : 1.35),
          duration: fade,
          ease: 'Sine.easeOut',
        }),
      );
    }
    if (this.halo) {
      this.scene.tweens.killTweensOf(this.halo);
      this.addTween(
        this.scene.tweens.add({
          targets: this.halo,
          alpha: 0,
          scale: this.halo.scale * 1.1,
          duration: fade,
          ease: 'Sine.easeOut',
        }),
      );
    }
    this.timers.push(
      this.scene.time.delayedCall(fade + 60, () => {
        this.destroy();
      }),
    );
  }

  /** 立刻拆干净（跳过 / 收尾 / 场景 shutdown）。幂等。 */
  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.active = false;
    for (const timer of this.timers) timer.remove();
    this.timers.length = 0;
    for (const tween of this.tweens) tween.remove();
    this.tweens.length = 0;
    for (const object of this.objects) {
      if (object.active) object.destroy();
    }
    this.objects.length = 0;
    this.puffs = [];
    this.glyphs = [];
    this.glyphLayer = null;
    this.halo = null;
  }

  // ---------------------------------------------------------------- 建层

  private buildHalo(): void {
    const halo = this.scene.add
      .image(this.xiaobai.x, this.xiaobai.y, HALO_TEXTURE)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(LAYERS.effects - 5)
      .setScale(0.86)
      .setAlpha(0);
    this.halo = halo;
    this.objects.push(halo);
    if (this.reduced) {
      halo.setAlpha(0.2);
      return;
    }
    this.addTween(
      this.scene.tweens.add({
        targets: halo,
        alpha: { from: 0, to: 0.2 },
        scale: { from: 0.86, to: 1.1 },
        duration: 520,
        ease: 'Sine.easeOut',
        yoyo: true,
        repeat: -1,
        hold: 180,
      }),
    );
  }

  /**
   * 光雾：一团团软白雾从头顶升起、边升边散。
   *
   * 位置/尺寸/时长的随机全部来自固定 seed（`src/dev/random.ts`），
   * 同一局重播这段时雾形一致，不会每次长得不一样。
   */
  private buildPuffs(): void {
    const { scene, anchor, random, reduced } = this;
    for (let i = 0; i < PUFF_COUNT; i += 1) {
      // 雾团铺得比符号环更宽：贴近头顶的一团最亮，往上越来越淡、越来越大。
      // 铺开成一根「雾柱」：太窄的话 18 团雾会叠成一颗白灯泡（实测）。
      const spread = 112;
      const startX = anchor.x + (random() - 0.5) * spread;
      const startY = anchor.y - 10 + random() * 18;
      const puff = scene.add
        .image(startX, startY, MIST_TEXTURE)
        // 偏冷的天蓝：寝室里本来就有一道暖色窗光（`addLightShaft`），纯白雾叠上去
        // 会和窗光糊成一团暖白光斑，反而看不出「银白色的光雾」。
        .setTint(0xcfe4ff)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(LAYERS.effects + 6)
        .setScale(0.7 + random() * 0.96)
        .setAngle(random() * 360)
        .setAlpha(0);
      this.puffs.push(puff);
      this.objects.push(puff);

      // 单团雾很淡（ADD 叠在一起才成形）：太亮会变成一颗白灯泡，把小白吃掉。
      const peak = 0.055 + random() * 0.075;
      const rise = 84 + random() * 92;
      const drift = (random() - 0.5) * 84;
      if (reduced) {
        // 静态构图：雾停在头顶，不升不散（信息还在，运动去掉）。
        puff.setPosition(startX + drift * 0.3, startY - rise * 0.35).setAlpha(peak);
        continue;
      }
      this.addTween(
        scene.tweens.add({
          targets: puff,
          x: startX + drift,
          y: startY - rise,
          angle: puff.angle + (random() - 0.5) * 120,
          scale: puff.scale * (1.15 + random() * 0.35),
          alpha: { from: 0, to: peak },
          duration: 760 + random() * 620,
          delay: i * 34,
          ease: 'Sine.easeOut',
          yoyo: true,
          hold: 120,
          repeat: -1,
        }),
      );
    }
  }

  /** 符号环：一圈数学符号绕头顶缓慢转，坍塌时被吸向中心。 */
  private buildGlyphs(): void {
    const { scene, anchor, random, reduced } = this;
    const layer = scene.add.container(anchor.x, anchor.y - 14).setDepth(LAYERS.effects + 10);
    this.glyphLayer = layer;
    this.objects.push(layer);

    for (const [i, glyphText] of GLYPHS.entries()) {
      const angle = (i / GLYPHS.length) * Math.PI * 2 + (random() - 0.5) * 0.22;
      const radius = GLYPH_RING.min + random() * (GLYPH_RING.max - GLYPH_RING.min);
      const size = 30 + Math.round(random() * 14);
      const glyph = scene.add
        .text(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.74, glyphText, {
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: `${size}px`,
          color: '#f4f9ff',
          stroke: '#1b2738',
          strokeThickness: 3,
          align: 'center',
        })
        .setOrigin(0.5)
        .setResolution(2)
        // 符号用普通混合 + 深色描边：ADD 叠在暖木头上会糊成一片白。
        .setShadow(0, 0, '#9cc6ff', 14, true, true)
        .setAngle(-14 + random() * 28)
        .setAlpha(0);
      layer.add(glyph);
      this.glyphs.push(glyph);

      const spin = (random() - 0.5) * 36;
      if (reduced) {
        glyph.setAlpha(0.9);
        continue;
      }
      this.addTween(
        scene.tweens.add({
          targets: glyph,
          alpha: { from: 0, to: 0.92 },
          scale: { from: 0.55, to: 1 },
          angle: glyph.angle + spin,
          duration: 340 + random() * 220,
          delay: i * 55,
          ease: 'Sine.easeOut',
        }),
      );
      // 每张符号自己轻轻呼吸，避免整圈像一张静止贴图。
      this.addTween(
        scene.tweens.add({
          targets: glyph,
          scale: 1.12,
          duration: 620 + random() * 320,
          delay: 400 + i * 55,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        }),
      );
    }

    if (!reduced) {
      this.addTween(
        scene.tweens.add({
          targets: layer,
          angle: 26,
          duration: 1600,
          ease: 'Sine.easeInOut',
          yoyo: true,
          repeat: -1,
        }),
      );
    }
  }

  private addTween(tween: Phaser.Tweens.Tween): void {
    this.tweens.push(tween);
  }

  /**
   * 两张 canvas 径向渐变贴图：雾团与光晕。
   *
   * 用贴图而不是一叠同心圆 Graphics：同心圆在软边缘上会露色带（黑场胁迫 v1 踩过）。
   */
  private ensureTextures(): void {
    const { scene } = this;
    if (!scene.textures.exists(MIST_TEXTURE)) {
      const texture = scene.textures.createCanvas(MIST_TEXTURE, 128, 128);
      if (texture) {
        const ctx = texture.context;
        const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        gradient.addColorStop(0, 'rgba(238, 246, 255, 0.85)');
        gradient.addColorStop(0.42, 'rgba(206, 226, 255, 0.34)');
        gradient.addColorStop(1, 'rgba(170, 200, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 128, 128);
        texture.refresh();
      }
    }
    if (!scene.textures.exists(HALO_TEXTURE)) {
      const texture = scene.textures.createCanvas(HALO_TEXTURE, 192, 192);
      if (texture) {
        const ctx = texture.context;
        const gradient = ctx.createRadialGradient(96, 96, 0, 96, 96, 96);
        gradient.addColorStop(0, 'rgba(226, 240, 255, 0.62)');
        gradient.addColorStop(0.5, 'rgba(168, 202, 255, 0.22)');
        gradient.addColorStop(1, 'rgba(120, 160, 230, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 192, 192);
        texture.refresh();
      }
    }
  }
}
