# 本地改动记录

| 日期 | 文件 | 改动 | 原因 | 可否上游化 |
| --- | --- | --- | --- | --- |
| 2026-10-24 | — | 初始复制，无改动 | M0 接入 | — |
| 2026-10-24 | `packages/phaser/src/plugin.ts` | 新增公开方法 `requestBack()`，转调内部 `handleBack()` | Cordova `backbutton` 事件没有公开入口可接；Android 返回键原本直接退出应用 | 可以 |
| 2026-11-21 | `packages/widgets/src/text-truncate.ts` | `rewrapOverflowingLines()` 折行加行首禁则（新增 `isForbiddenLineStart()`）：新行不能以标点开头，前引号/前书名号例外；必要时把上一行末字一起带到下一行 | 中文长句按宽度折行时会把「，」「」」「）」挤到行首（游戏台词 2026-11-21 需求） | 可以 |
| 2026-11-21 | `packages/widgets/src/text-truncate.ts` | 折行再加「不拆数字/英文词」（新增 `isTokenChar()`）：断点落在 `32.47%`/`TEAR-27` 中间时整个 token 换行（token 比一行还长才允许断开） | 实测渲染层把「32.47%」切成「32.4 / 7%」，玩家读成两个意思 | 可以 |
| 2026-11-23 | `packages/widgets/src/Button.ts`, `packages/widgets/src/compose.ts` | `Button` 新增 `labelColor` / `glow` / `glowColor`，Compose 提供响应式 `labelColor`/`glow`；glow 是 body 后面的红色 alpha 脉冲，destroy 时停 tween | 战斗「确认攻击」需要红色文字 + 发光动画（用户 2026-11-23） | 可以 |
