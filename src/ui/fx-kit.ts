import Phaser from 'phaser';
import { prefersReducedMotion } from '@phaser-mvvm/phaser';
import { getViewportPlan } from '../app/viewport';
import { hashSeed, mulberry32 } from '../dev/random';
import { LAYERS } from '../render/layers';
import { DANGER, GOLD, INK, PAPER } from './cinematic';

/**
 * 电影化氛围特效工具箱（原生层，即用即弃）。
 *
 * 这一份只画「画面语言」，不读剧情、不碰资源加载、不改相机 zoom：
 * - **depth 一律从 `LAYERS` / `SCREEN_LAYERS` 取**，需要夹层时只在常量上做加减（注释写明夹在哪两层之间）。
 * - **坐标是设计坐标**（`getViewportPlan().designWidth / designHeight`），和地图/角色同一口径；
 *   相机由 `applyCamera()` 统一 `setZoom(scale)` + `centerOn(设计框中心)`，所以世界坐标 0..designW 就是整屏。
 * - **reduced（`prefers-reduced-motion` / 设置项）保留信息层，去掉运动**：冲击环留一帧静态环、光柱/浮尘/余烬
 *   留静态构图、暗角与接触阴影本来就静止；位移、抖动、速度线、成片粒子全部跳过。
 * - **对象预算**：单个特效 ≤ `FX_MAX_OBJECTS`（40）个 GameObject；各特效再各自收紧（见 `BUDGET`）。
 *   **不在 update 里逐帧 new**：一次性特效用 tween + `delayedCall` + `onComplete` 自毁；
 *   氛围类（光柱/浮尘/余烬/LED）返回容器，由调用方 `destroy()`。
 * - **不创建持久化纹理**：本文件全部用 Graphics / Shape 绘制；需要面板纹理的是 `stage-frame.ts`，那边按用途前缀复用 key。
 *
 * 销毁责任：返回对象的调用方负责在场景 `shutdown()` 里 `destroy()`（可以放进自己的特效数组统一清理）。
 * 返回的 Container 已经挂了「销毁时顺带 kill 子对象 tween」，所以只调 `destroy()` 即可，不会留悬空 tween。
 */

/** 单个特效允许创建的 GameObject 硬上限（需求约束）。 */
export const FX_MAX_OBJECTS = 40;

/** 各特效的预算；除了暗角/光柱（一个 Graphics 画完），其余都在 40 以内。 */
const BUDGET = {
  /** 暗角分带数（绘制指令数，不是 GameObject）。24 带在亮背景上能看到竖向条带，加到 72 带才顺滑。 */
  vignetteBands: 72,
  /** 光柱切片数（绘制指令数，不是 GameObject）。 */
  shaftSlices: 12,
  dust: 30,
  embers: 26,
  sparks: 22,
  shards: 12,
} as const;

/** 共用开关：各函数下面的 inline options 都是它的扩展。 */
export interface FxOptions {
  readonly reduced?: boolean;
  readonly depth?: number;
  readonly seed?: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const finiteOr = (value: number | undefined, fallback: number): number =>
  value !== undefined && Number.isFinite(value) ? value : fallback;

const clampCount = (value: number | undefined, fallback: number, max: number): number =>
  Math.max(0, Math.min(max, Math.floor(finiteOr(value, fallback))));

/** 没传 `reduced` 时跟系统设置走，和 `cinematic.ts` / 各场景保持一致。 */
const isReduced = (value: boolean | undefined): boolean => value ?? prefersReducedMotion();

/** 同 seed 同布局；不给 seed 时用用途字符串派生，场景重建后仍然一致（`src/dev/random.ts`）。 */
const seededRandom = (seed: number | undefined, salt: string): (() => number) =>
  mulberry32(seed ?? hashSeed(`avm.fx.${salt}`));

const between = (next: () => number, min: number, max: number): number =>
  min + (max - min) * next();

/**
 * 容器销毁时顺手 kill 子对象的 tween。
 * 只依赖 GameObject 自己的 DESTROY 事件，不往场景上挂 shutdown 钩子（避免重复挂/漏挂）。
 */
function tieTweensToDestroy(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  targets: readonly Phaser.GameObjects.GameObject[],
): void {
  container.once(Phaser.GameObjects.Events.DESTROY, () => {
    scene.tweens.killTweensOf([...targets]);
  });
}

// ---------------------------------------------------------------- 静态氛围

/**
 * 全屏暗角：四边分带压暗，中间完全不动。
 *
 * 每一带只填自己的区域，所以「带的 alpha 就是该处最终浓度」，不会像叠加半透明同心圆那样
 * 越靠近中心越黑；四角天然叠两层，比四边更沉一点，就是电影暗角该有的形状。
 * 默认放在 `LAYERS.cinematic`（角色/世界特效之上、CG 与 Compose UI 之下），适合过场里压画面。
 * 用于「舞台框」这种不能压角色太多的地方时，传更低的 depth 和更小的 alpha。
 *
 * 纯静态，reduced 与非 reduced 表现一致；返回的 Graphics 由调用方 destroy。
 */
export function addVignette(
  scene: Phaser.Scene,
  opts: { color?: number; alpha?: number; depth?: number } = {},
): Phaser.GameObjects.Graphics {
  const plan = getViewportPlan();
  const width = plan.designWidth;
  const height = plan.designHeight;
  const color = opts.color ?? INK;
  const alpha = clamp01(finiteOr(opts.alpha, 0.55));
  const graphics = scene.add.graphics().setDepth(opts.depth ?? LAYERS.cinematic);

  const steps = BUDGET.vignetteBands;
  const edgeY = height * 0.24;
  const edgeX = width * 0.2;
  const bandH = edgeY / steps;
  const bandW = edgeX / steps;

  // 上下：各占 24% 设计高，向内二次衰减。
  for (let i = 0; i < steps; i += 1) {
    const t = (i + 0.5) / steps;
    const a = alpha * Math.pow(1 - t, 2.1);
    if (a <= 0.002) continue;
    const offset = i * bandH;
    graphics.fillStyle(color, a);
    graphics.fillRect(0, offset, width, bandH + 1);
    graphics.fillRect(0, height - offset - bandH - 1, width, bandH + 1);
  }
  // 左右：各占 20% 设计宽，比上下略淡，避免竖屏两侧像被裁掉。
  for (let i = 0; i < steps; i += 1) {
    const t = (i + 0.5) / steps;
    const a = alpha * 0.72 * Math.pow(1 - t, 2.1);
    if (a <= 0.002) continue;
    const offset = i * bandW;
    graphics.fillStyle(color, a);
    graphics.fillRect(offset, 0, bandW + 1, height);
    graphics.fillRect(width - offset - bandW - 1, 0, bandW + 1, height);
  }

  return graphics;
}

/**
 * 光柱：从 `(x, y)` 往下打的一道斜面光束。
 *
 * 三层嵌套（外宽淡、内窄亮）+ 逐片纵向衰减，边缘因此是软的，不需要混合模式
 * （Phaser 4 的 Graphics 在 Canvas 回退下不认 `fillGradientStyle`，而混合模式在部分设备上还会
 * 让 WebGL 批次变脏，这里索性只用普通 alpha 叠加）。
 * 容器以 `(x, y)` 为锚点旋转 `angleDeg`，即「光从哪个角度射进来」。
 *
 * reduced：只留静态的一帧光柱（无淡入、无呼吸）。
 * 返回 Container（含 1 个 Graphics），由调用方 destroy。
 */
export function addLightShaft(
  scene: Phaser.Scene,
  opts: {
    x: number;
    y: number;
    width: number;
    height: number;
    angleDeg?: number;
    color?: number;
    alpha?: number;
    reduced?: boolean;
    depth?: number;
  },
): Phaser.GameObjects.Container {
  const width = Math.max(1, Math.abs(finiteOr(opts.width, 1)));
  const height = Math.max(1, Math.abs(finiteOr(opts.height, 1)));
  const color = opts.color ?? PAPER;
  const alpha = clamp01(finiteOr(opts.alpha, 0.35));
  const reduced = isReduced(opts.reduced);
  const slices = BUDGET.shaftSlices;

  const graphics = scene.add.graphics();
  const halfTop = width / 2;
  // 外层宽而淡 → 内层窄而亮；三层的 alpha 会叠出柔和的横向渐变。
  const shells: readonly { scale: number; weight: number }[] = [
    { scale: 1, weight: 0.5 },
    { scale: 0.62, weight: 0.34 },
    { scale: 0.3, weight: 0.3 },
  ];
  for (const shell of shells) {
    for (let i = 0; i < slices; i += 1) {
      const t0 = i / slices;
      const t1 = (i + 1) / slices;
      const fade = Math.pow(1 - t0, 1.6);
      const nextFade = Math.pow(1 - t1, 1.6);
      const a = alpha * shell.weight * Math.max(fade, nextFade);
      if (a <= 0.002) continue;
      graphics.fillStyle(color, a);
      graphics.beginPath();
      graphics.moveTo(-halfTop * shell.scale, height * t0);
      graphics.lineTo(halfTop * shell.scale, height * t0);
      graphics.lineTo(halfTop * shell.scale * 1.35, height * t1);
      graphics.lineTo(-halfTop * shell.scale * 1.35, height * t1);
      graphics.closePath();
      graphics.fillPath();
    }
  }

  const container = scene.add
    .container(opts.x, opts.y, [graphics])
    .setDepth(opts.depth ?? LAYERS.effects)
    .setRotation(Phaser.Math.DegToRad(finiteOr(opts.angleDeg, 0)));

  tieTweensToDestroy(scene, container, [container]);

  if (reduced) {
    container.setAlpha(1);
    return container;
  }

  container.setAlpha(0);
  scene.tweens.add({
    targets: container,
    alpha: 1,
    duration: 640,
    ease: 'Sine.easeOut',
    onComplete: () => {
      scene.tweens.add({
        targets: container,
        alpha: 0.82,
        duration: 3200,
        yoyo: true,
        repeat: 2,
        ease: 'Sine.easeInOut',
      });
    },
  });
  return container;
}

/**
 * 浮尘：矩形区域内的发光微粒，向上缓慢飘 + 呼吸明暗。
 *
 * 位置全部由 `hashSeed` + `mulberry32` 决定，同 seed 同画面（验收可复现，不碰 `Math.random()`）。
 *
 * reduced：只留静态构图（数量压到 8 个以内、不飘不闪），信息（这里有空气/光）还在，运动去掉。
 * 返回 Container，由调用方 destroy（销毁时会 kill 子对象 tween）。
 */
export function addDustMotes(
  scene: Phaser.Scene,
  opts: {
    x: number;
    y: number;
    width: number;
    height: number;
    count?: number;
    seed?: number;
    color?: number;
    alpha?: number;
    reduced?: boolean;
    depth?: number;
  },
): Phaser.GameObjects.Container {
  const width = Math.max(1, Math.abs(finiteOr(opts.width, 1)));
  const height = Math.max(1, Math.abs(finiteOr(opts.height, 1)));
  const reduced = isReduced(opts.reduced);
  const requested = clampCount(opts.count, 26, BUDGET.dust);
  const count = reduced ? Math.min(requested, 8) : requested;
  const random = seededRandom(opts.seed, 'dust');
  const color = opts.color ?? 0xe6e2d2;
  const alpha = clamp01(finiteOr(opts.alpha, 0.5));

  const container = scene.add
    .container(0, 0)
    .setDepth(opts.depth ?? LAYERS.effects);
  const motes: Phaser.GameObjects.GameObject[] = [];

  for (let i = 0; i < count; i += 1) {
    const x = opts.x + between(random, 0, width);
    const y = opts.y + between(random, 0, height);
    const radius = between(random, 0.8, 2.3);
    const baseAlpha = alpha * between(random, 0.45, 1);
    const mote = scene.add.circle(x, y, radius, color, baseAlpha);
    container.add(mote);
    motes.push(mote);

    if (reduced) continue;
    scene.tweens.add({
      targets: mote,
      y: y - between(random, 16, 52),
      alpha: { from: baseAlpha, to: baseAlpha * 0.25 },
      duration: Math.round(between(random, 3200, 7200)),
      delay: Math.round(between(random, 0, 1800)),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  tieTweensToDestroy(scene, container, motes);
  return container;
}

/**
 * 接触阴影：角色/物件脚底的椭圆暗影。
 *
 * 默认 depth 是 `LAYERS.props - 1`（地图之上、家具之下）——角色在 `characterDepth()` 里，
 * 所以阴影永远被角色盖住。要压在某个角色脚下时，调用方传 `depth: characterDepth(feetY) - 1`。
 * 静态对象，reduced 不影响；返回的 Ellipse 由调用方 destroy。
 */
export function addContactShadow(
  scene: Phaser.Scene,
  opts: {
    x: number;
    y: number;
    width: number;
    height?: number;
    alpha?: number;
    depth?: number;
  },
): Phaser.GameObjects.Ellipse {
  const width = Math.max(2, Math.abs(finiteOr(opts.width, 2)));
  const height = Math.max(2, Math.abs(finiteOr(opts.height, width * 0.32)));
  const ellipse = scene.add.ellipse(
    opts.x,
    opts.y,
    width,
    height,
    INK,
    clamp01(finiteOr(opts.alpha, 0.42)),
  );
  ellipse.setDepth(opts.depth ?? LAYERS.props - 1);
  return ellipse;
}

// ---------------------------------------------------------------- 一次性冲击

/**
 * 冲击环：两圈同心环从缩放 0.15 推到 1（第二圈延迟一点，做出厚度感），淡出后自毁。
 *
 * reduced：不缩放、不位移，直接给一帧静态环（信息层），`ms` 后销毁。
 * 一次性特效，无需调用方清理。
 */
export function impactRing(
  scene: Phaser.Scene,
  x: number,
  y: number,
  opts: {
    color?: number;
    radius?: number;
    ms?: number;
    reduced?: boolean;
    depth?: number;
  } = {},
): void {
  const radius = Math.max(8, Math.abs(finiteOr(opts.radius, 96)));
  const ms = Math.max(120, Math.abs(finiteOr(opts.ms, 420)));
  const color = opts.color ?? PAPER;
  const reduced = isReduced(opts.reduced);
  const depth = opts.depth ?? LAYERS.effects;
  const makeRing = (lineWidth: number): Phaser.GameObjects.Graphics => {
    const ring = scene.add.graphics().setDepth(depth);
    ring.setPosition(x, y);
    ring.lineStyle(lineWidth, color, 1);
    ring.strokeCircle(0, 0, radius);
    return ring;
  };

  if (reduced) {
    const ring = makeRing(3);
    ring.setAlpha(0.55);
    scene.time.delayedCall(ms, () => ring.destroy());
    return;
  }

  const front = makeRing(4).setScale(0.15).setAlpha(0);
  scene.tweens.add({
    targets: front,
    scale: 1,
    alpha: 0.9,
    duration: Math.round(ms * 0.34),
    ease: 'Quad.easeOut',
    onComplete: () => {
      scene.tweens.add({
        targets: front,
        alpha: 0,
        duration: Math.round(ms * 0.66),
        ease: 'Sine.easeIn',
        onComplete: () => front.destroy(),
      });
    },
  });

  const echo = makeRing(2).setScale(0.1).setAlpha(0);
  scene.tweens.add({
    targets: echo,
    scale: 1.22,
    alpha: 0.42,
    delay: Math.round(ms * 0.18),
    duration: Math.round(ms * 0.4),
    ease: 'Quad.easeOut',
    onComplete: () => {
      scene.tweens.add({
        targets: echo,
        alpha: 0,
        duration: Math.round(ms * 0.5),
        ease: 'Sine.easeIn',
        onComplete: () => echo.destroy(),
      });
    },
  });
}

/**
 * 火星迸射：一圈小长条沿径向飞出 + 收细 + 淡出，逐个自毁。
 *
 * reduced：不位移，只在冲击点周围留一圈静态火星，短暂停留后消失。
 * 一次性特效，无需调用方清理；数量上限 `BUDGET.sparks`（22）。
 */
export function sparkBurst(
  scene: Phaser.Scene,
  x: number,
  y: number,
  opts: {
    color?: number;
    count?: number;
    seed?: number;
    reduced?: boolean;
    depth?: number;
  } = {},
): void {
  const count = clampCount(opts.count, 16, BUDGET.sparks);
  const color = opts.color ?? GOLD;
  const reduced = isReduced(opts.reduced);
  const depth = opts.depth ?? LAYERS.effects;
  const random = seededRandom(opts.seed, 'spark');
  const angleOffset = between(random, 0, Math.PI * 2);
  const sparks: Phaser.GameObjects.Rectangle[] = [];

  for (let i = 0; i < count; i += 1) {
    const angle = angleOffset + (i / Math.max(1, count)) * Math.PI * 2 + between(random, -0.26, 0.26);
    const distance = between(random, 24, 86);
    const length = between(random, 4, 10);
    const spark = scene.add
      .rectangle(x, y, 2, length, color, 1)
      .setDepth(depth)
      .setRotation(angle - Math.PI / 2);
    sparks.push(spark);

    if (reduced) {
      spark
        .setPosition(x + Math.cos(angle) * distance * 0.5, y + Math.sin(angle) * distance * 0.5)
        .setAlpha(0.75);
      continue;
    }

    scene.tweens.add({
      targets: spark,
      x: x + Math.cos(angle) * distance,
      y: y + Math.sin(angle) * distance,
      alpha: 0,
      scaleY: 0.3,
      duration: Math.round(between(random, 220, 460)),
      ease: 'Quad.easeOut',
      onComplete: () => spark.destroy(),
    });
  }

  if (reduced) {
    scene.time.delayedCall(260, () => {
      for (const spark of sparks) spark.destroy();
    });
  }
}

/**
 * 碎片迸射：小三角向四周飞散并旋转，用于矿石/玻璃/护盾碎裂。
 *
 * reduced：保留碎片落位构图（不飞不转），短暂停留后消失。
 * 一次性特效，无需调用方清理；数量上限 `BUDGET.shards`（12）。
 */
export function shardBurst(
  scene: Phaser.Scene,
  x: number,
  y: number,
  opts: {
    color?: number;
    count?: number;
    seed?: number;
    reduced?: boolean;
    depth?: number;
  } = {},
): void {
  const count = clampCount(opts.count, 9, BUDGET.shards);
  const color = opts.color ?? GOLD;
  const reduced = isReduced(opts.reduced);
  const depth = opts.depth ?? LAYERS.effects;
  const random = seededRandom(opts.seed, 'shard');
  const angleOffset = between(random, 0, Math.PI * 2);
  const shards: Phaser.GameObjects.Triangle[] = [];

  for (let i = 0; i < count; i += 1) {
    const angle = angleOffset + (i / Math.max(1, count)) * Math.PI * 2 + between(random, -0.4, 0.4);
    const distance = between(random, 18, 74);
    const size = between(random, 4, 11);
    const shard = scene.add
      .triangle(
        x,
        y,
        0,
        -size,
        size * 0.9,
        size * 0.7,
        -size * 0.9,
        size * 0.7,
        color,
        1,
      )
      .setDepth(depth)
      .setRotation(angle);
    shards.push(shard);

    if (reduced) {
      shard
        .setPosition(x + Math.cos(angle) * distance * 0.45, y + Math.sin(angle) * distance * 0.45)
        .setAlpha(0.8);
      continue;
    }

    scene.tweens.add({
      targets: shard,
      x: x + Math.cos(angle) * distance,
      y: y + Math.sin(angle) * distance,
      angle: shard.angle + between(random, -180, 180),
      alpha: 0,
      scale: 0.55,
      duration: Math.round(between(random, 320, 620)),
      ease: 'Quad.easeOut',
      onComplete: () => shard.destroy(),
    });
  }

  if (reduced) {
    scene.time.delayedCall(320, () => {
      for (const shard of shards) shard.destroy();
    });
  }
}

/**
 * 电子眼 / LED 呼吸点：核心亮点 + 光晕，用于警报、监控、矿工护目镜。
 *
 * reduced：静态不闪，只保留一个常亮的红点（信息层：这里在监控/警告）。
 * 返回 Container，由调用方 destroy（销毁时会 kill 子对象 tween）。
 */
export function ledPulse(
  scene: Phaser.Scene,
  x: number,
  y: number,
  opts: {
    color?: number;
    radius?: number;
    reduced?: boolean;
    depth?: number;
  } = {},
): Phaser.GameObjects.Container {
  const radius = Math.max(1.5, Math.abs(finiteOr(opts.radius, 4)));
  const color = opts.color ?? DANGER;
  const reduced = isReduced(opts.reduced);

  const glow = scene.add.circle(x, y, radius * 2.6, color, 0.18);
  const halo = scene.add.circle(x, y, radius * 1.5, color, 0.34);
  const core = scene.add.circle(x, y, radius, color, 1);
  const container = scene.add
    .container(0, 0, [glow, halo, core])
    .setDepth(opts.depth ?? LAYERS.effects);

  tieTweensToDestroy(scene, container, [glow, halo, core]);

  if (!reduced) {
    scene.tweens.add({
      targets: glow,
      scale: { from: 0.82, to: 1.24 },
      alpha: { from: 0.12, to: 0.3 },
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    scene.tweens.add({
      targets: core,
      alpha: { from: 0.55, to: 1 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
  return container;
}

/**
 * 余烬：矩形区域内的暖色火星向上飘、逐渐熄灭，循环使用同一批对象（不逐帧 new）。
 *
 * 位置由 `hashSeed` + `mulberry32` 决定，同 seed 同画面。
 *
 * reduced：只留静态暖色光点（数量压到 7 个以内、不飘），提示"这里有火/热气"。
 * 返回 Container，由调用方 destroy（销毁时会 kill 子对象 tween）。
 */
export function addEmbers(
  scene: Phaser.Scene,
  opts: {
    x: number;
    y: number;
    width: number;
    height: number;
    count?: number;
    seed?: number;
    color?: number;
    reduced?: boolean;
    depth?: number;
  },
): Phaser.GameObjects.Container {
  const width = Math.max(1, Math.abs(finiteOr(opts.width, 1)));
  const height = Math.max(1, Math.abs(finiteOr(opts.height, 1)));
  const reduced = isReduced(opts.reduced);
  const requested = clampCount(opts.count, 20, BUDGET.embers);
  const count = reduced ? Math.min(requested, 7) : requested;
  const random = seededRandom(opts.seed, 'embers');
  const color = opts.color ?? 0xd08a3e;

  const container = scene.add
    .container(0, 0)
    .setDepth(opts.depth ?? LAYERS.effects);
  const embers: Phaser.GameObjects.GameObject[] = [];

  for (let i = 0; i < count; i += 1) {
    const x = opts.x + between(random, 0, width);
    const y = opts.y + between(random, 0, height);
    const radius = between(random, 0.9, 2.4);
    const alpha = between(random, 0.45, 0.92);
    const rise = height * between(random, 0.35, 0.85);
    const ember = scene.add.circle(x, y, radius, color, alpha);
    container.add(ember);
    embers.push(ember);

    if (reduced) continue;
    scene.tweens.add({
      targets: ember,
      y: y - rise,
      alpha: { from: alpha, to: 0 },
      duration: Math.round(between(random, 2600, 6400)),
      delay: Math.round(between(random, 0, 2400)),
      repeat: -1,
      ease: 'Sine.easeOut',
    });
  }

  tieTweensToDestroy(scene, container, embers);
  return container;
}

// ---------------------------------------------------------------- 镜头

/**
 * 屏幕震动：**只做相机抖动**，不动 zoom（zoom 会把 Compose 对话框一起放大，见渲染层文档 §8）。
 *
 * reduced：直接返回（抖动是最典型的「会诱发不适」的运动）。
 * 一次性，相机效果到期自动结束，无需清理。
 */
export function screenRumble(
  scene: Phaser.Scene,
  opts: { ms?: number; intensity?: number; reduced?: boolean } = {},
): void {
  if (isReduced(opts.reduced)) return;
  const ms = Math.max(1, Math.abs(finiteOr(opts.ms, 260)));
  const intensity = Math.max(0, Math.abs(finiteOr(opts.intensity, 0.004)));
  scene.cameras.main.shake(ms, intensity);
}
