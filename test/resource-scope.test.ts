import { describe, expect, it } from 'vitest';
import {
  collectAssets,
  expandBundleIds,
  persistentBundleIds,
} from '../src/assets/bundles';
import type { BundleId } from '../src/assets/types';
import { planRelease } from '../src/resource/scope';

const assetKeys = (ids: readonly BundleId[]): string[] =>
  collectAssets(ids).map((asset) => asset.key);

describe('bundle closure', () => {
  it('expands dependencies before the bundle itself', () => {
    const ids = expandBundleIds(['battle.ch01']);
    expect(ids).toContain('ui');
    expect(ids).toContain('battle.common');
    expect(ids).toContain('ch.01');
    expect(ids.at(-1)).toBe('battle.ch01');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('dedupes shared dependencies', () => {
    const ids = expandBundleIds(['ch.01', 'battle.ch01']);
    expect(ids.filter((id) => id === 'ch.01')).toHaveLength(1);
    expect(ids.filter((id) => id === 'ui')).toHaveLength(1);
  });

  it('marks only global bundles as persistent', () => {
    expect(persistentBundleIds()).toEqual(['core', 'ui']);
  });
});

describe('scene release plan', () => {
  it('releases the title bundle when entering the prologue', () => {
    const plan = planRelease(['core', 'ui', 'title'], ['core', 'cutscene.prologue']);
    expect(plan.bundles).toEqual(['title']);
    expect(plan.assets.map((asset) => asset.key)).toContain('img.title.bg');
    expect(plan.assets.map((asset) => asset.key)).not.toContain('img.core.white');
  });

  it('never releases persistent bundles, even with an empty keep list', () => {
    const plan = planRelease(['core', 'ui', 'title'], []);
    expect(plan.bundles).toEqual(['title']);
    const releasedKeys = plan.assets.map((asset) => asset.key);
    expect(releasedKeys).not.toContain('img.core.white');
    expect(releasedKeys).not.toContain('audio.sfx.click');
  });

  it('keeps the dependency closure of the next scene', () => {
    const loaded = expandBundleIds(['core', 'ui', 'ch.01', 'battle.common', 'battle.ch01']);
    const plan = planRelease(loaded, ['core', 'battle.common', 'battle.ch01']);
    expect(plan).toEqual({ bundles: [], assets: [] });
  });

  it('releases chapter assets when returning to the title', () => {
    const loaded = expandBundleIds(['core', 'ui', 'ch.01']);
    const plan = planRelease(loaded, ['core', 'title']);
    expect(plan.bundles).toEqual(['ch.01']);
    const releasedKeys = plan.assets.map((asset) => asset.key);
    expect(releasedKeys).toContain('img.map.ch01.dorm_room');
    expect(releasedKeys).toContain('audio.bgm.ch01_dorm');
  });

  it('never deletes an asset key that is still inside the keep closure', () => {
    const plan = planRelease(['core', 'ui', 'cutscene.prologue', 'ch.01'], [
      'cutscene.prologue',
    ]);
    expect(plan.bundles).toEqual(['ch.01']);
    const keepKeys = new Set(assetKeys(['core', 'ui', 'cutscene.prologue']));
    expect(plan.assets.every((asset) => !keepKeys.has(asset.key))).toBe(true);
  });

  it('ignores bundles that were never loaded', () => {
    const plan = planRelease(['title'], ['title']);
    expect(plan).toEqual({ bundles: [], assets: [] });
  });
});
