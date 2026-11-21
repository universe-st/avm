import { describe, expect, it } from 'vitest';
import { CH01_ASSET_KEYS, PALACE_ASSET_KEYS } from '../src/assets/keys';
import { SCENE_KEYS } from '../src/app/scene-keys';
import { BGM_TRACKS, resolveSceneTrack } from '../src/audio/bgm-tracks';
import { PALACE_BEATS } from '../src/story/ch01-palace';
import type { PalaceAction, PalaceBeat } from '../src/story/palace-player';

/**
 * 金殿过场的音频回归护栏（2026-11-15 实机反馈：「没有 BGM + 隔一秒一记蹬」）。
 *
 * 旧实现的两个坑：
 * 1. 整场绑《清除协议》（energy 99% 在 120 Hz 以下，手机扬声器上等于没声音）；
 * 2. 心跳从第四拍起 `loop: true` 一直到进战斗——3 秒文件里三记闷响，
 *    听感就是「隔一秒一蹬」，还盖住了本该有的音乐。
 *
 * 这里断言的是剧本数据本身：心跳永远不循环、裂皮那一刻有硬切 cue。
 */

function actions(): PalaceAction[] {
  const out: PalaceAction[] = [];
  for (const beat of PALACE_BEATS as readonly PalaceBeat[]) {
    if (beat.kind === 'act') out.push(...beat.actions);
  }
  return out;
}

describe('金殿过场音频', () => {
  it('心跳只用单响，绝不在剧本里循环', () => {
    const loops = actions().filter(
      (action) =>
        action.kind === 'sfx' &&
        action.key === PALACE_ASSET_KEYS.sfx.heartbeat &&
        action.loop === true,
    );
    expect(loops).toEqual([]);
  });

  it('心跳只出现在「看见郑卿」与「太监裂皮」两处，不超过两次', () => {
    const hits = actions().filter(
      (action) => action.kind === 'sfx' && action.key === PALACE_ASSET_KEYS.sfx.heartbeat,
    );
    expect(hits.length).toBe(2);
  });

  it('裂皮那一刻硬切回《清除协议》，而且只切这一次', () => {
    const cues = actions().filter((action) => action.kind === 'bgm');
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ kind: 'bgm', id: 'ch01Dream', hard: true });
  });

  it('切曲 cue 与裂皮音效同一拍出现', () => {
    const crackBeat = (PALACE_BEATS as readonly PalaceBeat[]).find(
      (beat) =>
        beat.kind === 'act' &&
        beat.actions.some(
          (action) => action.kind === 'sfx' && action.key === PALACE_ASSET_KEYS.sfx.crack,
        ),
    );
    expect(crackBeat).toBeDefined();
    const beatActions = (crackBeat as Extract<PalaceBeat, { kind: 'act' }>).actions;
    expect(beatActions.some((action) => action.kind === 'bgm')).toBe(true);
  });

  it('金殿过场绑诙谐宫廷曲，战斗绑《刺王杀驾》', () => {
    expect(resolveSceneTrack(SCENE_KEYS.ch01Palace)).toMatchObject({
      kind: 'track',
      id: 'ch01Palace',
    });
    expect(resolveSceneTrack(SCENE_KEYS.battleCh01)).toMatchObject({
      kind: 'track',
      id: 'ch01Battle',
    });
    expect(BGM_TRACKS.ch01Palace.key).toBe(CH01_ASSET_KEYS.audio.palaceBgm);
  });

  it('环境音仍在，且不随切曲被停掉（大殿要有底噪）', () => {
    const ambience = actions().filter(
      (action) => action.kind === 'sfx' && action.key === PALACE_ASSET_KEYS.sfx.ambience,
    );
    expect(ambience.length).toBeGreaterThan(0);
    expect(ambience.every((action) => action.kind === 'sfx' && action.loop === true)).toBe(true);
    // 剧本里没有直接停环境音（收尾交给 audioDirector 的 SHUTDOWN 兜底）。
    const stops = actions().filter(
      (action) => action.kind === 'sfxStop' && action.key === PALACE_ASSET_KEYS.sfx.ambience,
    );
    expect(stops).toEqual([]);
  });
});
