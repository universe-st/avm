import { Button, Column, Panel, Row, Spacer, Text } from '@phaser-mvvm/widgets/compose';
import type { Ref } from '@phaser-mvvm/core';

export interface BattleCh01HudModel {
  readonly roundLabel: Ref<string>;
  readonly enemyLabel: Ref<string>;
  readonly playerLabel: Ref<string>;
  readonly logText: Ref<string>;
  readonly hintText: Ref<string>;
  readonly actionsDisabled: Ref<boolean>;
  readonly onAttack: () => void;
  readonly onGuard: () => void;
  readonly onMenu: () => void;
}

/** 第一章剧情战的 Compose HUD（UI 层）。 */
export function buildBattleCh01Hud(model: BattleCh01HudModel): void {
  Column(
    {
      width: 'fill',
      height: 'fill',
      padding: 24,
      gap: 10,
      alignItems: 'stretch',
    },
    () => {
      Row({ width: 'fill', justifyContent: 'space-between', alignItems: 'center' }, () => {
        Column({ gap: 2, alignItems: 'start' }, () => {
          Text(() => model.roundLabel.value, { size: 'md', tone: 'primary' });
          Text('梦域 · 金殿', { size: 'xs', tone: 'muted' });
        });
        Button('菜单', {
          variant: 'ghost',
          size: 'sm',
          width: 88,
          onClick: model.onMenu,
        });
      });

      Text(() => model.enemyLabel.value, { size: 'sm', tone: 'danger' });
      Spacer({ grow: 1 });

      Panel({ width: 672, height: 360, padding: 22, gap: 10, variant: 'surface' }, () => {
        Text(() => model.playerLabel.value, { size: 'md', tone: 'primary' });
        Text(() => model.hintText.value, { size: 'sm', tone: 'muted' });
        Row({ width: 'fill', gap: 14, justifyContent: 'center' }, () => {
          Button('攻击', {
            variant: 'primary',
            size: 'lg',
            width: 220,
            disabled: () => model.actionsDisabled.value,
            onClick: model.onAttack,
          });
          Button('防御', {
            variant: 'secondary',
            size: 'lg',
            width: 220,
            disabled: () => model.actionsDisabled.value,
            onClick: model.onGuard,
          });
        });
        Text(() => model.logText.value, { size: 'sm', tone: 'muted', wrap: true, maxLines: 2 });
      });
    },
  );
}
