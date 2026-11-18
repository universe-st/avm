import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { BUNDLES } from '../src/assets/bundles';
import { PALACE_ASSET_KEYS } from '../src/assets/keys';
import { typeVoiceForSpeaker } from '../src/audio/type-voice';
import { PALACE_BEATS, PALACE_TEXTURES, XIAOBAI_SPEAKER } from '../src/story/ch01-palace';
import { speakerTone } from '../src/story/dialogue';
import type { PalaceAction, PalaceBeat } from '../src/story/palace-player';

/**
 * 金殿过场 5 处演出/贴图修正（2026-11-17）的护栏。
 *
 * ① 说话人「？？？」→ 完整描述名（小白），语义色/声线仍走 `xiaobai`；
 * ② 旁白吐槽改成周全亲口吐槽，并换成「被按跪、慌张」的头部特写；
 *    （2026-11-18 起这两句改成括号里的心里话，本体顺序见 `palace-script-order.test.ts`）
 * ③ 原「查寝」长句改成「你爸知道你这么牛x吗？」，2026-11-18 起并进「疯了吧你？！……」那句；
 * ④ 郑卿走完台阶**转身朝左**看向周全（`texture: zhengLeft`，不是 `faceLeft` 翻面）；
 * ⑤ 小白 / 周全两张立绘都是 720×900 RGBA、透明底、不贴边。
 *
 * 立绘尺寸用**现场解码 PNG** 断言，不新增依赖：与 `palace-shadow.test.ts` 同一套
 * 最小 PNG 解码口径（8bit RGBA、非隔行）。
 */

// ------------------------------------------------------------------ PNG 解码

interface DecodedPng {
  readonly width: number;
  readonly height: number;
  readonly rgba: Buffer;
  readonly bitDepth: number;
  readonly colorType: number;
}

/** 只解 8bit RGBA、非隔行的 PNG（金殿立绘都是这个格式）。 */
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
  return { width, height, rgba, bitDepth, colorType };
}

interface AlphaBox {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** 内容包围盒（alpha ≥ cutoff，右下开区间）。 */
function alphaBox(png: DecodedPng, cutoff = 8): AlphaBox {
  let left = png.width;
  let top = png.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if ((png.rgba[(y * png.width + x) * 4 + 3] ?? 0) < cutoff) continue;
      if (x < left) left = x;
      if (y < top) top = y;
      if (x > right) right = x;
      if (y > bottom) bottom = y;
    }
  }
  return { left, top, right: right + 1, bottom: bottom + 1 };
}

function alphaOf(png: DecodedPng, x: number, y: number): number {
  return png.rgba[(y * png.width + x) * 4 + 3] ?? 0;
}

const png = (file: string): DecodedPng => decodePng(readFileSync(file));

// ------------------------------------------------------------------ 立绘资源表

/** 两张新立绘：`PALACE_ASSET_KEYS.characters` 的字段 → bundle key → 仓库文件。 */
const PORTRAITS = {
  portraitXiaobai: {
    key: PALACE_TEXTURES.portraitXiaobai,
    bundleKey: 'img.char.palace.portrait_xiaobai',
    file: 'public/assets/img/character/palace/portrait_xiaobai.png',
  },
  portraitZhouPanic: {
    key: PALACE_TEXTURES.portraitZhouPanic,
    bundleKey: 'img.char.palace.portrait_zhou_panic',
    file: 'public/assets/img/character/palace/portrait_zhou_panic.png',
  },
} as const;

type PortraitField = keyof typeof PORTRAITS;

const portraitEntry = (field: PortraitField): (typeof PORTRAITS)[PortraitField] => PORTRAITS[field];

// ------------------------------------------------------------------ 剧本读取

const actBeats = (): readonly Extract<PalaceBeat, { kind: 'act' }>[] =>
  PALACE_BEATS.filter((beat): beat is Extract<PalaceBeat, { kind: 'act' }> => beat.kind === 'act');

const sayBeats = (): readonly Extract<PalaceBeat, { kind: 'say' }>[] =>
  PALACE_BEATS.filter((beat): beat is Extract<PalaceBeat, { kind: 'say' }> => beat.kind === 'say');

const allActions = (): readonly PalaceAction[] => actBeats().flatMap((beat) => [...beat.actions]);

const beatAt = (index: number): PalaceBeat => {
  const beat = PALACE_BEATS[index];
  if (!beat) throw new Error(`金殿剧本没有第 ${index} 拍`);
  return beat;
};

const sayIndexOf = (needle: string): number =>
  PALACE_BEATS.findIndex((beat) => beat.kind === 'say' && beat.text.includes(needle));

/** 第 index 拍之后第一拍「含指定 action」的下标；找不到返回 -1。 */
const nextActIndexOf = (
  index: number,
  predicate: (action: PalaceAction) => boolean,
): number =>
  PALACE_BEATS.findIndex(
    (beat, at) => at > index && beat.kind === 'act' && beat.actions.some(predicate),
  );

const isPortraitOf = (key: string) => (action: PalaceAction): boolean =>
  action.kind === 'portrait' && action.key === key;

const isPortraitHide = (action: PalaceAction): boolean => action.kind === 'portraitHide';

// ------------------------------------------------------------------ ① 说话人

describe('金殿剧本：小白不再自称「？？？」', () => {
  it('两句小白台词都改成完整描述名，role 保留', () => {
    const xiaobaiLines = sayBeats().filter((beat) => beat.role === 'xiaobai');
    expect(xiaobaiLines).toHaveLength(2);
    expect(xiaobaiLines.map((beat) => beat.speaker)).toEqual([XIAOBAI_SPEAKER, XIAOBAI_SPEAKER]);
    expect(xiaobaiLines.map((beat) => beat.text)).toEqual([
      '心防出现剧烈震荡，目标精神屏障异常薄弱。',
      '建议：先活下来。',
    ]);
    // 名号揭示之后整段都不该再冒「？？？」
    expect(sayBeats().some((beat) => (beat.speaker ?? '').includes('？？？'))).toBe(false);
  });

  it('改名不影响语义色与逐字声线（仍然靠 role / 名字表落到 xiaobai）', () => {
    expect(speakerTone(XIAOBAI_SPEAKER, 'xiaobai')).toBe('xiaobai');
    // 调用方漏传 role 时，名字表也要兜得住语义色
    expect(speakerTone(XIAOBAI_SPEAKER)).toBe('xiaobai');
    // 逐字声线只认 role（与「？？？」同一套契约），剧本两处都带着 role
    expect(typeVoiceForSpeaker(XIAOBAI_SPEAKER, 'xiaobai')).toBe('xiaobai');
  });
});

// ------------------------------------------------------------------ ②③ 周全吐槽

describe('金殿剧本：周全的两句嘴硬', () => {
  it('旁白吐槽改成周全亲口说（2026-11-18 起是括号里的心里话），旧旁白整句已删', () => {
    const index = sayIndexOf('饶什么命');
    const beat = beatAt(index);
    expect(beat.kind).toBe('say');
    if (beat.kind !== 'say') return;
    expect(beat.speaker).toBe('周全');
    expect(beat.text).toBe('（……你不是罪该万死吗，饶什么命啊？）');
    expect(sayBeats().some((line) => line.text.includes('泰山压顶'))).toBe(false);
  });

  it('「查寝」长句不再出现，吐槽并进「疯了吧你？！……你爸知道你这么牛x吗？」', () => {
    const index = sayIndexOf('你爸');
    const beat = beatAt(index);
    expect(beat.kind).toBe('say');
    if (beat.kind !== 'say') return;
    expect(beat.speaker).toBe('周全');
    expect(beat.text).toBe('疯了吧你？！你在这儿玩什么cosplay！你爸知道你这么牛x吗？');
    expect(sayBeats().some((line) => line.text.includes('查！寝！'))).toBe(false);
    // 全段只许出现一次，不许「旧句 + 新句」并存
    expect(sayBeats().filter((line) => line.text.includes('你爸知道')).length).toBe(1);
  });
});

// ------------------------------------------------------------------ ④ 郑卿转身

describe('金殿剧本：郑卿走下台阶后转身看向跪着的周全', () => {
  it('beats 顺序：move(zheng) → texture zhengLeft → say 郑卿', () => {
    const moveIndex = PALACE_BEATS.findIndex(
      (beat) =>
        beat.kind === 'act' &&
        beat.actions.some((action) => action.kind === 'move' && action.actor === 'zheng'),
    );
    expect(moveIndex).toBeGreaterThanOrEqual(0);

    const turnIndex = nextActIndexOf(
      moveIndex,
      (action) => action.kind === 'texture' && action.texture === PALACE_TEXTURES.zhengLeft,
    );
    expect(turnIndex, '走位之后没换朝左贴图，郑卿会一直朝镜头').toBeGreaterThan(moveIndex);

    const sayIndex = sayIndexOf('谁派你来的');
    expect(sayIndex).toBeGreaterThan(turnIndex);

    // 转身之后到这声台词之间不许再 move 郑卿（否则走完会回落成 down，朝向被覆盖）
    const actionsBetween = PALACE_BEATS.slice(turnIndex + 1, sayIndex)
      .filter((beat): beat is Extract<PalaceBeat, { kind: 'act' }> => beat.kind === 'act')
      .flatMap((beat) => [...beat.actions]);
    expect(
      actionsBetween.some((action) => action.kind === 'move' && action.actor === 'zheng'),
    ).toBe(false);
  });

  it('转身是换贴图，不是 flipX（翻一张正面图看不出朝向）', () => {
    expect(
      allActions().some((action) => action.kind === 'texture' && action.texture === PALACE_TEXTURES.zhengLeft),
    ).toBe(true);
    expect(
      allActions().some((action) => action.kind === 'faceLeft' && action.actor === 'zheng'),
    ).toBe(false);
  });
});

// ------------------------------------------------------------------ ⑤ 立绘配对

interface PortraitLifecycle {
  readonly key: string;
  readonly shownAt: number;
  hiddenAt: number | null;
}

describe('金殿剧本：立绘出现 / 收起的配对', () => {
  const lifecycles = (): readonly PortraitLifecycle[] => {
    const shown: PortraitLifecycle[] = [];
    let current: PortraitLifecycle | null = null;
    PALACE_BEATS.forEach((beat, index) => {
      if (beat.kind !== 'act') return;
      for (const action of beat.actions) {
        if (action.kind === 'portrait') {
          if (current) current.hiddenAt = index;
          current = { key: action.key, shownAt: index, hiddenAt: null };
          shown.push(current);
        } else if (action.kind === 'portraitHide' && current) {
          current.hiddenAt = index;
          current = null;
        }
      }
    });
    return shown;
  };

  it('每张立绘后面都有一拍把它收掉，收尾时屏幕上不留脸', () => {
    const open = lifecycles().filter((entry) => entry.hiddenAt === null);
    expect(open.map((entry) => entry.key)).toEqual([]);
  });

  it('两张新立绘都真的上过场', () => {
    const shown = lifecycles().map((entry) => entry.key);
    for (const field of ['portraitXiaobai', 'portraitZhouPanic'] as const) {
      expect(shown, `${field} 从没上过场`).toContain(portraitEntry(field).key);
    }
  });

  it('小白两处台词都是「先出现 → 说 → 说完收」', () => {
    const xiaobaiLines = sayBeats().filter((beat) => beat.role === 'xiaobai');
    for (const line of xiaobaiLines) {
      const lineIndex = PALACE_BEATS.indexOf(line);
      const before = PALACE_BEATS[lineIndex - 1];
      expect(before?.kind).toBe('act');
      if (before?.kind !== 'act') continue;
      expect(before.actions.some(isPortraitOf(portraitEntry('portraitXiaobai').key))).toBe(true);

      const hideIndex = nextActIndexOf(lineIndex, isPortraitHide);
      expect(hideIndex, '小白说完没收立绘，会一直挂在屏幕上').toBeGreaterThan(lineIndex);
    }
  });

  it('周全吐槽：先换「被按跪慌张」特写，震屏那一拍前收起', () => {
    const firstLine = sayIndexOf('饶什么命');
    const showIndex = firstLine - 1;
    const showBeat = beatAt(showIndex);
    expect(showBeat.kind).toBe('act');
    if (showBeat.kind !== 'act') return;
    expect(showBeat.actions.some(isPortraitOf(portraitEntry('portraitZhouPanic').key))).toBe(true);

    // 震屏（rumble）那一拍必须把脸收掉
    const rumbleIndex = PALACE_BEATS.findIndex(
      (beat) =>
        beat.kind === 'act' && beat.actions.some((action) => action.kind === 'fx' && action.fx === 'rumble'),
    );
    expect(rumbleIndex).toBeGreaterThan(firstLine);
    const rumbleBeat = beatAt(rumbleIndex);
    expect(rumbleBeat.kind).toBe('act');
    if (rumbleBeat.kind !== 'act') return;
    expect(rumbleBeat.actions.some(isPortraitHide)).toBe(true);
  });
});

// ------------------------------------------------------------------ 贴图文件

describe('金殿立绘贴图：登记 / 尺寸 / 透明底', () => {
  it('两张新立绘都登记在 cutscene.ch01palace 里，url 指向 720×900 的 PNG', () => {
    const bundle = BUNDLES['cutscene.ch01palace'];
    for (const field of ['portraitXiaobai', 'portraitZhouPanic'] as const) {
      const entry = portraitEntry(field);
      expect(PALACE_ASSET_KEYS.characters[field]).toBe(entry.key);
      const asset = bundle.assets.find((item) => item.key === entry.bundleKey);
      expect(asset, `${entry.bundleKey} 没在 bundle 里登记`).toBeDefined();
      expect(`public/${asset?.url ?? ''}`).toBe(entry.file);
    }
  });

  it('PNG 是 720×900、8bit RGBA（立绘几何按 720:900 算显示尺寸）', () => {
    for (const field of ['portraitXiaobai', 'portraitZhouPanic'] as const) {
      const { file } = portraitEntry(field);
      const image = png(file);
      expect([image.width, image.height], file).toEqual([720, 900]);
      expect([image.bitDepth, image.colorType], file).toEqual([8, 6]);
    }
  });

  it('透明底干净：四角全透明、有透明区也有实体、左右不贴边、纵向占满', () => {
    for (const field of ['portraitXiaobai', 'portraitZhouPanic'] as const) {
      const { file } = portraitEntry(field);
      const image = png(file);
      for (const [x, y] of [
        [0, 0],
        [image.width - 1, 0],
        [0, image.height - 1],
        [image.width - 1, image.height - 1],
      ] as const) {
        expect(alphaOf(image, x, y), `${file} 角点 (${x},${y}) 不是透明`).toBe(0);
      }

      let transparent = 0;
      let opaque = 0;
      for (let index = 3; index < image.rgba.length; index += 4) {
        const alpha = image.rgba[index] ?? 0;
        if (alpha === 0) transparent += 1;
        else if (alpha === 255) opaque += 1;
      }
      const total = image.width * image.height;
      expect(transparent / total, `${file} 透明区太少，像是白底图`).toBeGreaterThan(0.1);
      expect(opaque / total, `${file} 几乎没有实体内容`).toBeGreaterThan(0.1);

      const box = alphaBox(image);
      // 立绘贴屏幕右侧时画布左 ~20% 会被裁掉：内容贴边就会露出直切的硬边
      expect(box.left, `${file} 左边贴边`).toBeGreaterThanOrEqual(8);
      expect(image.width - box.right, `${file} 右边贴边`).toBeGreaterThanOrEqual(8);
      // 半身构图要占满纵向，否则屏显只有一小团
      expect(box.bottom - box.top, `${file} 内容太矮`).toBeGreaterThan(700);
      expect(box.right - box.left, `${file} 内容太窄`).toBeGreaterThan(360);
    }
  });
});

// ------------------------------------------------------------------ 场景护栏

describe('金殿场景：换朝向不该顺手弹一下', () => {
  const source = readFileSync('src/scenes/ch01-palace-scene.ts', 'utf8');

  it('texture 的缩放弹跳只给「换形态」的三张贴图', () => {
    expect(source).toMatch(/if \(!this\.reduced && FORM_TEXTURES\.has\(action\.texture\)\)/);
    const formBlock = source.slice(source.indexOf('const FORM_TEXTURES'), source.indexOf('const FORM_TEXTURES') + 400);
    expect(formBlock).toContain('chuKneel');
    expect(formBlock).toContain('eunuchCrack');
    expect(formBlock).toContain('miner');
    // 郑卿朝左只是换朝向，不在白名单里
    expect(formBlock).not.toContain('zhengLeft');
  });
});

// ------------------------------------------------------------------ 全部立绘通用规格

/**
 * 金殿的全部半身立绘。
 *
 * 以后再加人（侍卫、太监、老郑的另一套衣服……）**只往这张表里加文件名**，
 * 尺寸/透明底/登记三项检查自动覆盖，不用再抄一份断言。
 */
const ALL_PORTRAITS = [
  'portrait_zheng.png',
  'portrait_chu.png',
  'portrait_xiaobai.png',
  'portrait_zhou_panic.png',
  'portrait_shiwei.png',
  'portrait_miner.png',
] as const;

const portraitKeyOf = (file: string): string => `img.char.palace.${file.replace(/\.png$/, '')}`;

describe('金殿半身立绘：通用规格', () => {
  it('每张都登记在 cutscene.ch01palace 里，url 指向 public/assets/img/character/palace/', () => {
    const bundle = BUNDLES['cutscene.ch01palace'];
    for (const file of ALL_PORTRAITS) {
      const key = portraitKeyOf(file);
      const asset = bundle.assets.find((item) => item.key === key);
      expect(asset, `${key} 没在 bundle 里登记`).toBeDefined();
      expect(`public/${asset?.url ?? ''}`).toBe(`public/assets/img/character/palace/${file}`);
    }
  });

  it('PNG 都是 720×900、8bit RGBA（立绘几何按 720:900 算显示尺寸）', () => {
    for (const file of ALL_PORTRAITS) {
      const image = png(`public/assets/img/character/palace/${file}`);
      expect([image.width, image.height], file).toEqual([720, 900]);
      expect([image.bitDepth, image.colorType], file).toEqual([8, 6]);
    }
  });

  it('透明底干净：四角全透明、左右不贴边、纵向够满（半身构图）', () => {
    for (const file of ALL_PORTRAITS) {
      const path = `public/assets/img/character/palace/${file}`;
      const image = png(path);
      for (const [x, y] of [
        [0, 0],
        [image.width - 1, 0],
        [0, image.height - 1],
        [image.width - 1, image.height - 1],
      ] as const) {
        expect(alphaOf(image, x, y), `${file} 角点 (${x},${y}) 不是透明`).toBe(0);
      }
      const box = alphaBox(image);
      expect(box.left, `${file} 左边贴边`).toBeGreaterThanOrEqual(8);
      expect(image.width - box.right, `${file} 右边贴边`).toBeGreaterThanOrEqual(8);
      expect(box.top, `${file} 头顶没贴到画布上沿（构图偏小）`).toBeLessThanOrEqual(2);
      expect(box.bottom - box.top, `${file} 内容太矮`).toBeGreaterThan(700);
    }
  });
});
