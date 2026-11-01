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
export const MAX_DESIGN_HEIGHT = 1600;

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
  const rawScale = (width * devicePixelRatio) / DESIGN_WIDTH;
  const scale = clamp(Math.round(rawScale * 4) / 4, 1, 2.5);

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
