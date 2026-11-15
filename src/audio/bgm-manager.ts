import Phaser from 'phaser';
import { settings } from '../app/settings';
import type { ContentSceneKey } from '../app/scene-keys';
import { planBgmTransition, type BgmPlaybackState } from './bgm-plan';
import {
  BGM_TRACKS,
  bgmVolume,
  resolveSceneTrack,
  withSceneBinding,
  type BgmId,
  type SceneBinding,
  type SceneBindingOverrides,
  type BgmTrack,
} from './bgm-tracks';

/** 一次淡入/淡出 tween 的记账：宿主场景变了，旧 tween 就会随 shutdown 失效。 */
interface FadeRecord {
  readonly tween: Phaser.Tweens.Tween;
  readonly scene: Phaser.Scene;
}

/** 只读调试快照；DEV 构建里通过 `window.__avmBgm.snapshot()` 拿。 */
export interface BgmDebugSnapshot {
  /** 当前宿主场景 key。 */
  readonly sceneKey: string | null;
  /** 当前曲目 id（静音/没播时为 null）。 */
  readonly currentId: BgmId | null;
  /** 声音实例编号：同一首跨场景续播时保持不变。 */
  readonly instanceId: number | null;
  readonly isPlaying: boolean;
  readonly isPaused: boolean;
  /** 管理器记账的当前音量（0–1）。 */
  readonly volume: number;
  /** 当前播放进度（毫秒）；读不到时为 -1。 */
  readonly positionMs: number;
  /** 当前曲目总时长（毫秒）；读不到时为 -1。 */
  readonly durationMs: number;
  /** 当前场景解析出来的绑定（含运行时改绑）。 */
  readonly binding: SceneBinding | null;
}

export interface BgmDebugApi {
  readonly snapshot: () => BgmDebugSnapshot;
  readonly currentId: () => BgmId | null;
  readonly instanceId: () => number | null;
  readonly isPlaying: () => boolean;
  readonly isPaused: () => boolean;
  readonly positionMs: () => number;
  readonly volume: () => number;
  readonly sceneKey: () => string | null;
  readonly binding: () => SceneBinding | null;
  readonly bindingOf: (sceneKey: string) => SceneBinding | null;
}

/**
 * BGM 管理器（执行层；「该不该重建实例」的判定在 `bgm-plan.ts`，场景绑定表在 `bgm-tracks.ts`）。
 *
 * 每个内容场景在 `create()` 里调用一次 `bgmManager.enterScene(this)`：
 *
 * - 绑定 `track`：切过去，旧曲淡出、新曲淡入（交叉淡化）；
 * - 绑定 `silence`：淡出到静音；
 * - 绑定 `hold`：保持当前曲目，不打断；
 * - 同一首曲子跨场景：**复用同一个声音实例**，播放进度连续、不回到 0。
 *
 * 跨场景的淡出必须由**新场景**的 tween 驱动：旧场景 shutdown 会连带销毁它的 tween，
 * 在旧场景里起淡化会让旧曲永远停在半音量。
 *
 * 另外：
 * - `play(id)` 是剧情 cue（对话 `bgm`、探索开始等）的即时切曲，不写改绑表；
 * - `bindScene(key, binding)` 是运行时改绑（如某检查点后寝室换曲），改绑跨场景生效，
 *   直到 `clearSceneBinding(key)` 显式改回。
 */
export class BgmManager {
  private scene: Phaser.Scene | null = null;
  private sceneKey: string | null = null;
  private currentId: BgmId | null = null;
  private current: Phaser.Sound.BaseSound | null = null;
  private currentInstanceId: number | null = null;
  private instanceSeq = 0;
  private readonly fades = new Map<Phaser.Sound.BaseSound, FadeRecord>();
  /**
   * 每条声音当前音量的记账值。
   *
   * 不读 `sound.volume`：WebAudio 的 gain 在读之前要等一个渲染量子，刚 add/play 时读到的
   * 是节点默认的 1，淡入会从满音量「淡出」到目标音量；所有写入都经过 `applyVolume`，
   * 读的时候只信任这本账。
   */
  private readonly volumes = new Map<Phaser.Sound.BaseSound, number>();
  /** 运行时改绑（优先于 `SCENE_BGM`）；只在被显式改过的场景上留 key。 */
  private overrides: SceneBindingOverrides = {};
  private unlockHooked = false;

  /** 当前曲目 id（调试用；没在播时为 null）。 */
  get currentBgmId(): BgmId | null {
    return this.currentId;
  }

  /** 当前曲目实例（测试/调试用）。 */
  get currentSound(): Phaser.Sound.BaseSound | null {
    return this.current;
  }

  /** 当前宿主场景 key（调试用）。 */
  get currentSceneKey(): string | null {
    return this.sceneKey;
  }

  /**
   * 场景入口：绑定宿主场景，并按「入口 cue（可选）> 运行时改绑 > 场景绑定表」切曲。
   *
   * `entryCue` 只用于同一个场景内「开场段音乐不同」的情况（寝室睡觉戏要静场）；
   * 常规跨场景的音乐差异一律改 `SCENE_BGM`。
   */
  enterScene(scene: Phaser.Scene, entryCue?: SceneBinding): void {
    this.attach(scene);
    this.sceneKey = scene.scene.key;
    this.applyBinding(entryCue ?? this.sceneBinding(scene.scene.key));
  }

  /**
   * 运行时改绑：立刻生效（如果改的就是当前场景），并在后续每次进入该场景时继续生效，
   * 直到 `clearSceneBinding()`。
   */
  bindScene(sceneKey: ContentSceneKey, binding: SceneBinding): void {
    this.overrides = withSceneBinding(this.overrides, sceneKey, binding);
    if (this.sceneKey === sceneKey) this.applyBinding(binding);
  }

  /** 撤销运行时改绑，回落到 `SCENE_BGM` 里的默认值。 */
  clearSceneBinding(sceneKey: ContentSceneKey): void {
    this.overrides = withSceneBinding(this.overrides, sceneKey, null);
    if (this.sceneKey === sceneKey) this.applyBinding(resolveSceneTrack(sceneKey, this.overrides));
  }

  /** 查某个场景当前生效的绑定（含改绑）；内容场景之外返回 undefined。 */
  sceneBinding(sceneKey: string): SceneBinding | undefined {
    return resolveSceneTrack(sceneKey, this.overrides);
  }

  /**
   * 重新解析**当前场景**的绑定并执行。
   *
   * 给「同一个场景内换阶段」用（寝室开场静场 → 进入探索要切回绑定曲）。
   * 不要在这里写死曲目 id：写死会把运行时改绑打回默认值。
   */
  applySceneBinding(): void {
    if (!this.sceneKey) return;
    this.applyBinding(this.sceneBinding(this.sceneKey));
  }

  /** 剧情 cue / 场景内阶段切曲：立即执行一个绑定，不写改绑表。 */
  play(id: BgmId, options: { readonly hard?: boolean } = {}): void {
    if (options.hard === true) {
      this.start(id, true);
      return;
    }
    this.applyBinding({ kind: 'track', id });
  }

  /** 淡出并释放当前曲目。 */
  stop(fadeMs?: number): void {
    const previous = this.current;
    const id = this.currentId;
    this.current = null;
    this.currentId = null;
    this.currentInstanceId = null;
    if (!previous) return;
    this.fadeOutAndDestroy(previous, fadeMs ?? (id ? BGM_TRACKS[id].fadeOutMs : 800));
  }

  /** 音量/静音变化后，把当前曲目拉回目标音量。 */
  syncVolume(durationMs = 160): void {
    if (!this.current) return;
    this.fadeTo(this.current, bgmVolume(settings.muted, settings.bgm), durationMs);
  }

  setBgmVolume(value: number): void {
    settings.bgm = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
    this.syncVolume(120);
  }

  setMuted(muted: boolean): void {
    settings.muted = muted;
    this.syncVolume(160);
  }

  /**
   * 浏览器要求「用户手势后才能出声」时，解锁的一瞬间把当前曲目重新播一遍，
   * 否则曲目可能停在「已调度但听不见」的状态。
   */
  unlock(): void {
    const manager = this.scene?.sound;
    (manager as unknown as { unlock?: () => void } | undefined)?.unlock?.();
    const sound = this.current;
    if (!sound) return;
    if (sound.isPaused) sound.resume();
    else if (!sound.isPlaying) sound.play();
    this.syncVolume(600);
  }

  /** 场景无关地释放所有声音（目前只给测试/热重载用）。 */
  dispose(): void {
    const sounds = new Set<Phaser.Sound.BaseSound>([...this.fades.keys()]);
    if (this.current) sounds.add(this.current);
    for (const sound of sounds) {
      this.fades.get(sound)?.tween.stop();
      sound.stop();
      sound.destroy();
    }
    this.fades.clear();
    this.volumes.clear();
    this.current = null;
    this.currentId = null;
    this.currentInstanceId = null;
    this.scene = null;
    this.sceneKey = null;
    this.overrides = {};
    this.unlockHooked = false;
  }

  /** 只读调试快照（DEV 构建暴露为 `window.__avmBgm`）。 */
  debugSnapshot(): BgmDebugSnapshot {
    const sound = this.current;
    return {
      sceneKey: this.sceneKey,
      currentId: this.currentId,
      instanceId: this.currentInstanceId,
      isPlaying: sound?.isPlaying === true,
      isPaused: sound?.isPaused === true,
      volume: sound ? (this.volumes.get(sound) ?? 0) : 0,
      positionMs: sound ? readSeekMs(sound) : -1,
      durationMs: sound ? readDurationMs(sound) : -1,
      binding: this.sceneKey ? (this.sceneBinding(this.sceneKey) ?? null) : null,
    };
  }

  /** Playwright / 控制台用的只读句柄。 */
  debugApi(): BgmDebugApi {
    return {
      snapshot: () => this.debugSnapshot(),
      currentId: () => this.currentId,
      instanceId: () => this.currentInstanceId,
      isPlaying: () => this.current?.isPlaying === true,
      isPaused: () => this.current?.isPaused === true,
      positionMs: () => (this.current ? readSeekMs(this.current) : -1),
      volume: () => (this.current ? (this.volumes.get(this.current) ?? 0) : 0),
      sceneKey: () => this.sceneKey,
      binding: () => (this.sceneKey ? (this.sceneBinding(this.sceneKey) ?? null) : null),
      bindingOf: (sceneKey) => this.sceneBinding(sceneKey) ?? null,
    };
  }

  private applyBinding(binding: SceneBinding | undefined): void {
    const action = planBgmTransition(this.playbackState(), binding);
    switch (action.type) {
      case 'hold':
        return;
      case 'silence':
        this.stop();
        return;
      case 'start':
        this.start(action.id);
        return;
      case 'continue':
        this.keepCurrent();
        return;
      case 'resume':
        this.resumeCurrent();
        return;
    }
  }

  /** 同一首跨场景：实例与进度都不动，只把音量收敛到目标值。 */
  private keepCurrent(): void {
    if (!this.current) return;
    this.syncVolume(400);
  }

  /** 同一首但被暂停（例如切后台 pauseAll）：从暂停点继续，绝不 `play()` 重头再来。 */
  private resumeCurrent(): void {
    const sound = this.current;
    if (!sound) return;
    if (sound.isPaused) sound.resume();
    else if (!sound.isPlaying) sound.play();
    this.syncVolume(400);
  }

  /**
   * 起一首曲子。
   *
   * `hard` 用于「一个画面就翻脸」的戏（金殿太监裂皮）：旧曲**不做淡出**、当场掐掉，
   * 新曲 160ms 内起来——切点必须落在冲击帧上，600ms 的淡出会把惊吓抹平。
   */
  private start(id: BgmId, hard = false): void {
    const scene = this.scene;
    if (!scene) return;
    const track: BgmTrack = BGM_TRACKS[id];
    if (!scene.cache.audio.exists(track.key)) {
      // 缺资源不阻断流程：没有音乐也要能继续看剧情。
      console.warn(`[bgm] 缺少音频资源：${track.key}`);
      return;
    }

    const previous = this.current;
    if (previous) {
      if (hard) {
        this.killFade(previous);
        this.volumes.delete(previous);
        previous.stop();
        previous.destroy();
      } else {
        this.fadeOutAndDestroy(previous, track.fadeOutMs);
      }
    }

    const sound = scene.sound.add(track.key, { loop: true, volume: 0 });
    this.current = sound;
    this.currentId = id;
    this.instanceSeq += 1;
    this.currentInstanceId = this.instanceSeq;
    // 先把声音真正播起来，再显式归零：Phaser 的 Sound 在未播放时 `volume`
    // 读的是节点默认值 1，tween 若在这之前取起点，就会从满音量「淡出」到目标音量。
    sound.play();
    this.applyVolume(sound, 0);
    this.fadeTo(sound, bgmVolume(settings.muted, settings.bgm), hard ? 160 : track.fadeInMs);
    this.hookUnlock(scene);
  }

  private playbackState(): BgmPlaybackState {
    const sound = this.current;
    return {
      currentId: this.currentId,
      hasInstance: sound !== null,
      playing: sound?.isPlaying === true,
      paused: sound?.isPaused === true,
    };
  }

  private attach(scene: Phaser.Scene): void {
    if (this.scene === scene) return;
    this.scene = scene;

    // 旧场景 shutdown 会销毁挂在它上面的 tween，记账里的记录随之作废：
    // - 属于当前曲目的记录要删掉，否则「同曲续播」会误判淡入还在跑而把音量停在半路；
    // - 属于正在淡出的旧曲目的记录，直接收尾（stop + destroy），别让它卡在半音量循环。
    for (const [sound, record] of [...this.fades]) {
      if (record.scene === scene) continue;
      this.fades.delete(sound);
      if (sound === this.current) continue;
      this.volumes.delete(sound);
      sound.stop();
      sound.destroy();
    }

    if (this.current && !this.fades.has(this.current)) {
      this.fadeTo(this.current, bgmVolume(settings.muted, settings.bgm), 400);
    }
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.scene !== scene) return;
      // 旧场景停了：tween 已经没有宿主，但声音是 game 级的，继续由下一个场景接管。
      this.scene = null;
      this.sceneKey = null;
    });
  }

  private hookUnlock(scene: Phaser.Scene): void {
    const manager = scene.sound;
    if (!manager.locked || this.unlockHooked) return;
    this.unlockHooked = true;
    manager.once('unlocked', () => {
      this.unlockHooked = false;
      this.unlock();
    });
  }

  private fadeTo(sound: Phaser.Sound.BaseSound, volume: number, durationMs: number): void {
    this.killFade(sound);
    const scene = this.scene;
    if (!scene) {
      this.applyVolume(sound, volume);
      return;
    }
    const state = { volume: this.volumes.get(sound) ?? 0 };
    const tween = scene.tweens.add({
      targets: state,
      volume,
      duration: Math.max(MIN_FADE_MS, durationMs),
      ease: 'Sine.easeInOut',
      onUpdate: () => this.applyVolume(sound, state.volume),
      onComplete: () => {
        this.applyVolume(sound, volume);
        this.fades.delete(sound);
      },
    });
    this.fades.set(sound, { tween, scene });
  }

  private fadeOutAndDestroy(sound: Phaser.Sound.BaseSound, durationMs: number): void {
    this.killFade(sound);
    const destroy = (): void => {
      this.fades.delete(sound);
      this.volumes.delete(sound);
      sound.stop();
      sound.destroy();
    };
    const scene = this.scene;
    if (!scene) {
      destroy();
      return;
    }
    const state = { volume: this.volumes.get(sound) ?? 0 };
    const tween = scene.tweens.add({
      targets: state,
      volume: 0,
      duration: Math.max(MIN_FADE_MS, durationMs),
      ease: 'Sine.easeInOut',
      onUpdate: () => this.applyVolume(sound, state.volume),
      onComplete: destroy,
    });
    this.fades.set(sound, { tween, scene });
  }

  private applyVolume(sound: Phaser.Sound.BaseSound, volume: number): void {
    this.volumes.set(sound, volume);
    setSoundVolume(sound, volume);
  }

  private killFade(sound: Phaser.Sound.BaseSound): void {
    const record = this.fades.get(sound);
    if (!record) return;
    record.tween.stop();
    this.fades.delete(sound);
  }
}

/** 淡入淡出的最短时长，避免 0ms 的 tween 在切场景瞬间堆积。 */
const MIN_FADE_MS = 80;

/** BaseSound 的 `volume` 是 WebAudioSound 的访问器；类型里没暴露，运行时可用。 */
function setSoundVolume(sound: Phaser.Sound.BaseSound, volume: number): void {
  (sound as unknown as { volume: number }).volume = volume;
}

/** WebAudioSound 的 `seek`（秒）在类型里没暴露；读不到返回 -1。 */
function readSeekMs(sound: Phaser.Sound.BaseSound): number {
  const seek = (sound as unknown as { seek?: number }).seek;
  if (typeof seek !== 'number' || !Number.isFinite(seek)) return -1;
  return Math.round(seek * 1000);
}

function readDurationMs(sound: Phaser.Sound.BaseSound): number {
  const duration = (sound as unknown as { duration?: number }).duration;
  if (typeof duration !== 'number' || !Number.isFinite(duration)) return -1;
  return Math.round(duration * 1000);
}

export const bgmManager = new BgmManager();
