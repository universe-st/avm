import { describe, expect, it } from 'vitest';
import { LAYERS, UI_ROOT_DEPTH, characterDepth } from '../src/render/layers';
import {
  CH01_ASSET_KEYS,
  CH01_STATIC_SPRITES,
  CH01_WALK_SHEETS,
} from '../src/assets/keys';
import { BUNDLES } from '../src/assets/bundles';

describe('render layers', () => {
  it('keeps the native stack ordered from background to debug', () => {
    expect(LAYERS.background).toBeLessThan(LAYERS.props);
    expect(LAYERS.props).toBeLessThan(LAYERS.markers);
    expect(LAYERS.markers).toBeLessThan(LAYERS.characters);
    expect(LAYERS.characters).toBeLessThan(LAYERS.effects);
    expect(LAYERS.effects).toBeLessThan(LAYERS.input);
    expect(LAYERS.input).toBeLessThan(LAYERS.cinematic);
    expect(LAYERS.cinematic).toBeLessThan(LAYERS.cg);
    expect(LAYERS.cg).toBeLessThan(LAYERS.debug);
    expect(LAYERS.debug).toBeLessThan(UI_ROOT_DEPTH);
  });

  it('sorts characters by feet Y without leaving the character band', () => {
    expect(characterDepth(0)).toBe(LAYERS.characters);
    expect(characterDepth(1200)).toBe(LAYERS.characters + 1200);
    expect(characterDepth(Number.NaN)).toBe(LAYERS.characters);
  });

  it('keeps every chapter key registered in a bundle', () => {
    const keys = new Set(
      Object.values(BUNDLES).flatMap((bundle) => bundle.assets.map((asset) => asset.key)),
    );
    const groups = [
      ...Object.values(CH01_ASSET_KEYS.map),
      ...Object.values(CH01_ASSET_KEYS.characters),
      ...Object.values(CH01_ASSET_KEYS.cg),
      ...Object.values(CH01_ASSET_KEYS.battle),
      ...Object.values(CH01_ASSET_KEYS.audio),
    ];
    for (const key of groups) expect(keys.has(key), `未登记 bundle：${key}`).toBe(true);
  });

  it('groups chapter keys by map / character / cg / battle / audio', () => {
    expect(CH01_ASSET_KEYS.map.dormRoom).toMatch(/^img\.map\.ch01\./);
    for (const key of Object.values(CH01_ASSET_KEYS.characters)) {
      expect(key).toMatch(/^img\.char\.ch01\./);
    }
    for (const key of Object.values(CH01_ASSET_KEYS.cg)) {
      expect(key).toMatch(/^img\.cg\.ch01\./);
    }
    expect(CH01_ASSET_KEYS.battle.dreamHall).toMatch(/^img\.battle\.ch01\./);
    expect(Object.values(CH01_STATIC_SPRITES).every((key) => key.startsWith('img.char.ch01.'))).toBe(true);
    expect(Object.values(CH01_WALK_SHEETS).every((key) => key.includes('zhou_walk'))).toBe(true);
  });
});
