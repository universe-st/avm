import { Branch, Button, Column, Panel, Row, Spacer, Text } from '@phaser-mvvm/widgets/compose';
import type { Ref } from '@phaser-mvvm/core';

/** 旁白文字色：天蓝。语义色板里没有蓝，所以只在这一处用显式颜色。 */
const NARRATION_TEXT_COLOR = '#87ceeb';

export interface Ch01HudModel {
  readonly objective: Ref<string>;
  readonly dialogueVisible: Ref<boolean>;
  readonly dialogueSpeaker: Ref<string>;
  /** 当前这句是不是旁白：不显示说话人，文字用天蓝色。 */
  readonly dialogueNarration: Ref<boolean>;
  readonly dialogueText: Ref<string>;
  readonly dialogueHint: Ref<string>;
  readonly interactLabel: Ref<string>;
  readonly interactAvailable: Ref<boolean>;
  readonly cardActive: Ref<boolean>;
  /** 新手指引：进入探索时出现，首次移动后消失。 */
  readonly tutorialVisible: Ref<boolean>;
  readonly onMenu: () => void;
  readonly onContinue: () => void;
  /** 跳过当前整段对话。 */
  readonly onSkipDialogue: () => void;
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
          Branch(
            () => (model.dialogueVisible.value ? 'skip' : 'none'),
            {
              skip: () => {
                Button('跳过', {
                  variant: 'secondary',
                  size: 'sm',
                  width: 88,
                  onClick: model.onSkipDialogue,
                });
              },
              none: () => {
                // Branch 的每个分支都必须产出 widget。
                Text('');
              },
            },
          );
          Button('菜单', {
            variant: 'ghost',
            size: 'sm',
            width: 88,
            onClick: model.onMenu,
          });
        });
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
              : 'explore',
        {
          dialogue: () => {
            /**
             * 对话面板只是展示：**点屏幕任意位置**都算「补全 / 继续」，
             * 由场景的全局指针处理（`onScenePointerDown`）统一推进，
             * 这样摇杆区、面板、空白处都能点，不用玩家对准。
             */
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
                /**
                 * 字号 34（lg）、最多 5 行：面板固定 300 高（用户要求锁定），
                 * 一页放得下 5 行 × 约 14 字 ≈ 68 字；超出的由播放器分页
                 * （`DIALOGUE_PAGE_CHARS`），点一下翻下一页。
                 * 未打完的部分用全角空格占位，所以行数不会随打字跳动。
                 *
                 * 旁白换天蓝色；两个分支的字号/换行完全一致，切换时高度不跳。
                 */
                Branch(
                  () => (model.dialogueNarration.value ? 'narration' : 'speech'),
                  {
                    narration: () => {
                      Text(() => model.dialogueText.value, {
                        size: 'lg',
                        wrap: true,
                        maxLines: 5,
                        style: { color: NARRATION_TEXT_COLOR },
                      });
                    },
                    speech: () => {
                      Text(() => model.dialogueText.value, {
                        size: 'lg',
                        wrap: true,
                        maxLines: 5,
                      });
                    },
                  },
                );
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
