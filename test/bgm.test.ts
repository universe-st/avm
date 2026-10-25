import { describe, expect, it } from 'vitest';
import { BUNDLES } from '../src/assets/bundles';
import { SCENE_KEYS } from '../src/app/scene-keys';
import {
  BGM_BY_SCENE,
  BGM_TRACKS,
  bgmForScene,
  bgmVolume,
  type BgmId,
} from '../src/audio/bgm-tracks';

const assetKeys = new Set(
  Object.values(BUNDLES).flatMap((bundle) => bundle.assets.map((asset) => asset.key)),
);

describe('BGM 场景表', () => {
  it('标题、开幕、占位页各有明确安排', () => {
    expect(bgmForScene(SCENE_KEYS.title)).toBe('title');
    expect(bgmForScene(SCENE_KEYS.prologue)).toBe('prologue');
    expect(bgmForScene(SCENE_KEYS.placeholder)).toBeNull();
    expect(bgmForScene(SCENE_KEYS.ch01Dorm)).toBeNull();
    expect(bgmForScene(SCENE_KEYS.battleCh01)).toBe('ch01Dream');
  });

  it('没登记的场景返回 undefined（保持当前曲目），不是 null（淡出）', () => {
    expect(bgmForScene(SCENE_KEYS.cgStage)).toBeUndefined();
    expect(bgmForScene(SCENE_KEYS.battleSandbox)).toBeUndefined();
    expect(bgmForScene('scene.nope')).toBeUndefined();
  });

  it('场景表里出现的每个 id 都有曲目定义', () => {
    for (const id of Object.values(BGM_BY_SCENE)) {
      if (id === null || id === undefined) continue;
      expect(BGM_TRACKS[id].key).toBeTruthy();
    }
  });

  it('曲目 key 唯一，且都在 bundles 里登记过', () => {
    const ids = Object.keys(BGM_TRACKS) as BgmId[];
    const keys = ids.map((id) => BGM_TRACKS[id].key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(assetKeys.has(key)).toBe(true);
  });

  it('淡入淡出时长在可感知但不拖沓的区间内', () => {
    for (const track of Object.values(BGM_TRACKS)) {
      expect(track.fadeInMs).toBeGreaterThanOrEqual(80);
      expect(track.fadeOutMs).toBeGreaterThanOrEqual(80);
      expect(track.fadeInMs).toBeLessThanOrEqual(3000);
      expect(track.fadeOutMs).toBeLessThanOrEqual(3000);
    }
  });
});

describe('bgmVolume', () => {
  it('静音时恒为 0', () => {
    expect(bgmVolume(true, 0.6)).toBe(0);
    expect(bgmVolume(true, 1)).toBe(0);
  });

  it('跟随设置里的音乐音量', () => {
    expect(bgmVolume(false, 0.6)).toBeCloseTo(0.6);
    expect(bgmVolume(false, 0.25)).toBeCloseTo(0.25);
  });

  it('钳制到 0–1，NaN 当 0', () => {
    expect(bgmVolume(false, 2)).toBe(1);
    expect(bgmVolume(false, -1)).toBe(0);
    expect(bgmVolume(false, Number.NaN)).toBe(0);
  });
});
