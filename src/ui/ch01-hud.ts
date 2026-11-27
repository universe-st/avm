import { Branch, Button, Column, Panel, Row, Spacer, Text } from '@phaser-mvvm/widgets/compose';
import type { Ref } from '@phaser-mvvm/core';
import type { Label } from '@phaser-mvvm/widgets';
import type { SpeakerTone } from '../story/dialogue';
import { buildDialoguePanel, buildStageHeader } from './hud-kit';

export interface Ch01HudModel {
  readonly objective: Ref<string>;
  readonly dialogueVisible: Ref<boolean>;
  readonly dialogueSpeaker: Ref<string>;
  /** 当前句的语义色档位（旁白 / 小白 / 矿工 / 普通）。 */
  readonly dialogueTone: Ref<SpeakerTone>;
  readonly dialogueText: Ref<string>;
  readonly dialogueHint: Ref<string>;
  readonly dialoguePageIndex: Ref<number>;
  readonly dialoguePageCount: Ref<number>;
  readonly interactLabel: Ref<string>;
  readonly interactAvailable: Ref<boolean>;
  readonly cardActive: Ref<boolean>;
  /**
   * 表演进行中（坐定/白光/起身）。
   *
   * 表演期间 `interactAvailable` 一定是 false，但「disabled 的按钮」仍会画出来——
   * 玩家会看到右下角挂着一个灰按钮。这里单独开一条分支，整块不渲染。
   */
  readonly performanceActive: Ref<boolean>;
  /**
   * 选项菜单打开中（`openStoryChoice` 的模态）。
   *
   * 此时对话面板已收起，但底部也不该露出「交互」灰按钮——整块留空，
   * 让视线落在模态里的选项上。
   */
  readonly choiceActive: Ref<boolean>;
  /** 新手指引：进入探索时出现，首次移动后消失。 */
  readonly tutorialVisible: Ref<boolean>;
  readonly onMenu: () => void;
  /** 跳过当前整段对话。 */
  readonly onSkipDialogue: () => void;
  readonly onAuto: () => void;
  readonly onHistory: () => void;
  readonly onInteract: () => void;
  /**
   * 说话人标签实体：给「名字从白色小精灵变成小白」的 `rename` 演出当锚点
   * （特效是 Label 的子对象，见 `src/ui/name-rename-fx.ts`）。
   */
  readonly onSpeakerLabel?: (label: Label) => void;
}

/**
 * 第一章寝室的 Compose HUD（UI 层）。
 *
 * 只画顶部信息条、新手指引、对话面板与交互按钮；不读剧情、不碰原生世界。
 * 顶部与对话面板走 `hud-kit`，与金殿/战斗保持同一套排版。
 */
export function buildCh01Hud(model: Ch01HudModel): void {
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
        location: '寝室 / 群英高中',
        chapter: '第一章 · 权力之梦',
        objective: model.objective,
        dialogueVisible: model.dialogueVisible,
        onSkip: model.onSkipDialogue,
        onAuto: model.onAuto,
        onHistory: model.onHistory,
        onMenu: model.onMenu,
      });

      Panel(
        {
          width: 600,
          padding: 18,
          gap: 6,
          variant: 'surface',
          alignSelf: 'center',
          // 寝室图顶部固定（设计高 1280–1600 时房间都在 y≈96–160 起），
          // 顶部横幅会压住桌前的周全和右上床的郑卿；margin 把指引压到两排床之间的空走廊。
          margin: { top: 600 },
          visible: () => model.tutorialVisible.value,
        },
        () => {
          Text('新手指引', { size: 'sm', tone: 'primary' });
          Text('移动：拖动左下摇杆，或按方向键', { size: 'md' });
          Text('靠近目标后，按 E 或点右下「交互」', { size: 'md', tone: 'muted' });
        },
      );

      Spacer({ grow: 1 });

      Branch(
        () =>
          model.dialogueVisible.value
            ? 'dialogue'
            : model.cardActive.value
              ? 'card'
              : model.performanceActive.value
                ? 'performance'
                : model.choiceActive.value
                  ? 'choice'
                  : 'explore',
        {
          dialogue: () => {
            /**
             * 面板只展示：**点屏幕任意位置**都算「补全 / 继续」，
             * 由场景的全局指针处理（`onScenePointerDown`）统一推进，
             * 这样摇杆区、面板、空白处都能点，不用玩家对准。
             */
            buildDialoguePanel({
              speaker: model.dialogueSpeaker,
              tone: model.dialogueTone,
              text: model.dialogueText,
              hint: model.dialogueHint,
              pageIndex: model.dialoguePageIndex,
              pageCount: model.dialoguePageCount,
              visible: model.dialogueVisible,
              ...(model.onSpeakerLabel ? { onSpeakerLabel: model.onSpeakerLabel } : {}),
            });
          },
          card: () => {
            Spacer({ grow: 0 });
          },
          // 表演期间整块留空：不画按钮、不画提示，避免灰按钮挂在画面上。
          performance: () => {
            Spacer({ grow: 0 });
          },
          // 选项菜单打开时同理：底部留空，视线交给模态。
          choice: () => {
            Spacer({ grow: 0 });
          },
          explore: () => {
            Column({ width: 'fill', padding: 24 }, () => {
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
            });
          },
        },
      );
    },
  );
}
