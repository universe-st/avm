import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { CH01_ASSET_KEYS, CH01_ZHOU_STAND_FRAME } from '../src/assets/keys';

/**
 * 侧面站立 idle（t39）的几何约束。
 *
 * 这张图存在的唯一理由：`zhou_stand_up` 的末帧是**正侧面**，而站立 idle 一直是
 * `q/zhou_q_right.png`（3/4 朝镜头），直接切会闪一下姿势 → 场景只能做 110ms 的
 * 交叉淡入伪装「转身」。所以新图必须和**站立帧/起身末帧同一套基准**：
 * 画布 160×400、人物高 371、底边 394、水平中心 80，否则接帧会跳。
 *
 * 基线数字由 `tools/make-zhou-idle-right.py` 实测写进 `idle-right-manifest.json`；
 * 这里既断言 manifest、也**真的解一遍 PNG 的 alpha 通道**量包围盒——
 * 图片可以重生成，但「站起来脚底不跳」这件事不能被悄悄改掉。
 */

const CHAR_DIR = 'public/assets/img/character/ch01';
const MANIFEST = 'assets-src/character/ch01/idle-right-manifest.json';
const ALPHA_CUTOFF = 40;

interface Profile {
  w: number;
  h: number;
  top: number;
  bottom: number;
  cx: number;
  head_w: number;
  shoulder: number;
}

interface IdleManifest {
  key: string;
  file: string;
  generator: string;
  sourceJob: string;
  canvas: { width: number; height: number };
  displayScale: number;
  idle: Profile;
  standupEndFrame: Profile;
  diff: {
    height: number;
    headWidth: number;
    shoulderY: number;
    topY: number;
    bottomY: number;
    centerX: number;
  };
  silhouetteIou: number;
}

/**
 * 解 PNG 的 alpha 通道（RGBA8 / 非隔行）。
 *
 * 只认 PIL 写出来的那种格式；遇到别的格式直接炸，别静默量错包围盒。
 * 解码走 node:zlib，没有新增依赖——和 `ch01-sit-standup.test.ts` 读 webp 头一个思路。
 */
function pngAlpha(buffer: Buffer): { width: number; height: number; alpha: Uint8Array } {
  expect(buffer.toString('ascii', 1, 4)).toBe('PNG');
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
      interlace = data.readUInt8(12);
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  expect({ bitDepth, colorType, interlace }).toEqual({ bitDepth: 8, colorType: 6, interlace: 0 });

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw.readUInt8(y * (stride + 1));
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const current = pixels.subarray(y * stride, (y + 1) * stride);
    const previous = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? current.readUInt8(x - 4) : 0;
      const up = previous ? previous.readUInt8(x) : 0;
      const upLeft = previous && x >= 4 ? previous.readUInt8(x - 4) : 0;
      let value = line.readUInt8(x);
      switch (filter) {
        case 0:
          break;
        case 1:
          value += left;
          break;
        case 2:
          value += up;
          break;
        case 3:
          value += (left + up) >> 1;
          break;
        case 4: {
          const estimate = left + up - upLeft;
          const distanceLeft = Math.abs(estimate - left);
          const distanceUp = Math.abs(estimate - up);
          const distanceUpLeft = Math.abs(estimate - upLeft);
          value +=
            distanceLeft <= distanceUp && distanceLeft <= distanceUpLeft
              ? left
              : distanceUp <= distanceUpLeft
                ? up
                : upLeft;
          break;
        }
        default:
          throw new Error(`未知的 PNG 行过滤器 ${filter}`);
      }
      current.writeUInt8(value & 0xff, x);
    }
  }

  const alpha = new Uint8Array(width * height);
  for (let index = 0; index < width * height; index += 1) {
    alpha[index] = pixels.readUInt8(index * 4 + 3);
  }
  return { width, height, alpha };
}

/** 和 `tools/make-zhou-idle-right.py` 同一套量法：alpha > 40 的包围盒。 */
function alphaBbox(alpha: Uint8Array, width: number, height: number) {
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((alpha[y * width + x] ?? 0) <= ALPHA_CUTOFF) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  expect(right, '整张图都是透明的').toBeGreaterThanOrEqual(0);
  return {
    w: right - left + 1,
    h: bottom - top + 1,
    top,
    /** 最后一排不透明像素的**下一行**（160×400 画布里是 394）。 */
    bottom: bottom + 1,
    cx: Math.round(((left + right + 1) / 2) * 10) / 10,
  };
}

describe('周全侧面站立 idle（t39）', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as IdleManifest;
  const file = readFileSync(`${CHAR_DIR}/zhou_idle_right.png`);

  it('画布 160×400，和站立帧同一套画布基准', () => {
    const image = pngAlpha(file);
    expect({ width: image.width, height: image.height }).toEqual({
      width: CH01_ZHOU_STAND_FRAME.canvasWidth,
      height: CH01_ZHOU_STAND_FRAME.canvasHeight,
    });
    expect(manifest.canvas).toEqual({ width: 160, height: 400 });
  });

  it('人物包围盒：高 365–375、底边 392–396、水平中心 78–82', () => {
    const image = pngAlpha(file);
    const bbox = alphaBbox(image.alpha, image.width, image.height);
    expect(bbox.h).toBeGreaterThanOrEqual(365);
    expect(bbox.h).toBeLessThanOrEqual(375);
    expect(bbox.bottom).toBeGreaterThanOrEqual(392);
    expect(bbox.bottom).toBeLessThanOrEqual(396);
    expect(bbox.cx).toBeGreaterThanOrEqual(78);
    expect(bbox.cx).toBeLessThanOrEqual(82);
    // 和站立 Q 帧 / 起身末帧对齐的常量：三者共用底边 394、中心 80、高 371。
    expect(bbox.bottom).toBe(CH01_ZHOU_STAND_FRAME.bottom);
    expect(bbox.cx).toBeCloseTo(CH01_ZHOU_STAND_FRAME.centerX, 0);
    expect(bbox.h).toBe(CH01_ZHOU_STAND_FRAME.height);
  });

  it('manifest 的实测数字与真实 PNG 一致（基线不许和素材脱节）', () => {
    const image = pngAlpha(file);
    const bbox = alphaBbox(image.alpha, image.width, image.height);
    expect(manifest.idle.h).toBe(bbox.h);
    expect(manifest.idle.bottom).toBe(bbox.bottom);
    expect(manifest.idle.top).toBe(bbox.top);
    expect(manifest.idle.cx).toBeCloseTo(bbox.cx, 1);
    expect(manifest.file).toBe(`${CHAR_DIR}/zhou_idle_right.png`);
  });

  it('与起身末帧并排：头顶 / 肩高 / 脚底差 ≤ 3px（接帧不跳）', () => {
    const { diff, standupEndFrame, idle } = manifest;
    expect(Math.abs(diff.height)).toBeLessThanOrEqual(3);
    expect(Math.abs(diff.shoulderY)).toBeLessThanOrEqual(3);
    expect(Math.abs(diff.topY)).toBeLessThanOrEqual(3);
    expect(Math.abs(diff.bottomY)).toBeLessThanOrEqual(3);
    // 头宽差 3px 是「同一角色同角度」的正常手绘抖动，但不能再大（否则像换了个人）。
    expect(Math.abs(diff.headWidth)).toBeLessThanOrEqual(4);
    // 两侧都按 §基准 归一化过：高 371、脚底 394。
    for (const side of [standupEndFrame, idle]) {
      expect(side.h).toBe(371);
      expect(side.bottom).toBe(394);
    }
    // 剪影重叠率：同姿势、同比例的两个独立渲染，0.85 以上才算「接得住」。
    expect(manifest.silhouetteIou).toBeGreaterThanOrEqual(0.85);
  });

  it('显示缩放沿用站立帧（371 × 0.6138 ≈ 228），和起身末帧同屏显高', () => {
    expect(manifest.displayScale).toBe(CH01_ZHOU_STAND_FRAME.displayScale);
    expect(Math.round(manifest.idle.h * manifest.displayScale)).toBe(228);
  });

  it('资源 key 已入库：img.char.ch01.zhou_idle_right', () => {
    expect(CH01_ASSET_KEYS.characters.zhouIdleRight).toBe('img.char.ch01.zhou_idle_right');
    expect(manifest.key).toBe(CH01_ASSET_KEYS.characters.zhouIdleRight);
    // 出图可追溯：哪一次生成任务、哪一张。
    expect(manifest.generator).toBe('tools/make-zhou-idle-right.py');
    expect(manifest.sourceJob).not.toBe('');
  });
});
