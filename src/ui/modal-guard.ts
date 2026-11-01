import type { ModalOptions } from '@phaser-mvvm/phaser';

/**
 * 剧情卡 / 结算卡 / 暂停确认这类「弹出即等玩家选」的弹窗统一选项：**不要自动聚焦第一个按钮**。
 *
 * 起因（2026-10-31 御膳房实测）：Compose 的键盘导航把 `Space` / `Enter` 映射成 `activate`
 * （`vendor/phaser-mvvm/packages/phaser/src/nav.ts` 的 `keyboardActionOf`）。而玩家推进对话用的
 * 正是 Space——`finishDialogue()` 在同一个 keydown 里弹出结束卡，UI 场景的键盘源随后把这一次
 * Space 交给刚被 `focusFirst` 聚焦的「重开本节」，于是结束卡一出现就被点掉、本节直接重开。
 * 失败卡的「再进去」、退出确认的「返回标题」是同一个雷。
 *
 * 关掉 `autoFocus` 之后：弹窗里没有任何控件持有焦点，`activate` 直接返回 false；指针点击照常，
 * 键盘也能用 Tab 主动进入弹窗再操作。`dismissible` 的关闭逻辑不受影响。
 */
export const MODAL_NO_AUTOFOCUS: Pick<ModalOptions, 'autoFocus'> = { autoFocus: false };
