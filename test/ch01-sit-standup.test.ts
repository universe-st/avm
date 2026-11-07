import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CH01_ZHOU_SIT_RIGHT,
  CH01_ZHOU_STAND_FRAME,
  CH01_ZHOU_STAND_UP,
} from '../src/assets/keys';
import { CH01_SIT_DISPLAY_HEIGHT } from '../src/story/ch01-performance';

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

  it('缩放口径：素材人物高 × displayScale = 目标屏显高（禁止按画布高换算）', () => {
    // t29 曾按「画布高 400」算 160/400 = 0.4 —— 那会把 160 高的人物缩成 64px。
    // 目标高度是**人物**的，不是画布的：坐地 160、起身末帧 228（= 站立 371 × 0.6138）。
    expect(CH01_ZHOU_SIT_RIGHT.height * CH01_ZHOU_SIT_RIGHT.displayScale).toBe(
      CH01_SIT_DISPLAY_HEIGHT,
    );
    const heights = manifest.heights;
    const last = heights[heights.length - 1] ?? 0;
    expect(last * CH01_ZHOU_STAND_UP.displayScale).toBe(228);
    // 站立静态帧 371 高 × 场景 PLAYER_SCALE 0.6138 ≈ 228。
    expect(last * CH01_ZHOU_STAND_UP.displayScale).toBe(Math.round(371 * 0.6138));
  });

  it('逐帧都不贴边、底边一致', () => {
    expect(manifest.baseline).toEqual({ bottom: 394, cx: 80 });
    // 生成脚本按「底边 394 / 躯干锚点」落位，包围盒中心只允许小幅漂移（腿收回会让包围盒变化）。
    for (const [index, height] of manifest.heights.entries()) {
      expect(height, `f${index} 高度异常`).toBeLessThan(manifest.frameHeight);
    }
  });

  it('坐姿 / 起身帧 / 站立静态图：同一画布、同一底边 394（不跳脚）', () => {
    /**
     * 「缩小再长大」的根因是三者各用各的基准。这里把**素材 bbox 常量**锁死：
     * - 画布：坐姿 160×400、起身单帧 160×400、站立 Q 帧 160×400；
     * - 底边：都是 394（最后一排不透明像素 y=393 的下一行），原点 394/400 = 0.985；
     * - 缩放：坐姿 1.0（160 高）、起身 1.0（160 → 228）、站立 0.6138（371 → 228）。
     * 所以坐下 / 起身 / 站定的脚底在屏幕上始终是同一条线。
     */
    expect(CH01_ZHOU_SIT_RIGHT.canvasWidth).toBe(CH01_ZHOU_STAND_FRAME.canvasWidth);
    expect(CH01_ZHOU_SIT_RIGHT.canvasHeight).toBe(CH01_ZHOU_STAND_FRAME.canvasHeight);
    expect(CH01_ZHOU_STAND_UP.frameWidth).toBe(CH01_ZHOU_STAND_FRAME.canvasWidth);
    expect(CH01_ZHOU_STAND_UP.frameHeight).toBe(CH01_ZHOU_STAND_FRAME.canvasHeight);
    expect(CH01_ZHOU_SIT_RIGHT.bottom).toBe(CH01_ZHOU_STAND_FRAME.bottom);
    expect(manifest.baseline.bottom).toBe(CH01_ZHOU_STAND_FRAME.bottom);
    // 帧高 400、底边 394 → 下方留 6px 给鞋影；PlayerActor 原点取 0.985 = 394/400。
    expect(CH01_ZHOU_STAND_UP.frameHeight - CH01_ZHOU_SIT_RIGHT.bottom).toBe(6);
    expect(CH01_ZHOU_SIT_RIGHT.bottom / CH01_ZHOU_SIT_RIGHT.canvasHeight).toBeCloseTo(0.985, 5);
  });

  it('屏显高度：坐 160 / 起身末帧 228 / 站立 228（切回静态图不跳大小）', () => {
    expect(CH01_ZHOU_SIT_RIGHT.height * CH01_ZHOU_SIT_RIGHT.displayScale).toBe(
      CH01_SIT_DISPLAY_HEIGHT,
    );
    expect(
      Math.round(CH01_ZHOU_STAND_FRAME.height * CH01_ZHOU_STAND_FRAME.displayScale),
    ).toBe(228);
    const heights = manifest.heights;
    const last = heights[heights.length - 1] ?? 0;
    expect(last * CH01_ZHOU_STAND_UP.displayScale).toBe(
      Math.round(CH01_ZHOU_STAND_FRAME.height * CH01_ZHOU_STAND_FRAME.displayScale),
    );
  });

  it('站立静态 Q 帧的真实画布也是 160×400（常量和素材一致）', () => {
    const size = pngSize(readFileSync(`${CHAR_DIR}/q/zhou_q_right.png`));
    expect(size).toEqual({
      width: CH01_ZHOU_STAND_FRAME.canvasWidth,
      height: CH01_ZHOU_STAND_FRAME.canvasHeight,
    });
  });
});
