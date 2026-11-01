import { describe, expect, it } from 'vitest';
import { LAYERS, SCREEN_LAYERS, UI_ROOT_DEPTH, characterDepth } from '../src/render/layers';
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
    expect(LAYERS.markers).toBeLessThan(LAYERS.fog);
    // 迷雾是"地面上的黑暗"，必须垫在角色身下；否则 3.5 格高的角色头一伸进暗处就被黑幕切掉。
    expect(LAYERS.fog).toBeLessThan(LAYERS.characters);
    expect(LAYERS.characters).toBeLessThan(LAYERS.effects);
    expect(LAYERS.effects).toBeLessThan(LAYERS.input);
    expect(LAYERS.input).toBeLessThan(LAYERS.cinematic);
    expect(LAYERS.cinematic).toBeLessThan(LAYERS.cg);
    expect(LAYERS.cg).toBeLessThan(LAYERS.debug);
    expect(LAYERS.debug).toBeLessThan(UI_ROOT_DEPTH);
  });

  it('keeps the screen band above every world layer and below the UI root', () => {
    const screen = Object.values(SCREEN_LAYERS);
    for (const depth of screen) {
      expect(depth).toBeGreaterThan(LAYERS.debug);
      expect(depth).toBeLessThan(UI_ROOT_DEPTH);
    }
    // 屏幕层内部有序：立绘 < 速度线 < 遮幅 < 字卡 < 硬切
    expect(SCREEN_LAYERS.portrait).toBeLessThan(SCREEN_LAYERS.speedlines);
    expect(SCREEN_LAYERS.speedlines).toBeLessThan(SCREEN_LAYERS.letterbox);
    expect(SCREEN_LAYERS.letterbox).toBeLessThan(SCREEN_LAYERS.stamp);
    expect(SCREEN_LAYERS.stamp).toBeLessThan(SCREEN_LAYERS.cut);
  });

  it('keeps the fog under every character so nobody gets cut in half', () => {
    for (const feetY of [0, 500, 1200, 2048, 4096, 6144]) {
      expect(characterDepth(feetY, 6144), `feetY=${feetY}`).toBeGreaterThan(LAYERS.fog);
    }
  });

  it('sorts characters by feet Y without leaving the character band', () => {
    expect(characterDepth(0)).toBe(LAYERS.characters);
    expect(characterDepth(1200)).toBe(LAYERS.characters + 675);
    expect(characterDepth(4096)).toBe(LAYERS.characters + 900);
    expect(characterDepth(1200, 4096)).toBe(LAYERS.characters + Math.round((1200 / 4096) * 900));
    expect(characterDepth(Number.NaN)).toBe(LAYERS.characters);
    // 最高处的角色（feetY = 地图底边）也必须画在迷雾之上。
    expect(characterDepth(4096)).toBeGreaterThan(LAYERS.fog);
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
    expect(CH01_ASSET_KEYS.battle.minerHall).toMatch(/^img\.battle\.ch01\./);
    expect(Object.values(CH01_STATIC_SPRITES).every((key) => key.startsWith('img.char.ch01.'))).toBe(true);
    expect(Object.values(CH01_WALK_SHEETS).every((key) => key.includes('zhou_walk'))).toBe(true);
  });
});

describe('layer discipline', () => {
  const FILES = [
    'src/ui/cinematic-director.ts',
    'src/ui/portrait-layer.ts',
    'src/scenes/ch01-palace-scene.ts',
    'src/scenes/ch01-kitchen-scene.ts',
  ];

  it('never hardcodes a numeric depth in cinematic scene code', async () => {
    const { readFile } = await import('node:fs/promises');
    for (const file of FILES) {
      const source = await readFile(file, 'utf-8');
      // setDepth(123) / setDepth(-5)：只允许 setDepth(LAYERS.xxx / SCREEN_LAYERS.xxx / characterDepth(...))
      const literal = /setDepth\(\s*-?\d/.exec(source);
      expect(literal, `${file} 里出现了写死的 depth：${literal?.[0] ?? ''}`).toBeNull();
    }
  });
});
