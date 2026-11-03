import {
  collectAssets,
  expandBundleIds,
  persistentBundleIds,
} from '../assets/bundles';
import type { AssetDef, BundleId } from '../assets/types';

export interface ReleasePlan {
  /** 需要从「已加载」账本里移除的 bundle（只含非常驻、且不在 keep 闭包里的）。 */
  readonly bundles: readonly BundleId[];
  /** 需要从 Phaser cache 删除的资源定义（已按 key 去重）。 */
  readonly assets: readonly AssetDef[];
}

/**
 * 计算场景切换后的回收计划（纯函数，不碰 Phaser）。
 *
 * 规则：
 * - `keep` 按依赖闭包展开：require `battle.ch01` 等于同时保留 `battle.common`、`ch.01`；
 * - 常驻 bundle（`core` / `ui`）无论 keep 里写没写都保留；
 * - `pinned`（过场期间预取的目标 bundle）在真正被门禁消费前也不回收——
 *   否则「开场 CG 里预取寝室资源」会被开场场景自己的 releaseExcept 立刻清掉；
 * - 两个 bundle 共享同一个资源 key 时，只要还有一个 bundle 保留，该 key 就不删。
 */
export function planRelease(
  loaded: Iterable<BundleId>,
  keep: readonly BundleId[],
  pinned: Iterable<BundleId> = [],
): ReleasePlan {
  const keepClosure = new Set<BundleId>(
    expandBundleIds([...keep, ...persistentBundleIds()]),
  );
  const pinnedSet = new Set(pinned);
  const releaseIds = [...new Set(loaded)].filter(
    (id) => !keepClosure.has(id) && !pinnedSet.has(id),
  );
  if (releaseIds.length === 0) return { bundles: [], assets: [] };

  // pinned 的 key 与 keep 一样不能被删：删除是按键去的，共享 key 的必须一起保住。
  const keepKeys = new Set(
    collectAssets([...keepClosure, ...pinnedSet]).map((asset) => asset.key),
  );
  const assets = collectAssets(releaseIds).filter((asset) => !keepKeys.has(asset.key));

  return { bundles: releaseIds, assets };
}
