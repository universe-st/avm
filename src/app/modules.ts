import type { BundleId, LoadShow } from '../assets/types';

export type ModuleId = 'title' | 'placeholder';

export interface GameModule {
  readonly id: ModuleId;
  /** Phaser scene key。 */
  readonly sceneKey: string;
  /** 进入前必须就绪的 bundle。 */
  readonly requires: readonly BundleId[];
  /** 进入后空闲预取（M0 只登记，不主动触发）。 */
  readonly prefetch?: readonly BundleId[];
  readonly gate: {
    readonly showProgress: LoadShow;
    readonly title: string;
  };
}

export const MODULES: Record<ModuleId, GameModule> = {
  title: {
    id: 'title',
    sceneKey: 'title',
    requires: ['core', 'title'],
    gate: { showProgress: 'always', title: '正在进入梦域' },
  },
  placeholder: {
    id: 'placeholder',
    sceneKey: 'placeholder',
    requires: ['ch.00'],
    prefetch: ['ui'],
    gate: { showProgress: 'auto', title: '正在载入序章' },
  },
};
