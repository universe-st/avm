import type { ModalHandle, MVVMPlugin } from '@phaser-mvvm/phaser';
import { MODAL_NO_AUTOFOCUS } from './modal-guard';
import { Button, Divider, Panel, Row, Text } from '@phaser-mvvm/widgets/compose';
import { CH01_BATTLE_BANNER } from '../story/ch01-dorm';

/**
 * 战斗相关模态（v2）。
 *
 * 三张卡都允许由战斗数据覆盖文案：金殿剧情战与御膳房遭遇战的规则/收尾完全不同，
 * 不能再把「固定 1 伤害」「矿场清除协议」写死在这层 UI 里。
 */
export function openBattleIntro(
  mvvm: MVVMPlugin,
  callbacks: {
    onClose: () => void;
    readonly badge?: string;
    readonly title?: string;
    readonly target?: string;
    readonly lines?: readonly string[];
    readonly ruleText?: string;
    readonly buttonLabel?: string;
  },
): ModalHandle {
  let modal: ModalHandle | null = null;
  modal = mvvm.modal.open(
    () => {
      Panel({ width: 620, padding: 30, gap: 12, variant: 'surface' }, () => {
        Text(callbacks.badge ?? 'PROTOCOL / CLEAR', { size: 'xs', tone: 'muted', align: 'center' });
        Text(callbacks.title ?? '矿场清除协议', { size: 'xl', tone: 'danger', align: 'center' });
        Divider({});
        Text(`目标：${callbacks.target ?? CH01_BATTLE_BANNER.subtitle}`, {
          size: 'md',
          align: 'center',
        });
        Text((callbacks.lines ?? CH01_BATTLE_BANNER.intro).join('\n'), {
          size: 'sm',
          tone: 'muted',
          align: 'center',
        });
        Text(callbacks.ruleText ?? '你只能移动与防御。', {
          size: 'sm',
          tone: 'primary',
          align: 'center',
        });
        Row({ width: 'fill', justifyContent: 'center' }, () => {
          Button(callbacks.buttonLabel ?? '迎战', {
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
      ...MODAL_NO_AUTOFOCUS,
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
    readonly title?: string;
    readonly lines?: readonly string[];
    readonly hint?: string;
    readonly wakeLabel?: string;
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
        Text('战斗 · 战败', { size: 'xs', tone: 'muted', align: 'center' });
        Text(options.title ?? '剧情战 · 战败', { size: 'xl', tone: 'danger', align: 'center' });
        Divider({});
        Text((options.lines ?? CH01_BATTLE_BANNER.defeat).join('\n'), {
          size: 'md',
          align: 'center',
        });
        Text(options.hint ?? '这不是游戏结束。你只是被踢出了梦域。', {
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
            Button(options.wakeLabel ?? '醒来', {
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
      ...MODAL_NO_AUTOFOCUS,
      dismissible: false,
      name: 'ch01-battle-defeat',
      onClose: options.onClose,
    },
  );
  return modal;
}

/**
 * 打赢后的收尾卡。
 *
 * 御膳房遭遇战打赢 = 回到地图继续潜行；预览里的胜利则给「重开 / 返回标题」，
 * 不能把验收者扔回一张没打开的地图。
 */
export function openBattleVictory(
  mvvm: MVVMPlugin,
  callbacks: {
    title: string;
    lines: readonly string[];
    preview: boolean;
    returnLabel?: string;
    onReturn: () => void;
    onRestart: () => void;
    onTitle: () => void;
    onClose: () => void;
  },
): ModalHandle {
  let modal: ModalHandle | null = null;
  modal = mvvm.modal.open(
    () => {
      Panel({ width: 640, padding: 32, gap: 14, variant: 'surface' }, () => {
        Text('战斗 · 解决', { size: 'xs', tone: 'muted', align: 'center' });
        Text(callbacks.title, { size: 'xl', tone: 'primary', align: 'center' });
        Divider({});
        Text(callbacks.lines.join('\n'), { size: 'md', align: 'center' });
        Row({ width: 'fill', gap: 12, justifyContent: 'center' }, () => {
          if (callbacks.preview) {
            Button('重开战斗', {
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
          } else {
            Button(callbacks.returnLabel ?? '回御膳房', {
              variant: 'primary',
              size: 'lg',
              width: 260,
              onClick: () => {
                modal?.close();
                callbacks.onReturn();
              },
            });
          }
        });
      });
    },
    {
      ...MODAL_NO_AUTOFOCUS,
      dismissible: false,
      name: 'ch01-battle-victory',
      onClose: callbacks.onClose,
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
