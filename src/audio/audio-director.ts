import Phaser from 'phaser';
import { settings } from '../app/settings';

type Sound = Phaser.Sound.BaseSound;

interface PlayBgmOptions {
  readonly fadeIn?: number;
  readonly loop?: boolean;
}

/**
 * 音频总线：BGM 跨场景不重启、音量持久化、首触解锁、后台暂停。
 *
 * Phaser 的 SoundManager 是 game 级的，这里只是对它的一层薄封装 + 当前曲目状态。
 */
export class AudioDirector {
  private scene: Phaser.Scene | null = null;
  private currentKey: string | null = null;
  private current: Sound | null = null;
  private fade: Phaser.Tweens.Tween | null = null;
  private unlockHooked = false;
  private suspended = false;
  private visibilityHooked = false;

  attach(scene: Phaser.Scene): void {
    this.scene = scene;
    this.hookLifecycle(scene);
  }

  /** 浏览器策略允许时直接播；被拦截就等第一次用户手势。 */
  playTitleBgm(key: string): void {
    this.playBgm(key, { fadeIn: 1200 });
    const manager = this.scene?.sound;
    if (!manager) return;
    const locked = (manager as unknown as { locked?: boolean }).locked === true;
    if (locked && !this.unlockHooked) {
      this.unlockHooked = true;
      manager.once('unlocked', () => {
        this.unlockHooked = false;
        this.playBgm(key, { fadeIn: 900 });
      });
    }
  }

  /** 用户第一次点击/触摸时调用：解锁 WebAudio，并补播当前 BGM。 */
  unlock(): void {
    const manager = this.scene?.sound;
    if (!manager) return;
    (manager as unknown as { unlock?: () => void }).unlock?.();
    if (this.currentKey && !this.current?.isPlaying) {
      this.playBgm(this.currentKey, { fadeIn: 600 });
    }
  }

  playBgm(key: string, options: PlayBgmOptions = {}): void {
    const scene = this.scene;
    if (!scene || !scene.cache.audio.exists(key)) return;
    if (this.currentKey === key && this.current?.isPlaying) return;

    this.stopBgm(260);
    const sound = scene.sound.add(key, {
      loop: options.loop ?? true,
      volume: 0,
    });
    sound.play();
    this.current = sound;
    this.currentKey = key;
    this.fadeTo(this.bgmTarget(), options.fadeIn ?? 900);
  }

  stopBgm(fadeOut = 400): void {
    const sound = this.current;
    const scene = this.scene;
    this.current = null;
    this.currentKey = null;
    if (!sound || !scene) return;
    this.fade?.stop();
    this.fade = null;
    if (fadeOut <= 0) {
      sound.stop();
      sound.destroy();
      return;
    }
    this.fade = scene.tweens.add({
      targets: sound as unknown as object,
      volume: 0,
      duration: fadeOut,
      onComplete: () => {
        sound.stop();
        sound.destroy();
      },
    });
  }

  /** 所有按钮的默认点击音。 */
  playClick(): void {
    this.unlock();
    this.playSfx('audio.sfx.click');
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

  setBgmVolume(value: number): void {
    settings.bgm = Math.min(1, Math.max(0, value));
    this.fadeTo(this.bgmTarget(), 120);
  }

  setSfxVolume(value: number): void {
    settings.sfx = Math.min(1, Math.max(0, value));
  }

  setMuted(muted: boolean): void {
    settings.muted = muted;
    this.fadeTo(this.bgmTarget(), 160);
  }

  /** 设置被外部改动后（例如设置弹窗），把当前曲目音量拉回目标值。 */
  syncVolume(): void {
    this.fadeTo(this.bgmTarget(), 120);
  }

  private bgmTarget(): number {
    return settings.muted ? 0 : settings.bgm;
  }

  private fadeTo(volume: number, duration: number): void {
    const scene = this.scene;
    const sound = this.current;
    if (!scene || !sound) return;
    this.fade?.stop();
    this.fade = scene.tweens.add({
      targets: sound as unknown as object,
      volume,
      duration,
    });
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
