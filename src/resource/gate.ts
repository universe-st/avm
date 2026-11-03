import type { LoadOptions, LoadState } from '../assets/types';

/**
 * 加载页可见性策略（纯函数，供 `LoaderScene` 与单测共用）。
 *
 * `LoadShow` 的三档语义见 `assets/types.ts`：
 * - `always`：场景门禁，立刻亮页（现有内容场景全部走这一档）；
 * - `auto`：等待 120ms 再亮，短批次不闪；
 * - `never`：**静默**。过场视频播放期间的预取走这一档，绝不能把加载页弹到 CG 上。
 *
 * 静默批次失败时同样不弹页：错误页会把「预取失败」误报成「场景进不去」，
 * 而且它盖在 CG 上；真正进不去会在随后的门禁重试里报出来。
 */
export type LoaderVisibility = 'instant' | 'delayed' | 'hidden';

export function loaderVisibility(state: LoadState): LoaderVisibility {
  if (state.show === 'never') return 'hidden';
  if (state.show === 'always') return 'instant';
  return 'delayed';
}

/**
 * 把**正在进行中**的批次提升为「立刻亮页」，返回新状态；不在 loading 时返回 null。
 *
 * 场景：开场 CG 期间静默预取寝室资源，视频播完时预取还没结束——这时必须让玩家
 * 看到进度条，而不是只剩一块马赛克。批次还没开始或已经结束就不用管了，
 * 随后的场景门禁自己会亮页。
 */
export function revealState(state: LoadState, label?: string): LoadState | null {
  if (state.phase !== 'loading') return null;
  return label === undefined ? { ...state, show: 'always' } : { ...state, show: 'always', label };
}

/**
 * 预取用的加载参数：只声明「静默」，不碰 holdMs。
 *
 * 场景门禁的 520ms 最短可见时长是 `loadSceneResources()` 自己传的，
 * 预取不传，就不会顺手改掉任何既有场景的加载页观感。
 */
export const PREFETCH_LOAD_OPTIONS: LoadOptions = { show: 'never' };
