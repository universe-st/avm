import type { ModalHandle, MVVMPlugin } from '@phaser-mvvm/phaser';
import { ref } from '@phaser-mvvm/core';
import { Branch, Button, Column, Divider, Panel, Row, Text } from '@phaser-mvvm/widgets/compose';
import type { HistoryEntry } from '../story/dialogue-history';
import { NARRATION_COLOR, TONE_TEXT_COLOR } from './hud-kit';

/** 每页条数：按 390×844 下 8 条刚好不溢出。 */
const PAGE_SIZE = 8;

function chunk(entries: readonly HistoryEntry[], size: number): HistoryEntry[][] {
  const pages: HistoryEntry[][] = [];
  for (let index = 0; index < entries.length; index += size) {
    pages.push(entries.slice(index, index + size));
  }
  return pages;
}

/**
 * 对话回看弹窗：分页展示最近 80 句。
 *
 * 不用 ScrollView 的原因：过场/地图对话都可能触发，弹窗生命周期短；
 * 分页只依赖 Branch，输入与焦点行为与现有模态一致，风险更低。
 */
export function openDialogueHistory(
  mvvm: MVVMPlugin,
  entries: readonly HistoryEntry[],
  callbacks: { onClose?: () => void } = {},
): ModalHandle {
  const pages = chunk(entries, PAGE_SIZE);
  const lastPage = Math.max(0, pages.length - 1);
  const pageRef = ref(lastPage);

  const branches: Record<string, () => void> = {};
  pages.forEach((pageEntries, index) => {
    branches[String(index)] = () => {
      Column({ width: 'fill', gap: 12, alignItems: 'stretch' }, () => {
        for (const entry of pageEntries) {
          Column({ width: 'fill', gap: 3, alignItems: 'start' }, () => {
            Text(entry.narration ? '旁白' : entry.speaker, {
              size: 'xs',
              tone: 'muted',
              style: { color: entry.narration ? NARRATION_COLOR : TONE_TEXT_COLOR.zheng },
            });
            Text(entry.text, {
              size: 'sm',
              wrap: true,
              style: { color: entry.narration ? NARRATION_COLOR : TONE_TEXT_COLOR.default },
            });
          });
        }
      });
    };
  });

  let modal: ModalHandle | null = null;
  modal = mvvm.modal.open(
    () => {
      Panel({ width: 640, padding: 26, gap: 14, variant: 'surface' }, () => {
        Row({ width: 'fill', justifyContent: 'space-between', alignItems: 'center' }, () => {
          Text('对话记录', { size: 'lg' });
          Text(() => (pages.length === 0 ? '' : `第 ${pageRef.value + 1} / ${pages.length} 页`), {
            size: 'xs',
            tone: 'muted',
          });
        });
        Divider({});

        if (pages.length === 0) {
          Text('还没有对话记录。', { size: 'md', tone: 'muted' });
        } else {
          Branch(() => String(pageRef.value), branches);
        }

        Divider({});
        Row({ width: 'fill', gap: 10, justifyContent: 'space-between', alignItems: 'center' }, () => {
          Row({ gap: 10 }, () => {
            Button('上一页', {
              variant: 'ghost',
              size: 'md',
              disabled: () => pageRef.value <= 0,
              onClick: () => {
                if (pageRef.value > 0) pageRef.value -= 1;
              },
            });
            Button('下一页', {
              variant: 'ghost',
              size: 'md',
              disabled: () => pageRef.value >= pages.length - 1,
              onClick: () => {
                if (pageRef.value < pages.length - 1) pageRef.value += 1;
              },
            });
          });
          Button('关闭', {
            variant: 'primary',
            size: 'md',
            width: 140,
            onClick: () => modal?.close(),
          });
        });
      });
    },
    {
      dismissible: true,
      name: 'dialogue-history',
      onClose: callbacks.onClose,
    },
  );
  return modal;
}
