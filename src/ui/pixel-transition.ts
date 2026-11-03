import { CG_HANDOFF_FADE_MS } from '../app/cg-handoff';
import { VIDEO_BACKDROP_FILTER, VIDEO_BACKDROP_SCALE } from './video-surface';

/**
 * 「写实视频 → 像素马赛克 → 游戏场景」里那块马赛克定格层（纯 DOM，不依赖 Phaser）。
 *
 * 做法：把视频**最后一帧** `drawImage` 到两块小 canvas，再 CSS 放大 + `image-rendering:pixelated`。
 * 只 `drawImage`、不读像素，所以不会触发跨域污染。
 *
 * ## 两层结构（2026-11-03 修「马赛克纵向拉伸 1.22x」）
 *
 * 旧实现把 720×1280 直接画进 48×104（9:19.5），再 `object-fit:cover` 铺满 9:19.5 屏：
 * 源是 9:16、目标是 9:19.5，纵向被拉开约 1.22 倍，像素人物比视频帧「更近」，
 * 从视频末帧切到马赛克时构图明显跳一下。
 *
 * 现在与 `video-surface` 用**同一套视觉契约**（前景 contain 保比例 + 背景同源模糊 cover 铺底）：
 *
 * - **前景层**：整帧按原比例画进 45×80（= 9:16）的小 canvas，CSS 用 `object-fit:contain`。
 *   它与 `<video>` 前景层几何完全一致（同一个 containing block、同一个 contain 规则），
 *   所以人物/床/窗的位置和视频末帧对齐，误差只来自像素块本身。
 * - **背景层**：同一帧按 `cover` 裁切（保持比例、裁掉溢出）画进 48×104 的小 canvas，
 *   再套用 `video-surface` 的模糊 + 压暗 + 微放大，填掉上下留边。
 *
 * 层叠：根节点 `position: fixed; z-index: 9`。它必须盖在 Phaser canvas（z-index 2）之上，
 * 否则寝室的不透明背景色会直接把它抹掉——代价是**加载页也在它下面**，
 * 所以全屏定格的时间必须短（见 `app/cg-handoff.ts`）。
 *
 * 溶解用 CSS `opacity` transition：`opacity` 是合成器属性，`fadeOut()` 之后
 * 下一帧起就由合成器接管，后面寝室首帧构建把主线程堵住也不影响它继续溶解。
 * （调用方必须保证「先 fadeOut、隔一帧再起跑场景切换」，否则 transition 还没提交
 * 就被首帧构建卡住，淡出会被一起推迟——这条在 `app/cg-handoff.ts` 里实现。）
 */
export interface PixelTransitionHandle {
  /** 前景（9:16）那块 canvas；背景层只负责铺底。 */
  readonly canvas: HTMLCanvasElement;
  /** 开始溶解；重复调用无副作用。 */
  fadeOut(): void;
  /** 从 DOM 摘掉；重复调用无副作用。 */
  remove(): void;
}

/** 前景：45×80 = 9:16，小到能看清像素块、又足够保留构图。 */
export const MOSAIC_FOREGROUND_WIDTH = 45;
export const MOSAIC_FOREGROUND_HEIGHT = 80;
/** 背景：贴合 9:19.5 竖屏的 cover 裁切尺寸（之后会模糊，粗糙一点没关系）。 */
export const MOSAIC_BACKDROP_WIDTH = 48;
export const MOSAIC_BACKDROP_HEIGHT = 104;
const MOSAIC_Z_INDEX = 9;

/** 一层像素画布：画布像素尺寸 + `drawImage` 的源矩形（视频像素坐标）。 */
export interface MosaicLayerPlan {
  readonly width: number;
  readonly height: number;
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
}

export interface MosaicPlan {
  /** 前景：整帧、保持原始宽高比（视频是 9:16 → 画布也是 9:16）。 */
  readonly foreground: MosaicLayerPlan;
  /** 背景：`cover` 裁切（保持比例，裁掉溢出部分），供模糊铺底。 */
  readonly backdrop: MosaicLayerPlan;
}

/**
 * 按源视频尺寸算两层的画布尺寸与裁切矩形。
 *
 * 前景的画布高度**由源宽高比反推**，保证 `drawImage` 不拉伸：视频是 9:16 时
 * 得到 45×80，若以后换成 4:3 的片子会得到 45×34，构图仍然不变形。
 */
export function planMosaic(videoWidth: number, videoHeight: number): MosaicPlan {
  const safeWidth = Math.max(1, videoWidth);
  const safeHeight = Math.max(1, videoHeight);
  const foregroundHeight = Math.max(
    1,
    Math.round((MOSAIC_FOREGROUND_WIDTH * safeHeight) / safeWidth),
  );
  const cover = coverCrop(safeWidth, safeHeight, MOSAIC_BACKDROP_WIDTH, MOSAIC_BACKDROP_HEIGHT);
  return {
    foreground: {
      width: MOSAIC_FOREGROUND_WIDTH,
      height: foregroundHeight,
      sx: 0,
      sy: 0,
      sw: safeWidth,
      sh: safeHeight,
    },
    backdrop: {
      width: MOSAIC_BACKDROP_WIDTH,
      height: MOSAIC_BACKDROP_HEIGHT,
      ...cover,
    },
  };
}

/**
 * `object-fit: cover` 的源裁切矩形：保持画面比例、铺满目标框，溢出部分居中裁掉。
 *
 * 纯函数，单测直接断言「裁切后的宽高比 = 目标宽高比」（不拉伸）与「不超出源画面」。
 */
export function coverCrop(
  videoWidth: number,
  videoHeight: number,
  targetWidth: number,
  targetHeight: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const sourceAspect = videoWidth / videoHeight;
  const targetAspect = targetWidth / targetHeight;
  if (sourceAspect > targetAspect) {
    // 源更宽：左右裁，高度铺满。
    const sw = videoHeight * targetAspect;
    return { sx: (videoWidth - sw) / 2, sy: 0, sw, sh: videoHeight };
  }
  // 源更高：上下裁，宽度铺满。
  const sh = videoWidth / targetAspect;
  return { sx: 0, sy: (videoHeight - sh) / 2, sw: videoWidth, sh };
}

/**
 * 抓 `video` 的当前帧，挂一层全屏马赛克。
 *
 * 拿不到画面（没有视频 / 首帧未解码 / 老 WebView 抛错）时返回 `null`，
 * 调用方应退回普通淡出——宁可少一次画风转场，也不能卡住。
 */
export function mountPixelTransition(video: HTMLVideoElement | null): PixelTransitionHandle | null {
  if (typeof document === 'undefined') return null;
  if (!video || video.readyState < 2 || video.videoWidth === 0) return null;

  try {
    const plan = planMosaic(video.videoWidth, video.videoHeight);

    const root = document.createElement('div');
    root.style.cssText =
      'position:fixed;inset:0;pointer-events:none;background:#05060a;' +
      `z-index:${MOSAIC_Z_INDEX};` +
      // 时长与 app/cg-handoff 的 fadeMs 同源，改一处即可。
      `transition:opacity ${CG_HANDOFF_FADE_MS}ms ease;`;
    root.dataset.avm = 'pixel-transition';

    // 背景层：cover 裁切 + 与 video-surface 同源的模糊/压暗，填掉 9:16 前景的上下留边。
    const backdrop = document.createElement('canvas');
    backdrop.width = plan.backdrop.width;
    backdrop.height = plan.backdrop.height;
    const backdropContext = backdrop.getContext('2d');
    if (!backdropContext) return null;
    backdropContext.imageSmoothingEnabled = false;
    backdropContext.drawImage(
      video,
      plan.backdrop.sx,
      plan.backdrop.sy,
      plan.backdrop.sw,
      plan.backdrop.sh,
      0,
      0,
      plan.backdrop.width,
      plan.backdrop.height,
    );
    backdrop.dataset.avm = 'pixel-transition-backdrop';
    backdrop.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;' +
      'image-rendering:pixelated;pointer-events:none;' +
      `filter:${VIDEO_BACKDROP_FILTER};transform:scale(${VIDEO_BACKDROP_SCALE});`;

    // 前景层：整帧、原比例（45×80），object-fit:contain ⇒ 与 <video> 前景层同一块矩形。
    const foreground = document.createElement('canvas');
    foreground.width = plan.foreground.width;
    foreground.height = plan.foreground.height;
    const foregroundContext = foreground.getContext('2d');
    if (!foregroundContext) return null;
    foregroundContext.imageSmoothingEnabled = false;
    foregroundContext.drawImage(
      video,
      plan.foreground.sx,
      plan.foreground.sy,
      plan.foreground.sw,
      plan.foreground.sh,
      0,
      0,
      plan.foreground.width,
      plan.foreground.height,
    );
    foreground.dataset.avm = 'pixel-transition';
    foreground.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;' +
      'image-rendering:pixelated;pointer-events:none;';

    root.append(backdrop, foreground);
    document.body.appendChild(root);

    let faded = false;
    let removed = false;
    return {
      canvas: foreground,
      fadeOut(): void {
        if (faded) return;
        faded = true;
        root.style.opacity = '0';
      },
      remove(): void {
        if (removed) return;
        removed = true;
        root.remove();
      },
    };
  } catch (error) {
    console.warn('[pixel-transition] 像素化转场抓帧失败，退回普通淡出', error);
    return null;
  }
}
