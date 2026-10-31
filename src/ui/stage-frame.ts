import Phaser from 'phaser';
import { prefersReducedMotion } from '@phaser-mvvm/phaser';
import { getViewportPlan } from '../app/viewport';
import { hashSeed, mulberry32 } from '../dev/random';
import { LAYERS } from '../render/layers';
import { GOLD } from './cinematic';
import { addVignette } from './fx-kit';

/**
 * 舞台框：地图只占设计高的一部分，上下露出来的那块别留「死黑」，给它一层有意设计的画框。
 *
 * 画的是三样东西，叠起来读作「舞台/胶片」而不是「没铺满」：
 * 1. **墨色渐变底板**（dorm 冷墨＋底部一点暖灯、palace 深红墨＋顶部鎏金雾、battle 不铺垫板）；
 * 2. **地图矩形外沿的 1px 鎏金细线 + 四角短角标**（画在矩形外侧 1px，不压地图像素）；
 * 3. **极淡的纸张/胶片颗粒** + **柔和暗角**（只压画面边缘，地图中央主体不动）。
 *
 * 深度：全部落在 `LAYERS.background` 附近，**不改 layers.ts，也不写裸数字**（夹层都是常量加减）：
 * - 底板 `background - 0.1`：必须在 base 之下，地图/世界容器（depth = background）才能盖住它；
 * - 颗粒 `background + 0.1`、金线 `background + 0.2`、暗角 `background + 0.3`：
 *   只比地图高一点点，仍远低于 `LAYERS.props`(100)、角色（`characterDepth()` ≥ 1000）和 Compose UI，
 *   所以不会挡住家具、角色或控制层。颗粒/暗角是低 alpha 的氛围叠加，不是遮挡。
 *   （注：金殿场景把整张图塞进 depth = background 的 `worldRoot` 容器里，所以这三层会浮在整座殿之上——
 *   但金线画在地图矩形外侧、颗粒 alpha ≈ 0.05、暗角只到边缘，视觉上就是「镜头前的一片滤镜」，不会盖内容。）
 *
 * reduced：颗粒不呼吸、其余本来就是静态——信息（画框）全保留，只去掉那点运动。
 *
 * 销毁：`handle.destroy()` 一次性清掉所有对象与它们的 tween；场景 `shutdown()` 里调用。
 */

export type StageFrameVariant = 'dorm' | 'palace' | 'battle';

export interface StageFrameOptions {
  /** 地图矩形（设计坐标）：画框围着它画。 */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly variant: StageFrameVariant;
  readonly reduced?: boolean;
}

export interface StageFrameHandle {
  readonly objects: readonly Phaser.GameObjects.GameObject[];
  destroy(): void;
}

/**
 * 画框子层：以 `LAYERS.background` 为基准做常量加减，语义见文件头。
 * 不新增 LAYERS 常量（那要改 layers.ts），全部用现有值组合。
 */
const FRAME_DEPTH = {
  plate: LAYERS.background - 0.1,
  grain: LAYERS.background + 0.1,
  rule: LAYERS.background + 0.2,
  vignette: LAYERS.background + 0.3,
} as const;

/** 颗粒上限：需求给的是 ≤ 400，取 380 留一点余量。 */
const GRAIN_MARKS = 380;

interface FramePalette {
  /** battle 不铺垫板，只留暗角。 */
  readonly plate: boolean;
  /** 竖向渐变停靠点（归一化位置 → CSS 颜色）。 */
  readonly gradient: readonly (readonly [number, string])[];
  /** 可选的一团柔光（位置/半径都按纹理归一化，贴到屏幕后自动拉成椭圆）。 */
  readonly glow: { readonly at: number; readonly radius: number; readonly fill: string } | null;
  readonly vignetteAlpha: number;
  readonly grainAlpha: number;
}

const PALETTES: Record<StageFrameVariant, FramePalette> = {
  // 寝室：冷墨打底，底部透出一点台灯的暖。
  dorm: {
    plate: true,
    gradient: [
      [0, 'rgba(4, 6, 11, 1)'],
      [0.42, 'rgba(7, 10, 16, 1)'],
      [0.72, 'rgba(10, 11, 15, 1)'],
      [1, 'rgba(22, 16, 11, 1)'],
    ],
    glow: { at: 0.94, radius: 0.62, fill: 'rgba(150, 104, 54, 0.17)' },
    vignetteAlpha: 0.42,
    grainAlpha: 0.6,
  },
  // 金殿：深红墨 + 顶部一层鎏金雾。
  palace: {
    plate: true,
    gradient: [
      [0, 'rgba(15, 4, 7, 1)'],
      [0.38, 'rgba(19, 6, 10, 1)'],
      [0.74, 'rgba(13, 4, 8, 1)'],
      [1, 'rgba(7, 2, 4, 1)'],
    ],
    glow: { at: 0.05, radius: 0.66, fill: 'rgba(164, 126, 58, 0.2)' },
    vignetteAlpha: 0.46,
    grainAlpha: 0.6,
  },
  // 战场：不铺垫板（背景本身是满屏的），只压暗角 + 金线。
  battle: {
    plate: false,
    gradient: [],
    glow: null,
    vignetteAlpha: 0.52,
    grainAlpha: 0.42,
  },
};

const finiteOr = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback;

/**
 * 底板纹理：64×96 的小画布生成竖向渐变（+ 一团柔光），再拉到整屏。
 *
 * Phaser 4 的 `Graphics.fillGradientStyle` 在 Canvas 回退渲染器里只取第一个颜色，
 * 所以渐变统一走 canvas 纹理（和 `ui/background.ts` 的 scrim 是同一套做法）。
 * key 带用途+变体前缀，同一变体反复创建时复用，不重复生成。
 */
function ensurePlateTexture(scene: Phaser.Scene, variant: StageFrameVariant): string | null {
  const palette = PALETTES[variant];
  if (!palette.plate) return null;

  const key = `__avm.fx.stageframe.plate.${variant}`;
  if (scene.textures.exists(key)) return key;

  const texture = scene.textures.createCanvas(key, 64, 96);
  if (!texture) return null;

  const ctx = texture.context;
  const gradient = ctx.createLinearGradient(0, 0, 0, 96);
  for (const [stop, color] of palette.gradient) gradient.addColorStop(stop, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 96);

  const glow = palette.glow;
  if (glow) {
    const cy = glow.at * 96;
    const radial = ctx.createRadialGradient(32, cy, 0, 32, cy, Math.max(1, glow.radius * 96));
    radial.addColorStop(0, glow.fill);
    radial.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, 64, 96);
  }

  texture.refresh();
  return key;
}

/**
 * 颗粒：一次性画进一个 Graphics 的 380 个点（需求允许 Graphics 点阵）。
 *
 * 没有用 canvas 纹理，是因为点阵已经够用，而且省掉一份纹理的生命周期管理
 * （`pnpm check` 里也不用担心 key 泄漏）；数量固定、位置由 `hashSeed` 决定，
 * 同 seed 同画面。点刻意压在地图上下两条「画框区」里各占约 35%，剩下的撒在地图上，
 * 这样露黑的地方才有胶片质感。
 */
function drawGrain(
  scene: Phaser.Scene,
  designWidth: number,
  designHeight: number,
  map: { x: number; y: number; width: number; height: number },
  alpha: number,
): Phaser.GameObjects.Graphics {
  const random = mulberry32(hashSeed('avm.fx.stageframe.grain'));
  const graphics = scene.add.graphics().setDepth(FRAME_DEPTH.grain).setAlpha(alpha);

  const topBand = Math.max(0, map.y);
  const bottomBandStart = Math.min(designHeight, map.y + map.height);
  const bottomBand = Math.max(0, designHeight - bottomBandStart);

  for (let i = 0; i < GRAIN_MARKS; i += 1) {
    const pick = random();
    let x = random() * designWidth;
    let y = random() * designHeight;

    if (pick < 0.35 && topBand > 0) {
      y = random() * topBand;
      x = random() * designWidth;
    } else if (pick < 0.7 && bottomBand > 0) {
      y = bottomBandStart + random() * bottomBand;
      x = random() * designWidth;
    } else {
      const inset = Math.min(24, map.width * 0.1);
      x = map.x + inset + random() * Math.max(1, map.width - inset * 2);
      y = map.y + random() * Math.max(1, map.height);
    }

    const size = random() > 0.82 ? 2 : 1;
    const bright = random() > 0.32;
    const a = 0.04 + random() * 0.1;
    graphics.fillStyle(bright ? 0xf2efe6 : 0x000000, a);
    graphics.fillRect(Math.round(x), Math.round(y), size, size);
  }

  return graphics;
}

/** 地图矩形外沿的 1px 鎏金线 + 四角短角标（都画在矩形外侧，不压地图像素）。 */
function drawGoldRule(
  scene: Phaser.Scene,
  map: { x: number; y: number; width: number; height: number },
): Phaser.GameObjects.Graphics {
  const graphics = scene.add.graphics().setDepth(FRAME_DEPTH.rule);

  // 1px 细线：外扩 1px，紧贴画面外侧，地图内容一个像素都不动。
  graphics.lineStyle(1, GOLD, 0.35);
  graphics.strokeRect(map.x - 1, map.y - 1, map.width + 2, map.height + 2);

  // 四角角标：向外伸出的短 L，落在露黑区里，给画框一个「装裱」的落点。
  const arm = Math.min(30, Math.min(map.width, map.height) * 0.08);
  const gap = 2.5;
  graphics.lineStyle(2, GOLD, 0.55);
  /** [外角 x, 外角 y, 向外 x 方向, 向外 y 方向]。 */
  const corners: readonly (readonly [number, number, number, number])[] = [
    [map.x - 1, map.y - 1, -1, -1],
    [map.x + map.width + 1, map.y - 1, 1, -1],
    [map.x - 1, map.y + map.height + 1, -1, 1],
    [map.x + map.width + 1, map.y + map.height + 1, 1, 1],
  ];
  for (const [cx, cy, dx, dy] of corners) {
    const originX = cx + dx * gap;
    const originY = cy + dy * gap;
    graphics.lineBetween(originX, originY, originX + dx * arm, originY);
    graphics.lineBetween(originX, originY, originX, originY + dy * arm);
  }

  return graphics;
}

/**
 * 给一块地图矩形装「舞台框」。
 *
 * @param options.x/y/width/height 地图在世界里的设计坐标矩形（画框围着它画）。
 * @param options.variant 寝室 / 金殿 / 战场三种配色与构成。
 * @param options.reduced `prefers-reduced-motion` 或设置项；为 true 时颗粒不呼吸，其余静态不变。
 */
export function addStageFrame(
  scene: Phaser.Scene,
  options: StageFrameOptions,
): StageFrameHandle {
  const plan = getViewportPlan();
  const designWidth = plan.designWidth;
  const designHeight = plan.designHeight;
  const palette = PALETTES[options.variant];
  const reduced = options.reduced ?? prefersReducedMotion();

  const width = Math.max(1, Math.abs(finiteOr(options.width, designWidth)));
  const height = Math.max(1, Math.abs(finiteOr(options.height, designHeight)));
  const map = {
    x: finiteOr(options.x, 0),
    y: finiteOr(options.y, 0),
    width,
    height,
  };

  const objects: Phaser.GameObjects.GameObject[] = [];

  // 1) 墨色渐变底板：在 background 之下，被地图/世界容器盖住中间，只在上下的「画框区」露出来。
  const plateKey = ensurePlateTexture(scene, options.variant);
  if (plateKey) {
    objects.push(
      scene.add
        .image(0, 0, plateKey)
        .setOrigin(0, 0)
        .setDisplaySize(designWidth, designHeight)
        .setDepth(FRAME_DEPTH.plate),
    );
  }

  // 2) 纸张/胶片颗粒。
  const grain = drawGrain(scene, designWidth, designHeight, map, palette.grainAlpha);
  objects.push(grain);

  // 3) 鎏金细线 + 角标。
  objects.push(drawGoldRule(scene, map));

  // 4) 柔和暗角：复用 fx-kit；depth 压在地图层附近，只暗边缘、不碰 Compose UI。
  const vignette = addVignette(scene, {
    alpha: palette.vignetteAlpha,
    depth: FRAME_DEPTH.vignette,
  });
  objects.push(vignette);

  // 唯一会让画面「动」的地方：颗粒极慢地一亮一暗（像胶片在走片）。reduced 时跳过。
  if (!reduced) {
    scene.tweens.add({
      targets: grain,
      alpha: { from: palette.grainAlpha * 0.72, to: palette.grainAlpha },
      duration: 9000,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
    });
  }

  return {
    objects,
    destroy(): void {
      for (const object of objects) {
        scene.tweens.killTweensOf(object);
        object.destroy();
      }
      objects.length = 0;
    },
  };
}
