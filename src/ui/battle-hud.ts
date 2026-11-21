import { Button, Column, Panel, Row, Spacer, Text } from '@phaser-mvvm/widgets/compose';
import type { Ref } from '@phaser-mvvm/core';
import { buildStageHeader } from './hud-kit';

export interface BattleHudModel {
  /** 顶栏右上角的短信息（SPD / 行动数）。 */
  readonly turnLabel: Ref<string>;
  readonly playerLabel: Ref<string>;
  readonly hintText: Ref<string>;
  readonly logText: Ref<string>;
  readonly attackLabel: Ref<string>;
  readonly moveLabel: Ref<string>;
  /** 非玩家回合/动画中：三个按钮都灰。 */
  readonly actionsDisabled: Ref<boolean>;
  /** 没有「解」/移动选择中：只灰攻击。 */
  readonly attackDisabled: Ref<boolean>;
  /** 移动选择中：灰防御（移动按钮保留为「取消移动」）。 */
  readonly guardDisabled: Ref<boolean>;
  readonly onAttack: () => void;
  readonly onMove: () => void;
  readonly onGuard: () => void;
  readonly onMenu: () => void;
  readonly location?: string;
  readonly subtitle?: string;
}

/**
 * 战斗 v2 的 Compose HUD。
 *
 * 分工：
 * - **Compose 负责**顶栏、底部指令区、按钮、提示与日志；
 * - **原生层负责**跑条/行动条、意图、怪物名牌、6 个站位环、角色、伤害数字
 *   （它们要跟着战场坐标走，放进 Compose 反而会错位）。
 *
 * 中间那段 `Spacer(118)` 就是留给原生跑条的位置：Compose 不画背景，
 * 原生文字/条形图在它下面一层，视觉上是一整块顶部信息区。
 */
export function buildBattleHud(model: BattleHudModel): void {
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
        objective: model.turnLabel,
        subtitle: model.subtitle ?? '战斗 · 六站位跑条',
        onMenu: model.onMenu,
      });

      // 原生跑条区（8 向朝向/行动条/意图都画在这段里）。
      Spacer({ height: 118 });

      // 战场（原生 sprite / 站位环 / 伤害数字）。
      Spacer({ grow: 1 });

      Column({ width: 'fill', padding: 24 }, () => {
        Panel(
          {
            width: 672,
            height: 350,
            padding: 20,
            gap: 8,
            variant: 'surface',
            alignSelf: 'center',
          },
          () => {
            Text(() => model.playerLabel.value, { size: 'md', tone: 'primary' });
            Text(() => model.hintText.value, {
              size: 'sm',
              tone: 'muted',
              wrap: true,
              maxLines: 2,
            });
            Row({ width: 'fill', gap: 12, justifyContent: 'center' }, () => {
              Button(() => model.attackLabel.value, {
                variant: 'primary',
                size: 'lg',
                width: 208,
                disabled: () => model.attackDisabled.value,
                onClick: model.onAttack,
              });
              Button(() => model.moveLabel.value, {
                variant: 'secondary',
                size: 'lg',
                width: 208,
                disabled: () => model.actionsDisabled.value,
                onClick: model.onMove,
              });
              Button('防御', {
                variant: 'secondary',
                size: 'lg',
                width: 208,
                disabled: () => model.guardDisabled.value,
                onClick: model.onGuard,
              });
            });
            Text(() => model.logText.value, {
              size: 'sm',
              tone: 'muted',
              wrap: true,
              maxLines: 2,
            });
          },
        );
      });
    },
  );
}
