import { Button, Column, Panel, Row, Spacer, Text } from '@phaser-mvvm/widgets/compose';
import type { Ref } from '@phaser-mvvm/core';
import { buildStageHeader } from './hud-kit';

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
  /** 遭遇战换掉金殿的抬头与副标题（省略时用金殿那场）。 */
  readonly location?: string;
  readonly subtitle?: string;
}

/**
 * 第一章剧情战的 Compose HUD（UI 层）。
 *
 * 顶部信息条与探索/过场共用；敌方名字放在独立名牌里，
 * 不再直接压在金色龙椅上（对比度不够，之前的实机截图里几乎看不清）。
 */
export function buildBattleCh01Hud(model: BattleCh01HudModel): void {
  Column(
    {
      width: 'fill',
      height: 'fill',
      padding: 0,
      gap: 0,
      alignItems: 'stretch',
    },
    () => {
      buildStageHeader({
        location: model.location ?? '梦域 / 金殿',
        chapter: '第一章 · 权力之梦',
        objective: model.roundLabel,
        subtitle: model.subtitle ?? '剧情战 · 矿场清除协议',
        onMenu: model.onMenu,
      });

      Panel(
        {
          width: 520,
          padding: 10,
          gap: 2,
          variant: 'surface',
          alignSelf: 'center',
          margin: { top: 4 },
        },
        () => {
          Text(() => model.enemyLabel.value, { size: 'sm', tone: 'danger', align: 'center' });
        },
      );

      Spacer({ grow: 1 });

      Column({ width: 'fill', padding: 24 }, () => {
        Panel({ width: 672, height: 350, padding: 22, gap: 10, variant: 'surface', alignSelf: 'center' }, () => {
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
      });
    },
  );
}
