import { describe, expect, it } from 'vitest';
import type { AssetDef } from '../src/assets/types';
import {
  assetBytes,
  missingAssets,
  progressOf,
  requiredFailures,
  totalWeight,
  weightOf,
  type Catalog,
} from '../src/resource/plan';

const image = (key: string, required = true): AssetDef => ({
  key,
  kind: 'image',
  url: `assets/${key}.png`,
  required,
});

const catalog: Catalog = {
  'assets/img.a.png': { bytes: 10 * 1024 },
  'assets/img.b.png': { bytes: 90 * 1024 },
  'assets/audio.c.mp3': { bytes: 1_000 * 1024 },
};

describe('resource weight', () => {
  it('uses catalog bytes and clamps to 1..4096', () => {
    expect(weightOf(image('img.a'), catalog)).toBe(10);
    expect(weightOf({ ...image('img.tiny'), weight: 0 }, { 'assets/img.tiny.png': { bytes: 1 } })).toBe(1);
    expect(weightOf({ ...image('img.huge'), weight: 99999 }, catalog)).toBe(4096);
  });

  it('falls back to type estimate when the catalog has no entry', () => {
    expect(assetBytes(image('img.unknown'), catalog)).toBe(192 * 1024);
    expect(assetBytes({ ...image('audio.unknown'), kind: 'audio' }, catalog)).toBe(1024 * 1024);
  });

  it('sums weights', () => {
    expect(totalWeight([image('img.a'), image('img.b')], catalog)).toBe(100);
  });
});

describe('progress', () => {
  it('is monotonic and clamped', () => {
    expect(progressOf(0, 0)).toBe(1);
    expect(progressOf(1, 4)).toBe(0.25);
    expect(progressOf(8, 4)).toBe(1);
    expect(progressOf(-1, 4)).toBe(0);
  });
});

describe('failure policy', () => {
  it('blocks only on required failures', () => {
    const optional = image('img.opt', false);
    expect(requiredFailures([image('img.a'), optional], ['img.opt'])).toEqual([]);
    expect(requiredFailures([image('img.a'), optional], ['img.a'])).toEqual([image('img.a')]);
  });
});

describe('missing assets', () => {
  it('filters what the cache already has', () => {
    const all = [image('img.a'), image('img.b')];
    expect(missingAssets(all, (a) => a.key === 'img.a')).toEqual([all[1]]);
  });
});
