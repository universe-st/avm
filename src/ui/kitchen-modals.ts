import type { ModalHandle, MVVMPlugin } from '@phaser-mvvm/phaser';
import { MODAL_NO_AUTOFOCUS } from './modal-guard';
import { Button, Column, Divider, Panel, Row, Text } from '@phaser-mvvm/widgets/compose';
import { KITCHEN_END_CARD } from '../story/ch01-kitchen';

/** 第一章第二节（P1 白盒）的 Compose 模态。 */

export function openKitchenFailCard(
  mvvm: MVVMPlugin,
  callbacks: { reason: string; onRetry: () => void; onTitle: () => void },
): ModalHandle {
  let modal: ModalHandle | null = null;
  modal = mvvm.modal.open(
    () => {
      Panel({ width: 620, padding: 30, gap: 12, variant: 'surface' }, () => {
        Text('被发现了', { size: 'xl', align: 'center', style: { fontStyle: 'bold' } });
        Divider({});
        Text(callbacks.reason, { size: 'md', align: 'center', tone: 'muted' });
        Text('梦域把你吐了出去。', { size: 'sm', align: 'center', tone: 'muted' });
        Divider({});
        Column({ width: 'fill', gap: 10, alignItems: 'center' }, () => {
          Row({ width: 'fill', gap: 12, justifyContent: 'center' }, () => {
            Button('再进去', {
              variant: 'primary',
              size: 'md',
              width: 190,
              onClick: () => {
                modal?.close();
                callbacks.onRetry();
              },
            });
            Button('返回标题', {
              variant: 'secondary',
              size: 'md',
              width: 190,
              onClick: () => {
                modal?.close();
                callbacks.onTitle();
              },
            });
          });
        });
      });
    },
    { ...MODAL_NO_AUTOFOCUS, dismissible: false, name: 'kitchen-fail' },
  );
  modal.widget.setScrollFactor(0);
  return modal;
}

export function openKitchenEndCard(
  mvvm: MVVMPlugin,
  callbacks: { onRestart: () => void; onTitle: () => void },
): ModalHandle {
  let modal: ModalHandle | null = null;
  modal = mvvm.modal.open(
    () => {
      Panel({ width: 640, padding: 34, gap: 12, variant: 'surface' }, () => {
        Text(KITCHEN_END_CARD.kicker, { size: 'xs', tone: 'muted', align: 'center' });
        Divider({});
        Text(KITCHEN_END_CARD.title, {
          size: 'xl',
          tone: 'primary',
          align: 'center',
          style: { fontStyle: 'bold' },
        });
        Text(KITCHEN_END_CARD.subtitle, { size: 'md', align: 'center' });
        Divider({});
        Text(KITCHEN_END_CARD.hint, { size: 'sm', tone: 'muted', align: 'center' });
        Column({ width: 'fill', gap: 10, alignItems: 'center' }, () => {
          Row({ width: 'fill', gap: 12, justifyContent: 'center' }, () => {
            Button('重开本节', {
              variant: 'secondary',
              size: 'md',
              width: 190,
              onClick: () => {
                modal?.close();
                callbacks.onRestart();
              },
            });
            Button('返回标题', {
              variant: 'primary',
              size: 'md',
              width: 190,
              onClick: () => {
                modal?.close();
                callbacks.onTitle();
              },
            });
          });
        });
      });
    },
    { ...MODAL_NO_AUTOFOCUS, dismissible: false, name: 'kitchen-end' },
  );
  modal.widget.setScrollFactor(0);
  return modal;
}

export function openKitchenExitConfirm(
  mvvm: MVVMPlugin,
  callbacks: { onTitle: () => void; onClose?: () => void },
): ModalHandle {
  let modal: ModalHandle | null = null;
  modal = mvvm.modal.open(
    () => {
      Panel({ width: 580, padding: 28, gap: 14, variant: 'surface' }, () => {
        Text('返回标题？', { size: 'lg' });
        Text('当前是 P1 白盒，不写进度；下次从御膳房入口重来。', {
          size: 'sm',
          tone: 'muted',
        });
        Row({ width: 'fill', gap: 12, justifyContent: 'end' }, () => {
          Button('继续潜入', {
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
      ...MODAL_NO_AUTOFOCUS,
      dismissible: true,
      name: 'kitchen-exit',
      onClose: () => callbacks.onClose?.(),
    },
  );
  modal.widget.setScrollFactor(0);
  return modal;
}
