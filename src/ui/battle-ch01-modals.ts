import type { ModalHandle, MVVMPlugin } from '@phaser-mvvm/phaser';
import { Button, Divider, Panel, Row, Text } from '@phaser-mvvm/widgets/compose';
import { CH01_BATTLE_BANNER } from '../story/ch01-dorm';

/**
 * 战斗相关模态。
 *
 * 开场从「普通确认框」改成清除协议终端卡：朱红标题 + 协议编号 + 规则提示，
 * 与金殿过场里的「执行矿场清除协议」是同一件事。
 */
export function openBattleIntro(
  mvvm: MVVMPlugin,
  callbacks: { onClose: () => void },
): ModalHandle {
  let modal: ModalHandle | null = null;
  modal = mvvm.modal.open(
    () => {
      Panel({ width: 620, padding: 30, gap: 12, variant: 'surface' }, () => {
        Text('PROTOCOL / CLEAR', { size: 'xs', tone: 'muted', align: 'center' });
        Text('矿场清除协议', { size: 'xl', tone: 'danger', align: 'center' });
        Divider({});
        Text(`目标：${CH01_BATTLE_BANNER.subtitle}`, { size: 'md', align: 'center' });
        Text(CH01_BATTLE_BANNER.intro.join('\n'), {
          size: 'sm',
          tone: 'muted',
          align: 'center',
        });
        Text('你的攻击只能造成 1 点伤害。', { size: 'sm', tone: 'primary', align: 'center' });
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
      Panel({ width: 640, padding: 32, gap: 14, variant: 'surface' }, () => {
        Text('清除协议 · 执行完毕', { size: 'xs', tone: 'muted', align: 'center' });
        Text('剧情战 · 战败', { size: 'xl', tone: 'danger', align: 'center' });
        Divider({});
        Text(CH01_BATTLE_BANNER.defeat.join('\n'), { size: 'md', align: 'center' });
        Text('这不是游戏结束。你只是被踢出了梦域。', {
          size: 'sm',
          tone: 'muted',
          align: 'center',
        });
        Row({ width: 'fill', gap: 12, justifyContent: 'center' }, () => {
          if (options.preview) {
            Button('重开战斗', {
              variant: 'secondary',
              size: 'md',
              width: 200,
              onClick: () => {
                modal?.close();
                options.onRestart();
              },
            });
            Button('返回标题', {
              variant: 'primary',
              size: 'md',
              width: 200,
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
      Panel({ width: 580, padding: 28, gap: 14, variant: 'surface' }, () => {
        Text('离开战斗？', { size: 'lg' });
        Text('进度已记在「继续游戏」里，下次会从战后接着走。', {
          size: 'sm',
          tone: 'muted',
        });
        Row({ width: 'fill', gap: 12, justifyContent: 'end' }, () => {
          Button('继续战斗', {
            variant: 'secondary',
            size: 'md',
            width: 180,
            onClick: () => {
              modal?.close();
            },
          });
          Button('返回标题', {
            variant: 'primary',
            size: 'md',
            width: 180,
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
