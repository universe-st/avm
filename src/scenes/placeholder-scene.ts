import { UIScene } from '@phaser-mvvm/phaser';
import { Button, Column, Text } from '@phaser-mvvm/widgets/compose';
import { enterModule } from '../app/director';
import { audioDirector } from '../audio/audio-director';
import { applyCamera } from '../app/viewport';
import { addCoverImage, addScrims } from '../ui/background';

/** 「开始游戏」的落点：验证资源门禁与场景切换，不含任何剧情。 */
export class PlaceholderScene extends UIScene {
  constructor() {
    super('placeholder');
  }

  override create(): void {
    applyCamera(this);
    addCoverImage(this, 'img.ch00.bg');
    addScrims(this);
    super.create();
    this.cameras.main.fadeIn(320, 5, 6, 10);
  }

  protected content(): void {
    Column(
      {
        width: 'fill',
        height: 'fill',
        padding: 32,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 18,
      },
      () => {
        Text('序章 · 权力之梦', { size: 'xl', align: 'center' });
        Text('开发中', { size: 'lg', tone: 'muted', align: 'center' });
        Text(
          '第一章《天子》的梦域入口已预留。\nM1 将接入序章剧情、锚点与第一场战斗。',
          { size: 'sm', tone: 'muted', align: 'center' },
        );
        Button('返回标题', {
          variant: 'secondary',
          size: 'lg',
          onClick: () => {
            audioDirector.playClick();
            void enterModule(this, 'title');
          },
        });
      },
    );
  }

  protected override onBack(): boolean {
    void enterModule(this, 'title');
    return true;
  }
}
