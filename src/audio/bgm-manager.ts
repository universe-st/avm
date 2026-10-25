import Phaser from 'phaser';
import { settings } from '../app/settings';
import {
  BGM_TRACKS,
  bgmForScene,
  bgmVolume,
  type BgmId,
  type BgmTrack,
} from './bgm-tracks';

/**
 * BGM 管理器。
 *
 * 每个内容场景在 `create()` 里调用一次 `bgmManager.enterScene(this)`：
 *
 * - 场景表里登记了曲子：切过去，旧曲淡出、新曲淡入（交叉淡化）；
 * - 登记 `null`：淡出到静音；
 * - 没登记（CG 预览、战斗沙盒）：保持当前曲目，不打断。
 *
 * 跨场景的淡出必须由**新场景**的 tween 驱动：旧场景 shutdown 会连带销毁它的 tween，
 * 在旧场景里起淡化会让旧曲永远停在半音量。
 */
export class BgmManager {
  private scene: Phaser.Scene | null = null;
  private currentId: BgmId | null = null;
  private current: Phaser.Sound.BaseSound | null = null;
  private readonly fades = new Map<Phaser.Sound.BaseSound, Phaser.Tweens.Tween>();
  /**
   * 每条声音当前音量的记账值。
   *
   * 不读 `sound.volume`：WebAudio 的 gain 在读之前要等一个渲染量子，刚 add/play 时读到的
   * 是节点默认的 1，淡入会从满音量「淡出」到目标音量；所有写入都经过 `applyVolume`，
   * 读的时候只信任这本账。
   */
  private readonly volumes = new Map<Phaser.Sound.BaseSound, number>();
  private unlockHooked = false;

  /** 当前曲目 id（调试用；没在播时为 null）。 */
  get currentBgmId(): BgmId | null {
    return this.currentId;
  }

  /** 当前曲目实例（测试/调试用）。 */
  get currentSound(): Phaser.Sound.BaseSound | null {
    return this.current;
  }

  /** 场景入口：绑定宿主场景，并按场景表切换曲子。 */
  enterScene(scene: Phaser.Scene): void {
    this.attach(scene);
    const cue = bgmForScene(scene.scene.key);
    if (cue === undefined) return;
    if (cue === null) {
      this.stop();
      return;
    }
    this.play(cue);
  }

  /** 切到某一首；同一首正在播时是空操作。 */
  play(id: BgmId): void {
    const scene = this.scene;
    if (!scene) return;
    const track: BgmTrack = BGM_TRACKS[id];
    if (!scene.cache.audio.exists(track.key)) {
      // 缺资源不阻断流程：没有音乐也要能继续看剧情。
      console.warn(`[bgm] 缺少音频资源：${track.key}`);
      return;
    }
    if (this.currentId === id && this.current?.isPlaying === true) return;

    const previous = this.current;
    if (previous) this.fadeOutAndDestroy(previous, track.fadeOutMs);

    const sound = scene.sound.add(track.key, { loop: true, volume: 0 });
    this.current = sound;
    this.currentId = id;
    // 先把声音真正播起来，再显式归零：Phaser 的 Sound 在未播放时 `volume`
    // 读的是节点默认值 1，tween 若在这之前取起点，就会从满音量「淡出」到目标音量。
    sound.play();
    this.applyVolume(sound, 0);
    this.fadeTo(sound, bgmVolume(settings.muted, settings.bgm), track.fadeInMs);
    this.hookUnlock(scene);
  }

  /** 淡出并释放当前曲目。 */
  stop(fadeMs?: number): void {
    const previous = this.current;
    const id = this.currentId;
    this.current = null;
    this.currentId = null;
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
    if (!sound.isPlaying) sound.play();
    this.syncVolume(600);
  }

  /** 场景无关地释放所有声音（目前只给测试/热重载用）。 */
  dispose(): void {
    const sounds = new Set<Phaser.Sound.BaseSound>(this.fades.keys());
    if (this.current) sounds.add(this.current);
    for (const sound of sounds) {
      this.fades.get(sound)?.stop();
      sound.stop();
      sound.destroy();
    }
    this.fades.clear();
    this.volumes.clear();
    this.current = null;
    this.currentId = null;
    this.scene = null;
  }

  private attach(scene: Phaser.Scene): void {
    if (this.scene === scene) return;
    this.scene = scene;
    // 上一支曲子的淡化 tween 可能随旧场景一起被销毁，音量会停在半路；新场景接管时补一次。
    if (this.current && !this.fades.has(this.current)) this.syncVolume(400);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      // 旧场景停了：tween 已经没有宿主，但声音是 game 级的，继续由下一个场景接管。
      if (this.scene === scene) this.scene = null;
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
    this.fades.set(sound, tween);
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
    this.fades.set(sound, tween);
  }

  private applyVolume(sound: Phaser.Sound.BaseSound, volume: number): void {
    this.volumes.set(sound, volume);
    setSoundVolume(sound, volume);
  }

  private killFade(sound: Phaser.Sound.BaseSound): void {
    const tween = this.fades.get(sound);
    if (!tween) return;
    tween.stop();
    this.fades.delete(sound);
  }
}

/** 淡入淡出的最短时长，避免 0ms 的 tween 在切场景瞬间堆积。 */
const MIN_FADE_MS = 80;

/** BaseSound 的 `volume` 是 WebAudioSound 的访问器；类型里没暴露，运行时可用。 */
function setSoundVolume(sound: Phaser.Sound.BaseSound, volume: number): void {
  (sound as unknown as { volume: number }).volume = volume;
}

export const bgmManager = new BgmManager();
