import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  PALACE_ACTOR_SCALE,
  PALACE_ALPHA_CUTOFF,
  PALACE_CONTACT_BAND,
  PALACE_FOOTPRINTS,
  PALACE_FOOT_ANCHOR_Y,
  PALACE_FRAME,
  PALACE_HEAD_ANCHORS,
  PALACE_SHADOW_STYLE,
  palaceFootprintOf,
  palaceHeadPointFor,
  palaceShadowFor,
} from '../src/scenes/ch01-palace-shadow';
import { PALACE_TEXTURES } from '../src/story/ch01-palace';

/**
 * 金殿脚底阴影的对位护栏。
 *
 * 三件事：
 * ① **像素对表**：现场解码每张角色 PNG，重算 alpha 轮廓的底边/接触宽度/中心，
 *    和 `ch01-palace-shadow.ts` 里的表逐项对齐——换了贴图忘了更新表，这里立刻红。
 * ② **几何对位**：按表算出的阴影椭圆，上边缘必须压在「贴着的不透明底边」上方
 *    2–9 设计 px（不能留可见缝隙），宽度不能比接触面窄，跪姿用的参数不能等于站姿。
 * ③ **源码护栏**：`createActors()` 里不许再出现给所有角色共用的硬编码 118×24。
 *
 * 这些数字不是手调的：`python3 tools/measure-actor-footprint.py` 用同一套口径
 * （alpha ≥ 40、底边往上 24 画布 px 取最宽一行）量出来，改口径两边要一起改。
 */

const PALACE_CHAR_DIR = 'public/assets/img/character/palace';

interface DecodedPng {
  readonly width: number;
  readonly height: number;
  readonly rgba: Buffer;
}

/** 只解 8bit RGBA、非隔行的 PNG（金殿角色贴图都是这个格式，够用且零依赖）。 */
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
      idat.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(`只支持 8bit RGBA 非隔行 PNG（拿到 bitDepth=${bitDepth} colorType=${colorType}）`);
  }

  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  const rgba = Buffer.alloc(stride * height);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)] ?? 0;
    const source = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const line = rgba.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x += 1) {
      const left = x >= bpp ? (line[x - bpp] ?? 0) : 0;
      const up = prev[x] ?? 0;
      const upLeft = x >= bpp ? (prev[x - bpp] ?? 0) : 0;
      let value = source[x] ?? 0;
      if (filter === 1) value = (value + left) & 0xff;
      else if (filter === 2) value = (value + up) & 0xff;
      else if (filter === 3) value = (value + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const pa = Math.abs(estimate - left);
        const pb = Math.abs(estimate - up);
        const pc = Math.abs(estimate - upLeft);
        const predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        value = (value + predictor) & 0xff;
      } else if (filter !== 0) {
        throw new Error(`未知 PNG 行过滤 ${filter}`);
      }
      line[x] = value;
    }
    prev = line;
  }
  return { width, height, rgba };
}

interface MeasuredFootprint {
  readonly contactBottomY: number;
  readonly contactWidth: number;
  readonly contactCenterX: number;
}

/** 与 `tools/measure-actor-footprint.py` 完全相同的口径。 */
function measureFootprint(png: DecodedPng): MeasuredFootprint {
  const rows = new Map<number, { min: number; max: number }>();
  for (let y = 0; y < png.height; y += 1) {
    let min = -1;
    let max = -1;
    for (let x = 0; x < png.width; x += 1) {
      if ((png.rgba[(y * png.width + x) * 4 + 3] ?? 0) >= PALACE_ALPHA_CUTOFF) {
        if (min < 0) min = x;
        max = x;
      }
    }
    if (min >= 0) rows.set(y, { min, max });
  }
  const bottoms = [...rows.keys()];
  if (bottoms.length === 0) throw new Error('贴图全透明');
  const contactBottomY = Math.max(...bottoms);
  const bandTop = Math.max(0, contactBottomY - PALACE_CONTACT_BAND);

  let bestWidth = 0;
  let bestCenter = 0;
  for (const [y, span] of rows) {
    if (y < bandTop) continue;
    const width = span.max - span.min + 1;
    if (width > bestWidth) {
      bestWidth = width;
      bestCenter = (span.min + span.max) / 2;
    }
  }
  return { contactBottomY, contactWidth: bestWidth, contactCenterX: bestCenter };
}

const characterFiles = readdirSync(PALACE_CHAR_DIR)
  .filter((name) => name.endsWith('.png') && !name.startsWith('portrait_'))
  .sort();

const keyOfFile = (file: string): string => `img.char.palace.${file.replace(/\.png$/, '')}`;

/** 阴影椭圆上边缘相对角色落点（`toPixel()` 的 y）的位置。 */
const shadowTopOf = (textureKey: string, flipX = false): number => {
  const params = palaceShadowFor(textureKey, { scale: PALACE_ACTOR_SCALE, flipX });
  return params.offsetY - params.height / 2;
};
/** 贴图不透明底边相对角色落点的位置（负 = 比落点高）。 */
const opaqueBottomOf = (bottomY: number): number => (bottomY - PALACE_FOOT_ANCHOR_Y) * PALACE_ACTOR_SCALE;

describe('金殿脚底阴影：贴图表 ↔ 实际像素', () => {
  it('目录里的每张角色贴图都登记了接触面', () => {
    expect(characterFiles.length).toBeGreaterThanOrEqual(20);
    const missing = characterFiles.filter((file) => palaceFootprintOf(keyOfFile(file)) === null);
    expect(missing, '这些贴图没登记接触面，换图后阴影会飘').toEqual([]);
  });

  it('表里的 key 都能对上目录里的文件，且 key 与文件名一一对应', () => {
    for (const [key, footprint] of PALACE_FOOTPRINTS) {
      expect(keyOfFile(footprint.file), `${key} 的 file 字段对不上 key`).toBe(key);
      expect(characterFiles, `${footprint.file} 不存在`).toContain(footprint.file);
    }
    expect(PALACE_FOOTPRINTS.size).toBe(characterFiles.length);
  });

  it('每条记录的底边/接触宽度/接触中心与贴图像素一致', () => {
    const mismatches: string[] = [];
    for (const [key, footprint] of PALACE_FOOTPRINTS) {
      const png = decodePng(readFileSync(join(PALACE_CHAR_DIR, footprint.file)));
      expect([png.width, png.height], `${footprint.file} 画布尺寸`).toEqual([
        PALACE_FRAME.width,
        PALACE_FRAME.height,
      ]);
      const measured = measureFootprint(png);
      if (
        measured.contactBottomY !== footprint.contactBottomY ||
        measured.contactWidth !== footprint.contactWidth ||
        Math.abs(measured.contactCenterX - footprint.contactCenterX) > 0.01
      ) {
        mismatches.push(`${key}: 表 ${JSON.stringify(footprint)} vs 实测 ${JSON.stringify(measured)}`);
      }
    }
    expect(mismatches, '接触面表和贴图实际像素对不上（换图后记得跑 tools/measure-actor-footprint.py）').toEqual([]);
  });

  it('周全是唯一天生就比落点高一截的贴图（这正是「悬空」的根源，表里必须记着）', () => {
    const kneeling = PALACE_FOOTPRINTS.get(PALACE_TEXTURES.zhouKneelUp);
    expect(kneeling?.file).toBe('zhou_kneel_up.png');
    // 画到第 383 行就没了，而落点钉在第 400 行 → 视觉底边比落点高 8.5 设计 px
    expect(opaqueBottomOf(kneeling?.contactBottomY ?? 0)).toBeCloseTo(-8.5, 5);
    for (const [key, footprint] of PALACE_FOOTPRINTS) {
      if (key === PALACE_TEXTURES.zhouKneelUp) continue;
      expect(opaqueBottomOf(footprint.contactBottomY), `${key} 的底边`).toBeGreaterThanOrEqual(-1);
    }
  });
});

describe('金殿脚底阴影：几何对位规则', () => {
  it('每个角色：阴影上边缘压住接触底边 2–9 设计 px，绝不留在下面', () => {
    const offenders: string[] = [];
    for (const [key, footprint] of PALACE_FOOTPRINTS) {
      const opaqueBottom = opaqueBottomOf(footprint.contactBottomY);
      const overlap = opaqueBottom - shadowTopOf(key);
      // > 0 = 阴影上边缘在接触底边之上（有重叠），< 0 就是肉眼可见的空隙
      if (overlap < 2 || overlap > 9) offenders.push(`${key}: overlap=${overlap.toFixed(2)}px`);
    }
    expect(offenders, '阴影和接触面之间有空隙，或者爬到大腿上了').toEqual([]);
  });

  it('每个角色：阴影不比接触面窄；跪姿按接触面收窄后的宽度也不能宽得离谱', () => {
    const offenders: string[] = [];
    for (const [key, footprint] of PALACE_FOOTPRINTS) {
      const params = palaceShadowFor(key, { scale: PALACE_ACTOR_SCALE });
      const contact = footprint.contactWidth * PALACE_ACTOR_SCALE;
      const ratio = params.width / contact;
      if (ratio < 1) offenders.push(`${key}: ${params.width}/${contact}=${ratio.toFixed(2)} 倍，比接触面还窄`);
      // 跪姿的宽度是 接触宽 × 1.3 推出来的；这一条正是「人悬在一摊影子上面」的护栏：
      // 旧版给跪着的周全共用 118 宽 = 接触面的 2.27 倍，就是那个观感的来源。
      if (footprint.pose === 'kneel' && (ratio < 1.1 || ratio > 1.5)) {
        offenders.push(`${key}: 跪姿 ${params.width}/${contact}=${ratio.toFixed(2)} 倍，超出 1.1–1.5`);
      }
      // 站姿沿用既定 118 宽：楚公公侧身时接触面只有 27 设计 px，比例天然到 4 倍多，
      // 所以站姿只用「不比接触面窄」这一条，宽度的绝对值由下面的既定观感测试守住。
      expect(params.height, `${key} 阴影高度`).toBeGreaterThanOrEqual(2);
      expect(params.height / params.width, `${key} 阴影太圆`).toBeLessThan(0.4);
    }
    expect(offenders).toEqual([]);
  });

  it('跪姿和站姿必须用不同的阴影参数（防止以后又并回一条常量）', () => {
    const kneel = palaceShadowFor(PALACE_TEXTURES.zhouKneelUp, { scale: PALACE_ACTOR_SCALE });
    const stand = palaceShadowFor(PALACE_TEXTURES.zhengDown, { scale: PALACE_ACTOR_SCALE });
    expect(kneel.width).toBeLessThan(stand.width);
    expect(kneel.height).toBeLessThan(stand.height);
    expect(kneel.offsetY).toBeLessThan(stand.offsetY - 5);
    expect(kneel.alpha).not.toBe(stand.alpha);
    expect(PALACE_SHADOW_STYLE.kneel.overlap).not.toBe(PALACE_SHADOW_STYLE.stand.overlap);
  });

  it('站姿保持金殿既定观感：118×24 / alpha 0.28 / 落点 +3（不能顺手改粗）', () => {
    for (const [key, footprint] of PALACE_FOOTPRINTS) {
      if (footprint.pose !== 'stand') continue;
      const params = palaceShadowFor(key, { scale: PALACE_ACTOR_SCALE });
      expect([key, params.width, params.height, params.alpha], key).toEqual([key, 118, 24, 0.28]);
      expect(params.offsetY, key).toBeCloseTo(3, 5);
    }
  });

  it('侧身/翻面时阴影跟着接触面横向挪（翻面镜像）', () => {
    const right = palaceShadowFor(PALACE_TEXTURES.chuRight, { scale: PALACE_ACTOR_SCALE });
    const flipped = palaceShadowFor(PALACE_TEXTURES.chuRight, { scale: PALACE_ACTOR_SCALE, flipX: true });
    expect(right.offsetX).toBeCloseTo(-11.25, 5); // 接触面在画布中线左边
    expect(flipped.offsetX).toBeCloseTo(11.25, 5);
  });

  it('没登记的贴图（行走 sheet）走站姿兜底，不会算出 0 宽', () => {
    const fallback = palaceShadowFor('img.char.palace.walk.zheng_down', { scale: PALACE_ACTOR_SCALE });
    expect(fallback.footprint).toBeNull();
    expect(fallback.width).toBe(118);
    expect(fallback.height).toBe(24);
    expect(fallback.offsetY).toBeCloseTo(3, 5);
  });
});

// ---------------------------------------------------------------- 头顶（表情气泡）

/** 与表的口径一致：不透明像素（alpha ≥ 40）最上一行 + 最上面 12 行水平中心。 */
function measureHead(png: DecodedPng): { topY: number; centerX: number } {
  let topY = -1;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if ((png.rgba[(y * png.width + x) * 4 + 3] ?? 0) >= PALACE_ALPHA_CUTOFF) {
        topY = y;
        break;
      }
    }
    if (topY >= 0) break;
  }
  if (topY < 0) throw new Error('贴图全透明');
  let sum = 0;
  let count = 0;
  for (let y = topY; y < Math.min(topY + 12, png.height); y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if ((png.rgba[(y * png.width + x) * 4 + 3] ?? 0) >= PALACE_ALPHA_CUTOFF) {
        sum += x;
        count += 1;
      }
    }
  }
  return { topY, centerX: Math.round((sum / Math.max(1, count)) * 10) / 10 };
}

describe('金殿表情气泡：头顶表 ↔ 实际像素', () => {
  it('表里每一行的 topY / centerX 都与贴图像素一致（换图重测，不许手调）', () => {
    expect(PALACE_HEAD_ANCHORS.size).toBeGreaterThanOrEqual(5);
    const mismatches: string[] = [];
    for (const [key, head] of PALACE_HEAD_ANCHORS) {
      expect(keyOfFile(head.file), `${key} 的 file 字段对不上 key`).toBe(key);
      const png = decodePng(readFileSync(join(PALACE_CHAR_DIR, head.file)));
      const measured = measureHead(png);
      if (measured.topY !== head.topY || Math.abs(measured.centerX - head.centerX) > 0.01) {
        mismatches.push(`${key}: 表 ${JSON.stringify(head)} vs 实测 ${JSON.stringify(measured)}`);
      }
    }
    expect(mismatches, '头顶表和贴图实际像素对不上').toEqual([]);
  });

  it('站姿头顶 ≈ 落点上方 185，跪姿只有 ≈ 125：所以不能给两者共用一个常量', () => {
    const stand = palaceHeadPointFor(PALACE_TEXTURES.zhengLeft, { scale: PALACE_ACTOR_SCALE });
    const kneel = palaceHeadPointFor(PALACE_TEXTURES.zhouKneelUp, { scale: PALACE_ACTOR_SCALE });
    expect(-stand.offsetY).toBeCloseTo(185.5, 1);
    expect(-kneel.offsetY).toBeCloseTo(125, 1);
    // 差 60 设计 px = 屏幕上 30 css px（390 宽），写死一个值必有一边飘
    expect(Math.abs(-stand.offsetY - -kneel.offsetY)).toBeGreaterThan(50);
  });

  it('侧身/翻面时头顶跟着头的实际位置走（不是永远居中）', () => {
    const left = palaceHeadPointFor(PALACE_TEXTURES.zhengLeft, { scale: PALACE_ACTOR_SCALE });
    const right = palaceHeadPointFor(PALACE_TEXTURES.zhengRight, { scale: PALACE_ACTOR_SCALE });
    expect(left.offsetX).toBeLessThan(0);
    expect(right.offsetX).toBeGreaterThan(0);
    // flipX 把整个人镜像过去，头顶也要镜像
    const flipped = palaceHeadPointFor(PALACE_TEXTURES.zhengLeft, {
      scale: PALACE_ACTOR_SCALE,
      flipX: true,
    });
    expect(flipped.offsetX).toBeCloseTo(-left.offsetX, 5);
  });

  it('没登记的贴图（行走 sheet）走站姿兜底，不会算出 0 或 NaN', () => {
    const fallback = palaceHeadPointFor('img.char.palace.walk.zheng_down', {
      scale: PALACE_ACTOR_SCALE,
    });
    expect(fallback.head).toBeNull();
    expect(-fallback.offsetY).toBeCloseTo(185.5, 1);
    expect(Number.isFinite(fallback.offsetX)).toBe(true);
  });
});

describe('金殿场景：源码护栏', () => {
  const source = readFileSync('src/scenes/ch01-palace-scene.ts', 'utf8');

  const createActorsBody = ((): string => {
    const start = source.indexOf('private createActors(): void {');
    expect(start, 'createActors() 不见了？').toBeGreaterThanOrEqual(0);
    const end = source.indexOf('\n  private syncShadow(', start);
    expect(end, 'syncShadow() 不见了？').toBeGreaterThan(start);
    return source.slice(start, end);
  })();

  it('createActors() 不再给所有角色一条硬编码阴影', () => {
    expect(createActorsBody).toContain('palaceShadowFor(');
    expect(createActorsBody, '又出现 118×24 的万能阴影了').not.toMatch(/ellipse\([^)]*\b118\b/);
    expect(createActorsBody, '又出现 118×24 的万能阴影了').not.toMatch(/\b118\s*,\s*24\b/);
  });

  it('换姿势/翻面/走完停下都要重算阴影，走位时每帧跟一次', () => {
    expect(source).toContain('this.syncShadow(action.actor);');
    expect(source).toContain('this.followShadow(action.actor);');
    expect(source).toMatch(/case 'texture':[\s\S]*?this\.syncShadow\(action\.actor\);/);
    expect(source).toMatch(/case 'faceLeft':[\s\S]*?this\.syncShadow\(action\.actor\);/);
  });

  it('角色缩放和阴影表共用同一个常量', () => {
    expect(source).toContain('const ACTOR_SCALE = PALACE_ACTOR_SCALE;');
    expect(PALACE_ACTOR_SCALE).toBe(0.5);
  });
});
