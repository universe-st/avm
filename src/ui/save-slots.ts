import type { ModalHandle, MVVMPlugin } from '@phaser-mvvm/phaser';
import { Button, Column, Divider, Panel, Row, Text } from '@phaser-mvvm/widgets/compose';
import { readAllSlots, slotLabel, type SaveSlotSummary } from '../app/save/save-store';
import type { SaveSlotId } from '../app/save/schema';
import { MODAL_NO_AUTOFOCUS } from './modal-guard';

/**
 * 存档位列表（UI 层）：标题页读档与场景内菜单共用这一份渲染。
 *
 * 只负责「把槽位画成三行 + 报告玩家点了哪一槽」；写盘/读档/二次确认由调用方决定，
 * 这样标题页（直接读）和场景内菜单（先确认再读）能复用同一张列表。
 */

export type SaveSlotMode = 'save' | 'load';

export interface SaveSlotListOptions {
  readonly mode: SaveSlotMode;
  readonly slots: readonly SaveSlotSummary[];
  readonly onPick: (slot: SaveSlotId) => void;
  /**
   * 保存模式下「现在不能存档」的原因；非空时三行全部禁用并显示提示。
   * 读取模式传 null（空槽/坏槽自己会禁用）。
   */
  readonly blockedMessage?: string | null;
}

function statusLine(summary: SaveSlotSummary): string {
  switch (summary.status) {
    case 'ok':
      return '';
    case 'unsupported-version':
      return '存档版本不兼容，可用新存档覆盖';
    case 'corrupt':
      return '存档损坏，可用新存档覆盖';
    default:
      return '空档位';
  }
}

/**
 * 一个槽位的两行元信息。
 *
 * - 有存档：`第 N 槽 · 时间` / `章节 · 场景 · 目标摘要`；
 * - 空槽/坏槽：`第 N 槽 · 状态`（`slotLabel()` 已带状态，别再重复一行）；
 *   坏槽多一句「可用新存档覆盖」，否则玩家会以为这槽废了。
 */
function renderSlotHead(summary: SaveSlotSummary): void {
  if (summary.status === 'ok' && summary.meta) {
    const meta = summary.meta;
    Text(`第 ${summary.slot} 槽 · ${meta.timeLabel}`, { size: 'xs', tone: 'muted' });
    Text(`${meta.chapterLabel} · ${meta.sceneLabel}`, { size: 'sm', maxLines: 1, ellipsis: true });
    // 目标单独一行：和「章节 · 场景」挤一行时，390 宽会被省略号吃掉半句。
    Text(`目标：${meta.objective}`, { size: 'xs', tone: 'muted', maxLines: 1, ellipsis: true });
    return;
  }
  Text(slotLabel(summary), { size: 'sm' });
  // 空槽的第二行写「空档位」是重复信息（`slotLabel()` 已经写了），只留坏槽的解释。
  if (summary.status !== 'empty') {
    Text(statusLine(summary), { size: 'xs', tone: 'muted' });
  }
}

/**
 * 三行槽位列表（Column 根，可直接放进 Branch 分支）。
 *
 * `mode === 'save'` 时空槽显示「存入」、已有存档显示「覆盖」；
 * `mode === 'load'` 时只有可读槽位能按。
 */
export function renderSaveSlotList(options: SaveSlotListOptions): void {
  const { mode, slots, onPick } = options;
  const blocked = options.blockedMessage ?? null;
  Column({ width: 'fill', gap: 10, alignItems: 'stretch' }, () => {
    if (blocked !== null) {
      Text(blocked, { size: 'sm', tone: 'muted' });
    }
    for (const summary of slots) {
      const readable = summary.status === 'ok';
      const disabled = mode === 'load' ? !readable : blocked !== null;
      // 按钮名带槽位号：三个「存入」在无障碍镜像/读屏里分不出来，也没法被脚本按名字点。
      const label =
        mode === 'load'
          ? `读取第 ${summary.slot} 槽`
          : readable
            ? `覆盖第 ${summary.slot} 槽`
            : `存入第 ${summary.slot} 槽`;
      Panel(
        {
          width: 'fill',
          padding: 14,
          gap: 4,
          variant: 'surfaceAlt',
          radius: 4,
        },
        () => {
          Row({ width: 'fill', gap: 12, alignItems: 'center' }, () => {
            // `shrink` 必须给：目标摘要可能比剩余宽度长，不给就会把行撑出面板（按钮压到边框上）。
            Column({ grow: 1, shrink: 1, gap: 3, alignItems: 'start' }, () => {
              renderSlotHead(summary);
            });
            Button(label, {
              variant: readable && mode === 'load' ? 'primary' : 'secondary',
              size: 'sm',
              // 按钮名带槽位号（5 个汉字）后 112 宽会把字截掉，实测 390 宽下要 160。
              width: 160,
              disabled,
              onClick: () => onPick(summary.slot),
            });
          });
        },
      );
    }
  });
}

export interface LoadSlotsModalOptions {
  readonly title?: string;
  readonly onPick: (save: NonNullable<SaveSlotSummary['save']>) => void;
  readonly onClose?: () => void;
}

/**
 * 独立的读档弹窗（标题页用）。
 *
 * 场景内读档走 `game-menu.ts` 的分支页面（要先二次确认），这里只负责「标题 → 选一槽 → 进场景」，
 * 与 `继续游戏` 是同一层入口。
 */
export function openLoadSlotsModal(
  mvvm: MVVMPlugin,
  options: LoadSlotsModalOptions,
): ModalHandle {
  const slots = readAllSlots();
  let modal: ModalHandle | null = null;
  modal = mvvm.modal.open(
    () => {
      Panel({ width: 620, padding: 28, gap: 14, variant: 'surface' }, () => {
        Text(options.title ?? '读取存档', { size: 'lg' });
        Divider({});
        renderSaveSlotList({
          mode: 'load',
          slots,
          onPick: (slotId) => {
            const picked = slots.find((slot) => slot.slot === slotId);
            if (!picked || picked.status !== 'ok' || !picked.save) return;
            modal?.close();
            options.onPick(picked.save);
          },
        });
        Divider({});
        Row({ width: 'fill', justifyContent: 'end' }, () => {
          Button('关闭', {
            variant: 'secondary',
            size: 'md',
            width: 160,
            onClick: () => modal?.close(),
          });
        });
      });
    },
    {
      ...MODAL_NO_AUTOFOCUS,
      dismissible: true,
      name: 'load-slots',
      onClose: () => options.onClose?.(),
    },
  );
  // 标题页相机不滚动，但保持与场景内菜单一致：模态永远钉在屏幕上。
  modal.widget.setScrollFactor(0);
  return modal;
}
