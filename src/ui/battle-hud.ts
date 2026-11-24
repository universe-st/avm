import { Branch, Button, Column, Panel, Row, Spacer, Text } from '@phaser-mvvm/widgets/compose';
import type { Ref } from '@phaser-mvvm/core';
import { buildDialoguePanel, buildStageHeader, type DialoguePanelModel } from './hud-kit';
import { BATTLE_HEAD_KEYS } from '../assets/keys';

/** 「确认攻击」的红色高亮/发光。 */
const CONFIRM_RED = 0xff5c4d;

export interface BattleHudModel {
  /** 顶栏右上角的短信息（行动数 / 敌方数量）。 */
  readonly turnLabel: Ref<string>;
  readonly playerLabel: Ref<string>;
  readonly hintText: Ref<string>;
  readonly logText: Ref<string>;
  readonly attackLabel: Ref<string>;
  /** 已选中有效目标：攻击键变成红色发光的「确认攻击」。 */
  readonly confirming: Ref<boolean>;
  readonly moveLabel: Ref<string>;
  /** 非玩家回合/动画中：三个按钮都灰。 */
  readonly actionsDisabled: Ref<boolean>;
  /** 没有「解」/移动选择中/未选目标：只灰攻击。 */
  readonly attackDisabled: Ref<boolean>;
  /** 移动选择中：灰防御（移动按钮保留为「取消移动」）。 */
  readonly guardDisabled: Ref<boolean>;
  readonly reduced: boolean;
  readonly onAttack: () => void;
  readonly onMove: () => void;
  readonly onGuard: () => void;
  /** 打开小白图鉴（跨战斗持久）。 */
  readonly onCodex: () => void;
  readonly onMenu: () => void;
  readonly location?: string;
  readonly subtitle?: string;
  /** 顶部原生行动表高度（与 planBattleLayout 的 railHeight 同源）。 */
  readonly railHeight: number;
  /**
   * 战斗中插入对话：和剧情对话同一个 `buildDialoguePanel`。
   *
   * 可见时**整块替换**底部指令区（不是叠在上面）：战斗中对话期间按钮本来就全禁用，
   * 留着只会露出三个灰按钮，破坏「过场对话」的观感。
   */
  readonly dialogue?: DialoguePanelModel;
}

/**
 * 战斗 v3 的 Compose HUD。
 *
 * 分工：
 * - **Compose 负责**顶栏、底部指令区、按钮、提示与日志；
 * - **原生层负责**行动表、角色、伤害数字；战场不再常显点位环/意图/名牌。
 *
 * 中间那段 Spacer 就是留给原生行动表的位置；高度从 layout 传入（v3.1 = 64）。
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
        subtitle: model.subtitle ?? '战斗 · 七点位',
        onMenu: model.onMenu,
      });

      // 原生行动表区（标题 + 头像 chip）。
      Spacer({ height: model.railHeight });

      // 战场（原生 sprite / 站位环 / 伤害数字）。
      Spacer({ grow: 1 });

      /**
       * 战斗对话与指令区**同一个槽位**：对话可见时整块换成底部对话面板，
       * 排版/字号/语义色与寝室·御膳房·金殿完全一致（都是 `buildDialoguePanel`）。
       */
      Branch(
        () => (model.dialogue?.visible.value === true ? 'talk' : 'actions'),
        {
          talk: () => {
            const dialogue = model.dialogue;
            if (dialogue) buildDialoguePanel(dialogue);
          },
          actions: () => buildActions(model),
        },
      );
    },
  );
}

/** 底部指令区（攻击 / 移动 / 防御 + 日志）。 */
function buildActions(model: BattleHudModel): void {
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
        Row({ width: 'fill', gap: 8, alignItems: 'center' }, () => {
          Text(() => model.playerLabel.value, { size: 'md', tone: 'primary' });
          Spacer({ grow: 1 });
          Button('小白', {
            icon: BATTLE_HEAD_KEYS.xiaobai,
            variant: 'secondary',
            size: 'sm',
            width: 104,
            onClick: model.onCodex,
          });
        });
        Text(() => model.hintText.value, {
          size: 'sm',
          tone: 'muted',
          wrap: true,
          maxLines: 2,
        });
        Row({ width: 'fill', gap: 12, justifyContent: 'center' }, () => {
          Button(() => model.attackLabel.value, {
            variant: () => (model.confirming.value ? 'secondary' : 'primary'),
            labelColor: () => (model.confirming.value ? CONFIRM_RED : null),
            glow: () => model.confirming.value && !model.reduced,
            glowColor: CONFIRM_RED,
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
}
