import Phaser from 'phaser';
import { settings } from '../app/settings';
import { TYPE_BLIP_KEYS } from '../assets/keys';
import { LoopRegistry } from './loop-registry';
import { TYPE_VOICE_GAIN, type TypeVoice } from './type-voice';

type Sound = Phaser.Sound.BaseSound;

/** `playLoop()` 返回的循环音句柄：保留底层 Sound，同时提供按 key 停止的能力。 */
export interface LoopHandle {
  readonly key: string;
  readonly sound: Sound;
  /** 停止并销毁（幂等；与 `stopLoop(key)` 等价）。 */
  stop(): void;
}

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
  /** 普通配角的两条 blip 轮换游标。 */
  private genericCursor = 0;
  /**
   * 正在循环的音效（环境音、心跳、郑卿的呼噜）：切场景/重开要全部停掉。
   * 登记表是纯逻辑，`attach()` 会在场景 SHUTDOWN 时自动兜底收尾。
   */
  private readonly loops = new LoopRegistry<Sound>();

  attach(scene: Phaser.Scene): void {
    // 上一个场景的逐字音池已经没用了；Phaser 的 Sound 是 game 级的，不主动销毁会一直留着。
    this.releaseBlips();
    this.scene = scene;
    this.hookLifecycle(scene);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      // 只有「当前宿主场景」退出时才收尾，避免旧场景的 shutdown 误杀新场景刚起的循环音。
      if (this.scene !== scene) return;
      this.releaseBlips();
      // 兜底：场景退出/restart 一律停掉循环音，别再依赖每个场景记得手写 stop。
      this.stopAllLoops();
    });
  }

  /** 当前登记的循环音 key（调试/验收用：标题页应当为空）。 */
  get activeLoopKeys(): string[] {
    return this.loops.keys();
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
   * 打字机每冒出一个字调用一次；按 `voice` 选声线（旁白/周全/郑卿/小白），
   * 配角在两条普通 blip 之间轮换。复用 Sound 实例（逐字频率约 18/s，
   * 每次 add + destroy 会明显增加 GC 与音频节点开销）。
   */
  playTypeBlip(voice: TypeVoice = 'narrator'): void {
    const scene = this.scene;
    if (!scene || settings.muted) return;
    // 还没被用户手势解锁时播也听不到，只会刷 AudioContext autoplay 警告。
    if (scene.sound.locked) return;

    let key: string;
    if (voice === 'generic') {
      key = this.genericCursor === 0 ? TYPE_BLIP_KEYS.genericA : TYPE_BLIP_KEYS.genericB;
      this.genericCursor = 1 - this.genericCursor;
    } else {
      key = TYPE_BLIP_KEYS[voice];
    }
    if (!key || !scene.cache.audio.exists(key)) return;

    let sound = this.blips.get(key);
    if (!sound) {
      sound = scene.sound.add(key, { volume: 0 });
      this.blips.set(key, sound);
    }
    // BaseSound 的 volume 是 WebAudioSound 的访问器；类型里没暴露，运行时可用。
    (sound as unknown as { volume: number }).volume = Math.min(
      1,
      Math.max(0, settings.sfx * TYPE_VOICE_GAIN[voice]),
    );
    sound.play();
  }

  /**
   * 带音量/循环/搓音调的一次性音效。
   *
   * `volume` 是相对量（再乘 `settings.sfx`）；`loop` 的音效会被登记进循环表，切场景时由
   * `stopLoop()`/`stopAllLoops()`（以及 `attach()` 的 SHUTDOWN 兜底）统一收掉，
   * 避免大殿环境音跟着进战斗。
   */
  playSfxAt(
    key: string,
    options: { volume?: number; loop?: boolean; rate?: number } = {},
  ): Phaser.Sound.BaseSound | null {
    const owner = this.scene;
    const sound = this.playSound(key, options);
    if (!sound) return null;
    if (options.loop === true) {
      this.trackLoop(owner, key, sound);
    } else {
      sound.once('complete', () => sound.destroy());
    }
    return sound;
  }

  /**
   * 起一条循环音并返回句柄；与 `playSfxAt(key, { loop: true })` 等价，只是把
   * 「我记得自己停」变成「我拿着句柄，登记表和场景 shutdown 兜底」。
   *
   * 场景自持的循环音（例如寝室的呼噜）必须走这里，否则 `scene.shutdown` 之后
   * Phaser 的 game 级 SoundManager 还会继续播它。
   */
  playLoop(
    key: string,
    options: { volume?: number; rate?: number } = {},
  ): LoopHandle | null {
    const owner = this.scene;
    const sound = this.playSound(key, { ...options, loop: true });
    if (!sound) return null;
    this.trackLoop(owner, key, sound);
    return {
      key,
      sound,
      // 只停「自己这一条」：同名 key 后来又被起了一条时，旧句柄不能把新实例误杀。
      stop: () => {
        if (this.loops.get(key) === sound) this.stopLoop(key);
      },
    };
  }

  /** 停掉一个循环音效（幂等：没登记/已经停过都安全）。 */
  stopLoop(key: string): void {
    this.loops.stop(key);
  }

  /** 场景关闭时统一收尾：所有循环音效都必须停，否则会跟着进下一个场景。 */
  stopAllLoops(): void {
    this.loops.stopAll();
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

  /** 建一个 Sound 并播起来；缺资源/静默挂起时返回 null。 */
  private playSound(
    key: string,
    options: { volume?: number; loop?: boolean; rate?: number } = {},
  ): Sound | null {
    const scene = this.scene;
    if (!scene || !scene.cache.audio.exists(key)) return null;
    this.unlock();
    if (this.suspended) return null;
    const sound = scene.sound.add(key, {
      volume: settings.muted ? 0 : Math.max(0, Math.min(1, settings.sfx * (options.volume ?? 1))),
      loop: options.loop === true,
      rate: options.rate ?? 1,
    });
    sound.play();
    return sound;
  }

  /** 把循环音登记进表；同名 key 重复登记会先释放旧实例，不会泄漏。 */
  private trackLoop(owner: Phaser.Scene | null, key: string, sound: Sound): void {
    this.loops.register(key, sound, (previous) => {
      if (owner) {
        try {
          // 呼噜这类循环音还有一个「淡入音量」的 tween 指着这个 Sound；
          // 不 kill 的话，声音销毁后 tween 还会继续写 volume。
          owner.tweens.killTweensOf(previous);
        } catch {
          // 场景 shutdown 时 TweenManager 可能已经收尾；不能因此漏掉 stop。
        }
      }
      previous.stop();
      previous.destroy();
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
