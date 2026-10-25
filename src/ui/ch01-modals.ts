import type { ModalHandle, MVVMPlugin } from '@phaser-mvvm/phaser';
import { Button, Panel, Row, Text } from '@phaser-mvvm/widgets/compose';
import { CH01_END_CARD } from '../story/ch01-dorm';

/**
 * 第一章寝室的 Compose 模态（UI 层）。
 *
 * 只负责面板/按钮；重开、返回标题等动作由场景回调。
 */
export function openCh01EndCard(
  mvvm: MVVMPlugin,
  callbacks: { onRestart: () => void; onTitle: () => void },
): ModalHandle {
  let modal: ModalHandle | null = null;
  modal = mvvm.modal.open(
    () => {
      Panel({ width: 620, padding: 30, gap: 14, variant: 'surface' }, () => {
        Text(CH01_END_CARD.title, { size: 'xl', tone: 'primary', align: 'center' });
        Text(CH01_END_CARD.subtitle, { size: 'md', align: 'center' });
        Text(CH01_END_CARD.hint, { size: 'sm', tone: 'muted', align: 'center' });
        Row({ width: 'fill', gap: 12, justifyContent: 'center' }, () => {
          Button('重看本节', {
            variant: 'secondary',
            size: 'md',
            onClick: () => {
              modal?.close();
              callbacks.onRestart();
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
      Panel({ width: 560, padding: 28, gap: 14, variant: 'surface' }, () => {
        Text('返回标题？', { size: 'lg' });
        Text('本节没有存档，返回后将从开头重新开始。', { size: 'sm', tone: 'muted' });
        Row({ width: 'fill', gap: 12, justifyContent: 'end' }, () => {
          Button('继续本节', {
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
      name: 'ch01-exit',
      onClose: () => {
        callbacks.onClose?.();
      },
    },
  );
  return modal;
}
