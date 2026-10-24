import Phaser from 'phaser';
import { MVVMPlugin, installFactories } from '@phaser-mvvm/phaser';
import { installWidgetFactories } from '@phaser-mvvm/widgets';
import { planViewport, setViewportPlan } from './app/viewport';
import { applyTheme } from './theme/theme';
import { BootScene } from './scenes/boot-scene';
import { PlaceholderScene } from './scenes/placeholder-scene';
import { PrologueScene } from './scenes/prologue-scene';
import { TitleScene } from './scenes/title-scene';
import { LoaderScene } from './resource/loader-scene';

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
  scene: [BootScene, LoaderScene, TitleScene, PrologueScene, PlaceholderScene],
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
        .find((scene) => scene.scene.key !== 'loader') as
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

// 调试/自动化用：真实 game 实例与本次运行的视口计划。
(window as unknown as { __AVM__: unknown }).__AVM__ = { game, plan };

export { game };
