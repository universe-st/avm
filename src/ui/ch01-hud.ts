import { Branch, Button, Column, Panel, Row, Spacer, Text } from '@phaser-mvvm/widgets/compose';
import type { Ref } from '@phaser-mvvm/core';

export interface Ch01HudModel {
  readonly objective: Ref<string>;
  readonly dialogueVisible: Ref<boolean>;
  readonly dialogueSpeaker: Ref<string>;
  readonly dialogueText: Ref<string>;
  readonly dialogueHint: Ref<string>;
  readonly interactLabel: Ref<string>;
  readonly interactAvailable: Ref<boolean>;
  readonly cardActive: Ref<boolean>;
  readonly onMenu: () => void;
  readonly onContinue: () => void;
  readonly onInteract: () => void;
}

/**
 * 第一章寝室的 Compose HUD（UI 层）。
 *
 * 只画目标条、对话面板、交互按钮；不读剧情、不碰原生世界。
 * 场景把 ref 与回调传进来；按钮点击音/动作由场景回调负责。
 */
export function buildCh01Hud(model: Ch01HudModel): void {
  Column(
    {
      width: 'fill',
      height: 'fill',
      padding: 24,
      gap: 12,
      alignItems: 'stretch',
    },
    () => {
      Row({ width: 'fill', justifyContent: 'space-between', alignItems: 'start' }, () => {
        Column({ gap: 2, alignItems: 'start' }, () => {
          Text('目标', { size: 'xs', tone: 'muted' });
          Text(() => model.objective.value, { size: 'md', tone: 'primary' });
        });
        Row({ gap: 10, alignItems: 'center' }, () => {
          Text('寝室 / 群英高中', { size: 'sm', tone: 'muted' });
          Button('菜单', {
            variant: 'ghost',
            size: 'sm',
            width: 88,
            onClick: model.onMenu,
          });
        });
      });

      Spacer({ grow: 1 });

      Branch(
        () =>
          model.dialogueVisible.value
            ? 'dialogue'
            : model.cardActive.value
              ? 'card'
              : 'explore',
        {
          dialogue: () => {
            Panel(
              {
                width: 672,
                height: 300,
                padding: 22,
                gap: 8,
                variant: 'surface',
              },
              () => {
                Text(() => model.dialogueSpeaker.value, { size: 'sm', tone: 'primary' });
                Text(() => model.dialogueText.value, { size: 'md', wrap: true, maxLines: 6 });
                Spacer({ grow: 1 });
                Row({ width: 'fill', justifyContent: 'end' }, () => {
                  Button(() => model.dialogueHint.value, {
                    variant: 'primary',
                    size: 'md',
                    width: 168,
                    onClick: model.onContinue,
                  });
                });
              },
            );
          },
          card: () => {
            Spacer({ grow: 0 });
          },
          explore: () => {
            Row({ width: 'fill', justifyContent: 'space-between', alignItems: 'end' }, () => {
              Spacer({ grow: 1 });
              Button(() => model.interactLabel.value, {
                variant: 'primary',
                size: 'lg',
                width: 168,
                disabled: () => !model.interactAvailable.value,
                onClick: model.onInteract,
              });
            });
          },
        },
      );
    },
  );
}
