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
import { settings } from '../app/settings';
import { enterModule } from '../app/director';
import { applyCamera, getViewportPlan } from '../app/viewport';
import { audioDirector } from '../audio/audio-director';
import { addCoverImage, addScrims } from '../ui/background';

const BGM_KEY = 'audio.bgm.title';

export class TitleScene extends UIScene {
  constructor() {
    super('title');
  }

  override create(): void {
    applyCamera(this);
    addCoverImage(this, 'img.title.bg');
    addScrims(this);
    super.create();
    this.cameras.main.fadeIn(520, 5, 6, 10);

    audioDirector.attach(this);
    audioDirector.playTitleBgm(BGM_KEY);

    const unlock = (): void => {
      audioDirector.unlock();
      audioDirector.playTitleBgm(BGM_KEY);
    };
    this.input.once('pointerdown', unlock);
    this.input.keyboard?.once('keydown', unlock);
  }

  protected content(): void {
    const plan = getViewportPlan();
    const tall = plan.designHeight >= 1450;

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

        Column({ width: 380, gap: 14 }, () => {
          Button('开始游戏', {
            variant: 'primary',
            size: 'lg',
            onClick: () => {
              audioDirector.playClick();
              void enterModule(this, 'placeholder');
            },
          });
          Button('继续游戏', { variant: 'secondary', size: 'lg', disabled: true });
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
            onValueChange: (value) => audioDirector.setBgmVolume(value / 100),
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
                audioDirector.setMuted(!settings.muted);
              },
            });
            Button('恢复默认', {
              variant: 'ghost',
              size: 'md',
              onClick: () => {
                audioDirector.playClick();
                settings.bgm = 0.6;
                settings.sfx = 0.8;
                settings.muted = false;
                audioDirector.syncVolume();
              },
            });
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
