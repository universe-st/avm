/**
 * 「CG 结束 → 进入下一个场景」的收尾时间线（纯逻辑，不 import Phaser / DOM）。
 *
 * ## 为什么单独抽出来
 *
 * 之前开场动画把「马赛克淡出」绑在 `enterModule()` 的 promise 上：
 *
 * ```ts
 * await enterModule(...)          // 冷启动要真下载 14.5 MB
 * setTimeout(() => fade(), 140)   // 等到了才淡
 * ```
 *
 * 结果就是资源越慢，马赛克定格越久——而马赛克是 `z-index:9` 的全屏层，
 * 正好把加载页和寝室首帧全盖住，玩家只看到一块不会动的像素画。
 *
 * ## 现在的时间线
 *
 * ```text
 * t=0                    马赛克出现（全屏定格开始）
 * t=holdMs               预取没完成 → 先亮加载页（保证有进度可看）
 *                        马赛克开始溶解（opacity transition，交给合成器）
 * t=holdMs + 一帧        场景切换起跑（见 afterPaint）
 * t=holdMs + fadeMs      马赛克完全透明
 * t=holdMs + fadeMs + cleanup  移除元素
 * ```
 *
 * 两条关键约束：
 *
 * 1. **过渡层只由定时器驱动**。`enter()` 慢也好、直接 reject 也好，时间线照走，
 *    不会出现「只有马赛克、永远不动」的死等。
 * 2. **先淡出、隔一帧再起跑场景切换**（`afterPaint`）。寝室首帧 `create()` 实测要
 *    160~200ms，主线程一堵，CSS transition 还没提交就会被一起推迟；
 *    先让浏览器提交一帧，溶解就交给合成器，定格时间从此只由 `holdMs` 决定。
 */

/**
 * CG 是「怎么走的」：`ended` = 自然播完，`skip` = 玩家主动跳过（按钮 / SPACE / ESC / 返回键）
 * 以及所有兜底退出（素材缺失、视频加载失败、卡住不动、被暂停且续播不回来）。
 */
export type CgExitReason = 'ended' | 'skip';

/** 一次退出的转场编排（纯数据，供 `ui/pixel-transition` 画、供场景排时间线）。 */
export interface CgExitPlan {
  /** 是否走「末帧像素化定格 → 溶解」这套画风转场。 */
  readonly mosaic: boolean;
  /** 定格时长（ms）：过渡层完全不动的那一段。 */
  readonly holdMs: number;
  /** 溶解时长（ms）：过渡层从全不透明到透明的 CSS transition。 */
  readonly fadeMs: number;
}

/**
 * 补一条 2026-11-06 的反馈：**点「跳过」时会先闪一下马赛克**。
 *
 * 原因是 `finish()` 把「播完」和「跳过」当成同一件事：跳过时抓的是随机一帧，
 * 于是「突然变像素块 → 定住 120ms → 再溶 320ms」全砸在玩家脸上——想快点走的人
 * 反而被一段 440ms 的画风转场绊住。
 *
 * 现在按意图分开：
 * - **播完**：末帧像素化定格 120ms + 溶解 320ms（原样保留，这是有意设计的「视频 → 像素游戏」衔接）；
 * - **跳过**：不做像素化，抓一整帧原样盖住（抓不到就纯黑 `#05060a`），**立刻**开始 ≤160ms 的淡出。
 *   定格 0ms + 淡出 120ms ⇒ 玩家点完「跳过」到寝室首帧之间，我们只额外加 ≤ 一帧 + 120ms。
 *
 * 纯函数：不 import Phaser / DOM，单测直接断言四种组合。
 */
export function planCgExit(input: {
  readonly reason: CgExitReason;
  /** 视频当前帧能否抓取（`readyState >= HAVE_CURRENT_DATA` 且 `videoWidth > 0`）。 */
  readonly frameReady: boolean;
}): CgExitPlan {
  // 只有「自然播完 + 抓得到末帧」才配得上像素转场：跳过没有末帧可言，抓到的只是随机画面。
  if (input.reason === 'ended' && input.frameReady) {
    return { mosaic: true, holdMs: CG_HANDOFF_HOLD_MS, fadeMs: CG_HANDOFF_FADE_MS };
  }
  return { mosaic: false, holdMs: 0, fadeMs: CG_SKIP_FADE_MS };
}

export interface CgHandoffDeps {
  /** 场景切换：淡出提交之后才调用。失败只回调 `onError`，不打断收尾时间线。 */
  readonly enter: () => Promise<void>;
  /** 等浏览器提交一帧（过渡层的 opacity 已进合成器）再跑 `fn`。 */
  readonly afterPaint: (fn: () => void) => void;
  /** 目标资源是否已就绪（决定要不要在马赛克底下亮起加载页）。 */
  readonly isReady: () => boolean;
  /** 亮起加载页（把进行中的静默预取批次改成可见）。 */
  readonly reveal: () => void;
  /** 开始溶解过渡层（CSS transition 由实现方负责）。 */
  readonly fadeOut: () => void;
  /** 彻底移除过渡层。 */
  readonly remove: () => void;
  readonly schedule: (fn: () => void, ms: number) => void;
  readonly onError?: (error: unknown) => void;
  /** 全屏定格时长；默认 120ms（硬指标：只有马赛克的区间 < 250ms）。 */
  readonly holdMs?: number;
  /** 溶解时长；默认 320ms。 */
  readonly fadeMs?: number;
}

/** 定格时长：够玩家认出「视频被像素化」，又不至于像卡住。 */
export const CG_HANDOFF_HOLD_MS = 120;
/** 溶解时长：240ms 太硬，450ms 太拖；320ms 和视频本身的镜头切换同量级。 */
export const CG_HANDOFF_FADE_MS = 320;
/**
 * 跳过时的淡出时长：120ms。硬指标 ≤160ms——跳过要像一次剪切，
 * 慢过 160ms 就会被感知成「卡了一下」；再快（<100ms）又显得画面在抽搐。
 */
export const CG_SKIP_FADE_MS = 120;
/** CSS transition 结束后再等一小段，避免元素在过渡中途被删掉。 */
export const CG_HANDOFF_CLEANUP_MS = 120;

/**
 * 起跑收尾时间线。返回的 promise 在过渡层被移除（整段时间线走完）时 resolve，
 * 永不 reject（进入失败只走 `onError`）。调用方一般不用 await 它。
 */
export function runCgHandoff(deps: CgHandoffDeps): Promise<void> {
  const holdMs = Math.max(0, deps.holdMs ?? CG_HANDOFF_HOLD_MS);
  const fadeMs = Math.max(0, deps.fadeMs ?? CG_HANDOFF_FADE_MS);

  let settled = false;
  let settle!: () => void;
  const done = new Promise<void>((resolve) => {
    settle = resolve;
  });
  const finish = (): void => {
    if (settled) return;
    settled = true;
    deps.remove();
    settle();
  };

  let started = false;

  deps.schedule(() => {
    // 还没就绪：先在过渡层底下把加载页亮起来，否则淡掉以后就是一块黑屏。
    if (!deps.isReady()) deps.reveal();
    deps.fadeOut();
    deps.afterPaint(() => {
      if (started) return;
      started = true;
      void (async (): Promise<void> => {
        try {
          await deps.enter();
        } catch (error) {
          deps.onError?.(error);
        }
      })();
    });
    deps.schedule(finish, fadeMs + CG_HANDOFF_CLEANUP_MS);
  }, holdMs);

  return done;
}
