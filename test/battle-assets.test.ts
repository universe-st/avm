import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  BATTLE_ASSET_KEYS,
  BATTLE_HEAD_KEYS,
  BATTLE_MINER_ART,
  BATTLE_COOK_ATTACKS,
  BATTLE_MINER_ATTACKS,
  BATTLE_PLAYER_ART,
  KITCHEN_CAST,
} from '../src/assets/keys';
import { collectAssets } from '../src/assets/bundles';
import { BGM_TRACKS } from '../src/audio/bgm-tracks';
import { MODULES } from '../src/app/modules';
import type { BundleId } from '../src/assets/types';

const ROOT = process.cwd();
const PUBLIC = join(ROOT, 'public');

function assetUrl(ids: readonly BundleId[], key: string): string {
  const assets = collectAssets(ids);
  const asset = assets.find((entry) => entry.key === key);
  expect(asset, `bundle 里没有登记 ${key}`).toBeDefined();
  return asset!.url;
}

function read(ids: readonly BundleId[], key: string): Buffer {
  const path = join(PUBLIC, assetUrl(ids, key));
  expect(existsSync(path), `文件不存在：${path}`).toBe(true);
  return readFileSync(path);
}

function pngSize(buffer: Buffer): { width: number; height: number } {
  expect(buffer.toString('ascii', 1, 4)).toBe('PNG');
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function webpSize(buffer: Buffer): { width: number; height: number } {
  expect(buffer.toString('ascii', 0, 4)).toBe('RIFF');
  expect(buffer.toString('ascii', 8, 12)).toBe('WEBP');
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    const width = 1 + (buffer[24]! | (buffer[25]! << 8) | (buffer[26]! << 16));
    const height = 1 + (buffer[27]! | (buffer[28]! << 8) | (buffer[29]! << 16));
    return { width, height };
  }
  if (chunk === 'VP8 ') {
    const width = buffer.readUInt16LE(26) & 0x3fff;
    const height = buffer.readUInt16LE(28) & 0x3fff;
    return { width, height };
  }
  throw new Error(`未支持的 WebP 子格式：${chunk}`);
}

describe('battle v2 assets', () => {
  it('keeps the player battle frames on the shared 160×400 baseline', () => {
    const common: BundleId[] = ['battle.common'];
    expect(pngSize(read(common, BATTLE_PLAYER_ART.key))).toEqual({ width: 160, height: 400 });
    expect(pngSize(read(common, BATTLE_PLAYER_ART.guardKey))).toEqual({
      width: 160,
      height: 400,
    });
    expect(BATTLE_PLAYER_ART.frameHeight).toBe(400);
  });

  it('keeps the 12-frame attack sheet under the mobile 4096 texture limit', () => {
    const common: BundleId[] = ['battle.common'];
    const size = webpSize(read(common, BATTLE_PLAYER_ART.attackKey));
    expect(size).toEqual({ width: 3840, height: 400 });
    expect(size.width).toBeLessThan(4096);
    expect(BATTLE_PLAYER_ART.frameCount).toBe(12);
    expect(BATTLE_PLAYER_ART.frameWidth * BATTLE_PLAYER_ART.frameCount).toBe(size.width);
    expect(BATTLE_PLAYER_ART.frameHeight).toBe(size.height);
    // 起手式与突刺用同一个显示缩放，出招时人不会突然变大。
    expect(BATTLE_PLAYER_ART.displayScale).toBeCloseTo(0.458, 3);
  });

  it('ships all eight miner facings at the same 272×400 baseline', () => {
    const battle: BundleId[] = ['battle.ch01'];
    for (const key of Object.values(BATTLE_MINER_ART.dirs)) {
      const size = pngSize(read(battle, key));
      expect(size, key).toEqual({ width: 272, height: 400 });
    }
    expect(Object.keys(BATTLE_MINER_ART.dirs)).toHaveLength(8);
    expect(BATTLE_MINER_ART.figureHeight).toBe(371);
  });

  it('ships one left-facing 12-frame sheet per miner skill, under 4096', () => {
    const battle: BundleId[] = ['battle.ch01'];
    for (const [skillId, meta] of Object.entries(BATTLE_MINER_ATTACKS)) {
      const size = webpSize(read(battle, meta.key));
      expect(size, skillId).toEqual({
        width: meta.frameWidth * meta.frameCount,
        height: 400,
      });
      expect(size.width, skillId).toBeLessThan(4096);
      expect(meta.originX, skillId).toBeGreaterThan(0);
      expect(meta.originX, skillId).toBeLessThan(1);
    }
  });

  it('ships one left-facing 10-frame sheet per cook skill, under 4096', () => {
    const kitchen: BundleId[] = ['battle.kitchen'];
    for (const [skillId, meta] of Object.entries(BATTLE_COOK_ATTACKS)) {
      const size = webpSize(read(kitchen, meta.key));
      expect(size, skillId).toEqual({
        width: meta.frameWidth * meta.frameCount,
        height: 400,
      });
      expect(size.width, skillId).toBeLessThan(4096);
      expect(meta.frameCount, skillId).toBe(10);
      expect(meta.originX, skillId).toBeGreaterThan(0);
      expect(meta.originX, skillId).toBeLessThan(1);
    }
  });

  it('ships the kitchen battle plate and the cook facings used by the phantom', () => {
    const kitchen: BundleId[] = ['battle.kitchen'];
    expect(webpSize(read(kitchen, BATTLE_ASSET_KEYS.stage.kitchenHall))).toEqual({
      width: 720,
      height: 1280,
    });
    const cast = collectAssets(['ch01.kitchen']);
    for (const [dir, key] of Object.entries(KITCHEN_CAST.cook.still)) {
      expect(cast.some((asset) => asset.key === key), dir).toBe(true);
    }
  });

  it('binds the battle BGM and keeps it inside the shared music bundle', () => {
    const tracks = BGM_TRACKS.ch01Battle;
    expect(tracks.key).toBe(BATTLE_ASSET_KEYS.bgm.battle);
    const assets = collectAssets(['ch01.bgm']);
    expect(assets.some((asset) => asset.key === tracks.key)).toBe(true);
  });

  it('registers every battle SFX in a battle bundle', () => {
    const common = collectAssets(['battle.common']);
    const ch01 = collectAssets(['battle.ch01']);
    const all = [...common, ...ch01].map((asset) => asset.key);
    for (const key of Object.values(BATTLE_ASSET_KEYS.sfx)) {
      expect(all, key).toContain(key);
    }
  });

  it('ships one 128×128 circular head per battle closure, without cross-loading', () => {
    const common = collectAssets(['battle.common']);
    const first = collectAssets(['battle.ch01']);
    const kitchen = collectAssets(['battle.kitchen']);
    const commonIds: BundleId[] = ['battle.common'];
    const firstIds: BundleId[] = ['battle.ch01'];
    const kitchenIds: BundleId[] = ['battle.kitchen'];
    expect(pngSize(read(commonIds, BATTLE_HEAD_KEYS.zhou))).toEqual({ width: 128, height: 128 });
    expect(pngSize(read(commonIds, BATTLE_HEAD_KEYS.xiaobai))).toEqual({ width: 96, height: 96 });
    expect(pngSize(read(firstIds, BATTLE_HEAD_KEYS.miner))).toEqual({ width: 128, height: 128 });
    expect(pngSize(read(kitchenIds, BATTLE_HEAD_KEYS.cook))).toEqual({ width: 128, height: 128 });

    // 周全/小白两场都用 → battle.common；矿工/御厨各归各包，不跨包混装。
    expect(first.some((asset) => asset.key === BATTLE_HEAD_KEYS.miner)).toBe(true);
    expect(first.some((asset) => asset.key === BATTLE_HEAD_KEYS.cook)).toBe(false);
    expect(kitchen.some((asset) => asset.key === BATTLE_HEAD_KEYS.cook)).toBe(true);
    expect(kitchen.some((asset) => asset.key === BATTLE_HEAD_KEYS.miner)).toBe(false);
    expect(common.some((asset) => asset.key === BATTLE_HEAD_KEYS.zhou)).toBe(true);
    expect(common.some((asset) => asset.key === BATTLE_HEAD_KEYS.xiaobai)).toBe(true);
  });

  it('keeps the two battle modules on separate resource closures', () => {
    const first = MODULES.battleCh01.requires;
    const kitchen = MODULES.battleKitchen.requires;
    expect(first).toContain('battle.ch01');
    expect(first).not.toContain('battle.kitchen');
    expect(kitchen).toContain('battle.kitchen');
    expect(kitchen).not.toContain('battle.ch01');
    // 第一场不该被迫加载御膳房的 14 MB 美术。
    expect(collectAssets(first).some((asset) => asset.key === 'img.map.ch01.kitchen')).toBe(false);
    // 御膳房战斗需要厨子八向。
    expect(collectAssets(kitchen).some((asset) => asset.key === 'img.char.ch01.kitchen.cook_down')).toBe(
      true,
    );
  });
});
