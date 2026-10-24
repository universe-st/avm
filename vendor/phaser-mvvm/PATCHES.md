# 本地改动记录

| 日期 | 文件 | 改动 | 原因 | 可否上游化 |
| --- | --- | --- | --- | --- |
| 2026-10-24 | — | 初始复制，无改动 | M0 接入 | — |
| 2026-10-24 | `packages/phaser/src/plugin.ts` | 新增公开方法 `requestBack()`，转调内部 `handleBack()` | Cordova `backbutton` 事件没有公开入口可接；Android 返回键原本直接退出应用 | 可以 |
