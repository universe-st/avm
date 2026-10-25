# 刺客大战矿工 / Assassins vs. Miners

竖屏回合制 RPG。现实是当代中国县城高中，梦里是别人的梦域——你扮演被灵能族征召的「刺客」，在矿工把梦主挖空之前解离梦域。

> 当前为 **M1a**：在 M0.9 基础上接入第一章第一节《寝室》——可走可交互的小地图、小白登场、第一场剧情战（必败、主角伤害固定 1）、战后征召与结束卡。

## 现在能跑什么

- 启动 → 资源加载（真实进度）→ 标题界面
- 标题界面：开始游戏（播放开幕剧情 → 第一章第一节《寝室》）、设置、制作名单
- 开幕剧情：5 张配图、逐字文案 + 逐字提示音、流星/白闪/震屏/红脉冲/日期卡；默认手动（每句点一下继续）；右上角两个无边框图标按钮：▶▶ 自动播放（开启时变鎏金）、▶| 跳过；返回键回标题
- 第一章第一节《寝室》：单房间 11×15 小地图，WASD/摇杆移动、碰撞、目标条、可选调查、逐字对话；叫醒郑卿 → 找手机 → 小白登场 → 梦域金殿 → 1v1 剧情战（必败，攻击固定 1 伤害）→ 被踢回寝室 → 征召 → 结束卡
- 素材：人物设定图、角色精灵、周全八方向图（游戏素材大师 sprite 模块）、寝室零部件与梦域金殿背景均由游戏素材大师生成；房间用零部件拼图，不画整张细图
- 音频：BGM 管理器按场景切曲并交叉淡化（标题曲 ↔ 开幕曲《星夜梦境》 ↔ 第一章寝室/梦域）、首触解锁、音量/静音持久化
- 资源框架：bundle 清单、按权重进度、串行队列、失败重试/降级、场景门禁、标题页静默预取
- **舞台预览**：任意场景/CG/战斗可用 `?stage=<id>`、浏览器控制台 `__AVM__.stages` 或预览 HUD 目录单独打开；带 seed/params、资源门禁、确定性重开
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
| `pnpm test` | Vitest 单测（资源、开幕、舞台目录/URL/上下文） |
| `pnpm assets:scan` | 扫描 `public/assets` → `src/assets/catalog.gen.json` |
| `pnpm assets:check` | 校验资源 key 唯一、文件存在、未引用警告 |
| `pnpm android:debug` | 构建 Web → 同步 Cordova → debug APK |
| `pnpm android:release` | 生成签名配置 → 构建签名 APK → apksigner 校验 |

## 舞台预览（测试/验收）

```bash
pnpm dev
# 单场景
open 'http://127.0.0.1:5173/?stage=scene.prologue'
# 干净 CG 截图（无 HUD）
open 'http://127.0.0.1:5173/?stage=cg.prologue.disaster&hud=0'
# 第一章寝室 / 剧情战
open 'http://127.0.0.1:5173/?stage=scene.ch01.dorm&phase=explore&hud=0'
open 'http://127.0.0.1:5173/?stage=battle.ch01.first&phase=defeat&hud=0'
# 战斗契约沙盒：seed + 敌人 + 回合
open 'http://127.0.0.1:5173/?stage=battle.sandbox&seed=7&enemies=miner.mask,miner.core&turns=10'
```

浏览器控制台：

```js
__AVM__.stages.list()
await __AVM__.stages.go('cg.prologue.disaster')
```

完整规则、参数表、新增场景/CG/战斗的接入步骤见 **[舞台预览与测试后门](docs/STAGE-PREVIEW.md)**。

## 目录

```
src/
  app/         视口、设置、模块表、场景门禁
  assets/      bundle 清单（唯一真值）与 catalog
  resource/    AssetService / LoaderScene / 权重与进度
  audio/       AudioDirector
  scenes/      Boot / Title / Prologue / Placeholder / CG 查看器 / 战斗沙盒
  story/       开幕文案与无 Phaser 的剧情时间线
  dev/         舞台目录、URL/控制台后门、预览 HUD、确定性随机
  theme/       主题令牌
  ui/          封面、压暗、开幕视觉层（cinematic.ts）
public/assets/ 运行时资源（按 bundle 分目录）
vendor/phaser-mvvm/  内置的 phaser-mvvm 源码（可改，见 UPSTREAM/PATCHES）
cordova/       Cordova 工程（www 与 keys 均不入库）
reference/     小说原文与分卷切片（不参与构建）
tools/         资源扫描/校验、Cordova 同步与构建
docs/          架构、资源规范、美术、Android、版权、ADR
```

## 文档

- [架构](docs/ARCHITECTURE.md)
- [渲染层级与模块边界](docs/RENDER-LAYERS.md)
- [资源规范与预加载规则](docs/RESOURCE-SPEC.md)
- [美术风格](docs/ART-STYLE.md)
- [Android 构建与签名](docs/ANDROID.md)
- [素材版权记录](docs/ASSET-CREDITS.md)
- [剧情圣经（简版）](docs/STORY-BIBLE.md)
- [地图系统设计（俯视探索）](docs/DESIGN-MAP.md)
- [战斗系统设计（回合制）](docs/DESIGN-BATTLE.md)
- [第一章第一节验收](docs/CH01-ACCEPTANCE.md)
- [开幕剧情验收](docs/PROLOGUE-ACCEPTANCE.md)
- [M0 验收记录](docs/M0-ACCEPTANCE.md)
- [舞台预览与测试后门](docs/STAGE-PREVIEW.md)
- [ADR 0005：舞台预览目录](docs/adr/0005-stage-preview.md)
- [开发约定](AGENTS.md)

## 已知限制

- 第一章第二节、后续梦域探索、完整回合制（技能/EP/背刺/核心/队伍）、存档与「继续游戏」尚未接入；本节无存档，刷新/返回标题后从头开始。
- 第一场战斗是剧情战：1v1、攻击/防御、固定 1 伤害、3 回合必败；不是完整战斗系统。
- 寝室是单房间；门、巡逻、视线、潜行、善变、锚点等仍按 `docs/DESIGN-MAP.md` 后置。
- 音频仍是程序化占位，正式版计划用游戏素材大师 music/sfx 重做。
- `battle.sandbox` 仍是契约自检页；真实战斗条目为 `battle.ch01.first`。
- 开幕配图为 1080×1920 WebP，5 张解码约 41 MB；低端机若出现纹理压力可降到 900×1600（代码不变）。
- 开幕正文是 Phaser Text，暂未接 DOM a11y 镜像；跳过按钮可键盘/读屏访问。
- 标题主视觉/徽记/BGM/点击音效是首版 AI 素材；M1 会按最终风格重做并补 UI 图集。
- minSdk 21 是低于 cordova-android 15 默认 24 的降级，目前只在 API 36 模拟器验证；API 21 真机待测。
- 字体暂用系统字（PingFang / Noto），尚未内置方舟像素字体子集。

## 密钥

发布签名在 `cordova/keys/`，**不入库、不上传网盘**。密码在 `cordova/keys/keystore.properties`（600），`cordova/build.json` 由 `tools/make-build-json.mjs` 临时生成（gitignore）。请把 `cordova/keys/` 离线双备份；keystore 丢失将无法覆盖升级。
