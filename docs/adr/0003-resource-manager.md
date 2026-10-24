# ADR-0003：清单驱动的资源管理与预加载

- 状态：Accepted
- 日期：2026-10-24

## 背景

游戏会有章节、战斗、过场等多种资源组合；如果每个场景各自 `this.load`，会出现重复加载、进度不准、切场景白屏、失败不可恢复。

## 决策

- 资源唯一真值：`src/assets/bundles.ts`（bundle + AssetDef）。
- 全局单例 `AssetService`：串行队列、按 key 去重、按权重算进度、失败重试/降级。
- 常驻 `LoaderScene` 画进度；加载 UI 本身不依赖任何待加载资源（Phaser 原生对象）。
- 场景通过 `enterModule()` 门禁进入：先 `ensure()`，再 `scene.start()`。
- `LoadState` 是 UI 唯一契约；进度不是 Phaser 的文件计数。

## 后果

- 场景里禁止 `this.load`；新增资源必须登记并由脚本校验。
- 预取（C/D 类）API 已留，M0 只实现 `show: 'never'`，调度器在 M1 接入。
- 缓存释放 API 已留，M0 不真正卸载。
- 进度条可能因权重与文件数不同而「跳」，这是有意的：BGM 比图标重。
