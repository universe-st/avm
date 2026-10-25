import Phaser from 'phaser';
import { settings } from '../app/settings';

type Sound = Phaser.Sound.BaseSound;

/** 逐字提示音：三段音高轮流出现，避免同一频率连续敲击的机械感。 */
const TYPE_BLIP_KEYS = ['audio.sfx.type1', 'audio.sfx.type2', 'audio.sfx.type3'] as const;

/**
 * 音效总线（BGM 在 `bgm-manager.ts`）。
 *
 * 负责 SFX、逐字提示音、WebAudio 首触解锁与后台暂停；音乐音量/曲目由 BgmManager 管。
 * Phaser 的 SoundManager 是 game 级的，这里只是对它的一层薄封装。
 */
export class AudioDirector {
  private scene: Phaser.Scene | null = null;
  private suspended = false;
  private visibilityHooked = false;
  /** 逐字提示音按 key 复用 Sound，避免每个字都 new 一个音频对象。 */
  private blips = new Map<string, Sound>();
  private blipCursor = 0;

  attach(scene: Phaser.Scene): void {
    // 上一个场景的逐字音池已经没用了；Phaser 的 Sound 是 game 级的，不主动销毁会一直留着。
    this.releaseBlips();
    this.scene = scene;
    this.hookLifecycle(scene);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.scene === scene) this.releaseBlips();
    });
  }

  /** 用户第一次点击/触摸时调用：解锁 WebAudio（BGM 会自己监听 unlocked 事件补播）。 */
  unlock(): void {
    const manager = this.scene?.sound;
    if (!manager) return;
    (manager as unknown as { unlock?: () => void }).unlock?.();
  }

  /** 所有按钮的默认点击音。 */
  playClick(): void {
    this.unlock();
    this.playSfx('audio.sfx.click');
  }

  /**
   * 逐字提示音。
   *
   * 打字机每冒出一个字调用一次；三段音高轮流，复用 Sound 实例（逐字频率约 18/s，
   * 每次 add + destroy 会明显增加 GC 与音频节点开销）。
   */
  playTypeBlip(): void {
    const scene = this.scene;
    if (!scene || settings.muted) return;
    // 还没被用户手势解锁时播也听不到，只会刷 AudioContext autoplay 警告。
    if (scene.sound.locked) return;
    this.blipCursor = (this.blipCursor + 1) % TYPE_BLIP_KEYS.length;
    const key = TYPE_BLIP_KEYS[this.blipCursor];
    if (!key || !scene.cache.audio.exists(key)) return;

    let sound = this.blips.get(key);
    if (!sound) {
      sound = scene.sound.add(key, { volume: 0 });
      this.blips.set(key, sound);
    }
    // BaseSound 的 volume 是 WebAudioSound 的访问器；类型里没暴露，运行时可用。
    (sound as unknown as { volume: number }).volume = Math.min(1, Math.max(0, settings.sfx * 0.9));
    sound.play();
  }

  playSfx(key: string): void {
    const scene = this.scene;
    if (!scene || !scene.cache.audio.exists(key)) return;
    const sound = scene.sound.add(key, {
      volume: settings.muted ? 0 : settings.sfx,
    });
    sound.play();
    sound.once('complete', () => sound.destroy());
  }

  setSfxVolume(value: number): void {
    settings.sfx = Math.min(1, Math.max(0, value));
  }

  private releaseBlips(): void {
    for (const sound of this.blips.values()) {
      sound.stop();
      sound.destroy();
    }
    this.blips.clear();
  }

  private hookLifecycle(scene: Phaser.Scene): void {
    if (this.visibilityHooked) return;
    this.visibilityHooked = true;
    const pause = (): void => {
      this.suspended = true;
      scene.sound.pauseAll();
    };
    const resume = (): void => {
      if (!this.suspended) return;
      this.suspended = false;
      scene.sound.resumeAll();
    };
    const onVisibility = (): void => {
      if (document.hidden) pause();
      else resume();
    };
    document.addEventListener('visibilitychange', onVisibility);
    // Cordova 在 WebView 进入后台时派发 pause/resume。
    document.addEventListener('pause', pause);
    document.addEventListener('resume', resume);
  }

}

export const audioDirector = new AudioDirector();
