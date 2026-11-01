import type Phaser from 'phaser';

/** 竖屏设计宽度：所有 UI 坐标按这个宽度写。 */
export const DESIGN_WIDTH = 720;
/**
 * 设计高度随设备比例伸缩，避免出现黑边。
 *
 * 只钳制「极端比例」，不要为了凑 9:16 就把高度下限抬到 1280——
 * 788×1288 这类窗口的理想高度只有 1177，钳到 1280 之后设计框比窗口更窄，
 * Phaser 的 FIT 只能按高度缩放，于是左右各留一条黑边，画面既不满屏又显得「没居中」。
 * 下限放到 1100（= 720:1100 约 0.655，比常见竖屏都宽），既让画面铺满，
 * 也不会矮到把固定尺寸的 HUD 面板和对话面板挤爆。
 */
export const MIN_DESIGN_HEIGHT = 1100;
export const MAX_DESIGN_HEIGHT = 1700;

export interface ViewportPlan {
  /** 设计空间宽度（布局单位）。 */
  readonly designWidth: number;
  /** 设计空间高度（布局单位），1280–1600。 */
  readonly designHeight: number;
  /** 设备像素 / 设计单位。相机用它缩放，画布缓冲 = 设计 × scale。 */
  readonly scale: number;
  /** Phaser gameSize（画布后备缓冲，设备像素）。 */
  readonly gameWidth: number;
  readonly gameHeight: number;
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly dpr: number;
}

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/**
 * 设计宽固定 720；高度按视口比例算，钳制在 1280–1600。
 * 渲染倍率按「物理像素 / 设计宽」算（不是只看 dpr），并封顶 2.5 控制显存。
 */
export function planViewport(
  cssWidth = window.innerWidth,
  cssHeight = window.innerHeight,
  dpr = window.devicePixelRatio || 1,
): ViewportPlan {
  const width = Math.max(1, cssWidth);
  const height = Math.max(1, cssHeight);
  const devicePixelRatio = Math.max(1, dpr);

  const designHeight = clamp(
    Math.round((DESIGN_WIDTH * height) / width),
    MIN_DESIGN_HEIGHT,
    MAX_DESIGN_HEIGHT,
  );
  /**
   * 渲染倍率钉死 1：**画布缓冲 = 设计尺寸**，由 CSS 放大到屏幕。
   *
   * 曾经按「物理像素 / 720」算设备倍率（dpr 3 的手机会到 2.5），配合
   * `MVVMPlugin.configure({ designResolution })` 想让 UI 走设备分辨率。
   * 实测在 DPR>1 的真机上 UIRoot 没有跟着放大，而相机 `setZoom(scale)` 放大了整页：
   * 对话框左边被切、摇杆直接挤出屏幕（2026-11-02 用户截图复现）。
   * 钉成 1 之后 gameSize === designSize，相机 zoom=1，HUD 与设计坐标 1:1，
   * 所有既有单测/多视口验收也都在这个前提下通过。
   */
  const scale = 1;

  return {
    designWidth: DESIGN_WIDTH,
    designHeight,
    scale,
    gameWidth: Math.round(DESIGN_WIDTH * scale),
    gameHeight: Math.round(designHeight * scale),
    cssWidth: width,
    cssHeight: height,
    dpr: devicePixelRatio,
  };
}

let current: ViewportPlan | null = null;

export function setViewportPlan(plan: ViewportPlan): void {
  current = plan;
}

export function getViewportPlan(): ViewportPlan {
  current ??= planViewport();
  return current;
}

/**
 * 设备分辨率渲染：相机缩放 + 对准设计框中心。
 *
 * 只 setZoom 不 centerOn 的话，gameSize 比设计框大，相机只看得到设计框右下四分之一，
 * 点击也会全部落空（phaser-mvvm PITFALLS §8.73 实测）。
 */
export function applyCamera(scene: Phaser.Scene): void {
  const plan = getViewportPlan();
  const camera = scene.cameras.main;
  camera.setZoom(plan.scale);
  camera.centerOn(plan.designWidth / 2, plan.designHeight / 2);
}


/**
 * 视口变了就重新规划：设计高度、画布缓冲、相机都要跟着走。
 *
 * 真机上 WebView 的 `innerHeight` 常常在启动后变一次（系统栏淡入/全屏切换），
 * 而设计框是启动那一刻算的 → 画布被 FIT 打成四条黑边，
 * HUD 按旧设计框排，于是"对话框偏了、轮盘跑到屏幕外"。
 *
 * @returns 清理函数
 */
export function watchViewport(
  game: Phaser.Game,
  options: { onReplan: (plan: ViewportPlan) => void; threshold?: number },
): () => void {
  const threshold = options.threshold ?? 24;
  let seenWidth = getViewportPlan().cssWidth;
  let seenHeight = getViewportPlan().cssHeight;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const check = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const width = window.innerWidth;
      const height = window.innerHeight;
      if (Math.abs(width - seenWidth) < threshold && Math.abs(height - seenHeight) < threshold) {
        return;
      }
      seenWidth = width;
      seenHeight = height;
      const next = planViewport(width, height);
      const current = getViewportPlan();
      if (next.gameWidth === current.gameWidth && next.gameHeight === current.gameHeight) {
        return;
      }
      setViewportPlan(next);
      game.scale.resize(next.gameWidth, next.gameHeight);
      // resize 只换缓冲。FIT 的 CSS 尺寸在同一帧里 refresh 会用到旧的 baseSize
      // （算出来 428x700 这种"新宽度 × 旧高度"的怪值），推到下一帧再 refresh 才对。
      requestAnimationFrame(() => game.scale.refresh());
      options.onReplan(next);
    }, 260);
  };

  window.addEventListener('resize', check);
  window.addEventListener('orientationchange', check);
  window.visualViewport?.addEventListener('resize', check);
  return () => {
    if (timer !== null) clearTimeout(timer);
    window.removeEventListener('resize', check);
    window.removeEventListener('orientationchange', check);
    window.visualViewport?.removeEventListener('resize', check);
  };
}
