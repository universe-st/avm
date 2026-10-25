import type { ModalHandle, MVVMPlugin } from '@phaser-mvvm/phaser';
import { Button, Panel, Row, Text } from '@phaser-mvvm/widgets/compose';
import { CH01_BATTLE_BANNER } from '../story/ch01-dorm';

export function openBattleIntro(
  mvvm: MVVMPlugin,
  callbacks: { onClose: () => void },
): ModalHandle {
  let modal: ModalHandle | null = null;
  modal = mvvm.modal.open(
    () => {
      Panel({ width: 620, padding: 30, gap: 14, variant: 'surface' }, () => {
        Text(CH01_BATTLE_BANNER.title, { size: 'xl', tone: 'primary', align: 'center' });
        Text(`敌方：${CH01_BATTLE_BANNER.subtitle}`, { size: 'md', align: 'center' });
        Text(CH01_BATTLE_BANNER.intro.join('\n'), { size: 'sm', tone: 'muted', align: 'center' });
        Row({ width: 'fill', justifyContent: 'center' }, () => {
          Button('迎战', {
            variant: 'primary',
            size: 'lg',
            width: 240,
            onClick: () => {
              modal?.close();
            },
          });
        });
      });
    },
    {
      dismissible: false,
      name: 'ch01-battle-intro',
      onClose: callbacks.onClose,
    },
  );
  return modal;
}

export function openBattleDefeat(
  mvvm: MVVMPlugin,
  options: {
    readonly preview: boolean;
    readonly onRestart: () => void;
    readonly onTitle: () => void;
    readonly onWake: () => void;
    readonly onClose: () => void;
  },
): ModalHandle {
  let modal: ModalHandle | null = null;
  modal = mvvm.modal.open(
    () => {
      Panel({ width: 640, padding: 32, gap: 16, variant: 'surface' }, () => {
        Text('剧情战 · 战败', { size: 'xl', tone: 'danger', align: 'center' });
        Text(CH01_BATTLE_BANNER.defeat.join('\n'), { size: 'md', align: 'center' });
        Text('这不是游戏结束。', { size: 'sm', tone: 'muted', align: 'center' });
        Row({ width: 'fill', gap: 12, justifyContent: 'center' }, () => {
          if (options.preview) {
            Button('重开战斗', {
              variant: 'secondary',
              size: 'md',
              onClick: () => {
                modal?.close();
                options.onRestart();
              },
            });
            Button('返回标题', {
              variant: 'primary',
              size: 'md',
              onClick: () => {
                modal?.close();
                options.onTitle();
              },
            });
          } else {
            Button('醒来', {
              variant: 'primary',
              size: 'lg',
              width: 260,
              onClick: () => {
                modal?.close();
                options.onWake();
              },
            });
          }
        });
      });
    },
    {
      dismissible: false,
      name: 'ch01-battle-defeat',
      onClose: options.onClose,
    },
  );
  return modal;
}

export function openBattleExit(
  mvvm: MVVMPlugin,
  callbacks: { onTitle: () => void; onClose: () => void },
): ModalHandle {
  let modal: ModalHandle | null = null;
  modal = mvvm.modal.open(
    () => {
      Panel({ width: 560, padding: 28, gap: 14, variant: 'surface' }, () => {
        Text('离开战斗？', { size: 'lg' });
        Text('本节没有存档，离开后需要从标题重新开始。', { size: 'sm', tone: 'muted' });
        Row({ width: 'fill', gap: 12, justifyContent: 'end' }, () => {
          Button('继续战斗', {
            variant: 'secondary',
            size: 'md',
            onClick: () => {
              modal?.close();
            },
          });
          Button('返回标题', {
            variant: 'primary',
            size: 'md',
            onClick: () => {
              modal?.close();
              callbacks.onTitle();
            },
          });
        });
      });
    },
    {
      dismissible: true,
      name: 'ch01-battle-exit',
      onClose: callbacks.onClose,
    },
  );
  return modal;
}
