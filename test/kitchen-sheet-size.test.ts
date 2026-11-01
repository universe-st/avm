import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CH01_KITCHEN_FRAME, CH01_KITCHEN_WALK_FRAME_COUNT } from '../src/assets/keys';

/**
 * 行走 sheet 的整张宽度必须小于 GPU 的 MAX_TEXTURE_SIZE。
 *
 * 手机常见上限是 **4096**（桌面 16384，所以本地永远测不出来）。
 * 一旦超了，WebGL 纹理创建失败，角色会渲染成一块纯黑矩形——2026-11-02 真机复现过：
 * 帧宽 224 × 20 帧 = 4480 > 4096，御厨走路时变成黑块。
 */

const KITCHEN_DIR = 'public/assets/img/character/ch01/kitchen';
const MAX_TEXTURE_SIZE = 4096;

/** 读 WebP 头拿宽高（VP8 / VP8L / VP8X 三种格式）。 */
function webpSize(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF') return null;
  if (buffer.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    const width = 1 + (buffer.readUIntLE(24, 3) & 0xffffff);
    const height = 1 + (buffer.readUIntLE(27, 3) & 0xffffff);
    return { width, height };
  }
  if (chunk === 'VP8 ') {
    const width = buffer.readUInt16LE(26) & 0x3fff;
    const height = buffer.readUInt16LE(28) & 0x3fff;
    return { width, height };
  }
  if (chunk === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

describe('御膳房行走 sheet 尺寸', () => {
  const casts = readdirSync(KITCHEN_DIR).filter((name) =>
    statSync(join(KITCHEN_DIR, name)).isDirectory(),
  );

  it('能找到角色目录', () => {
    expect(casts.length).toBeGreaterThanOrEqual(5);
  });

  it('每张行走 sheet 的宽度都低于 GPU 纹理上限', () => {
    const offenders: string[] = [];
    for (const cast of casts) {
      const dir = join(KITCHEN_DIR, cast);
      for (const file of readdirSync(dir)) {
        if (!file.includes('_walk_') || !file.endsWith('.webp')) continue;
        const size = webpSize(readFileSync(join(dir, file)));
        expect(size, `${file} 不是合法 WebP`).not.toBeNull();
        if (size === null) continue;
        if (size.width > MAX_TEXTURE_SIZE) {
          offenders.push(`${cast}/${file} 宽 ${size.width}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('sheet 宽度 = 帧宽 × 帧数', () => {
    const dir = join(KITCHEN_DIR, casts[0] ?? 'cook');
    const file = readdirSync(dir).find((name) => name.includes('_walk_') && name.endsWith('.webp'));
    expect(file).toBeTruthy();
    const size = webpSize(readFileSync(join(dir, file as string)));
    expect(size?.width).toBe(CH01_KITCHEN_FRAME.width * CH01_KITCHEN_WALK_FRAME_COUNT);
  });
});
