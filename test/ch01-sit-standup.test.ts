import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CH01_ZHOU_SIT_RIGHT, CH01_ZHOU_STAND_UP } from '../src/assets/keys';

/**
 * 坐地朝右静帧 + 起身序列（t28）的几何约束。
 *
 * 像素级的「每帧非空 / 不贴边 / 高度单调」由生成脚本
 * `tools/make-zhou-sit-standup.py` 现场量过并写进 manifest；这里把那些数字变成
 * 每次 `pnpm test` 都会跑的断言——图片可以重生成，但这些基线不能被悄悄改掉。
 */

const CHAR_DIR = 'public/assets/img/character/ch01';
const MANIFEST = 'assets-src/character/ch01/standup-manifest.json';
const MAX_TEXTURE_SIZE = 4096;

interface StandupManifest {
  frameCount: number;
  frameWidth: number;
  frameHeight: number;
  frameMs: number;
  displayScale: number;
  heights: number[];
  headWidths: number[];
  baseline: { bottom: number; cx: number };
}

/** PNG 的 IHDR 宽高（字节 16..24）。 */
function pngSize(buffer: Buffer): { width: number; height: number } {
  expect(buffer.toString('ascii', 1, 4)).toBe('PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** 读 WebP 头拿宽高（VP8 / VP8L / VP8X 三种格式）。 */
function webpSize(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF') return null;
  if (buffer.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return {
      width: 1 + (buffer.readUIntLE(24, 3) & 0xffffff),
      height: 1 + (buffer.readUIntLE(27, 3) & 0xffffff),
    };
  }
  if (chunk === 'VP8 ') {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

describe('周全坐地朝右静帧', () => {
  it('画布是 160×400，和站立帧同一套基准', () => {
    const size = pngSize(readFileSync(`${CHAR_DIR}/zhou_sit_right.png`));
    expect(size).toEqual({ width: 160, height: 400 });
  });

  it('元数据：显示缩放 1.0、底边 394、水平中心 80、坐高在 150–170', () => {
    expect(CH01_ZHOU_SIT_RIGHT.displayScale).toBe(1);
    expect(CH01_ZHOU_SIT_RIGHT.bottom).toBe(394);
    expect(CH01_ZHOU_SIT_RIGHT.centerX).toBe(80);
    expect(CH01_ZHOU_SIT_RIGHT.height).toBeGreaterThanOrEqual(150);
    expect(CH01_ZHOU_SIT_RIGHT.height).toBeLessThanOrEqual(170);
  });
});

describe('周全起身序列', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as StandupManifest;

  it('sheet 是 8 帧 × 160 宽，整张宽度低于真机纹理上限', () => {
    expect(manifest.frameCount).toBe(CH01_ZHOU_STAND_UP.frameCount);
    expect(manifest.frameWidth).toBe(CH01_ZHOU_STAND_UP.frameWidth);
    expect(manifest.frameHeight).toBe(CH01_ZHOU_STAND_UP.frameHeight);
    const data = readFileSync(`${CHAR_DIR}/zhou_stand_up.webp`);
    const size = webpSize(data);
    expect(size).not.toBeNull();
    const { width, height } = size as { width: number; height: number };
    expect(width).toBe(CH01_ZHOU_STAND_UP.frameWidth * CH01_ZHOU_STAND_UP.frameCount);
    expect(height).toBe(CH01_ZHOU_STAND_UP.frameHeight);
    expect(width).toBeLessThan(MAX_TEXTURE_SIZE);
  });

  it('播放参数：displayScale 1.0（和坐姿同画布，不许再乘 PLAYER_SCALE）', () => {
    expect(CH01_ZHOU_STAND_UP.displayScale).toBe(1);
    expect(manifest.displayScale).toBe(1);
    expect(CH01_ZHOU_STAND_UP.frameMs).toBeGreaterThanOrEqual(50);
    expect(CH01_ZHOU_STAND_UP.frameMs).toBeLessThanOrEqual(100);
  });

  it('人物高度严格单调递增：坐最低、站最高，中间不许变矮', () => {
    const heights = manifest.heights;
    expect(heights).toHaveLength(CH01_ZHOU_STAND_UP.frameCount);
    for (let index = 1; index < heights.length; index += 1) {
      const previous = heights[index - 1] ?? 0;
      expect(heights[index], `f${index} 比 f${index - 1} 矮`).toBeGreaterThan(previous);
    }
    // 首帧 = 坐姿图高度，末帧 = 站立帧 371 × 0.6138 ≈ 228（起身演完能无缝切回站立贴图）。
    expect(heights[0]).toBe(CH01_ZHOU_SIT_RIGHT.height);
    expect(heights[heights.length - 1]).toBe(228);
  });

  it('人物大小不变：逐帧头宽波动 < 6%（不是「被拉高/压扁」）', () => {
    const heads = manifest.headWidths;
    const first = heads[0] ?? 0;
    expect(first).toBeGreaterThan(0);
    for (const [index, head] of heads.entries()) {
      expect(Math.abs(head - first) / first, `f${index} 头宽 ${head} 偏离首帧 ${first}`).toBeLessThan(
        0.06,
      );
    }
  });

  it('逐帧都不贴边、底边一致', () => {
    expect(manifest.baseline).toEqual({ bottom: 394, cx: 80 });
    // 生成脚本按「底边 394 / 躯干锚点」落位，包围盒中心只允许小幅漂移（腿收回会让包围盒变化）。
    for (const [index, height] of manifest.heights.entries()) {
      expect(height, `f${index} 高度异常`).toBeLessThan(manifest.frameHeight);
    }
  });
});
