import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { BUNDLES } from '../src/assets/bundles';
import { CH01_ASSET_KEYS } from '../src/assets/keys';
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

  it('音量压在打字 blip 之下，但不至于听不见', () => {
    expect(BUBBLE_POP_VOLUME).toBeGreaterThanOrEqual(0.3);
    expect(BUBBLE_POP_VOLUME).toBeLessThanOrEqual(0.4);
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
