import Phaser from 'phaser';
import { ref } from '@phaser-mvvm/core';
import { UIScene } from '@phaser-mvvm/phaser';
import { Branch, Button, Column, Row, Text } from '@phaser-mvvm/widgets/compose';
import { SCENE_KEYS } from '../app/scene-keys';
import { enterModule } from '../app/director';
import { applyCamera } from '../app/viewport';
import { audioDirector } from '../audio/audio-director';
import { bgmManager } from '../audio/bgm-manager';
import { mountVideoSurface, type VideoSurfaceHandle } from '../ui/video-surface';

const VIDEO_KEY = 'video.ch01.opening';
const CANVAS_Z = '2';

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
 */
export class Ch01OpeningScene extends UIScene {
  private surface: VideoSurfaceHandle | null = null;
  private leaving = false;
  private tapTimer: Phaser.Time.TimerEvent | null = null;
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
    this.cameras.main.fadeIn(260, 5, 6, 10);
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

    this.surface = mountVideoSurface({
      src,
      layout: 'fill',
      zIndex: 0,
      skipLabel: null,
      onEnded: () => this.handleEnded(),
      onError: (reason) => this.handleVideoError(reason),
      onMutedChange: (muted) => {
        this.muted.value = muted;
      },
    });

    void this.surface.play().then(() => {
      if (this.leaving) return;
      this.statusText.value = '';
      this.needsTap.value = false;
    });

    // 浏览器可能连静音自动播放都拦（iOS 低电量模式）：1.6s 后还没动就让玩家点一下。
    this.tapTimer?.remove();
    this.tapTimer = this.time.delayedCall(1600, () => {
      this.tapTimer = null;
      if (this.leaving) return;
      if (!this.surface || !this.surface.element.paused) return;
      this.needsTap.value = true;
      this.statusText.value = '轻触屏幕开始播放';
    });
  }

  private handleEnded = (): void => {
    this.finish();
  };

  private handleVideoError = (reason: string): void => {
    console.warn('[ch01-opening] 视频加载失败', reason);
    this.statusText.value = '开场动画加载失败，可以直接跳过';
    this.needsTap.value = false;
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
    this.surface?.element.pause();
    this.cameras.main.fadeOut(240, 5, 6, 10);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.surface?.destroy();
      this.surface = null;
      void enterModule(this, 'ch01Dorm');
    });
  }

  private onShutdown(): void {
    this.input.off('pointerdown', this.handlePointer);
    this.input.keyboard?.off('keydown-SPACE', this.handleSkip);
    this.input.keyboard?.off('keydown-ESC', this.handleSkip);
    this.tapTimer?.remove();
    this.tapTimer = null;

    const canvas = this.game.canvas;
    canvas.style.position = '';
    canvas.style.zIndex = '';

    this.surface?.destroy();
    this.surface = null;
  }

  protected override onBack(): boolean {
    this.finish();
    return true;
  }
}
