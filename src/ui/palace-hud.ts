import { Button, Column, Panel, Row, Spacer, Text } from '@phaser-mvvm/widgets/compose';
import type { Ref } from '@phaser-mvvm/core';

export interface PalaceHudModel {
  readonly sayVisible: Ref<boolean>;
  readonly saySpeaker: Ref<string>;
  readonly sayText: Ref<string>;
  readonly sayHint: Ref<string>;
  readonly onSkip: () => void;
}

/**
 * 梦域金殿的 Compose HUD。
 *
 * 这场是纯演出：没有摇杆、没有目标条，只有底部的说话面板和右上角「跳过」。
 * 点屏幕任意处都能推进一句（由场景的全局指针处理），面板本身只负责显示。
 */
export function buildPalaceHud(model: PalaceHudModel): void {
  Column(
    {
      width: 'fill',
      height: 'fill',
      padding: 20,
      gap: 10,
      alignItems: 'stretch',
    },
    () => {
      Row({ width: 'fill', justifyContent: 'space-between', alignItems: 'start' }, () => {
        Column({ gap: 2, alignItems: 'start' }, () => {
          Text('梦域 / 金殿', { size: 'xs', tone: 'muted' });
          Text('第一章 · 权力之梦', { size: 'sm', tone: 'primary' });
        });
        Button('跳过', {
          variant: 'ghost',
          size: 'sm',
          width: 88,
          onClick: () => model.onSkip(),
        });
      });

      Spacer({ grow: 1 });

      Panel(
        {
          width: 616,
          padding: 16,
          gap: 6,
          margin: { bottom: 4 },
          variant: 'surface',
          alignSelf: 'center',
          visible: () => model.sayVisible.value,
        },
        () => {
          Row({ width: 584, justifyContent: 'space-between' }, () => {
            Text(() => model.saySpeaker.value, { size: 'sm', tone: 'primary' });
            Text(() => model.sayHint.value, { size: 'xs', tone: 'muted' });
          });
          Text(() => model.sayText.value, { size: 'md', wrap: true });
        },
      );
    },
  );
}
