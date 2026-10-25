import type Phaser from 'phaser';
import { SCENE_KEYS } from '../app/scene-keys';
import {
  loadSceneResources,
  releaseSceneResourcesAfterCreate,
} from '../resource/scene-resources';
import {
  findStage,
  listStages,
  toStageSummary,
  type StageSummary,
} from './stage-catalog';
import {
  isStageHudMounted,
  isStageHudVisible,
  mountStageHud,
  setStageHudVisible,
  showStageToast,
  unmountStageHud,
} from './stage-hud';
import { buildStageUrl, type StageUrlOptions } from './stage-query';
import {
  createStageContext,
  type StageDef,
  type StageLaunchContext,
  type StageRunOptions,
} from './stage-types';

export interface StageLaunchOptions extends StageRunOptions {
  /** 是否挂预览 HUD；`?hud=0` 或控制台显式关闭时传 false。 */
  readonly hud?: boolean;
}

interface ActiveStage {
  readonly stage: StageDef;
  readonly context: StageLaunchContext;
}

const INFRA_SCENE_KEYS = new Set(['loader']);
let active: ActiveStage | null = null;
let launchToken = 0;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hostSceneKey(stage: StageDef): string {
  return stage.kind === 'cg' ? SCENE_KEYS.cgStage : stage.sceneKey;
}

function stopContentScenes(game: Phaser.Game): void {
  // 舞台预览是显式跳转：先停掉所有内容场景，再启动目标，避免留下旧 UIRoot。
  // 正常流程仍然走 enterModule(from, id)，不使用这里。
  for (const scene of game.scene.getScenes(true)) {
    if (INFRA_SCENE_KEYS.has(scene.scene.key)) continue;
    game.scene.stop(scene.scene.key);
  }
}

function mountHud(game: Phaser.Game, stage: StageDef): void {
  const run = (task: Promise<unknown> | null): void => {
    if (!task) return;
    void task.catch((error: unknown) => {
      showStageToast(`舞台启动失败：${errorMessage(error)}`, 'error');
    });
  };

  mountStageHud({
    stage,
    onSelect: (stageId) => {
      run(launchStage(game, stageId, { origin: 'hud' }));
    },
    onRestart: () => {
      run(restartActiveStage(game));
    },
    onTitle: () => {
      run(exitStagePreview(game));
    },
  });
}

function trackSceneShutdown(game: Phaser.Game, stage: StageDef): void {
  const sceneKey = hostSceneKey(stage);
  const scene = game.scene.getScene(sceneKey);
  if (!scene) return;
  scene.events.once('shutdown', () => {
    // 等本帧场景操作落定：正常剧目推进（如 prologue → placeholder）时清掉 HUD；
    // 舞台重开/切换时目标场景仍然 active，则保留。
    window.setTimeout(() => {
      if (active?.stage.id === stage.id && !game.scene.isActive(sceneKey)) {
        active = null;
        unmountStageHud();
      }
    }, 0);
  });
}

/**
 * 从任意位置启动一个舞台。这是唯一的代码级入口：
 * URL、控制台、HUD 目录最终都调用它。
 *
 * 资源仍然走 `AssetService.ensure()`，与正常流程同一套门禁；场景里不会出现 `this.load`。
 */
export async function launchStage(
  game: Phaser.Game,
  stageId: string,
  options: StageLaunchOptions = {},
): Promise<StageLaunchContext> {
  const normalizedId = stageId.trim().toLowerCase();
  const stage = findStage(normalizedId);
  if (!stage) throw new Error(`未知舞台：${stageId}`);
  if (stage.status !== 'ready') throw new Error(`舞台尚未接入：${stageId}`);

  const context = createStageContext(stage, options);
  const token = (launchToken += 1);

  await loadSceneResources(stage.requires, {
    label: `预览 · ${stage.title}`,
    holdMs: 420,
  });
  if (token !== launchToken) throw new Error(`舞台预览已被更新的请求取代：${stageId}`);

  active = { stage, context };
  stopContentScenes(game);
  const hostScene = game.scene.getScene(hostSceneKey(stage));
  if (hostScene) releaseSceneResourcesAfterCreate(hostScene, stage.requires);
  game.scene.start(hostSceneKey(stage), context);
  trackSceneShutdown(game, stage);

  if (options.hud === false) unmountStageHud();
  else mountHud(game, stage);

  return context;
}

/** 重开当前舞台（沿用 seed / skip / frame / params），HUD「重开」按钮走这里。 */
export function restartActiveStage(game: Phaser.Game): Promise<StageLaunchContext> | null {
  const current = active;
  if (!current) return null;
  return launchStage(game, current.stage.id, {
    seed: current.context.seed,
    skip: current.context.skip,
    frame: current.context.frame,
    params: current.context.params,
    origin: 'hud',
  });
}

/** 结束预览并把玩家送回正常标题流程；HUD「标题」按钮走这里。 */
export async function exitStagePreview(game: Phaser.Game): Promise<void> {
  const title = findStage('scene.title');
  if (!title) throw new Error('舞台目录缺少 scene.title，无法返回标题');

  launchToken += 1;
  active = null;
  unmountStageHud();

  await loadSceneResources(title.requires, { label: '返回标题', holdMs: 420 });
  stopContentScenes(game);
  const titleScene = game.scene.getScene(hostSceneKey(title));
  if (titleScene) releaseSceneResourcesAfterCreate(titleScene, title.requires);
  game.scene.start(hostSceneKey(title));
}

export interface StageConsoleCurrent {
  readonly stage: StageSummary;
  readonly context: StageLaunchContext;
}

export interface StageConsoleOptions extends StageRunOptions {
  readonly hud?: boolean;
}

/** 浏览器控制台后门：`__AVM__.stages.*`。参数与 URL 后门一一对应。 */
export interface StageConsoleApi {
  readonly list: (includePlanned?: boolean) => readonly StageSummary[];
  readonly get: (id: string) => StageSummary | null;
  readonly current: () => StageConsoleCurrent | null;
  readonly go: (id: string, options?: StageConsoleOptions) => Promise<StageSummary>;
  readonly restart: () => Promise<StageSummary | null>;
  readonly title: () => Promise<void>;
  readonly url: (id: string, options?: StageUrlOptions) => string;
  readonly hud: (visible?: boolean) => boolean;
}

export function installStageConsole(game: Phaser.Game): StageConsoleApi {
  const api: StageConsoleApi = {
    list: (includePlanned = true) => listStages(includePlanned).map(toStageSummary),
    get: (id) => {
      const stage = findStage(id);
      return stage ? toStageSummary(stage) : null;
    },
    current: () => {
      if (!active) return null;
      return { stage: toStageSummary(active.stage), context: active.context };
    },
    go: async (id, options = {}) => {
      const stage = findStage(id);
      if (!stage) throw new Error(`未知舞台：${id}`);
      await launchStage(game, id, { ...options, origin: 'console' });
      return toStageSummary(stage);
    },
    restart: async () => {
      const current = active;
      if (!current) return null;
      await launchStage(game, current.stage.id, {
        seed: current.context.seed,
        skip: current.context.skip,
        frame: current.context.frame,
        params: current.context.params,
        origin: 'console',
      });
      return toStageSummary(current.stage);
    },
    title: () => exitStagePreview(game),
    url: (id, options = {}) => buildStageUrl(window.location.href, id, options),
    hud: (visible) => {
      if (!active) return false;
      if (!isStageHudMounted()) mountHud(game, active.stage);
      const next = visible ?? !isStageHudVisible();
      return setStageHudVisible(next);
    },
  };

  if (import.meta.env.DEV) {
    console.info('[AVM] 舞台预览后门已就绪：__AVM__.stages.list()');
  }

  return api;
}
