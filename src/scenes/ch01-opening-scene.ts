import Phaser from 'phaser';
import { ref } from '@phaser-mvvm/core';
import { UIScene } from '@phaser-mvvm/phaser';
import { Branch, Button, Column, Row, Text } from '@phaser-mvvm/widgets/compose';
import { SCENE_KEYS } from '../app/scene-keys';
import { enterModule } from '../app/director';
import { applyCamera } from '../app/viewport';
import { audioDirector } from '../audio/audio-director';
import { bgmManager } from '../audio/bgm-manager';

const VIDEO_KEY = 'video.ch01.opening';
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
 * 现在改成**让浏览器自己合成 `<video>`**：元素铺满视口、`object-fit: contain`，
 * 画面直接由合成器硬解输出；Phaser 的 canvas 设成透明、盖在它上面，只画 UI
 * （状态文案 / 跳过 / 开启声音）。视频帧**不再经过 canvas**，纹理上传成本归零。
 *
 * 代价是 canvas 必须全局透明（`main.ts` 的 `transparent: true`），所以各内容场景都要自己铺
 * 不透明背景色；本场景反过来显式设成 `rgba(0,0,0,0)`，把底下的视频露出来。
 *
 * 另：`<video>` 必须真的在 DOM 里——Safari / iOS 对未挂载的 `<video>` 不解码，
 * 表现是「有进度、没画面」。这里直接挂到 body，并插在 canvas 之前（DOM 顺序 = 层叠顺序）。
 */
export class Ch01OpeningScene extends UIScene {
  private videoEl: HTMLVideoElement | null = null;
  private started = false;
  private leaving = false;
  private fallbackTimer: Phaser.Time.TimerEvent | null = null;
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
    /**
     * Phaser 4 的 video 缓存只存 `{ url, noAudio, crossOrigin }`（**不是** `<video>` 元素，
     * 元素由 Video GameObject 自己创建）。这里要做的是绕过 GameObject、自己建元素直显，
     * 所以只从缓存里取 URL。
     */
    const entry = this.cache.video.get(VIDEO_KEY) as { url?: string } | undefined;
    const src = entry?.url;
    if (!src) {
      console.warn('[ch01-opening] 视频缓存里没有可用地址，直接进入第一章');
      this.finish();
      return;
    }

    const element = document.createElement('video');
    element.src = src;
    element.playsInline = true;
    element.setAttribute('playsinline', '');
    element.setAttribute('webkit-playsinline', '');
    element.removeAttribute('controls');
    element.preload = 'auto';
    element.loop = false;
    // contain：720×1280 的片子放进视口，宁可上下留黑边，也不裁掉靠边的床和窗。
    // 背景色只在 letterbox 区域可见，顺带盖住 body 的渐变。
    element.style.cssText =
      'position:fixed;left:0;top:0;width:100%;height:100%;object-fit:contain;' +
      'background:#05060a;pointer-events:none;z-index:0;';

    /**
     * 层叠：`<video>` 是 `position: fixed`（定位元素），canvas 是普通文档流 ——
     * **定位元素永远画在非定位元素上面**，跟 DOM 顺序无关。只把 video 插在 canvas 前面是不够的，
     * 结果就是「视频能看，但跳过按钮/状态文案全被盖住」。所以这里显式给 canvas 抬一层。
     */
    const canvas = this.game.canvas;
    canvas.style.position = 'relative';
    canvas.style.zIndex = '1';
    if (canvas.parentNode) canvas.parentNode.insertBefore(element, canvas);
    else document.body.appendChild(element);
    this.videoEl = element;

    element.addEventListener('ended', this.handleEnded);
    element.addEventListener('error', this.handleVideoError);
    element.addEventListener('loadeddata', this.handleReady);
    element.addEventListener('canplay', this.handleReady);

    this.tryPlay();
    // 浏览器可能拦掉带声音的自动播放：400ms 后还没动就静音起播，并给一个开声音的按钮。
    this.fallbackTimer = this.time.delayedCall(400, () => {
      if (this.videoEl !== element || this.started) return;
      element.muted = true;
      this.muted.value = true;
      this.tryPlay();
    });
  }

  private handleReady = (): void => {
    if (!this.leaving) this.statusText.value = '';
  };

  private tryPlay(): void {
    const element = this.videoEl;
    if (!element) return;
    const played = element.play();
    played
      ?.then(() => {
        this.started = true;
        this.needsTap.value = false;
      })
      .catch(() => {
        if (this.videoEl !== element) return;
        // 带声音被拦：交给 400ms 的静音重试，再不行就让玩家点一下。
        this.needsTap.value = true;
      });
    this.tapTimer?.remove();
    this.tapTimer = this.time.delayedCall(1600, () => {
      this.tapTimer = null;
      if (this.videoEl !== element || !element.paused) return;
      this.needsTap.value = true;
      this.statusText.value = '轻触屏幕开始播放';
    });
  }

  private handleEnded = (): void => {
    this.finish();
  };

  private handleVideoError = (): void => {
    const element = this.videoEl;
    console.warn('[ch01-opening] 视频加载失败', element?.error?.code, element?.error?.message);
    this.statusText.value = '开场动画加载失败，可以直接跳过';
    this.needsTap.value = false;
  };

  private handlePointer = (): void => {
    if (!this.needsTap.value || !this.videoEl) return;
    this.videoEl.muted = false;
    this.muted.value = false;
    this.needsTap.value = false;
    this.statusText.value = '';
    this.tryPlay();
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
                const element = this.videoEl;
                if (!element) return;
                audioDirector.playClick();
                element.muted = false;
                this.muted.value = false;
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
    this.fallbackTimer?.remove();
    this.fallbackTimer = null;
    this.tapTimer?.remove();
    this.tapTimer = null;
    this.videoEl?.pause();
    this.cameras.main.fadeOut(240, 5, 6, 10);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      void enterModule(this, 'ch01Dorm');
    });
  }

  private onShutdown(): void {
    this.input.off('pointerdown', this.handlePointer);
    this.input.keyboard?.off('keydown-SPACE', this.handleSkip);
    this.input.keyboard?.off('keydown-ESC', this.handleSkip);
    this.fallbackTimer?.remove();
    this.fallbackTimer = null;
    this.tapTimer?.remove();
    this.tapTimer = null;

    const canvas = this.game.canvas;
    canvas.style.position = '';
    canvas.style.zIndex = '';

    const element = this.videoEl;
    this.videoEl = null;
    if (element) {
      element.removeEventListener('ended', this.handleEnded);
      element.removeEventListener('error', this.handleVideoError);
      element.removeEventListener('loadeddata', this.handleReady);
      element.removeEventListener('canplay', this.handleReady);
      element.pause();
      element.remove();
    }
  }

  protected override onBack(): boolean {
    this.finish();
    return true;
  }
}
