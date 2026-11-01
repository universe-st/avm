import { Branch, Button, Column, Panel, Row, Text } from '@phaser-mvvm/widgets/compose';
import type { Ref } from '@phaser-mvvm/core';
import type { SpeakerTone } from '../story/dialogue';
import { settings } from '../app/settings';

/**
 * 全项目统一的阶段 HUD（探索 / 过场 / 战斗共用）。
 *
 * 只负责排版与绑定，不读剧情、不碰原生世界；所有动作由场景回调。
 * 之前三套 HUD 的面板宽、说话人字号、旁白颜色、按钮位置各写各的，这里收成一套。
 */

/** 旁白文字色：天蓝（语义色板里没有蓝，只在这一处用显式颜色）。 */
export const NARRATION_COLOR = '#87ceeb';

/** 说话人语义色：正文与说话人名共用，避免「小白」和「矿工」一个颜色。 */
export const TONE_TEXT_COLOR: Readonly<Record<SpeakerTone, string>> = {
  narration: NARRATION_COLOR,
  zhou: '#f2efe6',
  zheng: '#e9cc86',
  xiaobai: '#bfe9ff',
  miner: '#ff6b5b',
  default: '#f2efe6',
};

export function toneTextColor(tone: SpeakerTone): string {
  return TONE_TEXT_COLOR[tone] ?? TONE_TEXT_COLOR.default;
}

export interface StageHeaderModel {
  /** 左上角地点：`寝室 / 群英高中`、`梦域 / 金殿`。 */
  readonly location: string;
  /** 左上角章节：`第一章 · 权力之梦`；有目标时只显示目标。 */
  readonly chapter: string;
  /** 探索/战斗的目标文本；省略时显示章节名。 */
  readonly objective?: Ref<string>;
  /** 对话进行中：显示「跳过 / 自动 / 记录」。 */
  readonly dialogueVisible?: Ref<boolean>;
  readonly onSkip?: () => void;
  readonly onAuto?: () => void;
  readonly onHistory?: () => void;
  readonly onMenu: () => void;
  /** 战斗里不显示章节名，改成一个短标签（如「清除协议」）。 */
  readonly subtitle?: string;
}

const SMALL_BUTTON_WIDTH = 92;
/**
 * 顶部左侧信息栏的宽度预算（设计 px，720 宽减左右各 24 的内边距 = 672）。
 *
 * 对话时右上角会同时出现「跳过 / 自动 / 记录 / 菜单」四个 92px 按钮（4×92 + 3×8 = 392），
 * 左侧只剩 672 - 392 - 8 = 272。不收窄的话目标文字会把按钮顶出 390 宽屏幕：
 * 视线里就是「菜单」被切掉一半。
 */
const HEADER_TEXT_WIDE = 672 - SMALL_BUTTON_WIDTH - 8;
const HEADER_TEXT_DIALOGUE = 672 - (SMALL_BUTTON_WIDTH * 4 + 8 * 3) - 8;

/** 顶部信息条：左侧地点/目标，右侧操作按钮。 */
export function buildStageHeader(model: StageHeaderModel): void {
  Column(
    {
      width: 'fill',
      padding: 24,
      gap: 0,
      alignItems: 'stretch',
    },
    () => {
      Row({ width: 'fill', justifyContent: 'space-between', alignItems: 'start' }, () => {
        Column(
          {
            gap: 2,
            alignItems: 'start',
            width: () =>
              model.dialogueVisible?.value === true ? HEADER_TEXT_DIALOGUE : HEADER_TEXT_WIDE,
          },
          () => {
            Text(model.location, { size: 'xs', tone: 'muted', maxLines: 1, ellipsis: true });
            if (model.objective) {
              Text(() => model.objective?.value ?? '', {
                size: 'md',
                tone: 'primary',
                // 最宽也只有 272（对话时），长目标最多两行；三行会顶到右上角按钮。
                maxLines: 2,
                ellipsis: true,
              });
              if (model.subtitle) {
                Text(model.subtitle, { size: 'xs', tone: 'muted', maxLines: 1, ellipsis: true });
              }
            } else {
              Text(model.chapter, { size: 'sm', tone: 'primary', maxLines: 1, ellipsis: true });
            }
          },
        );

        Row({ gap: 8, alignItems: 'center' }, () => {
          if (model.onSkip) {
            Button('跳过', {
              variant: 'secondary',
              size: 'sm',
              width: SMALL_BUTTON_WIDTH,
              visible: () => model.dialogueVisible?.value === true,
              onClick: model.onSkip,
            });
          }
          if (model.onAuto) {
            Button(() => (settings.autoAdvance ? '自动·开' : '自动'), {
              variant: 'ghost',
              size: 'sm',
              width: SMALL_BUTTON_WIDTH,
              visible: () => model.dialogueVisible?.value === true,
              onClick: model.onAuto,
            });
          }
          if (model.onHistory) {
            Button('记录', {
              variant: 'ghost',
              size: 'sm',
              width: SMALL_BUTTON_WIDTH,
              visible: () => model.dialogueVisible?.value === true,
              onClick: model.onHistory,
            });
          }
          Button('菜单', {
            variant: 'ghost',
            size: 'sm',
            width: SMALL_BUTTON_WIDTH,
            onClick: model.onMenu,
          });
        });
      });
    },
  );
}

export interface DialoguePanelModel {
  /** 说话人显示名；旁白传入空字符串。 */
  readonly speaker: Ref<string>;
  /** 当前句的语义色档位。 */
  readonly tone: Ref<SpeakerTone>;
  readonly text: Ref<string>;
  /** `继续` / `补全` / `点击继续`。 */
  readonly hint: Ref<string>;
  readonly pageIndex: Ref<number>;
  readonly pageCount: Ref<number>;
  readonly visible: Ref<boolean>;
}

/**
 * 底部对话面板：固定 672×300，正文 34px / 最多 5 行。
 *
 * 面板只展示；「点屏幕任意位置推进」由场景的全局指针处理，按钮点击区域除外。
 * 正文按 tone 换色：旁白天蓝、小白淡青、矿工朱红、其余纸白。
 */
export function buildDialoguePanel(model: DialoguePanelModel): void {
  Panel(
    {
      width: 672,
      height: 300,
      padding: 22,
      gap: 8,
      variant: 'surface',
      margin: { bottom: 4 },
      visible: () => model.visible.value,
    },
    () => {
      Row({ width: 628, justifyContent: 'space-between', alignItems: 'center' }, () => {
        Row({ gap: 8, alignItems: 'center' }, () => {
          Text(() => model.speaker.value, {
            size: 'sm',
            style: { color: TONE_TEXT_COLOR.zheng },
          });
          Text(() => (model.pageCount.value > 1
            ? `${model.pageIndex.value + 1}/${model.pageCount.value}`
            : ''), { size: 'xs', tone: 'muted' });
        });
        Text(() => model.hint.value, { size: 'xs', tone: 'muted' });
      });

      Branch(() => {
        const tone = model.tone.value;
        if (tone === 'narration') return 'narration';
        if (tone === 'xiaobai') return 'xiaobai';
        if (tone === 'miner') return 'miner';
        return 'speech';
      }, {
        narration: () => {
          Text(() => model.text.value, {
            size: 'lg',
            wrap: true,
            maxLines: 5,
            style: { color: NARRATION_COLOR },
          });
        },
        xiaobai: () => {
          Text(() => model.text.value, {
            size: 'lg',
            wrap: true,
            maxLines: 5,
            style: { color: TONE_TEXT_COLOR.xiaobai },
          });
        },
        miner: () => {
          Text(() => model.text.value, {
            size: 'lg',
            wrap: true,
            maxLines: 5,
            style: { color: TONE_TEXT_COLOR.miner },
          });
        },
        speech: () => {
          Text(() => model.text.value, {
            size: 'lg',
            wrap: true,
            maxLines: 5,
            style: { color: TONE_TEXT_COLOR.default },
          });
        },
      });
    },
  );
}
