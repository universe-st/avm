import type { EmotionKind } from '../story/dialogue';

/**
 * 表情气泡的纯数据层：气泡外形尺寸 + 六种情绪的矢量图标。
 *
 * 背景：用户要求「角色头上冒的对话框不要用汉字，用图画表示」。六个情绪
 * （confused/angry/happy/surprised/sad/annoyed = 疑惑/生气/开心/吃惊/伤心/烦躁）
 * 全部用 Graphics 路径画，零图片资源、任意 DPR 都清晰，也没有「六个情绪各占一张图」
 * 的体积账（旧版用 Text 画汉字，本文件是那次改动的下限）。
 *
 * 这里只描述几何、不 import Phaser：单测和离线预览脚本可以直接跑，
 * 渲染（怎么画）在 `emotion-bubble.ts`。源码护栏见 `test/emotion-bubble-icons.test.ts`：
 * 本目录两个文件里不许再出现旧版那四个汉字字面量。
 *
 * 坐标系：气泡中心 = (0, 0)，图标中心 = (0, -5)（气泡内框的垂直中心）。
 * 所有坐标都是设计像素（720 宽基准），和场景单位一致。
 */

export interface IconPoint {
  readonly x: number;
  readonly y: number;
}

export interface IconBox {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

/** 图标笔画：只描述几何，怎么画由渲染层决定。 */
export type IconShape =
  /** 只描边的圆弧；角度按屏幕坐标（y 向下），0° 指右、90° 指下、270° 指上。 */
  | {
      readonly kind: 'arc';
      readonly cx: number;
      readonly cy: number;
      readonly radius: number;
      readonly fromDeg: number;
      readonly toDeg: number;
    }
  /** 只描边的折线（两个点就是一条直线）。 */
  | { readonly kind: 'polyline'; readonly points: readonly IconPoint[] }
  /** 实心圆点（眼睛、问号/感叹号的点）。 */
  | { readonly kind: 'fillCircle'; readonly cx: number; readonly cy: number; readonly radius: number }
  /** 实心多边形（水滴形）。 */
  | { readonly kind: 'fillPolygon'; readonly points: readonly IconPoint[] };

export interface EmotionIcon {
  /** 主色：笔画与填充用。沿用改汉字之前的 accent，不新增主题色。 */
  readonly color: string;
  readonly shapes: readonly IconShape[];
}

/**
 * 气泡外形。渲染层和单测都读这里，避免「气泡尺寸写在一处、图标避让写在另一处」。
 * 圆角框 62×52，尾巴挂在底边中点，外框描边 2px。
 */
export const BUBBLE_FILL = 0xfff9e8;
export const BUBBLE_LINE = 0x3a2e28;
export const BUBBLE_LINE_WIDTH = 2;
export const BUBBLE_FRAME = { x: -31, y: -31, width: 62, height: 52, radius: 13 } as const;
/** 尾巴三角：底边两点 + 尖端（画在框外）。 */
export const BUBBLE_TAIL: readonly [IconPoint, IconPoint, IconPoint] = [
  { x: -9, y: 19 },
  { x: 9, y: 19 },
  { x: 0, y: 34 },
];
/** 框内底部那条 accent 短线，给气泡一个底色呼应。 */
export const BUBBLE_ACCENT_LINE_Y = 17;

/**
 * 图标必须落在的区域：气泡圆角框内、再往里收一圈。
 * 上留 11px、下留 12px、左右各留 16px，图标不会蹭到描边，也不会压到 accent 短线。
 */
export const ICON_BOX: IconBox = { minX: -15, maxX: 15, minY: -20, maxY: 9 };

/** 线条粗细：比气泡 2px 描边略粗一档，26px 左右的小图标才不糊。 */
export const ICON_STROKE_WIDTH = 2.2;
/** 实心块（水滴/圆点）的深色描边：细一点，别把主色吃掉。 */
export const ICON_FILL_OUTLINE_WIDTH = 1.4;

const DEG_TO_RAD = Math.PI / 180;

/** 圆上一点（角度制，屏幕坐标：y 向下）。 */
export function pointOnArc(cx: number, cy: number, radius: number, deg: number): IconPoint {
  const rad = deg * DEG_TO_RAD;
  return { x: cx + Math.cos(rad) * radius, y: cy + Math.sin(rad) * radius };
}

/**
 * 水滴：底部一个半径 `radius` 的圆，顶部收到一个尖。
 *
 * 从右上肩（320°）顺时针绕到左上肩（580° = 220°），中间是圆的下半圈，
 * 所以外形是「上尖下圆」的一滴水；总高 = radius × (tipScale + 1)，总宽 = 2 × radius。
 */
export function teardrop(
  cx: number,
  cy: number,
  radius: number,
  tipScale = 2,
  segments = 16,
): readonly IconPoint[] {
  const points: IconPoint[] = [{ x: cx, y: cy - radius * tipScale }];
  const from = 320;
  const to = 320 + 260;
  for (let i = 0; i <= segments; i += 1) {
    points.push(pointOnArc(cx, cy, radius, from + ((to - from) * i) / segments));
  }
  return points;
}

/** 把一条笔画采样成点（单测和预览脚本用；渲染层不需要）。 */
export function sampleShapePoints(shape: IconShape, arcSegments = 24): readonly IconPoint[] {
  switch (shape.kind) {
    case 'arc': {
      const points: IconPoint[] = [];
      for (let i = 0; i <= arcSegments; i += 1) {
        const deg = shape.fromDeg + ((shape.toDeg - shape.fromDeg) * i) / arcSegments;
        points.push(pointOnArc(shape.cx, shape.cy, shape.radius, deg));
      }
      return points;
    }
    case 'polyline':
    case 'fillPolygon':
      return shape.points;
    case 'fillCircle':
      return sampleShapePoints(
        { kind: 'arc', cx: shape.cx, cy: shape.cy, radius: shape.radius, fromDeg: 0, toDeg: 360 },
        arcSegments,
      );
  }
}

/** 一个情绪图标的所有采样点。 */
export function iconPoints(icon: EmotionIcon): readonly IconPoint[] {
  return icon.shapes.flatMap((shape) => sampleShapePoints(shape));
}

/** 一组点的外接矩形。 */
export function iconBox(points: readonly IconPoint[]): IconBox {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

// ── 六个情绪 ───────────────────────────────────────────────────────────────
// 颜色沿用旧版汉字/符号的 accent：改图形不改情绪配色。
// `?` / `!` 也从 Text 换成同一条线条画的矢量符号，六个情绪只剩一个渲染路径。

/** 问号钩子的圆心/半径：∩ 形开口朝下，再回勾到中线。 */
const QUESTION_HOOK = { cx: 0, cy: -11.4, radius: 4.8 } as const;
/** 感叹号竖杠（点另画）。 */
const BANG_SHAFT_TOP = -15.6;
const BANG_SHAFT_BOTTOM = -2.6;
/**
 * 竖杠上下端的半宽：上宽下窄的锥形填充块。
 *
 * 2026-11-17 用户反馈「感叹号太细」：旧版是一根 2.2px 的描边线，26px 图标下
 * 只剩一两列像素，看着像根头发。改成实心多边形后，最窄处仍有 3.6px 宽，
 * 与点的比例也更像真正的「!」。
 */
const BANG_SHAFT_TOP_HALF = 2.6;
const BANG_SHAFT_BOTTOM_HALF = 1.8;
/** 感叹号圆点：位置沿用旧版（0, 1.9），只把半径从 1.75 抬到 1.9 跟上竖杠。 */
const BANG_DOT = { cx: 0, cy: 1.9, radius: 1.9 } as const;

/**
 * 感叹号竖杠的几何尺寸（设计 px），单测按它守「最窄处 ≥ 2.2px」。
 * 改形状时同步这里，别让断言和画面各说一套。
 */
export const BANG_SHAFT = {
  topY: BANG_SHAFT_TOP,
  bottomY: BANG_SHAFT_BOTTOM,
  topWidth: BANG_SHAFT_TOP_HALF * 2,
  bottomWidth: BANG_SHAFT_BOTTOM_HALF * 2,
} as const;
/** 头顶三道放射线：同一个虚点向外发，中间那道最长。 */
const BURST = { cx: 0, cy: -13.6, inner: 2.2, outer: 5.8 } as const;

export const EMOTION_ICONS = {
  /** 疑惑：问号（∩ 形钩子 + 回勾 + 短竖 + 点）。 */
  confused: {
    color: '#2f6fed',
    shapes: [
      {
        kind: 'arc',
        cx: QUESTION_HOOK.cx,
        cy: QUESTION_HOOK.cy,
        radius: QUESTION_HOOK.radius,
        fromDeg: 165,
        toDeg: 375,
      },
      {
        kind: 'polyline',
        points: [
          pointOnArc(QUESTION_HOOK.cx, QUESTION_HOOK.cy, QUESTION_HOOK.radius, 15),
          { x: 3.2, y: -6.9 },
          { x: 1.1, y: -4.5 },
          { x: 0, y: -3.4 },
          { x: 0, y: -0.4 },
        ],
      },
      { kind: 'fillCircle', cx: 0, cy: 2.9, radius: 1.7 },
    ],
  },

  /**
   * 生气：倒竖的两道粗眉 + 两个小眼睛 + 下撇的嘴 + 头顶三道放射线。
   * 「井字青筋」在 26px 下会糊成一团，所以走「眉毛 + 头顶冒烟」的漫画语法。
   */
  angry: {
    color: '#c0392b',
    shapes: [
      { kind: 'polyline', points: [{ x: -11.4, y: -11 }, { x: -3.2, y: -7 }] },
      { kind: 'polyline', points: [{ x: 11.4, y: -11 }, { x: 3.2, y: -7 }] },
      { kind: 'fillCircle', cx: -6, cy: -4.2, radius: 1.5 },
      { kind: 'fillCircle', cx: 6, cy: -4.2, radius: 1.5 },
      { kind: 'arc', cx: 0, cy: 6.2, radius: 4.8, fromDeg: 200, toDeg: 340 },
      {
        kind: 'polyline',
        points: [
          pointOnArc(BURST.cx, BURST.cy, BURST.inner, 215),
          pointOnArc(BURST.cx, BURST.cy, BURST.outer, 215),
        ],
      },
      {
        kind: 'polyline',
        points: [
          pointOnArc(BURST.cx, BURST.cy, BURST.inner, 270),
          pointOnArc(BURST.cx, BURST.cy, BURST.outer, 270),
        ],
      },
      {
        kind: 'polyline',
        points: [
          pointOnArc(BURST.cx, BURST.cy, BURST.inner, 325),
          pointOnArc(BURST.cx, BURST.cy, BURST.outer, 325),
        ],
      },
    ],
  },

  /** 开心：两只弯月眼（∩）+ 一张上翘的嘴（∪）。 */
  happy: {
    color: '#c28a12',
    shapes: [
      { kind: 'arc', cx: -7, cy: -9.2, radius: 4, fromDeg: 200, toDeg: 340 },
      { kind: 'arc', cx: 7, cy: -9.2, radius: 4, fromDeg: 200, toDeg: 340 },
      { kind: 'arc', cx: 0, cy: -2.6, radius: 7, fromDeg: 20, toDeg: 160 },
    ],
  },

  /**
   * 吃惊：一个实心锥形感叹号（填充竖条 + 圆点）。
   *
   * 2026-11-17 前是「2.2px 描边线段 + 点」，在手机上缩到 26px 就细得看不见；
   * 现在竖杠是 fillPolygon，渲染层不做线宽插值，任何倍率都是同一块实心形状。
   */
  surprised: {
    color: '#d35400',
    shapes: [
      {
        kind: 'fillPolygon',
        points: [
          { x: -BANG_SHAFT_TOP_HALF, y: BANG_SHAFT_TOP },
          { x: BANG_SHAFT_TOP_HALF, y: BANG_SHAFT_TOP },
          { x: BANG_SHAFT_BOTTOM_HALF, y: BANG_SHAFT_BOTTOM },
          { x: -BANG_SHAFT_BOTTOM_HALF, y: BANG_SHAFT_BOTTOM },
        ],
      },
      { kind: 'fillCircle', cx: BANG_DOT.cx, cy: BANG_DOT.cy, radius: BANG_DOT.radius },
    ],
  },

  /** 伤心：两个垂下的眼点 + 眼角两滴水 + 下撇的嘴。 */
  sad: {
    color: '#2f6fed',
    shapes: [
      { kind: 'fillCircle', cx: -6.4, cy: -9.6, radius: 2.1 },
      { kind: 'fillCircle', cx: 6.4, cy: -9.6, radius: 2.1 },
      { kind: 'fillPolygon', points: teardrop(-10.2, -3.6, 2.8, 2) },
      { kind: 'fillPolygon', points: teardrop(10.2, -3.6, 2.8, 2) },
      { kind: 'arc', cx: 0, cy: 5.2, radius: 5.4, fromDeg: 200, toDeg: 340 },
    ],
  },

  /** 烦躁：只用两滴水（一大一小），不画脸——两滴比一滴更醒目，也和伤心那两滴（挂在眼角）错开位置。 */
  annoyed: {
    color: '#6b5bb5',
    shapes: [
      { kind: 'fillPolygon', points: teardrop(-3.6, -3, 5.8, 2.05) },
      { kind: 'fillPolygon', points: teardrop(6.6, -11.4, 3, 2) },
    ],
  },
} as const satisfies Record<EmotionKind, EmotionIcon>;
