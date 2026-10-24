# 开发约定（给后续 AI / 协作者）

## 0. 当前阶段

M0 初始框架。已交付：竖屏开始界面、资源管理与预加载框架、标题 BGM、文档、Android 调试包。**不要**在没有计划的情况下接战斗/剧情。

## 1. 命令

```bash
pnpm dev            # 5173
pnpm build          # dist/
pnpm check          # typecheck + vitest + assets:check
pnpm test
pnpm assets:scan    # 资源字节 → catalog.gen.json
pnpm assets:check   # key 唯一 / 文件存在
pnpm android:debug
pnpm android:release
```

## 2. 硬规则

1. **场景里禁止 `this.load.*`**。资源先进 `src/assets/bundles.ts`，再走 `enterModule(this, id)`。
2. 新增 bundle/资源必须跑 `assets:scan` + `assets:check`，并在 `docs/RESOURCE-SPEC.md` 登记。
3. 切换场景用 `from.scene.start()`（`enterModule` 已封装）；不要用全局 `game.scene.start()`，会留旧场景。
4. 设计坐标按 **720 宽**写；不要读 `window.innerWidth` 做布局（视口在 `app/viewport.ts` 统一算）。
5. 相机必须 `setZoom(scale)` **且** `centerOn(360, designH/2)`。
6. 像素素材纹理 NEAREST，UI 文本 LINEAR；不要非整数倍缩放像素 sprite。
7. 不提交 `cordova/keys/`、`cordova/build.json`、`cordova/www/`、`cordova/platforms/`。
8. vendor 的 phaser-mvvm 可以改，但每次改动写进 `vendor/phaser-mvvm/PATCHES.md`，并跑框架单测。
9. 字体/文案不要写死到 canvas 纹理；中文长句用 Label 的换行能力。
10. 新依赖先确认许可证；AI 素材必须登记 `docs/ASSET-CREDITS.md`。

## 3. 代码风格

- TypeScript strict；`verbatimModuleSyntax`；类型导入用 `import type`。
- 文件位置：`app/` 决策与胶水、`resource/` 资源、`audio/` 音频、`scenes/` 场景、`ui/` 视觉辅助、`theme/` 令牌。
- UI 优先 Compose DSL（`Panel/Column/Row/Text/Button/Slider`），少用 `this.add.*` 工厂。
- 纯逻辑抽到无 Phaser 依赖的模块（如 `resource/plan.ts`）并写单测。

## 4. 验证

- 改 UI：`pnpm dev`，用浏览器在 **390×844** 与 **1200×648** 两个视口各看一眼；检查控制台 0 error。
- 改资源：`pnpm assets:check`；确认 `public/assets` 下没有未引用文件。
- 改 Android：`pnpm android:debug`，装模拟器，确认启动到标题、点击开始、返回键。
- 改 vendor：`pnpm --filter @phaser-mvvm/phaser test`（在 vendor 包内）或至少 `pnpm typecheck`。

## 5. 已知坑

- `cordova/config.xml` 的 `BackgroundColor` 必须 `#RRGGBB`，写 `0xff...` 会让 AAPT 报 `raw string`。
- Android 首次启动 WebView 可能超过默认 20s 加载超时；已把 `LoadUrlTimeoutValue` 设 120000。
- 系统「Viewing full screen」提示会盖住应用，点 Got it 后才是游戏。
- 4:3 平板会留边；20:9 手机无黑边。
- 标题主视觉是首版 AI 图 + 像素化后处理；M1 可重做。

## 6. 提交

- 提交信息用 `feat/fix/docs/chore(scope): ...`。
- 一次提交只做一件事；不要混入素材重生成与代码重构。
- 涉及视觉的改动附截图（`docs/screenshots/`）。
