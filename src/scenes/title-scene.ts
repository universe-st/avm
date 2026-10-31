import Phaser from 'phaser';
import { UIScene, type ModalHandle } from '@phaser-mvvm/phaser';
import {
  Button,
  Column,
  Divider,
  Panel,
  Row,
  Slider,
  Spacer,
  Text,
} from '@phaser-mvvm/widgets/compose';
import { settings, resetSettings, resolveReducedMotion } from '../app/settings';
import { CHECKPOINT_LABELS, continueDestination, loadProgress } from '../app/progress';
import { SCENE_KEYS } from '../app/scene-keys';
import { enterModule } from '../app/director';
import { applyCamera, getViewportPlan } from '../app/viewport';
import { audioDirector } from '../audio/audio-director';
import { bgmManager } from '../audio/bgm-manager';
import { addCoverImage, addScrims } from '../ui/background';
import { addEmbers, addVignette } from '../ui/fx-kit';

export class TitleScene extends UIScene {
  private fx: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super(SCENE_KEYS.title);
  }

  override create(): void {
    applyCamera(this);
    const cover = addCoverImage(this, 'img.title.bg');
    addScrims(this);
    const plan = getViewportPlan();
    const reduced = resolveReducedMotion();

    // 主视觉轻微推近（Ken Burns）+ 下半区余烬：标题页不再是一张死图。
    if (cover && !reduced) {
      const base = cover.scale;
      this.tweens.add({
        targets: cover,
        scale: base * 1.025,
        duration: 14000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
    this.fx.push(
      addEmbers(this, {
        x: 40,
        y: plan.designHeight * 0.45,
        width: plan.designWidth - 80,
        height: plan.designHeight * 0.4,
        count: 16,
        seed: 7,
        color: 0xd8b76a,
        reduced,
        depth: 1,
      }),
      addVignette(this, { alpha: 0.34, depth: 2 }),
    );

    super.create();
    this.cameras.main.fadeIn(520, 5, 6, 10);

    audioDirector.attach(this);
    // 场景 → 曲子的映射在 bgm-manager.ts；BgmManager 自己处理首次手势前的补播。
    bgmManager.enterScene(this);

    const unlock = (): void => {
      audioDirector.unlock();
      bgmManager.unlock();
    };
    this.input.once('pointerdown', unlock);
    this.input.keyboard?.once('keydown', unlock);
  }

  shutdown(): void {
    for (const object of this.fx) object.destroy();
    this.fx = [];
  }

  protected content(): void {
    const plan = getViewportPlan();
    const tall = plan.designHeight >= 1450;
    const progress = loadProgress();

    Column(
      {
        width: 'fill',
        height: 'fill',
        padding: 30,
        gap: 0,
        alignItems: 'center',
      },
      () => {
        Row({ width: 'fill', justifyContent: 'space-between', alignItems: 'center' }, () => {
          Text(`v${__APP_VERSION__}`, { size: 18, tone: 'muted' });
          Button('设 置', {
            variant: 'ghost',
            size: 'sm',
            onClick: () => {
              audioDirector.playClick();
              this.openSettings();
            },
          });
        });

        Spacer({ grow: 0.45 });

        Column({ alignItems: 'center', gap: tall ? 12 : 8, width: 'fill' }, () => {
          Text('此刻，潜入谁的梦？', {
            size: 28,
            align: 'center',
            style: { color: '#d9d3c4', stroke: '#05060a', strokeThickness: 3 },
          });
          Text('刺客大战矿工', {
            size: tall ? 76 : 70,
            align: 'center',
            style: {
              fontStyle: 'bold',
              color: '#f7f3e8',
              stroke: '#05060a',
              strokeThickness: 5,
            },
          });
          Text('ASSASSINS  VS.  MINERS', {
            size: 20,
            align: 'center',
            style: { color: '#e2d5ab', stroke: '#05060a', strokeThickness: 4 },
          });
        });

        Spacer({ grow: 1.6 });

        Column({ width: 380, gap: 14, alignItems: 'stretch' }, () => {
          Button('开始游戏', {
            variant: 'primary',
            size: 'lg',
            onClick: () => {
              audioDirector.playClick();
              void enterModule(this, 'prologue');
            },
          });
          Button('继续游戏', {
            variant: 'secondary',
            size: 'lg',
            disabled: progress === null,
            onClick: () => {
              if (!progress) return;
              audioDirector.playClick();
              const destination = continueDestination(progress.checkpoint);
              void enterModule(this, destination.module, destination.data);
            },
          });
          Text(
            progress
              ? `上次：${CHECKPOINT_LABELS[progress.checkpoint]}`
              : '还没有进度：从「开始游戏」进入第一章',
            { size: 'xs', tone: 'muted', align: 'center' },
          );
          Button('制作名单', {
            variant: 'ghost',
            size: 'lg',
            onClick: () => {
              audioDirector.playClick();
              this.openCredits();
            },
          });
        });

        Spacer({ grow: 0.35 });
        Text('© 2026 Universest', { size: 18, tone: 'muted' });
      },
    );
  }

  protected override onBack(): boolean {
    // 设置/名单弹窗会先消费 back；到标题页就吞掉，避免 Cordova 在某些机型上
    // 把同一次返回再交给系统默认行为、直接退出应用。M1 会加「再按一次退出」确认。
    return true;
  }

  private openSettings(): void {
    let modal: ModalHandle | null = null;
    modal = this.mvvm.modal.open(
      () => {
        Panel({ width: 600, padding: 30, gap: 18, variant: 'surface' }, () => {
          Text('设置', { size: 'lg' });
          Divider({});

          Text(() => `音乐音量  ${Math.round(settings.bgm * 100)}%`, {
            size: 'sm',
            tone: 'muted',
          });
          Slider({
            value: settings.bgm * 100,
            min: 0,
            max: 100,
            step: 1,
            width: 520,
            trackThickness: 4,
            knobRadius: 8,
            onValueChange: (value) => bgmManager.setBgmVolume(value / 100),
          });

          Text(() => `音效音量  ${Math.round(settings.sfx * 100)}%`, {
            size: 'sm',
            tone: 'muted',
          });
          Slider({
            value: settings.sfx * 100,
            min: 0,
            max: 100,
            step: 1,
            width: 520,
            trackThickness: 4,
            knobRadius: 8,
            onValueChange: (value) => audioDirector.setSfxVolume(value / 100),
          });

          Row({ width: 'fill', gap: 10, alignItems: 'center' }, () => {
            Button(() => (settings.muted ? '声音：关' : '声音：开'), {
              variant: 'secondary',
              size: 'md',
              onClick: () => {
                audioDirector.playClick();
                bgmManager.setMuted(!settings.muted);
              },
            });
            Button('恢复默认', {
              variant: 'ghost',
              size: 'md',
              onClick: () => {
                audioDirector.playClick();
                resetSettings();
                bgmManager.setBgmVolume(settings.bgm);
                audioDirector.setSfxVolume(settings.sfx);
                bgmManager.syncVolume();
              },
            });
          });

          Divider({});
          Text('文字速度', { size: 'sm', tone: 'muted' });
          Row({ width: 'fill', gap: 8, alignItems: 'center' }, () => {
            const speeds = [
              ['slow', '慢'],
              ['normal', '正常'],
              ['fast', '快'],
              ['instant', '瞬间'],
            ] as const;
            for (const [value, label] of speeds) {
              Button(() => (settings.textSpeed === value ? `● ${label}` : label), {
                variant: 'ghost',
                size: 'md',
                width: 120,
                onClick: () => {
                  audioDirector.playClick();
                  settings.textSpeed = value;
                },
              });
            }
          });

          Row({ width: 'fill', gap: 10, alignItems: 'center' }, () => {
            Text('自动播放', { size: 'sm', tone: 'muted' });
            Button(() => (settings.autoAdvance ? '开' : '关'), {
              variant: 'ghost',
              size: 'md',
              width: 120,
              onClick: () => {
                audioDirector.playClick();
                settings.autoAdvance = !settings.autoAdvance;
              },
            });
          });

          Text('动效', { size: 'sm', tone: 'muted' });
          Row({ width: 'fill', gap: 8, alignItems: 'center' }, () => {
            const motions = [
              ['system', '跟随系统'],
              ['reduced', '减弱'],
              ['full', '完整'],
            ] as const;
            for (const [value, label] of motions) {
              Button(() => (settings.motion === value ? `● ${label}` : label), {
                variant: 'ghost',
                size: 'md',
                width: 150,
                onClick: () => {
                  audioDirector.playClick();
                  settings.motion = value;
                },
              });
            }
          });

          Divider({});
          Row({ width: 'fill', justifyContent: 'end' }, () => {
            Button('关闭', {
              variant: 'primary',
              size: 'md',
              onClick: () => {
                audioDirector.playClick();
                modal?.close();
              },
            });
          });
        });
      },
      { dismissible: true },
    );
  }

  private openCredits(): void {
    let modal: ModalHandle | null = null;
    modal = this.mvvm.modal.open(
      () => {
        Panel({ width: 600, padding: 30, gap: 16, variant: 'surface' }, () => {
          Text('制作名单', { size: 'lg' });
          Divider({});
          Text(
            '策划 / 程序：universe-st\n' +
              '美术：seedance 模型\n' +
              '代码：deepseek 模型\n' +
              '引擎：Phaser 4.2.1（Giedi）\n' +
              '字体：方舟像素字体（OFL）/ 思源黑体\n' +
              '音乐与音效：游戏素材大师生成',
            { size: 'sm', tone: 'muted' },
          );
          Row({ width: 'fill', justifyContent: 'end' }, () => {
            Button('关闭', {
              variant: 'primary',
              size: 'md',
              onClick: () => {
                audioDirector.playClick();
                modal?.close();
              },
            });
          });
        });
      },
      { dismissible: true },
    );
  }
}
