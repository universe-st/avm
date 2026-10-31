import { Column, Spacer } from '@phaser-mvvm/widgets/compose';
import type { Ref } from '@phaser-mvvm/core';
import type { SpeakerTone } from '../story/dialogue';
import { buildDialoguePanel, buildStageHeader } from './hud-kit';

export interface PalaceHudModel {
  readonly sayVisible: Ref<boolean>;
  readonly saySpeaker: Ref<string>;
  readonly sayTone: Ref<SpeakerTone>;
  readonly sayText: Ref<string>;
  readonly sayHint: Ref<string>;
  readonly pageIndex: Ref<number>;
  readonly pageCount: Ref<number>;
  readonly onSkip: () => void;
  readonly onAuto: () => void;
  readonly onHistory: () => void;
  readonly onMenu: () => void;
}

/**
 * 梦域金殿的 Compose HUD。
 *
 * 这场是纯演出：没有摇杆、没有目标条，只有顶部信息条和底部说话面板。
 * 点屏幕任意处都能推进一句（由场景的全局指针处理），面板本身只负责显示。
 */
export function buildPalaceHud(model: PalaceHudModel): void {
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
        location: '梦域 / 金殿',
        chapter: '第一章 · 权力之梦',
        dialogueVisible: model.sayVisible,
        onSkip: model.onSkip,
        onAuto: model.onAuto,
        onHistory: model.onHistory,
        onMenu: model.onMenu,
      });

      Spacer({ grow: 1 });

      buildDialoguePanel({
        speaker: model.saySpeaker,
        tone: model.sayTone,
        text: model.sayText,
        hint: model.sayHint,
        pageIndex: model.pageIndex,
        pageCount: model.pageCount,
        visible: model.sayVisible,
      });
    },
  );
}
