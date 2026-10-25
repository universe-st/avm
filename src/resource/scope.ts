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
 * - 两个 bundle 共享同一个资源 key 时，只要还有一个 bundle 保留，该 key 就不删。
 */
export function planRelease(
  loaded: Iterable<BundleId>,
  keep: readonly BundleId[],
): ReleasePlan {
  const keepClosure = new Set<BundleId>(
    expandBundleIds([...keep, ...persistentBundleIds()]),
  );
  const releaseIds = [...new Set(loaded)].filter((id) => !keepClosure.has(id));
  if (releaseIds.length === 0) return { bundles: [], assets: [] };

  const keepKeys = new Set(collectAssets([...keepClosure]).map((asset) => asset.key));
  const assets = collectAssets(releaseIds).filter((asset) => !keepKeys.has(asset.key));

  return { bundles: releaseIds, assets };
}
