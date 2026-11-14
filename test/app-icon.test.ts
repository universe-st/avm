import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * App 图标的落地契约。
 *
 * 图标是"平台产物"，`pnpm typecheck`/`vitest` 平时碰不到它——改坏一个密度尺寸、
 * 忘了给 config.xml 加 foreground/background，都不会让单测变红，只会在真机桌面露馅。
 * 这里把最容易错的三件事钉死：
 *   1. config.xml 的显示名必须是「刺客vs矿工」（vs 小写、无空格）；
 *   2. 六个密度 × 传统/前景/背景 的 PNG 尺寸必须符合 Android 规范（48dp 基准 / 自适应 108dp）；
 *   3. 自适应前景层必须带 alpha 通道（否则圆形遮罩外会是一圈不透明方角）。
 * 像素级"不是 Cordova 默认图"由 `python3 tools/verify-app-icon.py <apk>` 在出包后校验。
 */

const ICON_DIR = join('cordova', 'res', 'icon', 'android');
const DEFAULT_TEMPLATE = join(
  'cordova',
  'node_modules',
  'cordova-android',
  'templates',
  'project',
  'res',
);

/** Android 传统启动图标 = 48dp × density scale。 */
const LEGACY_SIZES: Record<string, number> = {
  ldpi: 36,
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
};

/** 自适应层 = 108dp × density scale。 */
const ADAPTIVE_SIZES: Record<string, number> = {
  ldpi: 81,
  mdpi: 108,
  hdpi: 162,
  xhdpi: 216,
  xxhdpi: 324,
  xxxhdpi: 432,
};

interface PngHeader {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
}

/** 读 PNG 的 IHDR：宽高、位深、颜色类型（6 = RGBA）。 */
function pngHeader(path: string): PngHeader {
  const buffer = readFileSync(path);
  const signature = buffer.subarray(0, 8).toString('hex');
  if (buffer.length < 33 || signature !== '89504e470d0a1a0a') {
    throw new Error(`${path} 不是 PNG`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer.readUInt8(24),
    colorType: buffer.readUInt8(25),
  };
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

describe('App 图标', () => {
  const config = readFileSync(join('cordova', 'config.xml'), 'utf8');

  it('显示名是「刺客vs矿工」', () => {
    expect(config).toContain('<name>刺客vs矿工</name>');
  });

  it('config.xml 为每个密度声明了 src / foreground / background', () => {
    for (const density of Object.keys(LEGACY_SIZES)) {
      const iconTag = config.match(
        new RegExp(`<icon\\s+density="${density}"[\\s\\S]*?/>`),
      )?.[0];
      expect(iconTag, `缺少 density="${density}" 的 icon`).toBeTruthy();
      expect(iconTag).toContain(`src="res/icon/android/ic_launcher_${density}.png"`);
      expect(iconTag).toContain(
        `foreground="res/icon/android/ic_launcher_foreground_${density}.png"`,
      );
      expect(iconTag).toContain(
        `background="res/icon/android/ic_launcher_background_${density}.png"`,
      );
    }
  });

  it('传统 mipmap 六密度的尺寸符合 48dp × scale', () => {
    for (const [density, size] of Object.entries(LEGACY_SIZES)) {
      const header = pngHeader(join(ICON_DIR, `ic_launcher_${density}.png`));
      expect([header.width, header.height], `${density} 尺寸`).toEqual([size, size]);
    }
  });

  it('自适应前景/背景层的尺寸是 108dp × scale', () => {
    for (const [density, size] of Object.entries(ADAPTIVE_SIZES)) {
      for (const prefix of ['ic_launcher_foreground', 'ic_launcher_background']) {
        const header = pngHeader(join(ICON_DIR, `${prefix}_${density}.png`));
        expect([header.width, header.height], `${prefix}_${density} 尺寸`).toEqual([size, size]);
      }
    }
  });

  it('前景层带 alpha 通道（圆形遮罩外要靠透明让背景层透出来）', () => {
    for (const density of Object.keys(ADAPTIVE_SIZES)) {
      const header = pngHeader(join(ICON_DIR, `ic_launcher_foreground_${density}.png`));
      expect(header.colorType, `foreground_${density} 颜色类型`).toBe(6);
    }
  });

  it('图标不是 cordova-android 模板里的默认图', () => {
    for (const density of Object.keys(LEGACY_SIZES)) {
      const ours = sha256(join(ICON_DIR, `ic_launcher_${density}.png`));
      const template = sha256(join(DEFAULT_TEMPLATE, `mipmap-${density}`, 'ic_launcher.png'));
      expect(ours, `${density} 仍是模板默认图`).not.toBe(template);
    }
  });
});
