import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { BUNDLES } from '../src/assets/bundles';
import { CH01_ASSET_KEYS } from '../src/assets/keys';
import { TYPE_VOICE_GAIN } from '../src/audio/type-voice';
import type { EmotionKind } from '../src/story/dialogue';
import {
  BUBBLE_POP_MIN_INTERVAL_MS,
  BUBBLE_POP_RATE,
  BUBBLE_POP_VOLUME,
} from '../src/ui/emotion-bubble-sfx';

/**
 * 表情气泡冒出音效的护栏（t61）。
 *
 * 气泡出现动画只有 180ms，音效必须短促、近场、不能盖住台词打字音，也不能是
 * 科幻 UI 嘀声（`audio.sfx.click` 已经是那个声线）。这里守四件事：
 * 1. key 在 `keys.ts` 与 `bundles.ts` 里指向同一条资源，且 `required: false`；
 * 2. 音频文件真实存在、体积可控（一次性短音效不该超过 100 KB）；
 * 3. 播放发生在 `show()` 里、`hide()` 里没有（只给「冒出」配，不给「收起」配）；
 * 4. 节流常数存在、被 `show()` 引用，六个情绪的 rate 都在 ±5% 内且互不相同。
 *
 * 源码护栏用文本检查（不 import `emotion-bubble.ts`，避免在 node 里拉起 Phaser）。
 */

const BUBBLE_SOURCE = readFileSync(join('src/ui', 'emotion-bubble.ts'), 'utf8');
const SFX_SOURCE = readFileSync(join('src/ui/emotion-bubble-sfx.ts'), 'utf8');

/**
 * 读 16-bit PCM WAV 的采样峰值（dBFS）。
 *
 * 三条 voice blip 都是 22.05kHz / 16bit / 单声道；这里只解析 `fmt ` 的位深与 `data` 块，
 * 不新增任何依赖（也不把 ffmpeg 拖进 vitest）。
 */
function wavPeakDbfs(path: string): number {
  const buffer = readFileSync(path);
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${path} 不是 WAV`);
  }
  let offset = 12;
  let dataOffset = -1;
  let dataSize = 0;
  let bits = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === 'fmt ') bits = buffer.readUInt16LE(offset + 22);
    if (id === 'data') {
      dataOffset = offset + 8;
      dataSize = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (dataOffset < 0 || bits !== 16) throw new Error(`${path} 不是 16-bit PCM`);
  let peak = 0;
  const end = Math.min(buffer.length, dataOffset + dataSize);
  for (let i = dataOffset; i + 1 < end; i += 2) {
    const value = Math.abs(buffer.readInt16LE(i)) / 32768;
    if (value > peak) peak = value;
  }
  if (peak === 0) throw new Error(`${path} 是静音`);
  return 20 * Math.log10(peak);
}

const BLIP_FILES = {
  narrator: join('public/assets/audio/sfx', 'voice_blip_narrator.wav'),
  zhou: join('public/assets/audio/sfx', 'voice_blip_zhou.wav'),
  zheng: join('public/assets/audio/sfx', 'voice_blip_zheng.wav'),
} as const;

/**
 * pop 的文件峰值（`ffmpeg volumedetect` 实测；换 mp3 后必须同步这个数）。
 * 运行时有效峰值 = 文件峰值 + 20log10(settings.sfx × BUBBLE_POP_VOLUME)；
 * blip 同理由 `TYPE_VOICE_GAIN` 决定。`settings.sfx` 在两者差值里抵消，所以比较时不用带。
 */
const POP_FILE_PEAK_DBFS = -5.7;

const EMOTION_KINDS: readonly EmotionKind[] = [
  'confused',
  'angry',
  'happy',
  'surprised',
  'sad',
  'annoyed',
];

/** 从 `signature` 起找方法体（大括号配平）；找不到就抛，避免断言在空字符串上静默通过。 */
function methodBody(source: string, signature: string): string {
  const start = source.indexOf(signature);
  if (start < 0) throw new Error(`源码里找不到 ${signature}`);
  const open = source.indexOf('{', start);
  if (open < 0) throw new Error(`${signature} 后面没有方法体`);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  throw new Error(`${signature} 的大括号没有配平`);
}

describe('表情气泡冒出音效', () => {
  it('key 在 keys.ts 与 bundles.ts 里一致，且缺文件只静音不阻断', () => {
    const key = CH01_ASSET_KEYS.audio.bubblePop;
    expect(key).toBe('audio.sfx.ch01_bubble_pop');

    const entry = BUNDLES['ch.01'].assets.find((asset) => asset.key === key);
    expect(entry, `ch.01 里没有登记 ${key}`).toBeDefined();
    expect(entry).toMatchObject({
      kind: 'audio',
      url: 'assets/audio/sfx/ch01_bubble_pop.mp3',
      required: false,
    });
    expect(entry?.tags).toContain('sfx');
    expect(entry?.label?.length ?? 0).toBeGreaterThan(0);
  });

  it('音频文件存在且 < 100 KB（这是一条 200ms 的一次性音效）', () => {
    const entry = BUNDLES['ch.01'].assets.find(
      (asset) => asset.key === CH01_ASSET_KEYS.audio.bubblePop,
    );
    if (entry === undefined) throw new Error('bundle 里没有 bubblePop');

    const file = join('public', entry.url);
    expect(existsSync(file), `${file} 不存在，先跑 pnpm assets:scan`).toBe(true);

    const bytes = statSync(file).size;
    expect(bytes).toBeGreaterThan(1024);
    expect(bytes, `${file} 超过 100 KB`).toBeLessThan(100 * 1024);
  });

  it('show() 里播一记 pop，hide() 里不播', () => {
    const show = methodBody(BUBBLE_SOURCE, 'show(kind: EmotionKind');
    expect(show).toContain('audioDirector.playSfxAt(CH01_ASSET_KEYS.audio.bubblePop');
    expect(show).toContain('volume: BUBBLE_POP_VOLUME');
    expect(show).toContain('rate: BUBBLE_POP_RATE[kind]');

    const hide = methodBody(BUBBLE_SOURCE, 'hide()');
    expect(hide).not.toContain('playSfxAt');
    expect(hide).not.toContain('audioDirector');
  });

  it('120ms 节流常数存在，且被 show() 引用（连点/连续两行不叠音）', () => {
    expect(BUBBLE_POP_MIN_INTERVAL_MS).toBe(120);
    expect(BUBBLE_SOURCE).toContain('BUBBLE_POP_MIN_INTERVAL_MS');
    const show = methodBody(BUBBLE_SOURCE, 'show(kind: EmotionKind');
    expect(show).toContain('BUBBLE_POP_MIN_INTERVAL_MS');
    // 节流要写在播放之前，否则等于没节流。
    expect(show.indexOf('BUBBLE_POP_MIN_INTERVAL_MS')).toBeLessThan(
      show.indexOf('audioDirector.playSfxAt'),
    );
  });

  it('音量落在 [0.18, 0.26]：t67 实测后按契约压过一遍，别再调回 0.35', () => {
    expect(BUBBLE_POP_VOLUME).toBeGreaterThanOrEqual(0.18);
    expect(BUBBLE_POP_VOLUME).toBeLessThanOrEqual(0.26);
    // 常数注释里必须留着依据（旁白 −16.3 dBFS、要求再低 6 dB），别让后人只看到数字。
    expect(SFX_SOURCE).toContain('−16.3');
    expect(SFX_SOURCE).toContain('6 dB');
  });

  it('pop 峰值至少比旁白 blip 低 6 dB、比周全 blip 低 10 dB（数值断言）', () => {
    // 先锁住三条 blip 的文件峰值基线（t68 实测：−9.2 / −8.6 / −11.0 dBFS）。
    expect(wavPeakDbfs(BLIP_FILES.narrator)).toBeCloseTo(-9.2, 1);
    expect(wavPeakDbfs(BLIP_FILES.zhou)).toBeCloseTo(-8.6, 1);
    expect(wavPeakDbfs(BLIP_FILES.zheng)).toBeCloseTo(-11.0, 1);

    // settings.sfx 同时乘在 pop 与 blip 上，差值里抵消，故直接用单位增益。
    const effectivePeak = (filePeakDbfs: number, gain: number): number =>
      filePeakDbfs + 20 * Math.log10(gain);

    const pop = effectivePeak(POP_FILE_PEAK_DBFS, BUBBLE_POP_VOLUME);
    const narrator = effectivePeak(
      wavPeakDbfs(BLIP_FILES.narrator),
      TYPE_VOICE_GAIN.narrator,
    );
    const zhou = effectivePeak(wavPeakDbfs(BLIP_FILES.zhou), TYPE_VOICE_GAIN.zhou);

    expect(narrator - pop, 'pop 峰值必须比旁白 blip 低至少 6 dB').toBeGreaterThanOrEqual(6);
    expect(zhou - pop, 'pop 峰值必须比周全 blip 低至少 10 dB').toBeGreaterThanOrEqual(10);
  });

  it('六个情绪各有一个固定 rate，全部在 ±5% 内且互不相同', () => {
    expect(Object.keys(BUBBLE_POP_RATE).sort()).toEqual([...EMOTION_KINDS].sort());

    const rates = EMOTION_KINDS.map((kind) => BUBBLE_POP_RATE[kind]);
    for (const [index, kind] of EMOTION_KINDS.entries()) {
      const rate = rates[index] as number;
      expect(Number.isFinite(rate), kind).toBe(true);
      expect(rate, `${kind} 的 rate 超出 ±5%`).toBeGreaterThanOrEqual(0.95);
      expect(rate, `${kind} 的 rate 超出 ±5%`).toBeLessThanOrEqual(1.05);
    }
    expect(new Set(rates).size).toBe(EMOTION_KINDS.length);
  });

  it('reduced（减少动效）也照常响：播放不在 `if (!this.reduced)` 分支里', () => {
    const show = methodBody(BUBBLE_SOURCE, 'show(kind: EmotionKind');
    const playAt = show.indexOf('audioDirector.playSfxAt');
    const tweenGuard = show.indexOf('if (!this.reduced)');
    expect(playAt).toBeGreaterThanOrEqual(0);
    expect(tweenGuard).toBeGreaterThanOrEqual(0);
    // 播放写在动画分支之前，reduced 走 else 分支时也已经响过了。
    expect(playAt).toBeLessThan(tweenGuard);
  });
});
