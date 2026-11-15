# HUD 按钮误推进对话：修复取证（t70）

场景：金殿 `?stage=scene.ch01.palace&hud=0`，390×844，`textSpeed=slow`。
目标：点「记录 / 自动 / 跳过 / 菜单」那一下不再被场景当成「点屏幕推进 / 补全对话」。

## 关键帧

| 文件 | 说明 |
| --- | --- |
| `1-typing-before.png` | 逐字进行中（「雕梁画栋，」5 字），提示「点击补全」 |
| `2-record-open-typing-paused.png` | 打字中点「记录」：弹窗打开，背后台词仍停在「白光褪去，你发现」（未被补全），提示仍是「点击补全」 |
| `3-auto-on-no-advance.png` | 打字中点「自动」：按钮变「自动·开」，台词仍停在 4 字（状态快照 4→4，玩家仍停在本句） |
| `4-menu-open-no-advance.png` | 打字中点「菜单」：返回标题确认弹出，背后台词停在「雕梁画栋……光从雕花窗棂里」（29/33 字，仍在逐字），「自动·开」保持 |
| `5-blank-click-completes.png` | 点空白：本句正常补全（4→21 字），提示回到「点击继续」 |

> 说明：3/5 两张为稳定取证，逐字状态被测试脚本冻结在 4 字（不改产品代码）；状态快照与截图同时证明「按按钮不推进、点空白才补全」。

## 视频（带真实游戏音轨）

| 文件 | 说明 |
| --- | --- |
| `hud-button-pointer-sequence.mp4` | 6.6s 自然流程录屏：逐字 → 点「记录」（弹窗打开、逐字暂停）→ 关弹窗继续逐字 → 自动/菜单 → 点空白推进；H.264 + 真实音轨 AAC |
| `hud-button-pointer-typing-focus.mp4` | 3.8s 聚焦版：在第二句 33 字逐字中途点「记录」→ 继续逐字 → 点「自动」→ 点「菜单」（背后台词仍未打完）→ 点空白 |
| `hud-button-pointer-real-audio.webm` | 从游戏 WebAudio `masterVolumeNode` 抽头录下的原始音轨（Opus 48k），非静音模拟 |

## 运行时状态（Playwright 实机读数）

- 金殿：打字中 `revealed=5` 点「记录」→ 弹窗 `open=true`、`revealed` 仍在本句、`player.index` 不变；关弹窗后逐字继续；点「菜单」同样不推进；点「跳过」才整段结束（`player.done=true`、`transitioning=true`、打字状态清空）；按钮之间 8px 缝隙按「点空白」处理，会补全本句。
- 寝室（`phase=opening`）：打字中 `dialogue.typedCount=0` 点「记录」→ 历史打开、`typedCount` 仍 0；点空白 → `16/16` 补全。
- 御膳房（`phase=intro`）：同上，`typedCount` 0→0；点空白 `29/29` 补全。
- 开幕：点右上「自动播放」只切自动（`typedCount=0` 不变）；点空白才 `8/8` 补全；点「跳过剧情」正常结束。
- 命中判定：纯函数 `src/ui/ui-pointer-hit.ts`；场景统一入口 `src/ui/ui-pointer-guard.ts` 的 `isPointerOnUiControl()`（覆盖 4 个顶栏按钮、Compose 控件、任意模态；对话面板正文/装饰文字不算控件）。摇杆由 `VirtualJoystick#containsPointer()` 单独判断。
