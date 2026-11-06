import { CG_HANDOFF_FADE_MS } from '../app/cg-handoff';
import { VIDEO_BACKDROP_FILTER, VIDEO_BACKDROP_SCALE } from './video-surface';

/**
 * 「写实视频 → 像素马赛克 → 游戏场景」里那块马赛克定格层（纯 DOM，不依赖 Phaser）。
 *
 * 做法：把视频**最后一帧** `drawImage` 到两块小 canvas，再 CSS 放大 + `image-rendering:pixelated`。
 * 只 `drawImage`、不读像素，所以不会触发跨域污染。
 *
 * ## 两种画法（2026-11-06 修「点跳过先闪一下马赛克」）
 *
 * 同一个「盖住视频、按时间线淡掉」的壳子，按退出意图换画法（意图由 `app/cg-handoff.ts`
 * 的 `planCgExit()` 决定，本模块只管画）：
 *
 * - `mode: 'mosaic'`（自然播完）：45×80 / 48×104 两块小 canvas + `pixelated`——
 *   像素风转场，见下面的两层结构说明。
 * - `mode: 'frame'`（跳过）：整帧按原分辨率（长边 ≤1280）画进 canvas，**不**像素化，
 *   视觉上就是视频定格那一刻；随后用 120ms 淡出直接切走。抓不到帧时只留一层纯黑
 *   `#05060a`——跳过绝不能为了一段转场把玩家卡住。
 *
 * 两个模式的层叠、定时、`fadeOut()/remove()` 语义完全一致。
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
  /**
   * 前景那块 canvas；干净兜底（`mode: 'frame'` 但视频帧抓不到）时是 `null`，
   * 此时整层只剩不透明纯黑底。
   */
  readonly canvas: HTMLCanvasElement | null;
  /** 开始溶解；重复调用无副作用。 */
  fadeOut(): void;
  /** 从 DOM 摘掉；重复调用无副作用。 */
  remove(): void;
}

/** 过渡层的两种画法：像素化（播完）/ 原样整帧（跳过）。 */
export type PixelTransitionMode = 'mosaic' | 'frame';

export interface PixelTransitionOptions {
  /** 画法，默认 `mosaic`。 */
  readonly mode?: PixelTransitionMode;
  /** 溶解时长；默认 `CG_HANDOFF_FADE_MS`，跳过传 `CG_SKIP_FADE_MS`。 */
  readonly fadeMs?: number;
}

/** 前景：45×80 = 9:16，小到能看清像素块、又足够保留构图。 */
export const MOSAIC_FOREGROUND_WIDTH = 45;
export const MOSAIC_FOREGROUND_HEIGHT = 80;
/** 背景：贴合 9:19.5 竖屏的 cover 裁切尺寸（之后会模糊，粗糙一点没关系）。 */
export const MOSAIC_BACKDROP_WIDTH = 48;
export const MOSAIC_BACKDROP_HEIGHT = 104;
/** 跳过用的整帧层：长边上限 1280（4K 片子也不至于为一次 120ms 的淡出占几十 MB）。 */
export const FRAME_MAX_EDGE = 1280;
/**
 * 跳过用的背景层：与马赛克层同一个裁切比例（9:19.5），但分辨率高一档——
 * 它要铺满整屏又被模糊 28px，120×260 已经足够平滑，再高只是浪费显存。
 */
export const FRAME_BACKDROP_WIDTH = 120;
export const FRAME_BACKDROP_HEIGHT = 260;
const MOSAIC_Z_INDEX = 9;
/** 过渡层的底色，同时也是「抓不到帧」时的干净兜底：和页面/相机底色一致。 */
const TRANSITION_BACKGROUND = '#05060a';

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
 * 视频当前帧能不能抓（`readyState >= HAVE_CURRENT_DATA` 且已经解出尺寸）。
 *
 * 与 `mountPixelTransition()` 用同一个判据：场景决定「这次退出要不要带画面」时
 * 不能自己再写一份检查，否则两处一旦不一致，就会出现「计划里有画面、实际没画面」。
 * Node / 单测环境没有 DOM，一律 false。
 */
export function canCaptureFrame(video: HTMLVideoElement | null): boolean {
  if (typeof document === 'undefined') return false;
  if (!video) return false;
  return video.readyState >= 2 && video.videoWidth > 0;
}

/** 两层画布的绘制计划（像素化 / 原样整帧共用一套字段）。 */
interface LayerPlan {
  readonly width: number;
  readonly height: number;
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
}

/**
 * 跳过用的整帧层：前景按源分辨率画（长边 ≤ `FRAME_MAX_EDGE`），背景 cover 裁切。
 *
 * 与 `planMosaic()` 的差别只有分辨率：跳过时不做画风转场，画面上就该是玩家
 * 点下去那一刻的同一帧，所以前景必须保持原比例（`object-fit:contain` 的几何与
 * `<video>` 前景层一致），缩放只在超过长边上限时才发生。
 */
export function planFrameTransition(videoWidth: number, videoHeight: number): {
  foreground: LayerPlan;
  backdrop: LayerPlan;
} {
  const safeWidth = Math.max(1, videoWidth);
  const safeHeight = Math.max(1, videoHeight);
  const scale = Math.min(1, FRAME_MAX_EDGE / Math.max(safeWidth, safeHeight));
  return {
    foreground: {
      width: Math.max(1, Math.round(safeWidth * scale)),
      height: Math.max(1, Math.round(safeHeight * scale)),
      sx: 0,
      sy: 0,
      sw: safeWidth,
      sh: safeHeight,
    },
    backdrop: {
      width: FRAME_BACKDROP_WIDTH,
      height: FRAME_BACKDROP_HEIGHT,
      ...coverCrop(safeWidth, safeHeight, FRAME_BACKDROP_WIDTH, FRAME_BACKDROP_HEIGHT),
    },
  };
}

/** 两层都绝对定位铺满；前景 contain 保构图，背景 cover 填边。 */
const LAYER_BASE_STYLE = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';

/**
 * 把当前帧画进两块 canvas。返回 `null` 表示这台设备画不出来（拿不到 2D context），
 * 调用方按模式决定「退回普通淡出」还是「只留纯黑兜底」。
 */
function drawFrameLayers(
  video: HTMLVideoElement,
  mode: PixelTransitionMode,
): { foreground: HTMLCanvasElement; backdrop: HTMLCanvasElement } | null {
  const mosaic = mode === 'mosaic';
  const plan = mosaic
    ? planMosaic(video.videoWidth, video.videoHeight)
    : planFrameTransition(video.videoWidth, video.videoHeight);
  const prefix = mosaic ? 'pixel-transition' : 'frame-transition';
  // 像素化必须关掉插值，否则浏览器会把「像素块」抹成模糊；整帧层反过来要保持平滑。
  const rendering = mosaic ? 'image-rendering:pixelated;' : '';

  // 背景层：cover 裁切 + 与 video-surface 同源的模糊/压暗，填掉 9:16 前景的上下留边。
  const backdrop = document.createElement('canvas');
  backdrop.width = plan.backdrop.width;
  backdrop.height = plan.backdrop.height;
  const backdropContext = backdrop.getContext('2d');
  if (!backdropContext) return null;
  backdropContext.imageSmoothingEnabled = !mosaic;
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
  backdrop.dataset.avm = `${prefix}-backdrop`;
  backdrop.style.cssText =
    `${LAYER_BASE_STYLE}object-fit:cover;${rendering}` +
    `filter:${VIDEO_BACKDROP_FILTER};transform:scale(${VIDEO_BACKDROP_SCALE});`;

  // 前景层：整帧、原比例（马赛克 45×80，整帧层按源分辨率），
  // object-fit:contain ⇒ 与 <video> 前景层同一块矩形。
  const foreground = document.createElement('canvas');
  foreground.width = plan.foreground.width;
  foreground.height = plan.foreground.height;
  const foregroundContext = foreground.getContext('2d');
  if (!foregroundContext) return null;
  foregroundContext.imageSmoothingEnabled = !mosaic;
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
  foreground.dataset.avm = prefix;
  foreground.style.cssText = `${LAYER_BASE_STYLE}object-fit:contain;${rendering}`;

  return { foreground, backdrop };
}

/**
 * 抓 `video` 的当前帧，挂一层全屏过渡层（壳子两种模式共用）。
 *
 * - `mode: 'mosaic'`（默认，自然播完）：把当前帧像素化后定格。拿不到画面
 *   （没有视频 / 首帧未解码 / 老 WebView 抛错）时返回 `null`，调用方退回普通淡出——
 *   宁可少一次画风转场，也不能卡住。
 * - `mode: 'frame'`（跳过）：整帧原样盖住，用 `fadeMs` 快速淡出。**即使抓不到帧也不返回
 *   `null`**——此时挂一层纯黑 `#05060a`，保证「跳过」永远有干净画面、永远不露 `<video>` 最后一帧。
 */
export function mountPixelTransition(
  video: HTMLVideoElement | null,
  options: PixelTransitionOptions = {},
): PixelTransitionHandle | null {
  if (typeof document === 'undefined') return null;
  const mode = options.mode ?? 'mosaic';
  const fadeMs = Math.max(0, options.fadeMs ?? CG_HANDOFF_FADE_MS);
  const capturable = canCaptureFrame(video);
  // 马赛克是给「播完」用的画风转场：抓不到末帧就干脆不挂（调用方退回普通淡出）。
  if (mode === 'mosaic' && !capturable) return null;

  try {
    const mosaic = mode === 'mosaic';
    const root = document.createElement('div');
    root.style.cssText =
      'position:fixed;inset:0;pointer-events:none;' +
      `background:${TRANSITION_BACKGROUND};z-index:${MOSAIC_Z_INDEX};` +
      `transition:opacity ${fadeMs}ms ease;`;
    root.dataset.avm = mosaic ? 'pixel-transition' : 'frame-transition';

    let foreground: HTMLCanvasElement | null = null;
    if (capturable && video) {
      let layers: { foreground: HTMLCanvasElement; backdrop: HTMLCanvasElement } | null = null;
      try {
        layers = drawFrameLayers(video, mode);
      } catch (error) {
        // 老 WebView / 解不了码的片子：drawImage 会抛。跳过路径照旧靠纯黑底兜住。
        console.warn('[pixel-transition] 过渡层抓帧失败，退回纯色过渡', error);
        layers = null;
      }
      if (layers) {
        root.append(layers.backdrop, layers.foreground);
        foreground = layers.foreground;
      } else if (mosaic) {
        // 画不出来就别挂：老 WebView 上宁可退回普通淡出。
        return null;
      }
      // frame 模式画不出来 → 保留纯黑底，照样能在时间线上干净地淡掉。
    }

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
    console.warn('[pixel-transition] 过渡层抓帧失败，退回普通淡出', error);
    return null;
  }
}
