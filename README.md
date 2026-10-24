# 刺客大战矿工 / Assassins vs. Miners

竖屏回合制 RPG。现实是当代中国县城高中，梦里是别人的梦域——你扮演被灵能族征召的「刺客」，在矿工把梦主挖空之前解离梦域。

> 当前为 **M0 初始框架**：开始界面 + 资源管理与预加载框架 + 标题 BGM + 文档。战斗与剧情尚未接入。

## 现在能跑什么

- 启动 → 资源加载（真实进度）→ 标题界面
- 标题界面：开始游戏（进入「序章开发中」占位页）、设置、制作名单
- 音频：首触解锁、BGM 淡入、音量/静音持久化
- 资源框架：bundle 清单、按权重进度、串行队列、失败重试/降级、场景门禁
- Web 与 Android（Cordova，minSdk 21，签名 APK）同一套代码

## 环境

- Node ≥ 20（本机 22.23）
- pnpm 11（本机 11.7；`packageManager` 未锁，升级前先跑 `pnpm check`）
- Android：JDK 21（`/opt/homebrew/opt/openjdk@21`）、Android SDK 36、Cordova CLI 13

## 快速开始

```bash
pnpm install
pnpm dev          # http://127.0.0.1:5173
pnpm build        # 产物在 dist/
pnpm check        # typecheck + 单测 + 资源清单校验
```

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm preview` | Web 开发 / 构建 / 预览 |
| `pnpm typecheck` | TypeScript（含 vendor 源码） |
| `pnpm test` | Vitest 单测（资源权重/进度/失败策略） |
| `pnpm assets:scan` | 扫描 `public/assets` → `src/assets/catalog.gen.json` |
| `pnpm assets:check` | 校验资源 key 唯一、文件存在、未引用警告 |
| `pnpm android:debug` | 构建 Web → 同步 Cordova → debug APK |
| `pnpm android:release` | 生成签名配置 → 构建签名 APK → apksigner 校验 |

## 目录

```
src/
  app/         视口、设置、模块表、场景门禁
  assets/      bundle 清单（唯一真值）与 catalog
  resource/    AssetService / LoaderScene / 权重与进度
  audio/       AudioDirector
  scenes/      Boot / Title / Placeholder
  theme/       主题令牌
  ui/          封面、压暗等场景辅助
public/assets/ 运行时资源（按 bundle 分目录）
vendor/phaser-mvvm/  内置的 phaser-mvvm 源码（可改，见 UPSTREAM/PATCHES）
cordova/       Cordova 工程（www 与 keys 均不入库）
reference/     小说原文与分卷切片（不参与构建）
tools/         资源扫描/校验、Cordova 同步与构建
docs/          架构、资源规范、美术、Android、版权、ADR
```

## 文档

- [架构](docs/ARCHITECTURE.md)
- [资源规范与预加载规则](docs/RESOURCE-SPEC.md)
- [美术风格](docs/ART-STYLE.md)
- [Android 构建与签名](docs/ANDROID.md)
- [素材版权记录](docs/ASSET-CREDITS.md)
- [剧情圣经（简版）](docs/STORY-BIBLE.md)
- [M0 验收记录](docs/M0-ACCEPTANCE.md)
- [开发约定](AGENTS.md)

## 已知限制

- 「开始游戏」进入的是占位页，没有剧情和战斗。
- 标题主视觉/徽记/BGM/点击音效是首版 AI 素材；M1 会按最终风格重做并补 UI 图集。
- minSdk 21 是低于 cordova-android 15 默认 24 的降级，目前只在 API 36 模拟器验证；API 21 真机待测。
- 字体暂用系统字（PingFang / Noto），尚未内置方舟像素字体子集。

## 密钥

发布签名在 `cordova/keys/`，**不入库、不上传网盘**。密码在 `cordova/keys/keystore.properties`（600），`cordova/build.json` 由 `tools/make-build-json.mjs` 临时生成（gitignore）。请把 `cordova/keys/` 离线双备份；keystore 丢失将无法覆盖升级。
