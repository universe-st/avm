# 资源规范与预加载规则

> 目的：让「每个模块加载前需要什么资源」有唯一答案，并让加载进度可被 UI 真实消费。

## 1. 唯一真值

资源清单只有一个地方：`src/assets/bundles.ts`。

```ts
interface AssetDef {
  key: string;          // 全局唯一，Phaser cache key
  kind: 'image' | 'audio' | 'json';
  url: string;          // 相对站点根，如 assets/img/title/title_bg.webp
  weight?: number;      // 可选，缺省按 catalog 字节/1KB
  required?: boolean;   // 默认 true；false 时失败只降级
  label?: string;       // 加载页显示名
}
```

- 改资源先改 `bundles.ts`，再跑 `pnpm assets:scan`（更新字节数）与 `pnpm assets:check`。
- key 命名：`img.<bundle>.<name>` / `audio.bgm.<name>` / `audio.sfx.<name>` / `font.<name>`。
- 文件路径：`public/assets/{img,audio,font,data}/<bundle>/<name>[@2x].<ext>`。

## 2. 当前 bundle 表

| bundle | 内容 | 预算 | 加载点 |
| --- | --- | --- | --- |
| `core` | 基础纹理（白像素） | 2 MB | 冷启动 |
| `title` | 标题主视觉、徽记、标题 BGM | 6 MB | 进入标题（与 core 合并批次） |
| `ui` | 设置弹窗/通用 UI（M0 为空，用主题绘制） | 1 MB | 首次打开设置 |
| `ch.00` | 序章占位背景 | 2 MB | 开幕剧情结束/跳过后 |
| `cutscene.prologue` | 开幕剧情 5 张配图 | 6 MB | 标题页空闲预取 / 点击开始 |

后续：`ch.NN`（单章 ≤ 8 MB）、`battle.common`（≤ 3 MB）、`battle.<id>`（≤ 5 MB）、`cutscene.<id>`（单段 ≤ 8 MB）。

## 3. 进度契约

UI 只认 `LoadState`（`src/assets/types.ts`）：

```ts
{
  phase: 'idle' | 'loading' | 'ready' | 'error',
  progress: 0..1,        // 按权重、批次内单调递增
  currentKey, currentLabel,
  loaded, total,         // 文件计数
  bytesLoaded, bytesTotal,
  startedAt, show, error
}
```

- **进度 = Σ已完成权重 / Σ总权重**；不用 Phaser 的 `load.progress`（文件计数）。
- 权重 = `bytes / 1024`，钳制 [1, 4096]；BGM 与 1×1 图标不会同权。
- `total = 0` 时进度视为 1（资源全在缓存）。
- 同一批次内进度只增不减；失败重试不回退。
- 必填资源失败 → `phase = 'error'` 并 reject；可选资源失败 → 继续并记为降级。

## 4. 预加载矩阵

| 类型 | 时机 | 何时开始 | 显示进度条 | 目标 |
| --- | --- | --- | --- | --- |
| A 冷启动 | 应用启动 | 立即 | 总是全屏 | ≤ 2s |
| B 场景门禁 | 切场景前 | 点击/事件 | 预计 > 120ms 才显示 | ≤ 1.5s |
| C 环节预取 | 进入场景后空闲 | 500ms / idle | 不显示 | 无硬指标 |
| D 章节前瞻 | 当前章稳定后 | 空闲 | 不显示 | 下一章 ≤ 30s |

**已实现**：A、B、`show: 'never'` 的 `prefetch()` API；标题页稳定 800ms 后静默预取 `cutscene.prologue`（`navigator.connection.saveData` 为真时跳过），让「开始游戏」尽量不显示加载页。C/D 的章节调度器在接入章节时启用。

## 5. 十二条硬规则

1. 场景 `create()` 里禁止 `this.load`；新增资源必须登记 bundle。
2. 进入场景前 `await assets.ensure(module.requires)`，场景内资源 100% 就绪。
3. 加载页三档：`< 120ms` 不显示；`120ms–1s` 细条/全屏（当前统一全屏，短加载自动不闪）；`> 1s` 全屏 + 提示语。
4. 防闪烁：延迟 120ms 显示、最短可见 420ms、100% 后停留 120ms 再淡出。
5. 前台优先：同一时刻只跑一个批次；预取请求排队让位。
6. 预取上限：当前章 + 下一章 + 战斗公共包；缓存超阈值停止并淘汰最久未用章节（M1）。
7. 章节前瞻：进入第 N 章 3s 后预取 N+1；退出章节不预取（M1）。
8. 战斗前置：先 `battle.common + battle.<id>`，用转场遮住加载（M1）。
9. 弱网降级：`navigator.connection.saveData` 为真时关闭 C/D。
10. 章节包不得互相依赖；公共资源上移到 `ui` / `battle.common`。
11. 预算门禁：`core 2MB / title 6MB / 单章 8MB / 单战斗 5MB`，超限构建失败。
12. 必填资源失败必须可重试/阻断；可选资源必须有占位。

## 6. 失败与降级

- 单文件失败：Phaser 的 `loaderror` 记录 key；批次继续。
- 批次完成时：`requiredFailures()` 非空 → `error` + reject（加载页显示错误，不自动隐藏）。
- 可选失败：保留占位（目前是空纹理/静音），下次 `ensure` 仍会重试。
- 断网恢复：监听 `online` 后重新 `ensure` 即可（M1 在错误页提供按钮）。

## 7. 命名与格式

| 类别 | 规范 |
| --- | --- |
| 图像 | 2× 设计；WebP（含 alpha）优先，PNG 回退；单边 ≤ 2048；小图打图集，留 1px extrude + 2px padding。全屏过场图用 1080×1920（1.5× 设计）优先保证显存；标题主视觉 1440×2560 是已存在的例外 |
| 音频 | BGM 60–120s 可循环，-16 LUFS；SFX ≤ 2s；MP3 128k（BGM）/96k（SFX） |
| 字体 | WOFF2 子集；首屏前 `document.fonts.ready` 等待 |
| 数据 | JSON UTF-8 无 BOM |
| 体积 | 清单与 catalog 记录 bytes/hash/mtime |

## 8. 新资源接入清单

- [ ] `bundles.ts` 新增 AssetDef（key 唯一）
- [ ] 文件放到 `public/assets/...`
- [ ] `pnpm assets:scan`
- [ ] `pnpm assets:check`
- [ ] 场景通过 `enterModule` 加载，不直接 `this.load`
- [ ] 预算未超；可选资源标了 `required: false`
- [ ] 在 `ASSET-CREDITS.md` 登记来源
