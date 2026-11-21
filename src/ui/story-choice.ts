import type { ModalHandle, MVVMPlugin } from '@phaser-mvvm/phaser';
import { Button, Column, Divider, Panel, Row, Text } from '@phaser-mvvm/widgets/compose';
import { audioDirector } from '../audio/audio-director';

/**
 * 剧情选项菜单（Compose 模态）。
 *
 * 这是「最小可用」的一套选项 UI，供`InquiryScript`（见 `src/story/inquiry.ts`）与以后
 * 的其它分支对话复用：
 * - 只负责画按钮并回调 `onPick`，不保存状态（问没问过由调用方的纯模型决定）；
 * - **不可关闭**：分支必须选一个（返回键/点遮罩都吞掉，不允许把剧情停在半空）；
 * - 遮罩压得很淡（0.22），底下的角色与场景还看得见——这是「选项」，不是「系统弹窗」；
 * - 按钮只写文案本身，**不编号**（用户 2026-11-21：「选项对话框每个选项前面不用加编号」）；
 *   问过的一项由调用方从 `items` 里去掉，剩下的也不重新编号。
 */
export interface StoryChoiceItem {
  /** 回传给 `onPick` 的稳定 id；收尾项用 `'closing'`。 */
  readonly id: string;
  readonly label: string;
}

export interface StoryChoiceOptions {
  /** 面板标题（例如「提问」）。 */
  readonly title: string;
  /** 标题下的一行小字；省略时不画。 */
  readonly hint?: string;
  readonly items: readonly StoryChoiceItem[];
  readonly onPick: (id: string) => void;
}

export function openStoryChoice(mvvm: MVVMPlugin, options: StoryChoiceOptions): ModalHandle {
  let modal: ModalHandle | null = null;
  const pick = (id: string): void => {
    audioDirector.playClick();
    modal?.close();
    options.onPick(id);
  };

  modal = mvvm.modal.open(
    () => {
      Panel({ width: 600, padding: 26, gap: 14, variant: 'surface' }, () => {
        Row({ width: 'fill', justifyContent: 'space-between', alignItems: 'center' }, () => {
          Text(options.title, { size: 'lg' });
          if (options.items.length > 1) {
            Text(`${options.items.length} 项`, { size: 'xs', tone: 'muted' });
          }
        });
        Divider({});
        Column({ width: 'fill', gap: 10, alignItems: 'stretch' }, () => {
          for (const item of options.items) {
            Button(item.label, {
              variant: 'secondary',
              size: 'md',
              onClick: () => pick(item.id),
            });
          }
        });
        if (options.hint) {
          Text(options.hint, { size: 'xs', tone: 'muted' });
        }
      });
    },
    {
      dismissible: false,
      scrim: 0.22,
      name: 'story-choice',
    },
  );
  return modal;
}
