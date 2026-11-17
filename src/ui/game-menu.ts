import type { ModalHandle, MVVMPlugin } from '@phaser-mvvm/phaser';
import { ref } from '@phaser-mvvm/core';
import { Branch, Button, Column, Divider, Panel, Row, Slider, Text } from '@phaser-mvvm/widgets/compose';
import { settings } from '../app/settings';
import {
  SAVE_WRITE_MESSAGES,
  readAllSlots,
  readSlot,
  type SaveWriteResult,
} from '../app/save/save-store';
import type { SaveDataV1, SaveSlotId } from '../app/save/schema';
import type { SaveAvailability } from '../app/save/save-availability';
import { audioDirector } from '../audio/audio-director';
import { bgmManager } from '../audio/bgm-manager';
import { MODAL_NO_AUTOFOCUS } from './modal-guard';
import { renderSaveSlotList } from './save-slots';

/**
 * 右上角图标菜单（Compose 模态，四个阶段场景共用）。
 *
 * 页面用 `Branch` 切换（而不是叠第二层模态）：
 * 音量 / 存读档 / 二次确认都在同一个 620 宽的卡片里换内容，遮罩、焦点与
 * `isPointerOnUiControl()` 的「有弹窗 = 整块 UI」判定只需要管一层。
 *
 * 菜单**不碰场景状态**：存盘、读档、返回标题都通过回调交回场景，
 * 暂停对话自动播放/逐字推进也在场景侧完成（`cancelAutoAdvance()` + update 早退）。
 */

type MenuView =
  | 'root'
  | 'volume'
  | 'save'
  | 'load'
  | 'save-confirm'
  | 'load-confirm'
  | 'done';

const MENU_TITLES: Readonly<Record<MenuView, string>> = {
  root: '菜单',
  volume: '音量设置',
  save: '保存存档',
  load: '读取存档',
  'save-confirm': '覆盖存档',
  'load-confirm': '读取存档',
  done: '保存存档',
};

export interface GameMenuOptions {
  /** 打开菜单那一刻的存档可用性（菜单期间游戏是暂停的，状态不会变）。 */
  readonly availability: SaveAvailability;
  /** 场景侧写盘；返回值决定成功/失败提示。 */
  readonly onSave: (slot: SaveSlotId) => SaveWriteResult;
  /** 场景侧读档（已二次确认；调用方负责关菜单并切场景）。 */
  readonly onLoad: (save: SaveDataV1) => void;
  /** 「返回标题」：沿用各场景既有的二次确认弹窗。 */
  readonly onRequestTitle: () => void;
  /** 菜单关闭后（任何原因）回调场景恢复自动播放。 */
  readonly onClose?: () => void;
  /** 这行小字显示当前场景，让玩家知道自己存的是哪一节。 */
  readonly sceneLabel?: string;
}

export function openGameMenu(mvvm: MVVMPlugin, options: GameMenuOptions): ModalHandle {
  const view = ref<MenuView>('root');
  const selected = ref<SaveSlotId | null>(null);
  const notice = ref('');
  let modal: ModalHandle | null = null;

  const go = (next: MenuView): void => {
    view.value = next;
  };

  const pickSlotForSave = (slot: SaveSlotId): void => {
    const summary = readSlot(slot);
    selected.value = slot;
    if (summary.status === 'ok') {
      go('save-confirm');
      return;
    }
    // 空槽/损坏槽/旧版本槽都直接写：损坏槽允许覆盖。
    commitSave(slot);
  };

  const commitSave = (slot: SaveSlotId): void => {
    const result = options.onSave(slot);
    notice.value = result.ok
      ? `已保存到第 ${slot} 槽。`
      : `保存失败：${SAVE_WRITE_MESSAGES[result.reason]}`;
    go('done');
  };

  const pickSlotForLoad = (slot: SaveSlotId): void => {
    const summary = readSlot(slot);
    if (summary.status !== 'ok' || !summary.save) return;
    selected.value = slot;
    go('load-confirm');
  };

  const confirmLoad = (): void => {
    const slot = selected.value;
    if (slot === null) return;
    const summary = readSlot(slot);
    if (summary.status !== 'ok' || !summary.save) return;
    const save = summary.save;
    modal?.close();
    options.onLoad(save);
  };

  modal = mvvm.modal.open(
    () => {
      Panel({ width: 620, padding: 28, gap: 14, variant: 'surface' }, () => {
        Row({ width: 'fill', justifyContent: 'space-between', alignItems: 'center' }, () => {
          Text(() => MENU_TITLES[view.value], { size: 'lg' });
          if (options.sceneLabel) {
            Text(options.sceneLabel, { size: 'xs', tone: 'muted' });
          }
        });
        Divider({});

        Branch(() => view.value, {
          // ---------------------------------------------------------- 根菜单
          root: () => {
            Column({ width: 'fill', gap: 10, alignItems: 'stretch' }, () => {
              Button('音量设置', {
                variant: 'secondary',
                size: 'md',
                onClick: () => {
                  audioDirector.playClick();
                  go('volume');
                },
              });
              Button('读取存档', {
                variant: 'secondary',
                size: 'md',
                onClick: () => {
                  audioDirector.playClick();
                  go('load');
                },
              });
              Button('保存存档', {
                variant: 'secondary',
                size: 'md',
                disabled: !options.availability.allowed,
                onClick: () => {
                  audioDirector.playClick();
                  go('save');
                },
              });
              // 不能存档时把原因直接写在按钮下面：玩家不需要点一下才知道为什么。
              Text(options.availability.allowed ? '自由探索时可随时存档' : options.availability.message, {
                size: 'xs',
                tone: 'muted',
              });
              Button('返回标题', {
                variant: 'ghost',
                size: 'md',
                onClick: () => {
                  audioDirector.playClick();
                  // 场景自己弹「返回标题？」二次确认；菜单留在下面，取消后还能继续操作。
                  options.onRequestTitle();
                },
              });
            });
          },

          // ---------------------------------------------------------- 音量
          volume: () => {
            Column({ width: 'fill', gap: 10, alignItems: 'stretch' }, () => {
              Text(() => `音乐音量  ${Math.round(settings.bgm * 100)}%`, {
                size: 'sm',
                tone: 'muted',
              });
              Slider({
                value: settings.bgm * 100,
                min: 0,
                max: 100,
                step: 1,
                width: 540,
                trackThickness: 4,
                knobRadius: 8,
                onValueChange: (value) => bgmManager.setBgmVolume(value / 100),
              });
              Text(() => `音效音量  ${Math.round(settings.sfx * 100)}%`, {
                size: 'sm',
                tone: 'muted',
              });
              Slider({
                value: settings.sfx * 100,
                min: 0,
                max: 100,
                step: 1,
                width: 540,
                trackThickness: 4,
                knobRadius: 8,
                onValueChange: (value) => audioDirector.setSfxVolume(value / 100),
              });
              Row({ width: 'fill', gap: 12, alignItems: 'center' }, () => {
                Button(() => (settings.muted ? '声音：关' : '声音：开'), {
                  variant: 'secondary',
                  size: 'md',
                  width: 200,
                  onClick: () => {
                    audioDirector.playClick();
                    bgmManager.setMuted(!settings.muted);
                  },
                });
                Text('音量改动会立刻生效并记住', { size: 'xs', tone: 'muted' });
              });
            });
          },

          // ---------------------------------------------------------- 存档位（保存）
          save: () => {
            renderSaveSlotList({
              mode: 'save',
              slots: readAllSlots(),
              blockedMessage: options.availability.allowed
                ? null
                : `现在不能存档：${options.availability.message}`,
              onPick: pickSlotForSave,
            });
          },

          // ---------------------------------------------------------- 存档位（读取）
          load: () => {
            renderSaveSlotList({
              mode: 'load',
              slots: readAllSlots(),
              onPick: pickSlotForLoad,
            });
          },

          // ---------------------------------------------------------- 覆盖确认
          'save-confirm': () => {
            const slot = selected.value;
            const summary = slot === null ? null : readSlot(slot);
            Column({ width: 'fill', gap: 10, alignItems: 'stretch' }, () => {
              Text(`覆盖第 ${slot ?? '?'} 槽？`, { size: 'md' });
              Text(
                summary?.meta
                  ? `${summary.meta.timeLabel} · ${summary.meta.chapterLabel} · ${summary.meta.sceneLabel}`
                  : '',
                { size: 'sm', tone: 'muted' },
              );
              Text('这一槽原来的存档会被替换。', { size: 'xs', tone: 'muted' });
              Row({ width: 'fill', gap: 12, justifyContent: 'end' }, () => {
                Button('取消', {
                  variant: 'ghost',
                  size: 'md',
                  width: 150,
                  onClick: () => go('save'),
                });
                Button('覆盖', {
                  variant: 'primary',
                  size: 'md',
                  width: 150,
                  onClick: () => {
                    audioDirector.playClick();
                    if (slot !== null) commitSave(slot);
                  },
                });
              });
            });
          },

          // ---------------------------------------------------------- 读取确认
          'load-confirm': () => {
            const slot = selected.value;
            const summary = slot === null ? null : readSlot(slot);
            Column({ width: 'fill', gap: 10, alignItems: 'stretch' }, () => {
              Text(`读取第 ${slot ?? '?'} 槽？`, { size: 'md' });
              Text(
                summary?.meta
                  ? `${summary.meta.timeLabel} · ${summary.meta.chapterLabel} · ${summary.meta.sceneLabel}`
                  : '',
                { size: 'sm', tone: 'muted' },
              );
              if (summary?.meta) {
                Text(`目标：${summary.meta.objective}`, {
                  size: 'sm',
                  maxLines: 2,
                  ellipsis: true,
                });
              }
              Text('读档会离开当前场景，未保存的进度会丢失。', { size: 'xs', tone: 'muted' });
              Row({ width: 'fill', gap: 12, justifyContent: 'end' }, () => {
                Button('取消', {
                  variant: 'ghost',
                  size: 'md',
                  width: 150,
                  onClick: () => go('load'),
                });
                Button('读取', {
                  variant: 'primary',
                  size: 'md',
                  width: 150,
                  onClick: () => {
                    audioDirector.playClick();
                    confirmLoad();
                  },
                });
              });
            });
          },

          // ---------------------------------------------------------- 结果
          done: () => {
            Column({ width: 'fill', gap: 12, alignItems: 'stretch' }, () => {
              Text(() => notice.value, { size: 'md' });
              Row({ width: 'fill', gap: 12, justifyContent: 'end' }, () => {
                Button('返回菜单', {
                  variant: 'ghost',
                  size: 'md',
                  width: 170,
                  onClick: () => go('root'),
                });
                Button('完成', {
                  variant: 'primary',
                  size: 'md',
                  width: 150,
                  onClick: () => modal?.close(),
                });
              });
            });
          },
        });

        Divider({});
        Row({ width: 'fill', justifyContent: 'space-between', alignItems: 'center' }, () => {
          Row({ gap: 10 }, () => {
            Button('返回', {
              variant: 'ghost',
              size: 'sm',
              width: 150,
              visible: () => view.value !== 'root',
              onClick: () => {
                audioDirector.playClick();
                go('root');
              },
            });
          });
          Button('关闭', {
            variant: 'secondary',
            size: 'sm',
            width: 150,
            onClick: () => {
              audioDirector.playClick();
              modal?.close();
            },
          });
        });
      });
    },
    {
      ...MODAL_NO_AUTOFOCUS,
      dismissible: true,
      name: 'stage-menu',
      onClose: () => options.onClose?.(),
    },
  );
  // 地图场景（御膳房）的相机跟随玩家滚动，而模态层默认走 world 空间：
  // 不钉在屏幕上，菜单会画在屏幕外（玩家点开像「没反应」）。与 `kitchen-modals.ts` 同一处理。
  modal.widget.setScrollFactor(0);
  return modal;
}
