import Phaser from 'phaser';
import { getViewportPlan } from '../app/viewport';
import { CH01_ASSET_KEYS, PALACE_ASSET_KEYS } from '../assets/keys';
import { audioDirector, type LoopHandle } from '../audio/audio-director';
import { hashSeed, mulberry32 } from '../dev/random';
import { LAYERS } from '../render/layers';
import {
  DARK_BEATS,
  darkBeatAdvances,
  isDarkRelease,
  type DarkBeat,
  type DarkBeatSpec,
} from '../story/ch01-dark-scene';
import type { PlayerActor } from '../actors/player-actor';

/**
 * 战后黑场胁迫段的表现层：「小白压制周全」的暗场演出。
 *
 * 分工（和 `src/story/ch01-dark-scene.ts` 一起看）：
 * - 剧本只在台词行上写**哪一拍**（`dark: 'grip'`）；
 * - 纯数据表决定每一拍多黑/多紧/心跳多快（`DARK_BEATS`）；
 * - 这里只负责把数值画出来：冷光池、小白光晕与逼近、灵能缚环、屏幕压边、
 *   周全被压下去、心跳脉冲、压底噪与一次性音效。
 *
 * 三条硬约束：
 * 1. **不碰 `cameras.main.zoom`**：过场里 zoom 会把 Compose 对话框一起放大（见 `docs/RENDER-LAYERS.md`）；
 *    压迫感用光、压边、震屏、角色下沉做，全部走设计坐标。
 * 2. **全部可逆**：`release()` / `destroy()` 必须把小白的位移缩放、周全的位移缩放、
 *    循环音、心跳定时器、tween 全部收回去。场景 `finishDialogue()`（含跳过）无条件调用。
 * 3. **reduced 只留信息层**：冷光/缚环/压边/放大照做但**瞬间到位**；
 *    震屏、心跳脉冲、灵能粒子、符环扫开这些运动全部跳过。
 *
 * 为什么屏幕语言用「冷光压边」而不是「黑边收拢」：这一段世界层已经是黑的，
 * 黑边/暗角压在黑上等于没有。只有**亮的东西**在收拢，玩家才看得见画面被夹住。
 */

export interface DarkPressureOptions {
  readonly scene: Phaser.Scene;
  readonly player: PlayerActor;
  readonly xiaobai: Phaser.GameObjects.Image;
  readonly reduced: boolean;
}

/** `ch01_dark_heartbeat.mp3` 一组（两记）的时长，见 `scheduleHeartbeat()`。 */
const HEART_GROUP_MS = 1250;

/** 小白原显示缩放是场景定的 0.45（像素图）；这里只做倍数换算。 */
const XIAOBAI_BASE_SCALE = 0.45;

/** 演出用的视觉抖动：固定 seed，重开这一段画面一致（AGENTS §2.14 的随机口径）。 */
const visualRandom = mulberry32(hashSeed('avm.dark-pressure'));

const PALETTE = {
  /** 冷光池：暗场里唯一的光源感（深海军蓝，不是灰白）。 */
  pool: 0x1b2a44,
  /** 灵能压边/冷光。 */
  cold: 0x9dc4ff,
  /** 灵能缚环。 */
  bind: 0xcadfff,
  vignette: 0x080512,
  blood: 0x4a1018,
} as const;

export class DarkPressureRig {
  private readonly scene: Phaser.Scene;
  private readonly player: PlayerActor;
  private readonly xiaobai: Phaser.GameObjects.Image;
  private readonly reduced: boolean;
  private readonly designWidth: number;
  private readonly designHeight: number;

  private activeValue = false;
  private currentBeat: DarkBeat | null = null;

  /** 小白的原始构图：收尾要原样还回去（它是场景的常驻对象，不是这个 rig 建的）。 */
  private readonly xiaobaiBase: { x: number; y: number; scale: number; alpha: number };
  /** 周全的原始构图（同理）。 */
  private readonly playerBase: { x: number; y: number; scaleX: number; scaleY: number } | null;
  /** 缚环中心（躯干）：每拍都按玩家当前位置重算，免得站位变化后环套空。 */
  private bodyCenter: { x: number; y: number };

  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private readonly tweens: Phaser.Tweens.Tween[] = [];

  private haze: Phaser.GameObjects.Image | null = null;
  private aura: Phaser.GameObjects.Image | null = null;
  /** 光晕贴图在 `displaySize` 下的基准缩放（tween 放大时在它上面乘倍数）。 */
  private auraBaseScale = 1;
  /** 冷光池的基准缩放：压迫越重，光池收得越小越暗（光被小白吸走）。 */
  private hazeBaseScale = { x: 1, y: 1 };
  private motes: Phaser.GameObjects.Container | null = null;
  private bind: Phaser.GameObjects.Graphics | null = null;
  private rimSides: Phaser.GameObjects.Image[] = [];
  private vignette: Phaser.GameObjects.Image | null = null;
  private redPulse: Phaser.GameObjects.Rectangle | null = null;

  private drone: LoopHandle | null = null;
  private heartTimer: Phaser.Time.TimerEvent | null = null;
  /** 上一记心跳的实例：新的一记起来前先淡掉旧的，避免 3 层叠成心律不齐。 */
  private heartSound: Phaser.Sound.BaseSound | null = null;
  private heartbeatBpm = 0;
  private vignetteAlpha = 0;

  constructor(options: DarkPressureOptions) {
    this.scene = options.scene;
    this.player = options.player;
    this.xiaobai = options.xiaobai;
    this.reduced = options.reduced;
    const plan = getViewportPlan();
    this.designWidth = plan.designWidth;
    this.designHeight = plan.designHeight;

    const head = this.player.headPoint;
    this.bodyCenter = { x: head.x, y: head.y + 74 };

    this.xiaobaiBase = {
      x: this.xiaobai.x,
      y: this.xiaobai.y,
      scale: this.xiaobai.scale,
      alpha: this.xiaobai.alpha,
    };
    const display = this.player.display;
    this.playerBase =
      display === null
        ? null
        : { x: display.x, y: display.y, scaleX: display.scaleX, scaleY: display.scaleY };

    this.buildLayers();
  }

  get isActive(): boolean {
    return this.activeValue;
  }

  get beat(): DarkBeat | null {
    return this.currentBeat;
  }

  // ---------------------------------------------------------------- 建层

  /**
   * 一次建好所有图层（都已 alpha 0），后面只改透明度/尺寸，不反复 new。
   *
   * depth 口径（黑幕在 `LAYERS.fog + 10`）：冷光池与光晕夹在「黑幕之上、角色之下」；
   * 缚环/压边/暗角/血脉冲在 `LAYERS.cinematic` 一带——都在 Compose UI 之下。
   */
  private buildLayers(): void {
    const { scene } = this;
    const center = this.bodyCenter;

    /**
     * 冷光池：**径向渐变贴图**，不是一圈圈 Graphics。
     *
     * v1 用 20 层同心圆，叠出来能看到一圈圈色带（像灰白聚光灯，还带波纹）；
     * 这里改成 256×256 的 canvas 径向渐变，拉伸成扁椭圆，边缘天然是软的。
     */
    const poolSize = { w: 760, h: 620 };
    this.haze = scene.add
      .image(center.x, center.y, this.radialTexture('__avm.dark.pool', [
        [0, 'rgba(46, 68, 104, 0.92)'],
        [0.45, 'rgba(30, 46, 74, 0.55)'],
        [0.78, 'rgba(18, 28, 46, 0.22)'],
        [1, 'rgba(10, 16, 28, 0)'],
      ]))
      .setDisplaySize(poolSize.w, poolSize.h)
      .setDepth(LAYERS.fog + 15)
      .setAlpha(0);
    this.hazeBaseScale = { x: poolSize.w / 256, y: poolSize.h / 256 };
    this.objects.push(this.haze);

    const auraSize = 320;
    this.aura = scene.add
      .image(this.xiaobai.x, this.xiaobai.y, this.radialTexture('__avm.dark.aura', [
        [0, 'rgba(216, 236, 255, 0.55)'],
        [0.5, 'rgba(170, 200, 255, 0.22)'],
        [1, 'rgba(120, 160, 230, 0)'],
      ]))
      .setDisplaySize(auraSize, auraSize)
      .setDepth(LAYERS.fog + 20)
      .setAlpha(0);
    this.auraBaseScale = auraSize / 256;
    this.objects.push(this.aura);

    if (!this.reduced) {
      // 灵能粒子：绕着小白缓缓上浮，溶解在黑暗里。
      const container = scene.add.container(0, 0).setDepth(LAYERS.effects - 10).setAlpha(0);
      for (let i = 0; i < 12; i += 1) {
        const circle = scene.add.circle(0, 0, 1 + visualRandom() * 1.6, 0xcfe4ff, 0.85);
        container.add(circle);
        this.objects.push(circle);
        this.tweens.push(
          scene.tweens.add({
            targets: circle,
            alpha: { from: 0.85, to: 0 },
            duration: 1400 + visualRandom() * 1200,
            repeat: -1,
            delay: visualRandom() * 1200,
            onRepeat: () => {
              circle.setPosition(
                this.xiaobai.x + (visualRandom() - 0.5) * 90,
                this.xiaobai.y + 20 + visualRandom() * 40,
              );
              circle.setAlpha(0.85);
            },
            onStart: () => {
              circle.setPosition(
                this.xiaobai.x + (visualRandom() - 0.5) * 90,
                this.xiaobai.y + 20 + visualRandom() * 40,
              );
            },
          }),
        );
      }
      this.motes = container;
      this.objects.push(container);
    }

    // 灵能缚环：画在躯干中心，靠 scale 收拢 = 「无形的手越攥越紧」。
    this.bind = scene.add
      .graphics()
      .setDepth(LAYERS.cinematic - 100)
      .setPosition(center.x, center.y)
      .setAlpha(0);
    this.objects.push(this.bind);

    /**
     * 屏幕压边：四张线性渐变贴图贴着四边，厚度随 `squeeze` 变厚。
     *
     * 黑场里黑色压在黑色上等于没画（v1 的黑边就是这么消失的），所以用亮的冷光；
     * 但也不能画成四根线或一叠矩形条：那会露出色带/像相框（v2/v3 实测都是这个毛病）。
     * 线性渐变的过渡交给 canvas 做，边缘是真正软的。
     */
    const hKey = this.linearEdgeTexture('__avm.dark.edge.h', 'horizontal');
    const vKey = this.linearEdgeTexture('__avm.dark.edge.v', 'vertical');
    const edgeThickness = 40;
    const sides: Array<{
      x: number;
      y: number;
      key: string;
      origin: [number, number];
      flipX?: boolean;
      flipY?: boolean;
      vertical: boolean;
    }> = [
      { x: 0, y: 0, key: hKey, origin: [0, 0], vertical: false },
      { x: this.designWidth, y: 0, key: hKey, origin: [1, 0], flipX: true, vertical: false },
      { x: 0, y: 0, key: vKey, origin: [0, 0], vertical: true },
      { x: 0, y: this.designHeight, key: vKey, origin: [0, 1], flipY: true, vertical: true },
    ];
    for (const side of sides) {
      const image = scene.add
        .image(side.x, side.y, side.key)
        .setOrigin(...side.origin)
        .setFlipX(side.flipX === true)
        .setFlipY(side.flipY === true)
        .setDisplaySize(
          side.vertical ? this.designWidth : edgeThickness,
          side.vertical ? edgeThickness : this.designHeight,
        )
        .setDepth(LAYERS.cinematic + 10)
        .setAlpha(0);
      this.rimSides.push(image);
      this.objects.push(image);
    }

    /**
     * 暗角：同样用径向渐变贴图。
     *
     * v1 复刻了 `fx-kit.addVignette` 的 72 带分带画法：压在冷光池上能看见一圈圈竖向条纹
     * （8-bit alpha 量化 + 硬边界），像给画面加了扫描线。渐变贴图没有这个问题。
     */
    this.vignette = scene.add
      .image(this.designWidth / 2, this.designHeight / 2, this.radialTexture('__avm.dark.vignette', [
        [0, 'rgba(8, 5, 18, 0)'],
        [0.55, 'rgba(8, 5, 18, 0.12)'],
        [0.82, 'rgba(8, 5, 18, 0.5)'],
        [1, 'rgba(8, 5, 18, 0.92)'],
      ]))
      .setDisplaySize(this.designWidth, this.designHeight)
      .setDepth(LAYERS.cinematic)
      .setAlpha(0);
    this.objects.push(this.vignette);

    this.redPulse = scene.add
      .rectangle(0, 0, this.designWidth, this.designHeight, PALETTE.blood, 0)
      .setOrigin(0, 0)
      .setDepth(LAYERS.cinematic + 5);
    this.objects.push(this.redPulse);
  }

  /**
   * 取（或建）一张 256×256 的径向渐变贴图。
   *
   * 走 canvas 纹理而不是 Graphics 同心圆：渐变的颜色过渡由浏览器做，没有可见色带。
   * key 固定、存在就复用——同一场重进不会反复建纹理。
   */
  private radialTexture(key: string, stops: readonly (readonly [number, string])[]): string {
    if (!this.scene.textures.exists(key)) {
      const texture = this.scene.textures.createCanvas(key, 256, 256);
      if (texture) {
        const ctx = texture.context;
        const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
        for (const [position, color] of stops) gradient.addColorStop(position, color);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 256, 256);
        texture.refresh();
      }
    }
    return key;
  }

  /** 贴图：从冷光色到透明的线性渐变（横/竖各一张），用来做软压边。 */
  private linearEdgeTexture(key: string, orientation: 'horizontal' | 'vertical'): string {
    if (!this.scene.textures.exists(key)) {
      const horizontal = orientation === 'horizontal';
      const texture = this.scene.textures.createCanvas(key, horizontal ? 64 : 1, horizontal ? 1 : 64);
      if (texture) {
        const ctx = texture.context;
        const gradient = horizontal
          ? ctx.createLinearGradient(0, 0, 64, 0)
          : ctx.createLinearGradient(0, 0, 0, 64);
        gradient.addColorStop(0, 'rgba(157, 196, 255, 0.95)');
        gradient.addColorStop(0.35, 'rgba(120, 160, 230, 0.45)');
        gradient.addColorStop(1, 'rgba(90, 130, 200, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, horizontal ? 64 : 1, horizontal ? 1 : 64);
        texture.refresh();
      }
    }
    return key;
  }

  // ---------------------------------------------------------------- 开始 / 每一拍

  /** 进入黑场：冷光池/粒子淡入，压迫底噪起，心跳起。 */
  start(): void {
    if (this.activeValue) return;
    this.activeValue = true;

    this.scene.tweens.add({
      targets: this.haze,
      alpha: 1,
      duration: this.reduced ? 0 : 620,
      ease: 'Sine.easeOut',
    });
    if (this.motes) {
      this.scene.tweens.add({
        targets: this.motes,
        alpha: 1,
        duration: this.reduced ? 0 : 700,
        ease: 'Sine.easeOut',
      });
    }

    this.drone = audioDirector.playLoop(CH01_ASSET_KEYS.audio.darkPressure, { volume: 0 });
    if (this.drone) {
      this.scene.tweens.add({
        targets: this.drone.sound,
        volume: this.reduced ? 0.42 : 0,
        duration: 760,
        ease: 'Sine.easeOut',
      });
    }
    // 黑场降临的一记「空气被抽走」：低频 whoosh，压在半场，让转黑有重量。
    audioDirector.playSfxAt(PALACE_ASSET_KEYS.sfx.whoosh, {
      volume: this.reduced ? 0.16 : 0.3,
      rate: 0.78,
    });
  }

  /**
   * 演一拍。
   *
   * 病态输入（剧本被改成往回退）按「不演」处理：宁可少一拍，也不要让画面在半句话里松开。
   */
  play(beat: DarkBeat): void {
    if (isDarkRelease(beat)) {
      if (this.activeValue) this.release();
      return;
    }
    if (!this.activeValue) this.start();
    if (!darkBeatAdvances(this.currentBeat, beat)) return;
    this.currentBeat = beat;
    const spec = DARK_BEATS[beat];

    this.setVignette(spec.vignette);
    this.setRim(spec);
    this.dimHaze(spec);
    this.moveXiaobai(spec);
    this.setBind(spec.bind);
    this.sinkPlayer(spec.sinkPx);
    this.setHeartbeat(spec.heartbeatBpm);
    this.setDrone(spec.drone);

    if (spec.shake && !this.reduced) {
      this.scene.cameras.main.shake(spec.shake.ms, spec.shake.intensity);
    }
    if (spec.sealRing) this.spawnSealRing();
    if (spec.redPulse) this.flashBlood(0.16);
    if (beat === 'crush') {
      this.crushImpact();
      this.flickerAura();
    }
    this.playSting(spec);
  }

  /** 灵能输出过载：小白的光晕抖两下（只动 alpha，不改构图）。 */
  private flickerAura(): void {
    const aura = this.aura;
    if (!aura || this.reduced) return;
    // 等 `moveXiaobai` 的 480ms 位移/alpha tween 收完再抖，否则两个 tween 抢同一个 alpha。
    this.scene.time.delayedCall(420, () => {
      this.scene.tweens.add({
        targets: aura,
        alpha: 0.55,
        duration: 80,
        yoyo: true,
        repeat: 2,
        ease: 'Sine.easeInOut',
      });
    });
  }

  /**
   * 惨叫那一拍的「重击」：冷白一闪 + 三下短震 + 角色泛红。
   *
   * 只靠数据表里那一记 420ms 的震屏太温：这里叠三下 140ms 间隔的短震，
   * 再给周全的贴图加一层红（Q 版平涂上色很干净），像是血液被攥住。
   */
  private crushImpact(): void {
    if (this.reduced) return;
    const camera = this.scene.cameras.main;
    camera.flash(150, 34, 52, 96);
    for (let i = 1; i <= 3; i += 1) {
      this.scene.time.delayedCall(i * 140, () => camera.shake(180, 0.008));
    }
    const display = this.player.display;
    display?.setTint(0xffb4b4);
  }

  /** 收尾：淡出所有图层、停循环音与心跳、把角色构图还回去。 */
  release(): void {
    if (!this.activeValue) return;
    this.activeValue = false;
    this.currentBeat = null;
    this.stopHeartbeat();
    this.fadeDrone();

    const targets = [this.haze, this.aura, this.bind, this.vignette, this.redPulse, ...this.rimSides];
    this.scene.tweens.add({
      targets,
      alpha: 0,
      duration: this.reduced ? 0 : 260,
      ease: 'Sine.easeOut',
    });
    this.restoreActors(this.reduced ? 0 : 260);

    this.scene.time.delayedCall(this.reduced ? 0 : 320, () => this.dispose());
  }

  /** 立刻拆干净（场景 shutdown / 重开 / 跳过收尾）。幂等。 */
  destroy(): void {
    this.activeValue = false;
    this.currentBeat = null;
    this.stopHeartbeat();
    this.stopDrone();
    this.restoreActors(0);
    this.dispose();
  }

  // ---------------------------------------------------------------- 数值 → 画面

  private setVignette(target: number): void {
    const graphics = this.vignette;
    if (!graphics) return;
    this.vignetteAlpha = target;
    this.scene.tweens.killTweensOf(graphics);
    this.scene.tweens.add({
      targets: graphics,
      alpha: target,
      duration: this.reduced ? 0 : 420,
      ease: 'Sine.easeOut',
    });
  }

  /**
   * 压迫越重，冷光池越暗越小：光像是被小白吸过去，画面只剩她一个光源。
   *
   * 只调 alpha/scale，不改贴图；收尾由 `release()` 统一淡出。
   */
  private dimHaze(spec: DarkBeatSpec): void {
    const haze = this.haze;
    if (!haze) return;
    const t = Math.max(0, Math.min(1, spec.vignette / 0.72));
    this.scene.tweens.killTweensOf(haze);
    this.scene.tweens.add({
      targets: haze,
      alpha: 1 - t * 0.55,
      scaleX: this.hazeBaseScale.x * (1 - t * 0.22),
      scaleY: this.hazeBaseScale.y * (1 - t * 0.22),
      duration: this.reduced ? 0 : 520,
      ease: 'Sine.easeOut',
    });
  }

  /**
   * 把压边厚度映射到四张贴图的尺寸（越紧越厚、越亮）。
   *
   * 贴图用 `setDisplaySize` 拉伸：宽度就是「被夹进来多少」，不会出现色带。
   */
  private setRim(spec: DarkBeatSpec): void {
    const inset = spec.squeeze * this.designWidth;
    const thickness = 26 + inset * 1.7;
    const strength = 0.16 + spec.squeeze * 1.3 + spec.vignette * 0.18;
    const sizes = [
      { w: thickness, h: this.designHeight },
      { w: thickness, h: this.designHeight },
      { w: this.designWidth, h: thickness },
      { w: this.designWidth, h: thickness },
    ];
    this.rimSides.forEach((image, index) => {
      const size = sizes[index];
      if (!size) return;
      image.setDisplaySize(size.w, size.h);
      this.scene.tweens.killTweensOf(image);
      if (this.reduced) {
        image.setAlpha(Math.min(1, strength));
        return;
      }
      this.scene.tweens.add({
        targets: image,
        alpha: Math.min(1, strength),
        duration: 420,
        ease: 'Sine.easeOut',
      });
    });
  }

  /**
   * 小白逼近 + 放大    this.scene.tweens.killTweensOf(graphics);
    if (this.reduced) {
      graphics.setAlpha(1);
      return;
    }
    graphics.setAlpha(0);
    this.scene.tweens.add({
      targets: graphics,
      alpha: 1,
      duration: 420,
      ease: 'Sine.easeOut',
    });
  }

  /**
   * 小白逼近 + 放大（倍数只取整数：像素图非整数倍会抖）。
   *
   * 这里必须**显式**把 alpha 拉满：进场时场景的 `showXiaobai()` 正在跑淡入 tween，
   * 而下面 `killTweensOf` 会把它一起杀掉，否则小白会永远停在 alpha 0（2026-11-21 实测）。
   */
  private moveXiaobai(spec: DarkBeatSpec): void {
    const head = this.player.headPoint;
    const targetX = head.x + 46;
    const targetY = head.y - 26;
    const targetScale = XIAOBAI_BASE_SCALE * spec.xiaobaiScale;
    const duration = this.reduced ? 0 : 480;

    this.scene.tweens.killTweensOf(this.xiaobai);
    this.xiaobai.setAlpha(1);
    this.scene.tweens.add({
      targets: this.xiaobai,
      x: targetX,
      y: targetY,
      scale: targetScale,
      duration,
      ease: 'Sine.easeOut',
    });

    if (this.aura) {
      this.scene.tweens.killTweensOf(this.aura);
      const auraScale = this.auraBaseScale * spec.xiaobaiScale;
      this.scene.tweens.add({
        targets: this.aura,
        x: targetX,
        y: targetY,
        scaleX: auraScale,
        scaleY: auraScale,
        alpha: 1,
        duration,
        ease: 'Sine.easeOut',
      });
    }
  }

  /**
   * 灵能缚索：几段不闭合的弧 + 向内的短爪，越到后面越实、越往里收。
   *
   * 故意**不画闭合圆环**：闭环 + 虚线看起来像瞄准准星/UI 标记，不像「被攥住」。
   * 弧段只覆盖圆周的一小截、粗细/alpha 各异，读起来是能量在身体周围收紧。
   */
  private setBind(amount: number): void {
    const graphics = this.bind;
    if (!graphics) return;
    const center = this.bodyCenter;
    graphics.setPosition(center.x, center.y);
    graphics.clear();
    if (amount <= 0.01) {
      graphics.setAlpha(0);
      return;
    }

    const arcs = this.reduced ? 3 : 6;
    for (let i = 0; i < arcs; i += 1) {
      const start = (i / arcs) * Math.PI * 2 + 0.35;
      const sweep = 0.55 + (i % 3) * 0.18;
      const rx = 74 - (i % 3) * 10;
      const ry = 112 - (i % 3) * 14;
      const steps = 10;
      // 三层同弧、alpha 递减：没有逐点粗细 API，就用「叠几条淡线」假装笔锋。
      for (let pass = 0; pass < 3; pass += 1) {
        graphics.lineStyle(3 - pass, PALETTE.bind, amount * (0.62 - pass * 0.16));
        graphics.beginPath();
        for (let stepIndex = 0; stepIndex <= steps; stepIndex += 1) {
          const angle = start + (sweep * stepIndex) / steps;
          const x = Math.cos(angle) * (rx - pass * 2);
          const y = Math.sin(angle) * (ry - pass * 2);
          if (stepIndex === 0) graphics.moveTo(x, y);
          else graphics.lineTo(x, y);
        }
        graphics.strokePath();
      }
    }

    // 向内的短爪：像手指扣进身体两侧（两侧强、上下弱）。
    const claws = this.reduced ? 6 : 10;
    for (let i = 0; i < claws; i += 1) {
      const angle = (i / claws) * Math.PI * 2 + 0.2;
      const side = Math.abs(Math.cos(angle));
      const outer = 124;
      const inner = 92;
      graphics.lineStyle(2 + side * 1.4, PALETTE.bind, amount * (0.28 + side * 0.26));
      graphics.beginPath();
      graphics.moveTo(Math.cos(angle) * outer, Math.sin(angle) * (outer * 1.3));
      graphics.lineTo(Math.cos(angle) * inner, Math.sin(angle) * (inner * 1.3));
      graphics.strokePath();
    }

    this.scene.tweens.killTweensOf(graphics);
    if (this.reduced) {
      graphics.setScale(1);
      graphics.setAlpha(1);
      return;
    }
    graphics.setScale(1.16);
    graphics.setAlpha(0);
    this.scene.tweens.add({
      targets: graphics,
      scale: 1,
      alpha: 1,
      duration: 460,
      ease: 'Cubic.easeOut',
    });
  }

  /** 周全被压下去：向下沉 + 轻微压扁；脚底在纯黑背景上看不出偏移。 */
  private sinkPlayer(pixels: number): void {
    const display = this.player.display;
    const base = this.playerBase;
    if (!display || !base) return;
    this.scene.tweens.killTweensOf(display);
    this.scene.tweens.add({
      targets: display,
      y: base.y + pixels,
      scaleY: base.scaleY * (1 - Math.min(0.06, pixels * 0.0035)),
      // 被压得往前弓：越到后面倾角越大（14px 下沉 → 约 10°），是「难受」的主要读点。
      rotation: Math.min(0.17, pixels * 0.012),
      duration: this.reduced ? 0 : 380,
      ease: 'Sine.easeOut',
    });
  }

  private setDrone(volume: number): void {
    if (!this.drone) return;
    this.scene.tweens.killTweensOf(this.drone.sound);
    this.scene.tweens.add({
      targets: this.drone.sound,
      volume: Math.min(1, Math.max(0, volume * 0.62)),
      duration: this.reduced ? 0 : 520,
      ease: 'Sine.easeOut',
    });
  }

  private fadeDrone(): void {
    const drone = this.drone;
    this.drone = null;
    if (!drone) return;
    this.scene.tweens.killTweensOf(drone.sound);
    this.scene.tweens.add({
      targets: drone.sound,
      volume: 0,
      duration: this.reduced ? 0 : 300,
      ease: 'Sine.easeOut',
      onComplete: () => drone.stop(),
    });
  }

  private stopDrone(): void {
    const drone = this.drone;
    this.drone = null;
    if (!drone) return;
    this.scene.tweens.killTweensOf(drone.sound);
    drone.stop();
  }

  private setHeartbeat(bpm: number): void {
    if (bpm === this.heartbeatBpm && this.heartTimer !== null) return;
    this.heartbeatBpm = bpm;
    this.stopHeartbeat();
    if (bpm <= 0) return;
    this.scheduleHeartbeat();
  }

  private scheduleHeartbeat(): void {
    const bpm = this.heartbeatBpm;
    if (bpm <= 0) return;
    /**
     * `palace_heartbeat.mp3` 本身是**两记一组**（约 1.55s 一组，不是单记）。
     *
     * 按「每组 = 两拍」排：组间隔 = 120000/bpm，再拿 `rate` 把组内间距拉到位。
     * 直接按 60000/bpm 排会让 1s 一记的组互相叠 3 层，变成一锅糊（v1 实测）。
     */
    const interval = Math.round(120000 / bpm);
    const rate = Math.min(2, Math.max(0.5, HEART_GROUP_MS / interval));
    this.beatHeart(rate);
    this.heartTimer = this.scene.time.delayedCall(interval, () => {
      this.heartTimer = null;
      this.scheduleHeartbeat();
    });
  }

  private stopHeartbeat(): void {
    this.heartTimer?.remove(false);
    this.heartTimer = null;
    const sound = this.heartSound;
    this.heartSound = null;
    try {
      sound?.stop();
    } catch {
      // 播完已经自毁：忽略。
    }
  }

  /** 一记心跳（一组两响）+ 压边/暗角短暂加深（reduced 只留声音）。 */
  private beatHeart(rate: number): void {
    /**
     * 不叠音是靠**时长对齐**保证的：`rate = 组时长 / 组间隔`，一组正好在下一组起来前收完。
     * 不要去 tween 上一记的 `volume`：`playSfxAt` 播完就 destroy，
     * tween 打到已销毁的 Sound 上会报 `Cannot set properties of null`（2026-11-21 实测）。
     */
    this.heartSound = audioDirector.playSfxAt(CH01_ASSET_KEYS.audio.darkHeartbeat, {
      volume: 0.3 + (this.currentBeat === 'crush' ? 0.12 : 0),
      rate,
    });
    if (this.reduced) return;
    const graphics = this.vignette;
    if (graphics) {
      this.scene.tweens.killTweensOf(graphics);
      graphics.setAlpha(Math.min(1, this.vignetteAlpha + 0.16));
      this.scene.tweens.add({
        targets: graphics,
        alpha: this.vignetteAlpha,
        duration: 260,
        ease: 'Sine.easeOut',
      });
    }
    // 惨叫那一拍：每记心跳顺手带一记很淡的血色，像视野在发红。
    if (this.currentBeat === 'crush') this.flashBlood(0.07);
  }

  /** 血色脉冲：只在挤压/惨叫两拍来一下，给「血流被掐住」的生理感。 */
  private flashBlood(alpha: number): void {
    const rect = this.redPulse;
    if (!rect || this.reduced) return;
    this.scene.tweens.killTweensOf(rect);
    rect.setAlpha(alpha);
    this.scene.tweens.add({
      targets: rect,
      alpha: 0,
      duration: 340,
      ease: 'Sine.easeOut',
    });
  }

  /** 小白念条例时那圈「规则降临」的符环：几何刻度环，只扫开一次。 */
  private spawnSealRing(): void {
    if (this.reduced) return;
    const x = this.xiaobai.x;
    const y = this.xiaobai.y;
    const ring = this.scene.add.graphics().setDepth(LAYERS.effects + 20).setPosition(x, y);
    const ticks = 18;
    for (let i = 0; i < ticks; i += 1) {
      const angle = (i / ticks) * Math.PI * 2;
      const inner = 70;
      const outer = i % 3 === 0 ? 112 : 92;
      ring.lineStyle(i % 3 === 0 ? 3 : 2, 0xdfeeff, i % 3 === 0 ? 0.9 : 0.55);
      ring.beginPath();
      ring.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      ring.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      ring.strokePath();
    }
    ring.lineStyle(2, 0xdfeeff, 0.7);
    ring.strokeCircle(0, 0, 70);
    this.objects.push(ring);

    this.scene.tweens.add({
      targets: ring,
      scale: 3.4,
      alpha: 0,
      rotation: 0.35,
      duration: 900,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  private playSting(spec: DarkBeatSpec): void {
    if (spec.sting === 'grip') {
      audioDirector.playSfxAt(CH01_ASSET_KEYS.audio.darkGrip, { volume: 0.85, rate: 1 });
    } else if (spec.sting === 'seal') {
      audioDirector.playSfxAt(PALACE_ASSET_KEYS.sfx.led, { volume: 0.42, rate: 0.86 });
    } else if (spec.sting === 'release') {
      audioDirector.playSfxAt(CH01_ASSET_KEYS.audio.darkRelease, { volume: 0.9, rate: 1 });
      audioDirector.playSfxAt(PALACE_ASSET_KEYS.sfx.gasp, { volume: 0.5, rate: 1 });
    }
  }

  // ---------------------------------------------------------------- 收尾

  /**
   * 小白/周全回到进场时的构图（缩放、位置、透明度）。
   *
   * `duration=0` 走**直接赋值**而不是 0 时长 tween：`destroy()` 是在 SHUTDOWN 里调的，
   * 那时 TweenManager 正在收尾，再 add 一条 tween 只会留下警告。
   */
  private restoreActors(duration: number): void {
    const xiaobai = this.xiaobai;
    const xiaobaiAlpha = this.xiaobaiBase.alpha === 0 ? 1 : this.xiaobaiBase.alpha;
    this.scene.tweens.killTweensOf(xiaobai);
    const display = this.player.display;
    display?.clearTint();
    const base = this.playerBase;
    if (duration <= 0) {
      xiaobai.setPosition(this.xiaobaiBase.x, this.xiaobaiBase.y);
      xiaobai.setScale(this.xiaobaiBase.scale);
      xiaobai.setAlpha(xiaobaiAlpha);
      if (display && base) {
        this.scene.tweens.killTweensOf(display);
        display.setPosition(base.x, base.y);
        display.setScale(base.scaleX, base.scaleY);
        display.setRotation(0);
      }
      return;
    }
    this.scene.tweens.add({
      targets: xiaobai,
      x: this.xiaobaiBase.x,
      y: this.xiaobaiBase.y,
      scale: this.xiaobaiBase.scale,
      alpha: xiaobaiAlpha,
      duration,
      ease: 'Sine.easeOut',
    });
    if (display && base) {
      this.scene.tweens.killTweensOf(display);
      this.scene.tweens.add({
        targets: display,
        x: base.x,
        y: base.y,
        scaleX: base.scaleX,
        scaleY: base.scaleY,
        rotation: 0,
        duration,
        ease: 'Sine.easeOut',
      });
    }
  }

  /** 拆对象：tween/timer 先杀，再 destroy 图层。幂等。 */
  private dispose(): void {
    for (const tween of this.tweens) tween.remove();
    this.tweens.length = 0;
    for (const object of this.objects) {
      if (object.active) object.destroy();
    }
    this.objects.length = 0;
    this.haze = null;
    this.aura = null;
    this.motes = null;
    this.bind = null;
    this.rimSides = [];
    this.vignette = null;
    this.redPulse = null;
  }
}
