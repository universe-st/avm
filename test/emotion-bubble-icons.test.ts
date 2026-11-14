import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EmotionKind } from '../src/story/dialogue';
import {
  BUBBLE_ACCENT_LINE_Y,
  BUBBLE_FRAME,
  BUBBLE_LINE_WIDTH,
  BUBBLE_TAIL,
  EMOTION_ICONS,
  ICON_BOX,
  ICON_STROKE_WIDTH,
  iconBox,
  iconPoints,
  pointOnArc,
  sampleShapePoints,
  teardrop,
} from '../src/ui/emotion-bubble-model';

/**
 * 表情气泡的护栏（纯数据 + 源码检查，不启动 Phaser）。
 *
 * 背景：2026-11 用户要求「角色头上冒的对话框不要用汉字，用图画表示」。旧版把
 * 疑惑/生气/开心/吃惊/伤心/烦躁 六个情绪渲染成 `?`/汉字/`!`，气泡里是 Text。
 * 这次改成 Graphics 画矢量图标，所以这里守三件事：
 * 1. 六个情绪都有图标，颜色仍是旧 accent（改图形不改配色）；
 * 2. 图标几何都落在气泡内框里，尺寸接近 26–30px，不会压到描边/尾巴/accent 短线；
 * 3. 源码里不再出现旧版那四个汉字，也不再建 Text 对象（回归就会红）。
 */

const KINDS: readonly EmotionKind[] = [
  'confused',
  'angry',
  'happy',
  'surprised',
  'sad',
  'annoyed',
];

/** 旧版拿汉字当图标的那四个字；任何人把它们写回代码/注释都会被抓到。 */
const BANNED_GLYPHS = ['笑', '汗', '怒', '泪'] as const;

function sourceOf(file: string): string {
  return readFileSync(join('src/ui', file), 'utf8');
}

describe('表情气泡图标', () => {
  it('六个情绪都有矢量图标，也没有多出来的 kind', () => {
    expect(Object.keys(EMOTION_ICONS).sort()).toEqual([...KINDS].sort());

    for (const kind of KINDS) {
      const icon = EMOTION_ICONS[kind];
      expect(icon.shapes.length, `${kind} 至少一笔`).toBeGreaterThan(0);
      for (const shape of icon.shapes) {
        if (shape.kind === 'arc') {
          expect(shape.radius, kind).toBeGreaterThan(0);
          expect(shape.toDeg, kind).toBeGreaterThan(shape.fromDeg);
          // 单段弧不许绕超过一整圈（Phaser 的 WebGL Graphics 会把超出的部分夹掉）。
          expect(shape.toDeg - shape.fromDeg, kind).toBeLessThanOrEqual(360);
        }
        if (shape.kind === 'fillCircle') {
          expect(shape.radius, kind).toBeGreaterThan(0);
        }
        if (shape.kind === 'polyline' || shape.kind === 'fillPolygon') {
          expect(shape.points.length, `${kind} 折线至少两点`).toBeGreaterThanOrEqual(2);
        }
        for (const point of sampleShapePoints(shape)) {
          expect(Number.isFinite(point.x) && Number.isFinite(point.y), kind).toBe(true);
        }
      }
    }
  });

  it('沿用旧 accent 配色：改图形不改情绪颜色', () => {
    const accents = Object.fromEntries(KINDS.map((kind) => [kind, EMOTION_ICONS[kind].color]));
    expect(accents).toEqual({
      confused: '#2f6fed',
      angry: '#c0392b',
      happy: '#c28a12',
      surprised: '#d35400',
      sad: '#2f6fed',
      annoyed: '#6b5bb5',
    });
  });

  it('每个图标都落在气泡内框里，且离描边/尾巴/accent 短线都有余量', () => {
    const frameRight = BUBBLE_FRAME.x + BUBBLE_FRAME.width;
    const frameBottom = BUBBLE_FRAME.y + BUBBLE_FRAME.height;

    for (const kind of KINDS) {
      const box = iconBox(iconPoints(EMOTION_ICONS[kind]));
      expect(box.minX, kind).toBeGreaterThanOrEqual(ICON_BOX.minX);
      expect(box.maxX, kind).toBeLessThanOrEqual(ICON_BOX.maxX);
      expect(box.minY, kind).toBeGreaterThanOrEqual(ICON_BOX.minY);
      expect(box.maxY, kind).toBeLessThanOrEqual(ICON_BOX.maxY);

      // 内框到气泡描边至少留 8px：图标不会蹭到圆角框的线。
      expect(box.minX - BUBBLE_FRAME.x, kind).toBeGreaterThanOrEqual(8);
      expect(frameRight - box.maxX, kind).toBeGreaterThanOrEqual(8);
      expect(box.minY - BUBBLE_FRAME.y, kind).toBeGreaterThanOrEqual(8);
      expect(frameBottom - box.maxY, kind).toBeGreaterThanOrEqual(8);
      // 图标底部不能压到那条 accent 短线，也不能压到尾巴三角。
      expect(box.maxY, kind).toBeLessThanOrEqual(BUBBLE_ACCENT_LINE_Y - 4);
      expect(box.maxY, kind).toBeLessThanOrEqual(BUBBLE_TAIL[0].y - 4);
    }
  });

  it('图标实际显示约 26–30px（`?`/`!` 天然窄，按最长边判）', () => {
    for (const kind of KINDS) {
      const box = iconBox(iconPoints(EMOTION_ICONS[kind]));
      const width = box.maxX - box.minX;
      const height = box.maxY - box.minY;
      const longest = Math.max(width, height);
      expect(longest, `${kind} 太小会看不清`).toBeGreaterThanOrEqual(18);
      expect(longest, `${kind} 太大就出框`).toBeLessThanOrEqual(30);
    }
  });

  it('线条比气泡 2px 描边略粗一档，但不夸张', () => {
    expect(ICON_STROKE_WIDTH).toBeGreaterThan(BUBBLE_LINE_WIDTH);
    expect(ICON_STROKE_WIDTH).toBeLessThanOrEqual(3);
  });

  it('水滴是「上尖下圆」：尖点在最上面，底圆宽度等于 2r', () => {
    const radius = 3;
    const points = teardrop(0, 0, radius, 2);
    const box = iconBox(points);

    const tip = points[0];
    if (tip === undefined) throw new Error('水滴缺尖点');
    // 第一点是尖；总高 = r × (tipScale + 1) = 9，总宽 ≈ 2r = 6
    // （16 段折线是内接多边形，左右极值不落在 180°，所以宽度略小于 2r）。
    expect(tip).toEqual({ x: 0, y: -radius * 2 });
    expect(box.maxX - box.minX).toBeGreaterThan(radius * 1.9);
    expect(box.maxX - box.minX).toBeLessThanOrEqual(radius * 2);
    expect(box.maxY - box.minY).toBeCloseTo(radius * 3, 5);
    // 尖点确实在最上面，其余点都在它下方。
    expect(box.minY).toBeCloseTo(tip.y, 5);
    expect(box.maxY).toBeCloseTo(radius, 5);
    // 底圆下沿在中轴两侧对称（同样受内接多边形影响，略窄）。
    expect(box.minX).toBeCloseTo(-radius, 1);
    expect(box.maxX).toBeCloseTo(radius, 1);
    expect(box.minX).toBeCloseTo(-box.maxX, 5);
  });

  it('圆弧采样点落在圆上（几何基元没写错）', () => {
    const point = pointOnArc(0, 0, 5, 270);
    expect(point.x).toBeCloseTo(0, 5);
    expect(point.y).toBeCloseTo(-5, 5); // 270° = 正上方（屏幕坐标 y 向下）

    const right = pointOnArc(2, 3, 4, 0);
    expect(right.x).toBeCloseTo(6, 5);
    expect(right.y).toBeCloseTo(3, 5);
  });
});

describe('表情气泡不再用汉字 / 不再建 Text', () => {
  const FILES = ['emotion-bubble.ts', 'emotion-bubble-model.ts'] as const;

  it('源码里没有旧版那四个汉字（笑、汗、怒、泪）', () => {
    for (const file of FILES) {
      const source = sourceOf(file);
      for (const glyph of BANNED_GLYPHS) {
        expect(source.includes(glyph), `${file} 里还留着「${glyph}」`).toBe(false);
      }
    }
  });

  it('气泡靠 Graphics 画图：不建 Text、不加载图片', () => {
    for (const file of FILES) {
      const source = sourceOf(file);
      expect(source.includes('add.text('), `${file} 还在建 Text`).toBe(false);
      expect(source.includes('GameObjects.Text'), `${file} 还引用 Text`).toBe(false);
      expect(source.includes('add.image('), `${file} 引入了图片`).toBe(false);
      expect(source.includes('textures.'), `${file} 读纹理了`).toBe(false);
    }
    // 图标定义只允许四种纯几何笔画。
    for (const kind of KINDS) {
      for (const shape of EMOTION_ICONS[kind].shapes) {
        expect(['arc', 'polyline', 'fillCircle', 'fillPolygon']).toContain(shape.kind);
      }
    }
  });
});
