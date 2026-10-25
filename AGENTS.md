# 开发约定（给后续 AI / 协作者）

## 0. 当前阶段

M1a。已交付：M0.9 的全部内容 + 第一章第一节《寝室》（单房间探索、小白登场、第一场剧情战、战后征召、结束卡）。第一章第二节、完整战斗系统、存档尚未接入；没有计划不要继续扩章节。

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
3. 切换场景用 `from.scene.start()`（`enterModule` 已封装）；不要用全局 `game.scene.start()`，会留旧场景。唯一例外是 `src/dev/stage-runner.ts` 的显式预览跳转：它会先停掉所有内容场景再启动，别在别处模仿。
4. 设计坐标按 **720 宽**写；不要读 `window.innerWidth` 做布局（视口在 `app/viewport.ts` 统一算）。
5. 相机必须 `setZoom(scale)` **且** `centerOn(360, designH/2)`。
6. 像素素材纹理 NEAREST，UI 文本 LINEAR；不要非整数倍缩放像素 sprite。
7. 不提交 `cordova/keys/`、`cordova/build.json`、`cordova/www/`、`cordova/platforms/`。
8. vendor 的 phaser-mvvm 可以改，但每次改动写进 `vendor/phaser-mvvm/PATCHES.md`，并跑框架单测。
9. 字体/文案不要写死到 canvas 纹理；中文长句用 Label 的换行能力。
10. 新依赖先确认许可证；AI 素材必须登记 `docs/ASSET-CREDITS.md`。
11. 剧情长文文案以 `src/story/` 为唯一真值；场景里不硬编码台词。过场时间线写成无 Phaser 的纯逻辑并补单测（参考 `prologue-player.ts`）。
12. **所有可玩场景/CG/战斗都必须登记舞台目录**：`src/dev/stage-catalog.ts`；场景 key 还要进 `src/app/scene-keys.ts`。`pnpm check` 会检查模块/内容场景覆盖，不登记就失败。
13. 预览/验收只走 `launchStage()`、`?stage=<id>` 或 `__AVM__.stages`；场景不要自己解析 query，也不要直接 `scene.start()` 做预览跳转。新增场景/CG/战斗照 `docs/STAGE-PREVIEW.md` 的三套接入步骤做。
14. 预览模式（`StageLaunchContext.preview === true`）**不得写存档/进度/成就**；随机必须用 `seed`（`src/dev/random.ts`），禁止直接 `Math.random()`。同一 seed + params 必须能复现同一画面/开局。
15. 原生渲染分层只能取 `src/render/layers.ts` 的 `LAYERS` / `characterDepth()`；资源 key 只能取 `src/assets/keys.ts` 的分组。地图、角色、UI、CG 的归属见 `docs/RENDER-LAYERS.md`，不要在场景里写魔法 depth 或手写资源 key。
16. **资源随场景走**：内容场景只通过 `GameModule.requires` 声明资源，切场景必须走 `enterModule` / `launchStage`；`AssetService` 会在目标场景 `create` 后释放旧 bundle（`core`/`ui` 常驻）。禁止跨场景 `prefetch`，禁止场景里手工 `textures.remove` / `cache.*.remove`；验收看 `__AVM__.assets.bundles()`。

## 3. 代码风格

- TypeScript strict；`verbatimModuleSyntax`；类型导入用 `import type`。
- 文件位置：`app/` 决策与胶水、`resource/` 资源、`audio/` 音频、`scenes/` 场景编排、`world/` 地图/房间视图、`actors/` 角色表现、`ui/` HUD/CG/视觉辅助、`render/` 深度契约、`story/` 剧情数据与纯时间线、`map/` 地图数据与碰撞、`battle/` 战斗数据与纯逻辑、`dev/` 舞台目录与测试后门、`theme/` 令牌。
- UI 优先 Compose DSL（`Panel/Column/Row/Text/Button/Slider`），少用 `this.add.*` 工厂。过场/电影化画面可以用原生层，但控制层（跳过/继续）仍放 Compose，保证焦点与安全区。
- 纯逻辑抽到无 Phaser 依赖的模块（如 `resource/plan.ts`）并写单测。

## 4. 验证

- **默认不启动 Android 模拟器**：除非用户主动要求，否则测试验收无需启动模拟器调试 Android 端。
- 改 UI：`pnpm dev`，用浏览器在 **390×844** 与 **1200×648** 两个视口各看一眼；检查控制台 0 error。
- 改开幕/过场：完整走一遍「开始 → 全部 cue → 点击继续 → 第一章寝室」，再测「跳过」「返回键」和 `prefers-reduced-motion`；`?stage=scene.prologue` 直接进开幕。
- 改第一章/地图：`?stage=scene.ch01.dorm&phase=explore&hud=0`；验移动/碰撞/交互/目标/对话/返回标题；`debug=1` 看碰撞格。
- 改剧情战：`?stage=battle.ch01.first&phase=opening|mid|defeat&hud=0`；验攻击固定 1、3 回合必败、战败回寝室、预览可重开/返回。
- 改舞台目录/预览：`pnpm check`；按 `docs/STAGE-PREVIEW.md` §10 验「URL / 控制台 / HUD 目录 / 未知 id 回退 / hud=0」；新增场景/CG/战斗必须能单点打开、带 seed 重开、返回标题。
- 改资源：`pnpm assets:check`；确认 `public/assets` 下没有未引用文件。
- 改 Android：`pnpm android:debug` 出调试包即可；只有用户主动要求时才装模拟器/真机，验「启动到标题、点击开始、返回键」。
- 改 vendor：`pnpm --filter @phaser-mvvm/phaser test`（在 vendor 包内）或至少 `pnpm typecheck`。

## 5. 已知坑

- `cordova/config.xml` 的 `BackgroundColor` 必须 `#RRGGBB`，写 `0xff...` 会让 AAPT 报 `raw string`。
- Android 首次启动 WebView 可能超过默认 20s 加载超时；已把 `LoadUrlTimeoutValue` 设 120000。
- 系统「Viewing full screen」提示会盖住应用，点 Got it 后才是游戏。
- 4:3 平板会留边；20:9 手机无黑边。
- 标题主视觉是首版 AI 图 + 像素化后处理；M1 可重做。
- 第一章素材由游戏素材大师生成；人物先出设定图，再以图为参考生成精灵/八方向/场景。寝室是零部件拼图，不画整张细图，也不铺地毯。
- 角色精灵工具（sprite）的转圈视频一旦源图里混入第二个人物/剪影，截帧会带残影；源图必须是单人、全身、纯色背景。
- 行走帧不能逐帧按各自 bbox 缩放，否则人物会「越走越瘦」；必须用整段 8 帧的并集 bbox 统一缩放，脚底对齐。
- sprite 转圈的斜向 pick 要按实际帧校准：西北/东北容易取到正侧或正背；抽不准就直接用 `direct` 逐张生成，验收时看 8 方向图而不是只看四向。
- 坐姿图如果自带椅子，必须用 `sittingOffsetY` 把椅子脚对齐地面，并在坐着时隐藏独立椅子；表情气泡用 `headPoint` 定位，别用脚底坐标。

## 6. 提交

- 提交信息用 `feat/fix/docs/chore(scope): ...`。
- 一次提交只做一件事；不要混入素材重生成与代码重构。
- 涉及视觉的改动附截图（`docs/screenshots/`）。
