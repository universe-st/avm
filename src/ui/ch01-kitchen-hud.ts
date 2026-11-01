import { Branch, Button, Column, Image, Panel, Row, Spacer, Text } from '@phaser-mvvm/widgets/compose';
import type { Ref } from '@phaser-mvvm/core';
import type { SpeakerTone } from '../story/dialogue';
import { buildDialoguePanel, buildStageHeader } from './hud-kit';
import { CH01_KITCHEN_ASSET_KEYS } from '../assets/keys';

export interface KitchenHudModel {
  readonly objective: Ref<string>;
  readonly dialogueVisible: Ref<boolean>;
  readonly dialogueSpeaker: Ref<string>;
  readonly dialogueTone: Ref<SpeakerTone>;
  readonly dialogueText: Ref<string>;
  readonly dialogueHint: Ref<string>;
  readonly dialoguePageIndex: Ref<number>;
  readonly dialoguePageCount: Ref<number>;
  readonly interactLabel: Ref<string>;
  readonly interactAvailable: Ref<boolean>;
  readonly backstabAvailable: Ref<boolean>;
  readonly sneakOn: Ref<boolean>;
  readonly alertText: Ref<string>;
  readonly tutorialVisible: Ref<boolean>;
  readonly cardActive: Ref<boolean>;
  /** 本节结束（结束卡/失败卡）后隐藏底部操作条。 */
  readonly runOver: Ref<boolean>;
  readonly onMenu: () => void;
  readonly onSkipDialogue: () => void;
  readonly onAuto: () => void;
  readonly onHistory: () => void;
  readonly onInteract: () => void;
  readonly onBackstab: () => void;
  readonly onSneak: () => void;
}

/**
 * 第一章第二节（P1 白盒）的 Compose HUD。
 *
 * 顶部沿用 hud-kit；底部是「潜行 / 偷袭 / 交互」三键 + 警戒提示。
 * 摇杆仍是原生 `VirtualJoystick`（屏幕坐标），不在 Compose 树里。
 */
export function buildKitchenHud(model: KitchenHudModel): void {
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
        location: '御膳房 / 梦域',
        chapter: '第一章 · 权力之梦',
        objective: model.objective,
        dialogueVisible: model.dialogueVisible,
        onSkip: model.onSkipDialogue,
        onAuto: model.onAuto,
        onHistory: model.onHistory,
        onMenu: model.onMenu,
      });

      Text(() => model.alertText.value, {
        size: 'sm',
        align: 'center',
        alignSelf: 'center',
        style: { color: '#ff6b5b' },
        visible: () => model.alertText.value !== '',
      });

      Panel(
        {
          width: 620,
          padding: 18,
          gap: 6,
          variant: 'surface',
          alignSelf: 'center',
          margin: { top: 260 },
          visible: () => model.tutorialVisible.value,
        },
        () => {
          Text('新手指引', { size: 'sm', tone: 'primary' });
          Text('推方向看视锥；墙和柜子会挡住视线', { size: 'md' });
          Text('从背后靠近敌人，按「偷袭」；靠近干草堆/橱柜按「交互」躲藏', {
            size: 'md',
            tone: 'muted',
          });
        },
      );

      Spacer({ grow: 1 });

      Branch(
        () =>
          model.dialogueVisible.value
            ? 'dialogue'
            : model.runOver.value
              ? 'over'
              : model.cardActive.value
                ? 'card'
                : 'explore',
        {
          over: () => {
            // 结束卡/失败卡盖在上面时，底部操作条整块收掉，
            // 免得「离开」这类按钮还留在屏幕上（update() 在 done/failed 已提前 return）。
            Spacer({ grow: 0 });
          },
          dialogue: () => {
            buildDialoguePanel({
              speaker: model.dialogueSpeaker,
              tone: model.dialogueTone,
              text: model.dialogueText,
              hint: model.dialogueHint,
              pageIndex: model.dialoguePageIndex,
              pageCount: model.dialoguePageCount,
              visible: model.dialogueVisible,
            });
          },
          card: () => {
            Spacer({ grow: 0 });
          },
          explore: () => {
            Column({ width: 'fill', padding: 24, gap: 10 }, () => {
              Row({ width: 'fill', justifyContent: 'end', alignItems: 'center', gap: 8 }, () => {
                Image({ texture: CH01_KITCHEN_ASSET_KEYS.ui.footprints, width: 20, height: 20 });
                Button(() => (model.sneakOn.value ? '潜行·开' : '潜行'), {
                  variant: 'secondary',
                  size: 'sm',
                  width: 116,
                  onClick: model.onSneak,
                });
                Image({ texture: CH01_KITCHEN_ASSET_KEYS.ui.dagger, width: 20, height: 20 });
                Button('偷袭', {
                  variant: 'primary',
                  size: 'sm',
                  width: 116,
                  disabled: () => !model.backstabAvailable.value,
                  onClick: model.onBackstab,
                });
              });
              Row({ width: 'fill', justifyContent: 'end', alignItems: 'center', gap: 8 }, () => {
                Image({ texture: CH01_KITCHEN_ASSET_KEYS.ui.screen, width: 20, height: 20 });
                Button(() => model.interactLabel.value, {
                  variant: 'primary',
                  size: 'lg',
                  width: 168,
                  disabled: () => !model.interactAvailable.value,
                  onClick: model.onInteract,
                });
              });
            });
          },
        },
      );
    },
  );
}
