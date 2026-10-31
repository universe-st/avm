import type { ModalHandle, MVVMPlugin } from '@phaser-mvvm/phaser';
import { Button, Column, Divider, Panel, Row, Text } from '@phaser-mvvm/widgets/compose';
import { CH01_END_CARD } from '../story/ch01-dorm';

/**
 * 第一章寝室的 Compose 模态（UI 层）。
 *
 * 只负责面板/按钮；重开、返回标题等动作由场景回调。
 * 结束卡从「普通弹窗」改成章节卡：金线、章节号、下一节预告，和标题/章节卡同一套语言。
 */
export function openCh01EndCard(
  mvvm: MVVMPlugin,
  callbacks: { onRestart: () => void; onTitle: () => void },
): ModalHandle {
  let modal: ModalHandle | null = null;
  modal = mvvm.modal.open(
    () => {
      Panel({ width: 640, padding: 34, gap: 12, variant: 'surface' }, () => {
        Text(CH01_END_CARD.kicker, { size: 'xs', tone: 'muted', align: 'center' });
        Divider({});
        Text(CH01_END_CARD.title, {
          size: 'xl',
          tone: 'primary',
          align: 'center',
          style: { fontStyle: 'bold' },
        });
        Text(CH01_END_CARD.subtitle, { size: 'md', align: 'center' });
        Divider({});
        Text(CH01_END_CARD.hint, { size: 'sm', tone: 'muted', align: 'center' });
        Column({ width: 'fill', gap: 10, alignItems: 'center' }, () => {
          Row({ width: 'fill', gap: 12, justifyContent: 'center' }, () => {
            Button('重看本节', {
              variant: 'secondary',
              size: 'md',
              width: 200,
              onClick: () => {
                modal?.close();
                callbacks.onRestart();
              },
            });
            Button('返回标题', {
              variant: 'primary',
              size: 'md',
              width: 200,
              onClick: () => {
                modal?.close();
                callbacks.onTitle();
              },
            });
          });
        });
      });
    },
    { dismissible: false, name: 'ch01-end' },
  );
  return modal;
}

export function openCh01ExitConfirm(
  mvvm: MVVMPlugin,
  callbacks: { onTitle: () => void; onClose?: () => void },
): ModalHandle {
  let modal: ModalHandle | null = null;
  modal = mvvm.modal.open(
    () => {
      Panel({ width: 580, padding: 28, gap: 14, variant: 'surface' }, () => {
        Text('返回标题？', { size: 'lg' });
        Text('进度已记在「继续游戏」里，下次可以从这一段接着走。', {
          size: 'sm',
          tone: 'muted',
        });
        Row({ width: 'fill', gap: 12, justifyContent: 'end' }, () => {
          Button('继续本节', {
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
      name: 'ch01-exit',
      onClose: () => {
        callbacks.onClose?.();
      },
    },
  );
  return modal;
}
