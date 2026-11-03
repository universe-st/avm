import Phaser from 'phaser';
import { ref } from '@phaser-mvvm/core';
import { UIScene } from '@phaser-mvvm/phaser';
import { Branch, Button, Column, Row, Text } from '@phaser-mvvm/widgets/compose';
import { SCENE_KEYS } from '../app/scene-keys';
import { enterModule } from '../app/director';
import { runCgHandoff } from '../app/cg-handoff';
import { MODULES } from '../app/modules';
import { applyCamera } from '../app/viewport';
import { audioDirector } from '../audio/audio-director';
import { bgmManager } from '../audio/bgm-manager';
import { assetService } from '../resource/asset-service';
import { gateOverlay } from '../resource/gate-overlay';
import { startCgWhenRevealed, type CgRevealHandle } from '../app/cg-reveal';
import { mountPixelTransition, type PixelTransitionHandle } from '../ui/pixel-transition';
import { mountVideoSurface, whenFirstFrameDecoded, type VideoSurfaceHandle } from '../ui/video-surface';

const VIDEO_KEY = 'video.ch01.opening';
const CANVAS_Z = '2';
/** 视频「卡住」判定：连续这么多次（每次 1.5s）时间不走，就当它播不动了。 */
const STALL_CHECKS = 3;
/** 被系统暂停后最多尝试续播几次，还不行就直接进寝室，别把人锁在最后一帧。 */
const RESUME_ATTEMPTS = 2;

/**
 * 开场动画（EP001）：开幕剧情之后、第一章寝室之前的竖屏 CG。
 *
 * 成片来自短剧工程 `drama/剧集/EP001`：蝉与窗 → 溶进寝室 → 周全看书 → 郑卿打呼 → 放下书起身。
 * 视频自带同轨声音（蝉声、鼾声、椅子），所以这里不叠 BGM；播完或点「跳过」都进第一章。
 *
 * ## 为什么不用 `this.add.video()`
 *
 * 用 Phaser 的 Video GameObject 时，每一帧都要把 720×1280 的画面**上传成 GPU 纹理**再重绘 canvas。
 * 桌面无所谓，手机上（尤其中低端 Android WebView）就是稳定掉帧：解码器跟得上，
 * 时间全花在 `texImage2D` 和整屏重绘上。
 *
 * 现在改成**让浏览器自己合成 `<video>`**：画面直接由合成器硬解输出；Phaser 的 canvas 设成透明、
 * 盖在它上面，只画 UI（状态文案 / 跳过 / 开启声音）。视频帧**不再经过 canvas**，纹理上传成本归零。
 *
 * 视频是 9:16，而手机视口常见 9:19.5；`video-surface` 用「前景 contain + 背景同源模糊 cover」
 * 填掉上下黑边，不裁掉靠边的床和窗。
 *
 * ## 起播时机（2026-11-03 修「开头近 1 秒被加载页吞掉」）
 *
 * 门禁遮罩（`show:'always'`，520ms hold + 120ms 排队 + 200ms 淡出）在场景 `create` 时还盖着，
 * 旧实现一起跑就把前 0.84~0.96s 藏进了遮罩后面，玩家看到的是「中途切入」。
 * 现在视频只预载 + 解码首帧（`readyState >= 2`）并保持 paused；首帧就绪时请门禁立刻撤罩
 * （跳过 hold/淡出，见 `resource/gate-overlay.ts`），遮罩完全撤掉后才 `play()`
 * （纯逻辑在 `app/cg-reveal.ts`）。没有遮罩的路径保持旧行为：立刻起播。
 *
 * ## 收尾时间线（2026-11-03 修「播完马赛克定格很久」）
 *
 * 旧实现把「马赛克淡出」绑在 `enterModule()` resolve 上，而马赛克是 `z-index:9` 的全屏层，
 * 把加载页和寝室首帧全盖住了：冷启动要真下载 `ch01Dorm` 的 14.5 MB，玩家就对着像素块干等。
 * 现在：
 * 1. **播放期间预取**寝室资源（`show:'never'`，绝不把加载页弹到 CG 上）；
 * 2. **收尾只由定时器驱动**（`app/cg-handoff.ts`）：120ms 定格 → 320ms 溶解 → 移除，
 *    `enterModule` 慢也好、失败也好，都不会让过渡层无限挂住；
 * 3. 预取命中时 `enterModule` 静默切换（`skipGateWhenReady`），像素画直接溶进寝室首帧；
 *    预取没命中就在溶解前把加载页亮起来，保证任何时刻都有进度可看。
 */
export class Ch01OpeningScene extends UIScene {
  private surface: VideoSurfaceHandle | null = null;
  private leaving = false;
  private tapTimer: Phaser.Time.TimerEvent | null = null;
  /** 收尾时间线持有的马赛克层；不跟着场景 shutdown 一起销毁（它要活过场景切换）。 */
  private mosaic: PixelTransitionHandle | null = null;
  /** 视频「播不动/被暂停」看门狗：ended 事件在个别 WebView 会丢。 */
  private stallTimer: Phaser.Time.TimerEvent | null = null;
  /** 「等加载页撤罩再起播」的流程；shutdown / 跳过时取消，避免遮罩后面偷偷起播。 */
  private reveal: CgRevealHandle | null = null;
  private hasStarted = false;
  private lastVideoTime = -1;
  private stalledChecks = 0;
  private resumeAttempts = 0;
  private readonly needsTap = ref(false);
  private readonly muted = ref(false);
  private readonly statusText = ref('正在载入开场动画…');

  constructor() {
    super(SCENE_KEYS.ch01Opening);
  }

  override create(): void {
    applyCamera(this);
    // 透明：画面交给底下的 <video>，canvas 只留 UI。
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');

    const missing = !this.cache.video.exists(VIDEO_KEY);
    if (!missing) this.mountVideo();

    super.create();
    audioDirector.attach(this);
    bgmManager.enterScene(this);

    this.input.keyboard?.on('keydown-SPACE', this.handleSkip);
    this.input.keyboard?.on('keydown-ESC', this.handleSkip);
    this.input.on('pointerdown', this.handlePointer);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);

    if (missing) {
      console.warn('[ch01-opening] 缺少开场动画素材，直接进入第一章');
      this.finish();
      return;
    }
    if (!this.leaving) this.prefetchDormAssets();
    this.cameras.main.fadeIn(260, 5, 6, 10);
  }

  /**
   * 视频播放期间预取寝室资源。
   *
   * `ch01Dorm.requires` 冷启动约 14.5 MB（`ch.01` 7.0 + `ch01.char` 3.2 + 手机 CG 4.2），
   * 正好是整个 CG 的时长能覆盖的量。`show:'never'` 保证这次预取不会把加载页弹到视频上；
   * 失败也不阻塞——真正进寝室时门禁会重试，并把错误页亮出来。
   */
  private prefetchDormAssets(): void {
    const module = MODULES.ch01Dorm;
    void assetService
      .prefetch(module.requires)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[ch01-opening] 预取寝室资源失败，进入寝室时重试：${message}`);
      });
  }

  private mountVideo(): void {
    // Phaser 4 的 video 缓存只存 `{ url, noAudio, crossOrigin }`，不是 <video> 元素。
    const entry = this.cache.video.get(VIDEO_KEY) as { url?: string } | undefined;
    const src = entry?.url;
    if (!src) {
      console.warn('[ch01-opening] 视频缓存里没有可用地址，直接进入第一章');
      this.finish();
      return;
    }

    /**
     * 层叠：视频是 `position: fixed`，canvas 是普通文档流。必须显式给 canvas
     * `position: relative; z-index: 2`，让「视频 → 透明 canvas（Compose UI）」的层级确定。
     * 其他场景的 canvas 不透明，所以这段样式只在开场生效、shutdown 还原。
     */
    const canvas = this.game.canvas;
    canvas.style.position = 'relative';
    canvas.style.zIndex = CANVAS_Z;

    /**
     * `autoPlay: false`：先只预载 + 解码首帧并保持 paused。起播交给下面的
     * `startCgWhenRevealed()`——**遮罩完全撤掉那一刻**才 play，玩家看到的是第 0 秒构图。
     */
    this.surface = mountVideoSurface({
      src,
      layout: 'fill',
      zIndex: 0,
      autoPlay: false,
      skipLabel: null,
      onEnded: () => this.handleEnded(),
      onError: (reason) => this.handleVideoError(reason),
      onMutedChange: (muted) => {
        this.muted.value = muted;
      },
    });

    const video = this.surface.element;
    video.addEventListener('playing', this.handlePlaying);

    this.reveal = startCgWhenRevealed({
      isGateHidden: () => !gateOverlay.isVisible,
      whenGateHidden: () => gateOverlay.whenHidden(),
      isFirstFrameReady: () => video.readyState >= 2,
      whenFirstFrameReady: () => whenFirstFrameDecoded(video),
      // 首帧没解码之前压住门禁（慢网下就停在加载页上，不黑屏）；
      // 首帧就绪再放行，门禁立刻撤罩（不等 holdMs / 淡出），CG 才不会在遮罩后面偷播。
      holdGate: () => gateOverlay.hold(),
      releaseGate: () => gateOverlay.release(),
      play: () => this.startPlayback(),
      onWarn: (message) => console.warn(`[ch01-opening] ${message}`),
    });

    this.watchVideoProgress();
  }

  /**
   * 遮罩撤掉之后才走到这里：起播，并在 1.6s 后确认它真的动了。
   *
   * 浏览器可能连静音自动播放都拦（iOS 低电量模式），那就退化成「轻触屏幕开始播放」——
   * 和旧实现同一条降级路径，只是计时的起点从「场景创建」改成「遮罩撤掉」。
   */
  private async startPlayback(): Promise<void> {
    if (this.leaving) return;
    const surface = this.surface;
    if (!surface) return;

    this.statusText.value = '';
    this.needsTap.value = false;
    await surface.play();
    if (this.leaving) return;

    this.tapTimer?.remove();
    this.tapTimer = this.time.delayedCall(1600, () => {
      this.tapTimer = null;
      if (this.leaving) return;
      if (!this.surface || !this.surface.element.paused) return;
      this.needsTap.value = true;
      this.statusText.value = '轻触屏幕开始播放';
    });
  }

  /**
   * 兜底看门狗：`ended` 事件在个别 WebView 上会丢，视频也可能被系统/播放策略悄悄暂停。
   * 每 1.5s 看一眼：时间不走了就先尝试续播，连续几次都走不动就直接进寝室。
   */
  private watchVideoProgress(): void {
    this.stallTimer?.remove();
    this.lastVideoTime = -1;
    this.stalledChecks = 0;
    this.resumeAttempts = 0;
    this.stallTimer = this.time.addEvent({
      delay: 1500,
      loop: true,
      callback: this.checkVideoProgress,
      callbackScope: this,
    });
  }

  private checkVideoProgress = (): void => {
    if (this.leaving) return;
    const video = this.surface?.element;
    if (!video || !this.hasStarted) return;
    // 「轻触屏幕开始播放」挂着时是等玩家，不是卡住。
    if (this.needsTap.value) return;
    if (video.ended) {
      this.finish();
      return;
    }
    if (video.paused) {
      this.resumeAttempts += 1;
      if (this.resumeAttempts > RESUME_ATTEMPTS) {
        console.warn('[ch01-opening] 视频被暂停且无法续播，直接进入第一章');
        this.finish();
        return;
      }
      void this.surface?.play();
      return;
    }
    if (video.currentTime > this.lastVideoTime + 0.05) {
      this.lastVideoTime = video.currentTime;
      this.stalledChecks = 0;
      return;
    }
    this.stalledChecks += 1;
    if (this.stalledChecks < STALL_CHECKS) return;
    console.warn('[ch01-opening] 视频画面停住超过 4.5s，直接进入第一章');
    this.finish();
  };

  private handlePlaying = (): void => {
    this.hasStarted = true;
  };

  private handleEnded = (): void => {
    this.finish();
  };

  private handleVideoError = (reason: string): void => {
    /**
     * `play-rejected` 不是加载失败，只是自动播放被策略拦了：交给 `startPlayback` 的
     * 1.6s 「轻触屏幕开始播放」降级，**不能**在这里放行门禁/取消流程。
     */
    if (reason.startsWith('play-rejected')) return;
    console.warn('[ch01-opening] 视频加载失败', reason);
    this.statusText.value = '开场动画加载失败，可以直接跳过';
    this.needsTap.value = false;
    // 真失败：别把玩家锁在 hold 住的加载页上（Compose 的跳过按钮在遮罩下面点不到）。
    this.reveal?.cancel();
    this.reveal = null;
  };

  private handlePointer = (): void => {
    if (!this.needsTap.value || !this.surface) return;
    this.surface.setMuted(false);
    this.muted.value = this.surface.muted;
    this.needsTap.value = false;
    this.statusText.value = '';
    void this.surface.play();
  };

  private handleSkip = (): void => {
    audioDirector.playClick();
    this.finish();
  };

  protected content(): void {
    Column(
      {
        width: 'fill',
        height: 'fill',
        padding: 20,
        gap: 12,
        justifyContent: 'space-between',
        alignItems: 'stretch',
      },
      () => {
        Branch(
          () => (this.statusText.value !== '' ? 'status' : 'none'),
          {
            status: () => {
              Text(() => this.statusText.value, { size: 'sm', tone: 'muted' });
            },
            none: () => {
              // 首帧已出：留一个空文本占位，Branch 的每个分支都必须产出 widget。
              Text('');
            },
          },
        );

        Row({ width: 'fill', justifyContent: 'end', gap: 10, alignItems: 'end' }, () => {
          if (this.muted.value) {
            Button('开启声音', {
              variant: 'secondary',
              size: 'sm',
              onClick: () => {
                const surface = this.surface;
                if (!surface) return;
                audioDirector.playClick();
                surface.setMuted(false);
                this.muted.value = surface.muted;
                void surface.play();
              },
            });
          }
          Button('跳过', {
            variant: 'secondary',
            size: 'sm',
            onClick: () => {
              audioDirector.playClick();
              this.finish();
            },
          });
        });
      },
    );
  }

  private finish(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.tapTimer?.remove();
    this.tapTimer = null;
    this.stallTimer?.remove();
    this.stallTimer = null;
    this.reveal?.cancel();
    this.reveal = null;
    this.statusText.value = '';

    // 抓帧必须早于 pause / destroy：暂停之后的帧不一定已经画进 video 元素。
    this.mosaic = mountPixelTransition(this.surface?.element ?? null);
    this.surface?.element.pause();
    this.cameras.main.fadeOut(240, 5, 6, 10);

    if (!this.mosaic) {
      /**
       * 抓不到帧（首帧还没解码就被跳过 / 老 WebView）：直接进寝室，不为了转场多等。
       * 但预取可能还在跑——把进行中的批次亮成加载页，否则玩家会盯着黑屏干等，
       * 直到排队中的寝室门禁开跑才有反馈（慢网下能等好几秒）。
       */
      assetService.revealLoading();
      void enterModule(this, 'ch01Dorm', undefined, { skipGateWhenReady: true }).catch(
        (error: unknown) => {
          console.warn('[ch01-opening] 进入寝室失败', error);
        },
      );
      return;
    }

    void runCgHandoff({
      enter: () => enterModule(this, 'ch01Dorm', undefined, { skipGateWhenReady: true }),
      afterPaint: (fn) => this.afterPaint(fn),
      isReady: () => assetService.isReady(MODULES.ch01Dorm.requires),
      reveal: () => {
        assetService.revealLoading();
      },
      fadeOut: () => this.mosaic?.fadeOut(),
      remove: () => {
        this.mosaic?.remove();
        this.mosaic = null;
      },
      // 场景 shutdown 之后 this.time 会停，收尾必须用窗口计时器。
      schedule: (fn, ms) => {
        window.setTimeout(fn, ms);
      },
      onError: (error) => {
        console.warn('[ch01-opening] 进入寝室失败', error);
      },
    });
  }

  /**
   * 等浏览器把上一帧提交掉（马赛克的 opacity transition 已经进合成器）再起跑场景切换。
   *
   * 寝室首帧 `create()` 实测会堵主线程 160~200ms；如果同一帧里既改样式又切场景，
   * 样式还没提交就被卡住，溶解会被一起推迟。后台标签页 rAF 不跑，用定时器兜底。
   */
  private afterPaint(fn: () => void): void {
    let ran = false;
    const run = (): void => {
      if (ran) return;
      ran = true;
      fn();
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        requestAnimationFrame(run);
      });
    }
    window.setTimeout(run, 140);
  }

  private onShutdown(): void {
    this.input.off('pointerdown', this.handlePointer);
    this.input.keyboard?.off('keydown-SPACE', this.handleSkip);
    this.input.keyboard?.off('keydown-ESC', this.handleSkip);
    this.tapTimer?.remove();
    this.tapTimer = null;
    this.stallTimer?.remove();
    this.stallTimer = null;
    this.reveal?.cancel();
    this.reveal = null;

    const canvas = this.game.canvas;
    canvas.style.position = '';
    canvas.style.zIndex = '';

    this.surface?.element.removeEventListener('playing', this.handlePlaying);
    this.surface?.destroy();
    this.surface = null;

    /**
     * 正常收尾（`finish()` 已经交给 `runCgHandoff`）时**不能**在这里删马赛克：
     * 场景会在 `enterModule` resolve 的那一刻 shutdown，而马赛克还要继续溶解。
     * 只有非收尾路径（例如被外部强制停场景）才顺手清掉，避免全屏残影。
     */
    if (!this.leaving) {
      this.mosaic?.remove();
      this.mosaic = null;
    }
  }

  protected override onBack(): boolean {
    this.finish();
    return true;
  }
}
