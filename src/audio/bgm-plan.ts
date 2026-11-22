import type { BgmId, SceneBinding } from './bgm-tracks';

/**
 * 「场景绑定 → 播放器动作」的纯逻辑（不依赖 Phaser，可在 Node 单测）。
 *
 * 管理器只负责执行动作；「要不要重建声音实例」这个最容易出错的判断集中在这里。
 *
 * 用户 2026-11-22 口径：**进入场景时，该场景的曲目必须从 0 开始、整首循环到尾**。
 * 所以 `enterScene` 传入 `restart: true`，同曲也重建实例；只有场景内的 cue/改绑
 * 同曲才 `continue`/`resume`，`hold` 场景仍显式沿用。
 */

/** 管理器某一刻的播放状态快照。 */
export interface BgmPlaybackState {
  /** 当前曲目 id（没在播时为 null）。 */
  readonly currentId: BgmId | null;
  /** 是否还持有声音实例。 */
  readonly hasInstance: boolean;
  /** 实例正在出声。 */
  readonly playing: boolean;
  /** 实例被暂停（进度仍在，可以 resume）。 */
  readonly paused: boolean;
}

export interface BgmTransitionOptions {
  /**
   * 场景入场：`track` 绑定即使与当前同曲，也 `start` 一个新实例（进度从 0）。
   *
   * 只有 `enterScene` 传 true；场景内 `play` / `bindScene` / `applySceneBinding`
   * 不传，避免对话 cue 或阶段切曲把正在播的同一首无故重播。
   */
  readonly restart?: boolean;
}

export type BgmAction =
  /** 显式沿用：不动当前曲目。 */
  | { readonly type: 'hold' }
  /** 淡出到静音。 */
  | { readonly type: 'silence' }
  /** 同一实例继续播，进度与音量都不重置。 */
  | { readonly type: 'continue' }
  /** 同一实例从暂停点继续（`resume()`），不回到 0。 */
  | { readonly type: 'resume' }
  /** 需要（重新）建实例并淡入；只有这里会从 0 开始。 */
  | { readonly type: 'start'; readonly id: BgmId };

/**
 * 决定进入一个场景/收到一个绑定时要做什么。
 *
 * 关键规则：
 * - 绑定 `hold` / 场景未登记（非内容场景）→ `hold`，不打断；
 * - 绑定 `silence` → `silence`（管理器里的 stop 是幂等的）；
 * - `restart: true`（场景入场）且绑定 `track` → **无条件 `start`**，同曲也从 0；
 * - 非入场且绑定 `track` 与当前曲目相同、实例还在 → `continue` / `resume`；
 * - 曲子不同（或同 id 但实例已经没了）→ `start`。
 */
export function planBgmTransition(
  state: BgmPlaybackState,
  binding: SceneBinding | undefined,
  options: BgmTransitionOptions = {},
): BgmAction {
  if (binding === undefined || binding.kind === 'hold') return { type: 'hold' };
  if (binding.kind === 'silence') return { type: 'silence' };

  // 场景入场：每个场景的 BGM 都从头开始（用户 2026-11-22 口径）。
  if (options.restart === true) return { type: 'start', id: binding.id };

  if (state.currentId === binding.id && state.hasInstance) {
    // 同一首（场景内 cue / 改绑）：playing → 什么都不用做；paused → resume 续播。
    // 只有「实例存在但既没播也没暂停」（已被停掉、进度已经丢了）才重新起播。
    if (state.playing) return { type: 'continue' };
    if (state.paused) return { type: 'resume' };
  }

  return { type: 'start', id: binding.id };
}
