import { describe, expect, it } from 'vitest';
import { BUNDLES, collectAssets } from '../src/assets/bundles';
import { CONTENT_SCENE_KEYS, SCENE_KEYS } from '../src/app/scene-keys';
import { MODULES } from '../src/app/modules';
import { STAGE_CATALOG } from '../src/dev/stage-catalog';
import { CHECKPOINTS, continueDestination } from '../src/app/progress';
import {
  BGM_TRACKS,
  SCENE_BGM,
  SCENE_HOLD,
  SCENE_SILENT,
  bindingTrackId,
  bgmVolume,
  missingSceneBindings,
  resolveSceneTrack,
  sceneTrack,
  withSceneBinding,
  type BgmId,
  type SceneBinding,
  type SceneBindingOverrides,
} from '../src/audio/bgm-tracks';
import { planBgmTransition, type BgmPlaybackState } from '../src/audio/bgm-plan';

const assetKeys = new Set(
  Object.values(BUNDLES).flatMap((bundle) => bundle.assets.map((asset) => asset.key)),
);

function playing(id: BgmId | null): BgmPlaybackState {
  return { currentId: id, hasInstance: id !== null, playing: id !== null, paused: false };
}

function paused(id: BgmId): BgmPlaybackState {
  return { currentId: id, hasInstance: true, playing: false, paused: true };
}

describe('BGM 场景绑定表', () => {
  it('CONTENT_SCENE_KEYS 里每个场景都有显式绑定（漏登记直接红）', () => {
    expect(missingSceneBindings()).toEqual([]);
    // 表里也不能有内容场景之外的残留 key。
    expect(Object.keys(SCENE_BGM).sort()).toEqual([...CONTENT_SCENE_KEYS].sort());
    for (const key of CONTENT_SCENE_KEYS) {
      const binding = resolveSceneTrack(key);
      expect(binding).toBeDefined();
      expect(['track', 'silence', 'hold']).toContain(binding?.kind);
    }
  });

  it('没有「没登记 → 静默沿用」：未知场景才返回 undefined', () => {
    for (const key of CONTENT_SCENE_KEYS) {
      expect(resolveSceneTrack(key)).toBeDefined();
    }
    expect(resolveSceneTrack(SCENE_KEYS.boot)).toBeUndefined();
    expect(resolveSceneTrack(SCENE_KEYS.loader)).toBeUndefined();
    expect(resolveSceneTrack('scene.nope')).toBeUndefined();
  });

  it('各场景的三态与曲目都写死了，不再依赖隐式沿用', () => {
    expect(resolveSceneTrack(SCENE_KEYS.title)).toEqual(sceneTrack('title'));
    expect(resolveSceneTrack(SCENE_KEYS.prologue)).toEqual(sceneTrack('prologue'));
    expect(resolveSceneTrack(SCENE_KEYS.placeholder)).toEqual(SCENE_SILENT);
    expect(resolveSceneTrack(SCENE_KEYS.ch01Opening)).toEqual(SCENE_HOLD);
    expect(resolveSceneTrack(SCENE_KEYS.ch01Dorm)).toEqual(sceneTrack('ch01Dorm'));
    expect(resolveSceneTrack(SCENE_KEYS.ch01Kitchen)).toEqual(sceneTrack('ch01Crisis'));
    expect(resolveSceneTrack(SCENE_KEYS.ch01Palace)).toEqual(sceneTrack('ch01Palace'));
    expect(resolveSceneTrack(SCENE_KEYS.battleCh01)).toEqual(sceneTrack('ch01Battle'));
    expect(resolveSceneTrack(SCENE_KEYS.cgStage)).toEqual(SCENE_HOLD);
    expect(resolveSceneTrack(SCENE_KEYS.battleSandbox)).toEqual(SCENE_HOLD);
  });

  it('绑定里出现的每个 id 都有曲目定义', () => {
    for (const binding of Object.values(SCENE_BGM)) {
      expect(binding).toBeDefined();
      if (binding?.kind !== 'track') continue;
      expect(BGM_TRACKS[binding.id].key).toBeTruthy();
    }
  });

  it('曲目 key 唯一，且都在 bundles 里登记过', () => {
    const ids = Object.keys(BGM_TRACKS) as BgmId[];
    const keys = ids.map((id) => BGM_TRACKS[id].key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(assetKeys.has(key)).toBe(true);
  });

  it('真实模块绑定的曲子必须在该场景的 requires 闭包里（表里有、场景没加载 = 静音 bug）', () => {
    for (const module of Object.values(MODULES)) {
      const binding = resolveSceneTrack(module.sceneKey);
      if (binding?.kind !== 'track') continue;
      const keys = collectAssets(module.requires).map((asset) => asset.key);
      expect(keys, `${module.id} 缺少 ${binding.id} 的音频`).toContain(
        BGM_TRACKS[binding.id].key,
      );
    }
  });

  it('舞台预览的 requires 也必须带上它绑定的曲子', () => {
    for (const stage of STAGE_CATALOG) {
      if (stage.status !== 'ready' || stage.kind === 'cg') continue;
      const binding = resolveSceneTrack(stage.sceneKey);
      if (binding?.kind !== 'track') continue;
      const keys = collectAssets(stage.requires).map((asset) => asset.key);
      expect(keys, `${stage.id} 缺少 ${binding.id} 的音频`).toContain(
        BGM_TRACKS[binding.id].key,
      );
    }
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

describe('运行时改绑（resolveSceneTrack + overrides）', () => {
  it('改绑优先于默认表，且只影响被改的场景', () => {
    const overrides = withSceneBinding({}, SCENE_KEYS.ch01Dorm, sceneTrack('ch01Crisis'));
    expect(resolveSceneTrack(SCENE_KEYS.ch01Dorm, overrides)).toEqual(sceneTrack('ch01Crisis'));
    // 其它场景仍走默认表。
    expect(resolveSceneTrack(SCENE_KEYS.ch01Palace, overrides)).toEqual(sceneTrack('ch01Palace'));
    expect(resolveSceneTrack(SCENE_KEYS.ch01Kitchen, overrides)).toEqual(sceneTrack('ch01Crisis'));
  });

  it('改绑跨场景持续生效，`null` 显式改回默认值', () => {
    const overrides: SceneBindingOverrides = withSceneBinding(
      {},
      SCENE_KEYS.ch01Dorm,
      sceneTrack('ch01Dream'),
    );
    // 模拟「进别的场景再回来」：解析函数每次都会读到同一份 override。
    expect(bindingTrackId(resolveSceneTrack(SCENE_KEYS.ch01Dorm, overrides))).toBe('ch01Dream');
    expect(bindingTrackId(resolveSceneTrack(SCENE_KEYS.battleCh01, overrides))).toBe('ch01Battle');

    const restored = withSceneBinding(overrides, SCENE_KEYS.ch01Dorm, null);
    expect(resolveSceneTrack(SCENE_KEYS.ch01Dorm, restored)).toEqual(sceneTrack('ch01Dorm'));
  });

  it('改绑不修改入参（纯函数）', () => {
    const empty: SceneBindingOverrides = {};
    const next = withSceneBinding(empty, SCENE_KEYS.title, SCENE_SILENT);
    expect(empty).toEqual({});
    expect(next).not.toBe(empty);
  });

  it('改绑可以写成静音 / 沿用三态中的任意一种', () => {
    const silent = withSceneBinding({}, SCENE_KEYS.ch01Kitchen, SCENE_SILENT);
    expect(resolveSceneTrack(SCENE_KEYS.ch01Kitchen, silent)).toEqual(SCENE_SILENT);
    const held = withSceneBinding({}, SCENE_KEYS.ch01Kitchen, SCENE_HOLD);
    expect(resolveSceneTrack(SCENE_KEYS.ch01Kitchen, held)).toEqual(SCENE_HOLD);
  });
});

describe('续播判定（planBgmTransition）', () => {
  it('同一首跨场景：不重建实例（continue），进度不会回到 0', () => {
    const action = planBgmTransition(playing('ch01Dream'), sceneTrack('ch01Dream'));
    expect(action).toEqual({ type: 'continue' });
  });

  it('同一首但被暂停（切后台 pauseAll）：resume 同一个实例，不重新起播', () => {
    expect(planBgmTransition(paused('ch01Dream'), sceneTrack('ch01Dream'))).toEqual({
      type: 'resume',
    });
  });

  it('同一首但实例已经没了：才允许 start', () => {
    const lost: BgmPlaybackState = {
      currentId: 'ch01Dream',
      hasInstance: false,
      playing: false,
      paused: false,
    };
    expect(planBgmTransition(lost, sceneTrack('ch01Dream'))).toEqual({
      type: 'start',
      id: 'ch01Dream',
    });
  });

  it('不同首：交叉淡化（start 新曲）', () => {
    expect(planBgmTransition(playing('title'), sceneTrack('ch01Dorm'))).toEqual({
      type: 'start',
      id: 'ch01Dorm',
    });
    expect(planBgmTransition(playing(null), sceneTrack('ch01Dorm'))).toEqual({
      type: 'start',
      id: 'ch01Dorm',
    });
  });

  it('显式沿用 / 未登记场景：hold，不打断当前曲目', () => {
    expect(planBgmTransition(playing('title'), SCENE_HOLD)).toEqual({ type: 'hold' });
    expect(planBgmTransition(playing('title'), undefined)).toEqual({ type: 'hold' });
  });

  it('静音：淡出（stop 幂等）', () => {
    expect(planBgmTransition(playing('title'), SCENE_SILENT)).toEqual({ type: 'silence' });
    expect(planBgmTransition(playing(null), SCENE_SILENT)).toEqual({ type: 'silence' });
  });

  it('改绑后跨场景：同曲判定跟着改绑走', () => {
    // 场景绑《清除协议》，但运行时改成了《危机来临》→ 必须换曲。
    const overrides = withSceneBinding({}, SCENE_KEYS.ch01Kitchen, sceneTrack('ch01Crisis'));
    const binding = resolveSceneTrack(SCENE_KEYS.ch01Kitchen, overrides);
    expect(planBgmTransition(playing('ch01Dream'), binding)).toEqual({
      type: 'start',
      id: 'ch01Crisis',
    });
    // 改绑到与当前同一首 → 续播。
    const same = withSceneBinding({}, SCENE_KEYS.ch01Kitchen, sceneTrack('ch01Dream'));
    expect(planBgmTransition(playing('ch01Dream'), resolveSceneTrack(SCENE_KEYS.ch01Kitchen, same))).toEqual(
      { type: 'continue' },
    );
  });
});

describe('「继续游戏」检查点 → BGM（防回归）', () => {
  /** 检查点 → 模块 → 场景 key → 解析出的曲目。 */
  const expected: Record<(typeof CHECKPOINTS)[number], BgmId> = {
    'dorm.explore': 'ch01Dorm',
    'dorm.palace': 'ch01Palace',
    'dorm.after': 'ch01Dorm',
    'ch01.complete': 'ch01Dorm',
    'kitchen.explore': 'ch01Crisis',
    'kitchen.done': 'ch01Crisis',
  };

  it('每个检查点都有明确的曲目，标题曲绝不会被带进去', () => {
    for (const checkpoint of CHECKPOINTS) {
      const destination = continueDestination(checkpoint);
      const module = MODULES[destination.module];
      const binding = resolveSceneTrack(module.sceneKey);
      expect(binding).toBeDefined();
      expect(binding?.kind).toBe('track');
      expect(bindingTrackId(binding)).toBe(expected[checkpoint]);
      expect(bindingTrackId(binding)).not.toBe('title');
    }
  });

  it('从标题进入任一检查点：都会切曲（不是 hold / 静音）', () => {
    const fromTitle = playing('title');
    for (const checkpoint of CHECKPOINTS) {
      const destination = continueDestination(checkpoint);
      const binding: SceneBinding | undefined = resolveSceneTrack(
        MODULES[destination.module].sceneKey,
      );
      const action = planBgmTransition(fromTitle, binding);
      expect(action.type).toBe('start');
      if (action.type === 'start') {
        expect(action.id).toBe(expected[checkpoint]);
        expect(action.id).not.toBe('title');
      }
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
