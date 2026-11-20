import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { CH01_ZHOU_STAND_FRAME } from '../src/assets/keys';
import {
  CH01_STAND_HEAD_CENTER_OFFSET,
  CH01_STAND_UP_SEQUENCE,
  CH01_WAKE_PERFORMANCE,
  CH01_XIAOBAI_HEAD_OFFSET_PX,
} from '../src/story/ch01-performance';

/**
 * 「小白起身时飘到与周全头部同一水平线」的对位护栏。
 *
 * 头高不是拍脑袋的常数：这里现场解码每张站立贴图的 alpha 轮廓，按同一套口径
 * （alpha ≥ 40、脖子 = 头区行宽局部最小、头部中线 = 头顶与脖子的中点）重算头部中线
 * 到脚底的距离，再和 `CH01_STAND_HEAD_CENTER_OFFSET` 对表。换了/重生成贴图而忘了改表，
 * 这里立刻红——否则小白会停在胸口，或者飘到头顶上方。
 */

const CHAR_DIR = 'public/assets/img/character/ch01';

/** 站立姿态会出现在屏上的贴图：正侧面 idle（起身后）+ 3/4 面八向（自由行动时）。 */
const STANDING_SPRITES = [
  { file: `${CHAR_DIR}/zhou_idle_right.png`, scale: CH01_ZHOU_STAND_FRAME.displayScale },
  { file: `${CHAR_DIR}/q/zhou_q_right.png`, scale: CH01_ZHOU_STAND_FRAME.displayScale },
  { file: `${CHAR_DIR}/q/zhou_q_down.png`, scale: CH01_ZHOU_STAND_FRAME.displayScale },
] as const;

/** 允许误差（设计 px）：三张图本身就有 189–192 的差异，取 190 是折中。 */
const HEAD_CENTER_TOLERANCE_PX = 4;

/** alpha 判定阈值，与 `tools/measure-actor-footprint.py` 保持一致。 */
const ALPHA_CUTOFF = 40;

interface DecodedPng {
  readonly width: number;
  readonly height: number;
  readonly rgba: Buffer;
}

/** 只解 8bit RGBA、非隔行的 PNG（这三张角色图都是这个格式，够用且零依赖）。 */
function decodePng(buffer: Buffer): DecodedPng {
  if (buffer.toString('ascii', 1, 4) !== 'PNG') throw new Error('不是 PNG');
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8] ?? 0;
      colorType = data[9] ?? 0;
      interlace = data[12] ?? 0;
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(`只支持 8bit RGBA 非隔行 PNG：depth=${bitDepth} color=${colorType} interlace=${interlace}`);
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  const rgba = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)] ?? 0;
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = rgba.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x += 1) {
      const left = x >= bpp ? (out[x - bpp] ?? 0) : 0;
      const up = y > 0 ? (rgba[(y - 1) * stride + x] ?? 0) : 0;
      const upLeft = y > 0 && x >= bpp ? (rgba[(y - 1) * stride + x - bpp] ?? 0) : 0;
      const value = line[x] ?? 0;
      switch (filter) {
        case 0:
          out[x] = value;
          break;
        case 1:
          out[x] = (value + left) & 0xff;
          break;
        case 2:
          out[x] = (value + up) & 0xff;
          break;
        case 3:
          out[x] = (value + ((left + up) >> 1)) & 0xff;
          break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          const pr = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
          out[x] = (value + pr) & 0xff;
          break;
        }
        default:
          throw new Error(`未知 PNG 行过滤器 ${filter}`);
      }
    }
  }
  return { width, height, rgba };
}

/** 每行不透明像素的行宽（alpha ≥ 40）。 */
function rowWidths(png: DecodedPng): { top: number; bottom: number; widths: Map<number, number> } {
  const widths = new Map<number, number>();
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < png.height; y += 1) {
    let count = 0;
    for (let x = 0; x < png.width; x += 1) {
      if ((png.rgba[(y * png.width + x) * 4 + 3] ?? 0) >= ALPHA_CUTOFF) count += 1;
    }
    if (count > 0) {
      widths.set(y, count);
      if (top < 0) top = y;
      bottom = y;
    }
  }
  return { top, bottom, widths };
}

/**
 * 头部中线（画布行）：头顶 → 脖子（头区里最窄的一行）的中点。
 *
 * 头区从头顶往下 60–160 行：太浅会量到耳朵/发际，太深会量到腰。这个窗口对 Q 版
 * 4 头身角色是稳的（三张图实测脖子分别在 140 / 149 / 146 行）。
 */
function headCenterCanvasRow(png: DecodedPng): number {
  const { top, widths } = rowWidths(png);
  let neck = top + 60;
  let narrowest = Number.POSITIVE_INFINITY;
  for (let y = top + 60; y <= top + 160; y += 1) {
    const width = widths.get(y) ?? 0;
    if (width > 0 && width < narrowest) {
      narrowest = width;
      neck = y;
    }
  }
  return (top + neck) / 2;
}

describe('小白与头部齐平的对位（像素对表）', () => {
  it('三张站立贴图的头部中线到脚底都在 190px 附近（±4）', () => {
    const measured = STANDING_SPRITES.map(({ file, scale }) => {
      const png = decodePng(readFileSync(file));
      expect(png.width).toBe(CH01_ZHOU_STAND_FRAME.canvasWidth);
      expect(png.height).toBe(CH01_ZHOU_STAND_FRAME.canvasHeight);
      const centerRow = headCenterCanvasRow(png);
      const { bottom } = rowWidths(png);
      // 脚底线必须还在 394（原点 394/400），否则「到脚底」这个距离没意义。
      expect(bottom).toBe(CH01_ZHOU_STAND_FRAME.bottom - 1);
      return (CH01_ZHOU_STAND_FRAME.bottom - centerRow) * scale;
    });
    for (const offset of measured) {
      expect(Math.abs(offset - CH01_STAND_HEAD_CENTER_OFFSET)).toBeLessThanOrEqual(
        HEAD_CENTER_TOLERANCE_PX,
      );
    }
  });

  it('对齐点在「坐姿落点」与「头顶气泡锚点」之间：确实升起来了，也没飘过头', () => {
    // 坐姿构图里小白中心约在脚底上方 54px（-2.5 格 × 21.8）；头顶气泡锚点 232。
    expect(CH01_STAND_HEAD_CENTER_OFFSET).toBeGreaterThan(54);
    expect(CH01_STAND_HEAD_CENTER_OFFSET).toBeLessThan(232);
    // 额外偏移只允许微调：±12px 之内都还压在头部上（头高约 70px）。
    expect(Math.abs(CH01_XIAOBAI_HEAD_OFFSET_PX)).toBeLessThanOrEqual(12);
  });
});

describe('起身与漂浮的同步（计划表）', () => {
  it('wakeUp 里漂浮步骤紧跟起身、并标了 parallel', () => {
    const steps = CH01_WAKE_PERFORMANCE.steps;
    const standIndex = steps.findIndex((step) => step.kind === 'frame-sequence');
    const floatStep = steps[standIndex + 1];
    expect(floatStep?.kind).toBe('float-actor');
    if (floatStep?.kind !== 'float-actor') throw new Error('expected float-actor');
    expect(floatStep.parallel).toBe(true);
    expect(floatStep.ms).toBe(CH01_STAND_UP_SEQUENCE.durationMs);
    expect(floatStep.actor).toBe('xiaobai');
  });
});
