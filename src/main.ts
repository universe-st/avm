import Phaser from 'phaser';
import { MVVMPlugin, installFactories } from '@phaser-mvvm/phaser';
import { installWidgetFactories } from '@phaser-mvvm/widgets';
import { planViewport, setViewportPlan, type ViewportPlan } from './app/viewport';
import { SCENE_KEYS } from './app/scene-keys';
import { applyTheme } from './theme/theme';
import { UI_ROOT_DEPTH } from './render/layers';
import { BootScene } from './scenes/boot-scene';
import { CgStageScene } from './scenes/cg-stage-scene';
import { BattleSandboxScene } from './scenes/battle-sandbox-scene';
import { BattleCh01Scene } from './scenes/battle-ch01-scene';
import { Ch01DormScene } from './scenes/ch01-dorm-scene';
import { PlaceholderScene } from './scenes/placeholder-scene';
import { PrologueScene } from './scenes/prologue-scene';
import { TitleScene } from './scenes/title-scene';
import { LoaderScene } from './resource/loader-scene';
import { assetService } from './resource/asset-service';
import { installStageConsole, type StageConsoleApi } from './dev/stage-runner';

const plan = planViewport();
setViewportPlan(plan);

// 主题、工厂、插件默认值都要在 new Phaser.Game 之前配好。
applyTheme();
installFactories();
installWidgetFactories();
MVVMPlugin.configure({
  designResolution: { width: plan.designWidth, height: plan.designHeight },
  textResolution: plan.scale,
  safeArea: true,
  themeBackground: false,
  depth: UI_ROOT_DEPTH,
  transition: { enter: 220, exit: 160 },
});

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#05060a',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: plan.gameWidth,
    height: plan.gameHeight,
  },
  render: {
    antialias: true,
    roundPixels: true,
    powerPreference: 'high-performance',
  },
  loader: {
    maxParallelDownloads: 8,
  },
  input: {
    activePointers: 2,
    gamepad: true,
  },
  dom: {
    createContainer: true,
  },
  plugins: {
    scene: [
      {
        key: 'MVVMPlugin',
        plugin: MVVMPlugin,
        mapping: 'mvvm',
        start: true,
      },
    ],
  },
  // 新增内容场景时三处同步：本列表、`scene-keys.ts`、`dev/stage-catalog.ts`；
  // 舞台目录单测会检查「内容 scene key 必须有入口」。
  scene: [
    BootScene,
    LoaderScene,
    TitleScene,
    PrologueScene,
    PlaceholderScene,
    Ch01DormScene,
    BattleCh01Scene,
    CgStageScene,
    BattleSandboxScene,
  ],
});

// Cordova：隐藏状态栏 + 硬件返回键接入框架的 back 链。
// 注意：监听必须在 cordova.js 执行之后注册，否则 Cordova 不知道有订阅者，会直接退出应用。
const cordovaGlobal = (window as unknown as {
  cordova?: { exec?: (...args: unknown[]) => void; platformId?: string };
}).cordova;

const hideStatusBar = (): void => {
  cordovaGlobal?.exec?.(() => undefined, () => undefined, 'SystemBarPlugin', 'setStatusBarVisible', [false]);
};

let backInstalled = false;
const installBackButton = (): void => {
  if (backInstalled || !cordovaGlobal) return;
  backInstalled = true;
  document.addEventListener(
    'backbutton',
    (event) => {
      const active = game.scene
        .getScenes(true)
        .find((scene) => scene.scene.key !== SCENE_KEYS.loader) as
        | (Phaser.Scene & { mvvm?: MVVMPlugin })
        | undefined;
      if (!active?.mvvm) return;
      event.preventDefault();
      active.mvvm.requestBack();
    },
    false,
  );
};

if (cordovaGlobal) {
  installBackButton();
  hideStatusBar();
}
document.addEventListener('deviceready', () => {
  installBackButton();
  hideStatusBar();
});

// 调试/自动化后门：真实 game 实例、本次视口计划、舞台预览 API。
// 用法见 docs/STAGE-PREVIEW.md，例如 __AVM__.stages.go('cg.prologue.disaster')。
export interface AvmDebugApi {
  readonly game: Phaser.Game;
  readonly plan: ViewportPlan;
  readonly stages: StageConsoleApi;
  /** 资源验收：当前场景持有的 bundle 与真实存在的 cache key。 */
  readonly assets: {
    readonly bundles: () => readonly string[];
    readonly keys: () => readonly string[];
  };
}

const stageConsole = installStageConsole(game);
const debugApi: AvmDebugApi = {
  game,
  plan,
  stages: stageConsole,
  assets: {
    bundles: () => assetService.loadedBundleIds(),
    keys: () => assetService.loadedAssetKeys(),
  },
};
(window as unknown as { __AVM__: AvmDebugApi }).__AVM__ = debugApi;

export { game, debugApi };
