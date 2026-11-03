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
