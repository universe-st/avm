# 《刺客大战矿工》M0 初始框架开发计划

| 项 | 内容 |
| --- | --- |
| 文档版本 | v1.0（M0 已实施；验收见 `docs/M0-ACCEPTANCE.md`） |
| 日期 | 2026-10-24 |
| 范围 | 开始游戏界面、资源加载框架、开始页 BGM、必要文档 |
| 不在范围 | 战斗系统、剧情内容、存档、角色养成、数值 |
| 技术基线 | Phaser 4.2.1 + phaser-mvvm 1.0.0（源码内置）+ TypeScript 5.9 + Vite + Cordova 13 / cordova-android 15 |
| 应用标识 | `com.universest.avm` · 英文名 **Assassins vs. Miners** |
| 签名 | 已预生成 PKCS#12：`cordova/keys/avm-release.keystore`（alias `avm`，RSA 4096，2054-03-11 到期） |
| 素材预算 | ≤ **50**（按你的预算口径，以插件实际扣费为准；累计 45 即停） |

**变更记录**：v0.1 初稿（横屏/赛璐璐/方案待定）；v0.2 改为竖屏、国风 HD-2D 像素、phaser-mvvm 源码复制、签名 APK + minSdk 21、主标题「刺客大战矿工」；v0.3 补齐包名、英文名、keystore、50 预算与 BGM 路线，并预生成签名密钥。

**已确认方向（2026-10-24）**

| 项 | 决定 |
| --- | --- |
| 屏幕 | **竖屏** |
| 美术 | **国风 HD-2D 像素** |
| phaser-mvvm | **源码复制进仓库**，后续可按需修改 |
| 素材审核 | **auto**（自检后继续，失败/重生成仍先问） |
| Android | **签名 APK**，minSdk **21** |
| 主标题 | **刺客大战矿工** |

**目录**：§1 资料研究 · §2 游戏地基 · §3 技术架构 · **§4 资源管理框架（核心）** · §5 开始界面 · §6 BGM · §7 素材 · §8 文档 · §9 里程碑 · §10 测试 · §11 风险 · §12 已定与待补

---

## 0. 一句话结论

先做一个**「能跑、能扩、能验收」的壳**：竖屏、国风 HD-2D 像素，以 `phaser-mvvm`（源码内置、可改）为 UI 骨架，搭一套**清单驱动（manifest-driven）的资源管理与预加载框架**，配一张有辨识度的标题主视觉、一首可循环的标题 BGM，以及一套给后续模块照抄的规范文档；M0 结束时，Web 与 Android（Cordova）都能从启动走到开始界面，进度条真实反映资源加载，点「开始游戏」进入一个明确标注「序章待开发」的占位页。

---

## 1. 我读了什么，得出了什么

### 1.1 剧情蓝本（已从坚果云取回并全文精读）

- 文件：`刺客与矿工.txt`，**61.5 万字，7 卷，139 章 + 6 篇「间章 审讯记录」**（另有 1 篇工程复盘），**尚未完结**，断在第 139 章。
- 卷目与体量：权力（4.0 万）· 快乐（6.7 万）· 正义（13.6 万）· 认同（15.6 万）· 爱情（7.5 万）· 尊严（13.2 万）· 知识（0.9 万，刚开篇）。
- 阅读方式：按章节边界切成 8 段（每段 5–8 万字），由 8 个子代理逐段精读，分别产出章节摘要、世界观规则、人物表、场景与美术线索、战斗与游戏化要素、术语表；本计划据此提炼，后续会落成 `docs/STORY-BIBLE.md`。

**核心设定（直接决定游戏形态）：**

| 概念 | 设定 | 对游戏的意义 |
| --- | --- | --- |
| 沉睡症 | 患者被拖入梦域、现实身体长眠；矿点建成约 30 天，40 天不可逆，150 天死亡率 99.7% | 天然的「限时救援」压力与章节目标 |
| 梦域 | 梦主欲望/认知构建的高维意识空间，规则随梦主见识而变形，有「心防」 | 每一卷 = 一个梦主 = 一个主题副本，美术可整卷换风格 |
| 矿工 | 因泰里投放的信息态模因机器人，伪装成梦中人，分普通/中阶/精英，核心为暗红色节点 | 回合制敌人体系：伪装形态 → 战斗形态 → 核心弱点 |
| 解 / 解离 | 周全的无柄白光匕首，刺碎矿工核心；对梦主执行「解离」即唤醒 | 主角的处决/破核机制，也是关卡结算条件 |
| 善变 | 用「解」命中后可变为目标形貌并读取部分记忆，限时 | 伪装潜入玩法：换装、套话、骗门禁 |
| 锚点 | 梦域中的时空裂缝，进入点兼存档点，短时间三次需休息 24h | 存档点 / 行动点 / 复活点 |
| 刺客团 | 周全、郑卿、乌梅、小白（TEAR-27），后期苏皎月加入 | 四人小队：破核 / 控场 / 刺杀 / 辅助 |
| 七星座 | 皇冠·弹弓·宝剑·话筒·玫瑰·铜钱·梦星，对应七卷主题 | **标题画面的核心视觉母题**（文本推断，见 §2.2） |

**基调判读：** 约四成幽默吐槽、两成半热血、两成悬疑、一成半温情——「用搞笑包裹沉重」。现实线是当代中国县城高中（短视频、贴吧、校服、补习），梦域线是整卷换题材的类型拼贴（宫廷、游乐园、武侠、剧院、爱情王国、月球财阀、意识科幻）。

### 1.2 技术资产（`/Users/kuangshensheng/codes/phaser-mvvm`）

- 版本 1.0.0（4 个包，API 自第 110 轮起冻结，1377 个单测，23 个验收场景），peer 依赖 `phaser@^4.2.0`，示例锁定 **4.2.1 "Giedi"**（npm `latest` 也是 4.2.1）。
- 能力覆盖本阶段所需：`UIScene`、Compose DSL（`Panel/Row/Column/Text/Button/Image/Rect/Slider`）、主题令牌、`modal`（设置弹窗）、`pages/router`（后续章节导航）、安全区、响应式布局、输入/焦点/手柄导航、无障碍镜像。
- 关键约束：Phaser 4 的 `GeometryMask` 仅 Canvas 可用，WebGL 裁剪走 `FilterList#addMask`；Canvas 渲染器已弃用，**只保证 WebGL**。
- **源码可直接编译（已实测）**：新建 Vite 工程以 `file:` 依赖四个包（`exports` 指向 `src/index.ts`），`tsc` 与 `vite build` 均通过；产物 2.9 MB / gzip 783 KB（含 Phaser）。因此把源码复制进仓库后不需要预构建 `dist`。

### 1.3 本机环境

| 项 | 现状 | 结论 |
| --- | --- | --- |
| Node / npm / pnpm | v22.23.0 / 12.0.2 / 11.7.0 | 可用；建议仓库锁 `pnpm@10.34.5`（与框架一致），或用 11 并统一 |
| Cordova CLI | **未安装** | M0.7 前 `npm i -g cordova@13` |
| Java | Homebrew `openjdk@21` 已装（`/opt/homebrew/opt/openjdk@21`）；`/usr/bin/java` 未链接 | 构建时设 `JAVA_HOME=/opt/homebrew/opt/openjdk@21`，或 `brew link openjdk@21` |
| Android SDK | 已装 `platforms 35/36`、`build-tools 35–37` | 可用；缺 `ANDROID_HOME` 环境变量需补 |
| ffmpeg | 8.1.1 | 可做 BGM 裁剪/淡入淡出/响度归一、音频转码 |
| 版本事实 | cordova 13.0.0、cordova-android 15.1.0（2026-07） | 动工时先跑 `cordova requirements` 校验 JDK/SDK 组合 |

### 1.4 三条关键结论

1. **依赖方式**：把 phaser-mvvm 的 4 个包源码复制进 `vendor/phaser-mvvm/packages/*`（连同 LICENSE），作为**可修改的第一方代码**纳入 pnpm workspace；用 `UPSTREAM.md` 记录来源 commit `ef2b43d`，用 `PATCHES.md` 记录每一处本地改动。不走 submodule，避免误以为「不可改」。
2. **渲染策略**：**竖屏**。设计宽固定 **720**，设计高按设备比例取 1280–1600 自适应；`Scale.FIT` + `CENTER_BOTH`；「设备分辨率渲染」：`scale = clamp(viewportWidth × dpr ÷ 720, 1, 2.5)`、`gameSize = 设计 × scale`、相机 `setZoom(scale)` **且 `centerOn(360, designH / 2)`**、`MVVMPlugin.configure({ designResolution: { width: 720, height: designH } })`（在 `new Phaser.Game` 之前算好）。
3. **Android 路线**：Cordova 独立工程 `cordova/`，`www/` 来自 Web 构建产物；`base: './'`、竖屏锁定、状态栏/启动屏/返回键插件；**minSdk 21 覆盖**（cordova-android 15 默认 24，需在 `config.xml` 显式降级并实测）、target/compile 36；M0 产出**签名 APK**；音频首触解锁。

---

## 2. 从小说到游戏：M0 需要的地基

### 2.1 游戏定位（先立住，不做内容）

- 类型：**回合制 RPG + 梦境潜入叙事**；单机、剧情驱动、章节制。
- 一句话卖点：**白天是县城高中生，夜里是别人梦里的刺客；你要在矿工把梦主「挖空」之前，把梦拆掉。**
- 核心循环（后续实现，M0 只留接口）：现实调查 → 选锚点潜入 → 伪装/探索 → 回合制战斗破核 → 解离梦主 → 现实推进。
- 叙事单位：**一卷 = 一位梦主 = 一个主题副本**（权力/快乐/正义/认同/爱情/尊严/知识），天然适配「章节包」式资源预加载。

### 2.2 标题画面的视觉母题（M0 直接用）

全书反复出现的「纯白梦域穹顶 + 星座」是最好的品牌符号：每救回一个人，天顶就多一枚星座。六枚已知、第七枚（梦星）刚点亮：

> 皇冠（权力）→ 弹弓（快乐）→ 宝剑（正义）→ 话筒（认同）→ 玫瑰（爱情）→ 铜钱（尊严）→ **梦星（知识）**

标题画面构图（**竖屏 9:16～9:20**）：顶部是七枚星座连成的弧线（逐枚点亮），中段是纯白梦域裂隙与裂隙深处一台猩红电子眼的矿工剪影，下方是手持白光匕首的学生背影，主标题与按钮落在下三分之一。既有「刺客 vs 矿工」的直给，又不需要画任何角色正脸，成本低、扩展性强；竖构图也天然适合手机单手拇指区。

### 2.3 美术风格定义（M0 定调，后续照此扩展）

**主张：国风 HD-2D 像素**——2D 像素美术 + 电影化的光照、景深、体积光与移轴，不引入 3D 场景（那是《八方旅人》的做法，成本与工期不适合本项目）。

| 层 | 语言 | 色彩 | 参考气质 |
| --- | --- | --- | --- |
| 现实世界 | 像素化的当代中国县城高中：低饱和、轻颗粒、有序抖动（dither），建筑与校服写实比例 | 暖黄 / 灰蓝 / 消毒水白 | 《风来之国》的光影 + 像素版《想见你》的县城记忆 |
| 梦域世界 | 高饱和像素舞台：体积光、景深、移轴、可见的布景接缝；每卷一个主色 | 整卷一个主色 + 朱红警示 | 《八方旅人》的 HD-2D 光影 +《女神异闻录》的宫殿 |
| UI | 「刺客终端」像素化：1px 描边、九宫格硬边、墨黑底 + 鎏金线 + 朱红警示 | 墨黑 / 纯白 / 朱红 / 鎏金 | 16-bit 菜单 + 国风纹样 |

**HD-2D 的落地边界（避免过度承诺）：**

- 只做 2D：背景用「远景 / 中景 / 近景」三层视差 + 光柱/尘埃/景深模糊，模拟 HD-2D 的纵深，不做 3D 地形。
- 像素基准（游戏内 sprite）：**2 个设计单位 = 1 个美术像素**（即 720 宽设计 = 360 美术像素宽）；场景 tile 32×32 美术像素，角色 32×48，敌人 48×64，Boss 96×96 起。标题主视觉是「像素风格插画」，按 2× 出图，不受这条网格限制。
- 光照：在像素画之上叠加柔和光晕、体积光与暗角；光效用 LINEAR，像素本体用 NEAREST，二者分层。
- 调色板：每卷一套 32–48 色受限色板；现实线低饱和，梦域线高饱和，朱红只给矿工。
- 字体：标题与数字用 **方舟像素字体（Ark Pixel，OFL）**，以 12/16px 美术字号设计，渲染时按 2× 或 3× 整数倍放大到设计空间（16px → 32/48 设计px），可加 1px 描边与错位阴影；需要更强书法感时，用思源宋体做 2×2 网格像素化后处理。正文用思源黑体子集（像素正文在长段落里可读性差），字号取 14/16/20/24 设计px。

**三条色彩语义（全项目通用）：** 纯白 = 解 / 小白 / 梦域本源；猩红 = 矿工 / 危险 / 电子眼；鎏金 = 梦主的执念与「被看见」的渴望。这三条会写进 `docs/ART-STYLE.md`，后续所有素材生成都以它们为准绳。

---

## 3. 技术架构

### 3.1 仓库结构

```
assassins-vs-miners/
├─ docs/                     # 计划、架构、资源规范、美术、剧情圣经、ADR
├─ public/assets/            # 运行时资源（构建产物，按 bundle 分目录）
├─ reference/                # 小说原文、分卷笔记（不参与构建）
├─ src/
│  ├─ main.ts                # 引导：注册插件/工厂/主题/字体 → new Phaser.Game
│  ├─ app/                   # GameDirector、场景注册、模块表、全局配置
│  ├─ resource/              # ★ 资源管理框架（LoaderScene / AssetService / 队列）
│  ├─ audio/                 # AudioDirector（BGM/SFX/解锁/持久化）
│  ├─ scenes/                # BootScene / TitleScene / PlaceholderScene（后续 ch.NN）
│  ├─ ui/                    # 开始界面、加载界面、设置弹窗、ProgressBar
│  ├─ assets/
│  │  ├─ bundles/            # 每个 bundle 一个 TS 文件（类型安全）
│  │  └─ modules.ts          # 场景 ↔ bundle 的依赖声明
│  ├─ theme/                 # 主题令牌、字体、色彩脚本
│  └─ game/                  # 预留：battle/、story/、save/（M0 只放空接口）
├─ tools/                    # 资源管线：manifest 生成、图集、音频转码、字体子集、体积报告
├─ cordova/                  # Cordova 工程（config.xml、hooks、www 构建输出）
├─ vendor/phaser-mvvm/       # 源码复制（非 submodule）：packages/* + LICENSE + UPSTREAM/PATCHES
├─ package.json / pnpm-workspace.yaml / tsconfig.json / vite.config.ts
└─ AGENTS.md                 # 给后续 AI/协作者的开发约定
```

### 3.2 分层与依赖方向

```
scenes / ui  →  app(GameDirector)  →  resource(AssetService)  →  Phaser Loader / Cache
     ↓                    ↓                     ↓
  audio(AudioDirector)  assets/modules      audio/sfx
     ↓
phaser-mvvm (widgets → phaser → core/layout)  +  Phaser 4
```

硬规则：**场景里不出现 `this.load.*`**；资源只经由 `assets.ensure()` / `assets.prefetch()`。这条规则写进 `AGENTS.md` 与 PR 检查清单。

### 3.3 场景与生命周期

```
BootScene            TitleScene                 PlaceholderScene
  │  core bundle        │  title bundle            │  （M1 起：ch.01）
  │  字体就绪            │  首触解锁音频            │
  │  建最小 UI           │  BGM 淡入                │
  └─► TitleScene ──────►│  开始/继续/设置 ────────►│
```

- `BootScene` 只做三件事：**算出竖屏设计高与渲染倍率**、加载 `core`、等字体 `document.fonts.ready`；随后把 DPR/安全区/平台写进全局。
- `TitleScene` 是 M0 的主角：主视觉、Logo、按钮、设置弹窗、BGM、版本号。
- `PlaceholderScene` 是「开始游戏」的落点，明确写「序章开发中」，用于验证场景切换 + 资源门禁，不写任何剧情。
- 场景切换统一走 `GameDirector.enter(moduleId)`：**先 ensure 资源、再 start 场景**，杜绝「场景已 create 但贴图还没到」的竞态。

### 3.4 phaser-mvvm 接入（源码内置，可改）

- **复制而非依赖**：把 `packages/{core,layout,phaser,widgets}`、`tsconfig.base.json`、`LICENSE` 复制到 `vendor/phaser-mvvm/`，pnpm workspace 通过 `packages: ['vendor/phaser-mvvm/packages/*']` 引用；`@phaser-mvvm/*` 版本仍写 `1.0.0`，exports 指向 `src`，Vite 直接编译 TS（已实测）。
- **可改，但要留痕**：`UPSTREAM.md` 记录来源仓库、commit `ef2b43d`、复制日期；`PATCHES.md` 逐条记录本地改动（文件 / 原因 / 日期 / 是否可上游化）。升级上游时用「拉取 → diff → 手工合并 → 跑框架自带单测」的流程，不整体覆盖。
- **改动边界**：优先在 `vendor/phaser-mvvm/packages/phaser` 的适配层改；游戏侧定制尽量用主题令牌、`configure()`、包装组件完成，减少对上游文件的侵入。
- 注册 `MVVMPlugin`（`mapping: 'mvvm'`），`installFactories()` + `installWidgetFactories()` 在模块顶层各调一次。
- 用 `UIScene` 写标题页（天然获得挂载/销毁/焦点/安全区），用 `modal` 做设置弹窗；主题令牌覆盖成「墨黑 + 鎏金 + 朱红」。
- 版本锁定：`phaser@4.2.1`（peer `^4.2.0`），禁止浮动；升级写 ADR。

### 3.5 双端构建与签名

| 端 | 命令 | 要点 |
| --- | --- | --- |
| Web | `pnpm dev` / `pnpm build` | Vite，`base: './'`；产物 `dist/` |
| Android 调试 | `pnpm android:debug` | 构建 Web → 同步 `cordova/www` → `cordova build android` |
| Android 发布 | `pnpm android:release` | `cordova build android --release --buildConfig build.json`，产出签名 APK |

Cordova 配置要点：

- `config.xml`：`<preference name="Orientation" value="portrait" />`、`Fullscreen`、启动屏与主题色一致、`android-minSdkVersion=21`、`android-targetSdkVersion=36`、`android-compileSdkVersion=36`。
- **包名（`widget id`）**：`com.universest.avm`（已定，上架后不可改）。
- **显示名**：Android 桌面/商店用英文 **Assassins vs Miners**；游戏内标题仍用中文「刺客大战矿工」，副标题英文 `ASSASSINS VS. MINERS`。
- **minSdk 21 是显式降级**：cordova-android 15 默认 24，需在 `config.xml` 写 21 并在 API 21 模拟器实测；若 WebView/WebGL 不达标，回退 24（见 §11）。
- **老 WebView 兼容**：Vite `build.target: 'es2017'`（依赖预构建同样降级），入口按需引入 polyfill；若 Phaser 产物仍带新语法，再加 `@vitejs/plugin-legacy` 出兼容包。启动时检测 WebGL 与 ES2017 能力，不达标显示「设备浏览器版本过低」而不是白屏。Android 5 的可玩性最终取决于系统 WebView 是否被更新过。
- **签名（已预生成）**：`cordova/keys/avm-release.keystore`，PKCS#12，alias `avm`，RSA 4096，有效期至 **2054-03-11**，SHA-256 指纹 `8E:96:56:42:E1:F0:D7:87:94:02:4D:22:5C:7A:5A:FD:6B:86:B9:81:82:E4:30:8A:A4:67:3A:61:0F:B7:F6:C5`。
- **密码与 gitignore**：随机 32 位密码写入 `cordova/keys/keystore.properties`（权限 600）；`.gitignore` 排除 `cordova/keys/`、`*.keystore`、`*.jks`、`*.p12`、`keystore.properties` 与生成的 `cordova/build.json`。`tools/make-build-json.mjs` 在构建时从 properties 生成 `build.json`（`keystoreType: "pkcs12"`），密钥不进入版本库。
- **校验**：构建后 `apksigner verify --print-certs`，把证书指纹与 APK 路径写进交付记录；keystore 与密码需离线双备份（丢失将无法覆盖升级）。
- 产物：`cordova/platforms/android/app/build/outputs/apk/release/app-release.apk`，CI/脚本复制为 `dist/android/assassins-vs-miners-<version>.apk`。
- 返回键映射 `mvvm.onBack`；`pause/resume` 暂停 BGM；`chrome://inspect` 真机调试。

### 3.6 分辨率、竖屏适配与像素渲染

- **设计宽固定 720，设计高自适应**：`designH = clamp(round(720 × viewportH / viewportW), 1280, 1600)`。这样 16:9（1280）、19.5:9（1560）、20:9（1600）手机都**没有黑边**；4:3 平板会上下留边（用主题背景填充）。
- `Scale.FIT` + `CENTER_BOTH`；**渲染倍率按物理像素算**，不是只看 dpr：`scale = clamp(viewportWidth × devicePixelRatio ÷ 720, 1, 2.5)`，`gameSize = { width: 720 × scale, height: designH × scale }`；相机 `setZoom(scale)` 且 **`centerOn(360, designH / 2)`**；`MVVMPlugin.configure({ designResolution: { width: 720, height: designH } })`。这样 1080 物理宽的手机（scale≈1.5）、1440 的桌面（scale=2）都接近 1:1 缓冲，文字与像素不发虚；封顶 2.5 控制显存。这是框架在 Android 模拟器上验收过的「设备分辨率渲染」路径（phaser-mvvm `PITFALLS §8.73`）：
  - 漏掉 `centerOn` 会只看到设计框右下四分之一、点击全部落空；
  - 用 `Graphics.generateTexture` 烘焙的贴图要按 `scale` 先放大再烘焙，否则开设备分辨率反而更糊；
  - 窗口比例变化（浏览器地址栏收放）只让 FIT 重新计算显示尺寸，**不重排** UI；竖屏锁定，不做横竖切换。
- 安全区：`UIRoot` 默认读 `env(safe-area-inset-*)`，标题/按钮放在安全框内；主视觉按「中心 4:5 安全构图区」设计，上下各留 15% 可裁切。
- 素材出图 **2× 设计**（1440×2560 起），在 2× DPR 设备上 1:1；主视觉向上/下用渐变与粒子延伸到 1600 设计高，不依赖裁切。

**像素渲染纪律（HD-2D 观感靠这五条）：**

1. 像素本体（角色/场景/UI 边框）纹理设 **NEAREST**，UI 文本与光效/景深贴图设 **LINEAR**，两者分层，不全局一刀切。
2. `render.roundPixels: true`；相机缩放尽量落在整数或 0.5 的倍数（美术像素 = 2 设计单位，`zoom × 720 / 2` 为整数时最锐）。
3. 图集每帧留 **1px extrude + 2px padding**，杜绝缩放时的采边。
4. 九宫格只按整数像素拉伸；按钮/面板的描边宽度固定 1–2 美术像素，不随分辨率变粗。
5. 像素字体只用 12/16/24 美术字号，并按 2×/3× 整数倍放大到设计空间；正文长段落改用思源黑体，避免阅读疲劳。
6. 文本烘焙倍率显式设 `textResolution: scale`（框架默认封顶 2，2.5 倍设备上会略软）。

- 预留：若后续要严格「像素完美」，加一个「整数倍渲染 + 视口留边」开关（ADR 记录）；M0 不做，因为标题页是大图 + UI，不是像素战斗地图。

---

## 4. ★ 资源管理框架设计

这是本阶段的核心交付，也是后续每个模块都要遵守的「游戏规则」。

### 4.1 目标与非目标

**目标**

1. 声明式：每个模块只声明「我要哪些 bundle」，不关心 URL、格式、并发。
2. 可观测：进度、当前文件、预计耗时、失败原因都能被 UI 订阅。
3. 会预判：进入场景前加载、进入后预取下一章；大资源在「变化较大的环节」提前拉。
4. 可降级：失败可重试、可占位、可阻断，不白屏。
5. 双端一致：Web 与 Cordova 的相对路径、音频解码、字体时序一致。

**非目标（M0 不做）**

- 不做 CDN/热更新/分包下载（预留接口）。
- 不做运行时图集合并、不做压缩纹理（KTX2）——留给性能优化里程碑。
- 不做多语言资源切换（结构预留）。

### 4.2 资源模型

```ts
type AssetId = string;                 // 'img.title.bg' / 'audio.bgm.title'
type BundleId = 'core' | 'ui' | 'title' | `ch.${string}` | `battle.${string}` | ...;

interface AssetDef {
  id: AssetId;
  type: 'image' | 'spritesheet' | 'atlas' | 'audio' | 'json' | 'font';
  url: string | { webp?: string; png?: string; mp3?: string; ogg?: string };
  weight?: number;        // 相对权重，缺省由构建脚本按字节写入
  required?: boolean;     // 默认 true；false 时失败只降级
  loop?: [number, number];// BGM 循环点（秒）
  tags?: string[];        // 'bgm' | 'sfx' | 'ui' | 'portrait' | ...
}

interface BundleDef {
  id: BundleId;
  assets: AssetDef[];
  dependsOn?: BundleId[]; // 例如 title 依赖 core
  budgetKB?: number;      // CI 体积门禁
}

interface GameModule {          // 场景/功能模块
  id: string;                   // 'title' | 'ch.01' | 'battle.boss.01'
  requires: BundleId[];         // 进入前必须就绪
  prefetch?: BundleId[];        // 进入后空闲预取
  gate?: {
    showProgress: 'auto' | 'always' | 'never';
    title?: string;             // 加载页文案
    tip?: string[];             // 轮播提示
    minVisibleMs?: number;      // 防闪烁，默认 400
  };
}
```

**命名规范**：`img.<bundle>.<name>`、`audio.bgm.<name>`、`audio.sfx.<name>`、`font.<name>`；文件路径 `public/assets/<type>/<bundle>/<name>@2x.webp`。ID 全局唯一，构建期校验（重复即构建失败）。

### 4.3 加载器（AssetService + LoaderScene）

- **单一加载者**：一个常驻的 `LoaderScene`（`active: true`，不参与显示），持有 Phaser `LoaderPlugin`；全局只有一个加载队列，避免多场景并发抢 cache。
- **队列与优先级**：`foreground`（阻塞进入）> `prefetch`（空闲）。同一时刻只跑一个 foreground 批次；foreground 到来时 prefetch 暂停（保留已完成的文件），等前景完成后继续。
- **去重**：按 `AssetId` 记录状态（`idle/queued/loading/ready/failed`）；同一资源被两个模块请求只加载一次，返回同一个 Promise。
- **增量**：`ensure()` 只加载「尚未 ready」的文件；已加载的直接计入 100%。
- **批次**：一个 bundle 一批；多 bundle 合并成一个批次计算进度（例如 boot 冷启动合并 `core + title`，只闪一次加载页）。
- **取消**：`AbortSignal`；取消只停队列，已下载的文件保留（下次命中）。
- **并发**：Phaser Loader 自带并发上限（默认桌面 32、Android 自动降为 6，见 `loaderMaxParallelDownloads`）；我们在 LoaderScene 上按端覆盖为移动端 4–6、桌面 8–16，并限制同时最多 1 个批次。

### 4.4 进度契约（UI 只认这个）

```ts
interface LoadState {
  phase: 'idle' | 'loading' | 'ready' | 'error';
  bundleId: BundleId | null;
  progress: number;        // 0..1，按权重，单调递增
  currentId: AssetId | null;
  loaded: number;          // 已完成文件数
  total: number;           // 本批文件总数
  bytesLoaded: number;     // 估算值（构建期写入）
  bytesTotal: number;
  startedAt: number;
  error?: { id: AssetId; reason: string; retryable: boolean };
}
```

- **进度 = Σ已完成权重 / Σ总权重**，不是 Phaser 的「文件计数」。大 BGM 和小图标权重不同，进度条才不「卡在 90%」。
- 权重来源：构建脚本按文件字节写入 `weight`（1 KB≈1，Clamp 到 [1, 4096]）；运行时可用 `AssetDef.weight` 覆盖（例如 BGM 权重调高，避免视觉上突然跳）。
- **单调性**：批次内只增不减；重试不回退（进度条原地等待并显示「重试中」）。
- **完成**：`progress = 1` 且 `phase = 'ready'` 后，至少再显示 120 ms 才切场景（避免 100% 一闪而过）。
- **失败**：`phase = 'error'`，带失败文件与是否可重试；必需资源失败 → 阻断并给「重试 / 退出」。

### 4.5 预加载规则（每个模块照此申报）

**四类加载点：**

| 类型 | 触发时机 | 何时开始 | 是否显示进度条 | 目标耗时 |
| --- | --- | --- | --- | --- |
| A 冷启动 | 应用启动 | 立即 | 总是（全屏） | ≤ 2s |
| B 场景门禁 | 切场景前 | 点击/事件触发时 | 预计 > 200ms 才显示 | ≤ 1.5s |
| C 环节预取 | 进入场景后空闲 | 延迟 500ms / `requestIdleCallback` | 不显示 | 无硬指标 |
| D 章节前瞻 | 当前章稳定后 | 空闲 | 不显示 | 下一章 ≤ 30s 内完成 |

**具体规则（写进 `docs/RESOURCE-SPEC.md`，逐条可检查）：**

1. **禁止场景内加载**：`create()` 里不得出现 `this.load`；新增资源必须登记 bundle。
2. **进入即就绪**：`GameDirector.enter(module)` 先 `await assets.ensure(module.requires)`，再 `scene.start`；场景 `create()` 里资源 100% 可用。
3. **加载页三档**：预计 < 200ms 不显示；200ms–1s 显示右下角细条；> 1s 显示全屏「潜入梦域」页（主视觉 + 进度条 + 提示语）。预计耗时用「上次同 bundle 实测耗时」或「字节数 / 2MB/s」估算。
4. **防闪烁**：加载页最短显示 400ms，淡入 150ms；100% 后停留 120ms 再切。
5. **预取让位**：foreground 请求到来时，prefetch 立即暂停；同一时刻只跑 1 个预取批次。
6. **预取上限**：预取不超过「当前章 + 下一章 + 战斗公共包」；内存/缓存超预算（默认 256MB）时停止预取并 LRU 淘汰最久未用的章节包。
7. **章节前瞻**：进入第 N 章 3 秒后（且无前台加载）预取第 N+1 章；玩家退出章节则不预取。
8. **战斗前置**：触发战斗事件时，先加载 `battle.common + battle.<id>`，用战斗转场（白光/碎裂）遮住加载；> 1s 时转场延长并显示细条。
9. **可在弱网降级**：`navigator.connection.saveData` 为真时关闭 C/D 预取，只保留 A/B。
10. **每卷独立**：章节包不得互相依赖；公共资源上移到 `ui` / `battle.common`，避免重复下载。
11. **预算门禁**：`core ≤ 2MB`、`title ≤ 6MB`、单章 `≤ 8MB`、单场战斗 `≤ 5MB`；CI 超限即失败。
12. **必备占位**：每个必填图像有 1×1/棋盘格占位、音频有静音占位，失败时不白屏。

**4.5.1 新模块接入流程（后续每个场景照做三步）**

1. **登记资源**：在 `src/assets/bundles/<bundle>.ts` 写 `AssetDef`（id / type / url / weight），或把资源放进已有公共 bundle（`ui`、`battle.common`）。
2. **声明模块**：在 `src/assets/modules.ts` 注册 `GameModule`，写清 `requires`（进入前必须就绪）、`prefetch`（进入后空闲预取）、`gate`（加载页文案与阈值）。
3. **走门禁进入**：`GameDirector.enter('<module>')`，不在场景 `create()` 里加载；PR 检查三项——无 `this.load`、`check-budgets` 通过、`RESOURCE-SPEC.md` 已登记该 bundle。

对照表（决定「需要什么」的默认答案）：

| 模块类型 | requires | prefetch |
| --- | --- | --- |
| 标题/菜单 | `core` + `title` | 无 |
| 章节场景 ch.NN | `ui` + `ch.NN` | `ch.NN+1` + `battle.common` |
| 战斗 | `battle.common` + `battle.<id>` | 下一场 `battle.<id+1>` |
| 大剧情/过场 | `cutscene.<id>` | 下一章 `ch.NN+1` |
| 设置/档案 | `ui`（首次） | 无 |

### 4.6 失败、重试与降级

- 单文件失败自动重试 2 次（300ms / 900ms 退避），仍失败则标记 `failed` 并继续批次。
- `required: true` 的文件失败 → 批次失败 → 加载页显示「重试 / 返回标题 / 查看详情」。
- `required: false`（装饰图、可选语音）失败 → 用占位并继续，控制台/上报记录一次 `degraded`。
- 全局错误页复用设置弹窗的视觉，不再单独做一套。
- 断网恢复：监听 `online` 事件，若当前处于错误页，提供「一键重试」。

### 4.7 缓存与释放

- Phaser 的 `cache`/`textures` 是全局的：`AssetService` 维护 `bundle → assetIds` 与引用计数（`retain/release`）。
- `core`/`ui`/`title` 常驻；章节包在离开章节后 `release`，计数归零且缓存超阈值才真正 `textures.remove` / `cache.audio.remove`。
- **释放只发生在安全点**（场景 `shutdown` 之后、下一场景 `create` 之前），且跳过仍被其它 bundle 引用的资源。
- M0 默认不开启淘汰（资源很少），只把 API 与单测做出来；M1 接入章节后再打开开关。

### 4.8 音频总线（AudioDirector）

- `playBgm(id, { fadeIn, loop, volume })` / `stopBgm({ fadeOut })` / `playSfx(id)` / `duck(ms)`。
- **首触解锁**：进入标题先尝试 `play()`；被浏览器拦截则显示一个不打扰的「点击开启声音」提示，第一次 pointerdown 调 `sound.unlock()` 并用 0 音量播一个空 buffer，随后 BGM 淡入（浏览器自动播放策略 + Android WebView 都需要）。
- **跨场景不重启**：同一首 BGM 只切场景不重播；不同 BGM 交叉淡入淡出（600–1000ms）。
- **后台暂停**：`visibilitychange` / Cordova `pause` 暂停 BGM 与计时，`resume` 恢复。
- **持久化**：音量/静音写 `localStorage`（`avm.settings.v1`），启动时读回；设置弹窗实时生效。
- 音频格式：BGM 用 MP3 128kbps CBR（兼容性最好），另出 OGG 作为可选；SFX 用 MP3 96k 或短 WAV。

### 4.9 资源规范（摘要，完整版进 `RESOURCE-SPEC.md`）

| 类别 | 规范 |
| --- | --- |
| 目录 | `public/assets/{img,audio,font,data}/<bundle>/` |
| 命名 | 全小写 + 下划线；`<name>@2x.webp`；图集 `ui.atlas.json` + `ui.webp` |
| 图像 | 源图 2× 设计（竖屏 1440 宽起）；像素本体 NEAREST、光效 LINEAR；WebP（含 alpha）+ PNG 回退；单图 ≤ 2048；同主题小图打图集，图集留 1px extrude + 2px padding |
| 音频 | BGM 60–120s 可循环，-16 LUFS；SFX ≤ 2s；循环点写进 manifest |
| 字体 | 方舟像素字体（标题/数字，OFL）+ 思源黑体子集（正文）；WOFF2，首屏前 `FontFace.load` 等待 |
| 数据 | JSON（UTF-8，无 BOM），构建期校验 schema |
| 版本 | manifest 记录 `hash`/`size`/`mtime`，用于缓存与排查 |

### 4.10 工具链与 CI 校验

`tools/` 下五个脚本：

1. `build-manifest.mjs`：扫描 `public/assets` → 生成 `src/assets/manifest.gen.json`（id/type/url/bytes/hash/尺寸），并校验 ID 唯一、被引用文件存在。
2. `make-atlas.mjs`：把 UI 小图打成图集（后续接 TexturePacker 或 sharp）。
3. `audio-post.mjs`：调用 ffmpeg 做响度归一、淡入淡出、裁剪循环点、导出 mp3/ogg。
4. `make-build-json.mjs`：从 `cordova/keys/keystore.properties` 生成签名用 `cordova/build.json`（gitignore），避免密钥入库。
5. `check-budgets.mjs`：按 bundle 汇总体积，超预算退出码 1；输出体积报告（构建日志可读）。

CI（GitHub Actions 或本地 pre-push）：`typecheck` → `vitest` → `build` → `check-budgets` → Playwright 冒烟。

---

## 5. 开始游戏界面（M0 交付物 1）

### 5.1 画面构成（竖屏）

```
┌──────────────────────────┐
│ v0.1.0            设置 ⚙ │
│          ✦ ✦ ✦           │  ← 七星座弧线（逐枚点亮）
│        ✦       ✦         │
│                          │
│    〔纯白裂隙 + 矿工〕    │  ← 中段主视觉（视差）
│                          │
│                          │
│    〔刺客大战矿工〕       │  ← 主标题（像素字体 + 1px 描边）
│    〔此刻，潜入谁的梦？〕 │  ← 宣传语（像素小字）
│                          │
│        ▶ 开始游戏        │
│          继续游戏        │  ← 无存档置灰
│          制作名单        │
│                          │
│ © 2026 …        v0.1.0   │
└──────────────────────────┘
```

- **主标题「刺客大战矿工」**，宣传语「此刻，潜入谁的梦？」，副标题「在别人的梦里，做自己的刺客」；主标题用方舟像素字体 16px 美术字号 ×3（48 设计px）粗体 + 1px 描边，宣传语与副标题用像素小字。
- 竖屏三段式：上 1/3 星座与月光，中 1/3 裂隙与矿工剪影，下 1/3 标题与按钮；拇指导航区（底部 120px）只放按钮，不放需要精细点击的元素。
- 首次进入播放 2–3 秒的「裂隙展开」入场：白光从中心撕开，星座依次点亮，标题落位；可跳过（任意键/点击）。
- HD-2D 处理：背景三层视差（远景星尘 / 中景裂隙 / 近景光尘），叠加体积光柱、暗角与轻微景深模糊；像素层保持硬边，光效层用半透明渐变。
- 中文主标题下方加一行小号英文 `ASSASSINS VS. MINERS`（像素字，字距拉开），用于品牌统一；商店与 Android 桌面名用英文。
- 交互：按钮 hover 有 1px 刃光扫过；点击有「解」的白色划痕音效；BGM 首触后淡入。

### 5.2 按钮与状态

| 按钮 | 行为 | M0 |
| --- | --- | --- |
| 开始游戏 | `GameDirector.enter('ch.00')` → 占位页 | ✅ |
| 继续游戏 | 读存档；无存档置灰并 tooltip「暂无存档」 | 置灰 |
| 设置 | 打开 modal：BGM/音效音量、静音、全屏、清除缓存、制作名单 | ✅ |
| 制作名单 | 滚动名单（引擎/框架/素材/字体授权） | ✅ |
| 退出 | Web 无；Android 返回键二次确认退出 | ✅ |

### 5.3 验收标准

- 360×640（16:9）、390×844（19.5:9）、412×915（20:9）、768×1024（4:3 平板）四种视口下，标题与按钮不重叠、不被裁切、不压刘海。
- 竖屏下页面高度随设备伸缩（1280–1600 设计高），按钮始终在安全区内；20:9 无黑边，4:3 上下留边为星尘背景。
- 首帧到可交互 ≤ 2.5s（本地）；加载页进度真实、不倒退。
- 鼠标/触摸/键盘（Enter、方向键、Esc）都能完成「开始 → 设置 → 返回 → 开始」。
- 设置项重启后保留；静音后 BGM/SFX 均无声。

---

## 6. 开始页 BGM（M0 交付物 3）

### 6.1 音乐设计

- 曲名暂定 **《潜入》**；用途：标题/主菜单循环。
- 配器：古筝/琵琶点奏 + 低频电子脉冲 + 弦乐铺底 + 无词女声吟唱 + 少量金属质感打击（呼应矿工）。
- 情绪：**悬疑、克制、暗涌**，不是燃曲；给「开始游戏」留一个轻微的期待感。
- 结构：60–90 秒可无缝循环，避免明显前奏与终止式；结尾可接回开头。
- BPM 88–96；调性 D 小调 / A 小调；响度 -16 LUFS，真峰值 ≤ -1 dBTP。

### 6.2 生产流程（游戏素材大师 · 音乐）

1. `intake(module:"music")` 确认用途、风格、是否后期、审核模式（auto/manual）——**先问再做**。
2. `createMusicJob({ name:"avm-title", workflow:"generate", source:{ kind:"prompt", prompt:"…", instrumental:true } })`。
3. 读 `getMusicGuide` 后 `runMusicGeneration`（★计费，Suno 返回 2 首）；`wait` 到落盘。
4. 选曲：听 2 首，按「循环友好度 / 前 10 秒抓耳度 / 与美术匹配度」打分，选定 1 首。
5. 后期（本地免费）：`renderMusicEdit` 裁剪到 16/32 小节、1.5s 首尾交叉淡化、`loudnorm -16 LUFS`；`exportMusic` 出 WAV 母带 + MP3 128k 游戏版。
6. 用 ffmpeg 生成 OGG 备份；循环点写入 manifest；入库并登记 `ASSET-CREDITS.md`。

### 6.3 授权与风险

- 生成音乐的商用授权以「游戏素材大师」所用后端（Suno/Mureka 等）的条款为准；**首次生成前把条款摘要写进 `ASSET-CREDITS.md`**，并在商店页注明「AI 生成音乐」。
- 备选：若授权不满足上架要求，改用免版税曲库（Artlist/Epidemic）或委托作曲；M0 先用生成版验证流程。

---

## 7. 素材制作计划（游戏素材大师）

M0 只做「开始界面 + 加载 + UI」所需，控制在 8 项以内，避免过度生成。

| # | 素材 | 规格 | 用途 | 生成方式 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 1 | 标题主视觉 | 1440×2560 WebP（竖） | 标题背景 | image | 国风 HD-2D 像素；七星座 + 白光裂隙 + 矿工剪影；不含文字 |
| 2 | 徽记 / Logo 图形 | 1024×1024 透明 PNG | 标题标识 | image + 抠像 | 像素风白色匕首 + 环形星座；文字用字体排 |
| 3 | 加载页背景 | 1440×2560 WebP（竖） | 全屏加载 | image | 像素风白光隧道 / 梦域入口，低对比、中心留空压字 |
| 4 | UI 套件 | 图集（像素九宫格） | 按钮/面板/进度条/滑块 | image + 抠像 | 墨黑、金线、朱红；1–2px 硬边 |
| 5 | 图标集 | 32×32 / 64×64 美术像素 | 设置、音量、返回、关闭、播放 | image + 抠像 | 统一 1px 线宽，NEAREST |
| 6 | 标题 BGM | 60–90s | 开始页循环 | music | 已定：直接用游戏素材大师生成；见 §6 |
| 7 | UI 音效 | 5 条 | 点击/悬停/确认/加载完成/转场 | sfx | 短、轻、不刺耳 |
| 8 | 字体 | WOFF2 子集 | 全 UI | 开源字体子集 | 方舟像素字体（标题）+ 思源黑体（正文），非生成 |

**预算与流程（总额 ≤ 50，按插件实际扣费）：** 先做 #6 BGM（1 次提交，返回 2 首）与 #1 主视觉（2 张候选）定调，再做 #2–#5；每次付费提交前报「这一步预计消耗 + 当前累计」，累计到 45 就停，绝不超 50。流程：`intake` 记录 **auto** 审核 → 生成 → 每步 `review` 自检（构图/像素网格/色彩语义/文字留白）→ 入库 → `build-manifest` 扫描。生成后先 `wait`；失败或需要再生成仍先问。

**风格提示词骨架（供生成时展开）：**

> 国风 HD-2D 像素艺术，竖屏手机游戏主视觉，9:16；16-bit 像素角色与场景，叠加现代电影级光照（体积光、景深、移轴、轻微泛光），《八方旅人》式质感；纯白无垠的梦境空间与当代中国县城夜景交叠；顶部一枚发光的像素星座弧线（皇冠、弹弓、宝剑、话筒、玫瑰、铜钱、星芒）；画面中段是一道白色裂隙，裂隙深处一台锈蚀机械矿工剪影、猩红电子眼；下方是瘦削高中生的背影剪影，深色连帽衫，右手握一柄发出纯白光芒的无柄匕首；冷蓝 + 纯白为主，朱红点缀，上方与下方留出标题/按钮安全区；像素边缘清晰、色板克制、有留白。
>
> 负面：文字、水印、logo、写实照片、3D 渲染、平滑矢量、杂乱、过曝、非像素笔触。

---

## 8. 必要的文档（M0 交付物 4）

| 文档 | 目的 | 关键内容 | 更新时机 |
| --- | --- | --- | --- |
| `README.md` | 新人 5 分钟跑起来 | 环境要求、安装、dev/build/android、目录说明 | 每次改命令 |
| `docs/PLAN-M0.md` | 本计划 | 范围、设计、里程碑、验收 | 评审后冻结 |
| `docs/ARCHITECTURE.md` | 技术骨架 | 分层、场景生命周期、GameDirector、事件流 | 架构变更 |
| `docs/RESOURCE-SPEC.md` | **资源规则书** | 命名、bundle 表、预加载矩阵、进度契约、预算、失败策略 | 新增 bundle 时 |
| `docs/ART-STYLE.md` | 美术圣经 | 三套色彩语法、角色剪影、UI 材质、字体、构图安全区 | 新卷/新素材 |
| `docs/STORY-BIBLE.md` | 改编地基 | 世界观、七卷主题、人物小传、术语、章节索引、改编原则 | 小说更新时 |
| `docs/ANDROID.md` | 双端交付 | Cordova 环境、构建、签名、真机调试、已知问题 | 每次打包 |
| `docs/ASSET-CREDITS.md` | 合规 | 每项素材来源、生成记录、授权、字体许可 | 每次入库 |
| `docs/adr/000x-*.md` | 决策留痕 | 依赖方式、渲染策略、Cordova、资源框架 | 决策时 |
| `AGENTS.md` | 协作约定 | 目录、命名、禁止事项（场景内加载）、提交规范 | 持续 |

---

## 9. 里程碑、产出与验收

| 里程碑 | 产出 | 验收标准 | 估时 |
| --- | --- | --- | --- |
| M0.0 仓库与工装 | pnpm workspace、tsconfig、Vite、lint/format、目录 | `pnpm build` 空壳可跑；`typecheck` 绿 | 0.5d |
| M0.1 框架接入 | vendor 源码复制 + UPSTREAM/PATCHES、插件/工厂/主题、UIScene 示例 | 页面能挂载、按钮能点、Esc 返回；vendor 四个包能跑 typecheck | 0.5d |
| M0.2 资源管线 | manifest 生成、bundle 定义、体积报告 | 清单与磁盘一致；缺文件即报错 | 1d |
| M0.3 资源框架 | AssetService、LoaderScene、队列/去重/重试/取消、进度条 | 单测覆盖 8 种边界；进度单调 | 2d |
| M0.4 开始界面 | 主视觉、Logo、按钮、设置弹窗、占位页 | 4 种竖屏视口截图通过；键鼠触全通 | 1.5d |
| M0.5 音频 | AudioDirector、解锁、淡入淡出、持久化、BGM 入库 | 首触有声；切场景不断；静音持久 | 1d |
| M0.6 素材 | §7 的 8 项素材入库 | 风格统一；无版权问题；体积达标 | 1.5d（不含排队） |
| M0.7 Android | Cordova 工程、竖屏、返回键、minSdk21 实测、签名 APK（keystore 已预生成） | API 21 模拟器 + 真机启动到标题；APK 签名校验通过；后台恢复 | 2d |
| M0.8 文档与验收 | 全部文档、测试报告、截图 | 文档齐全；测试全绿；Demo 可演示 | 1d |

合计约 **11 个工程日**（不含素材生成排队与设计返工）。建议按 M0.0→M0.3 先打通「资源 → 进度 → 场景」主链路，再接 UI 与素材，最后打 Android。

---

## 10. 测试策略

| 层 | 工具 | 覆盖 |
| --- | --- | --- |
| 单测 | Vitest | AssetService（去重/权重进度/重试/取消/失败降级/并发）、manifest 校验、AudioDirector（mock sound）、设置持久化 |
| 组件/场景 | Playwright（Chromium） | 冷启动 → 标题；进度 0→100；开始→占位；设置开关；键盘导航 |
| 视觉 | Playwright 截图 | 4 种视口 + 深色/浅色（预留）；基线图对比 |
| 真机 | Android 模拟器 + 真机 | 竖屏、安全区、返回键、首触音频、后台恢复、WebView 控制台无错、APK 安装 |
| 性能 | 自建埋点 | 首帧时间、加载耗时、bundle 体积、FPS（标题页 ≥ 55） |

门禁：`typecheck` + `vitest` + `check-budgets` + Playwright 冒烟全部通过才能合入。

---

## 11. 风险与对策

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| phaser-mvvm 源码内置后与上游漂移 | 升级困难、行为不一致 | `UPSTREAM.md` 记 commit、`PATCHES.md` 记改动；升级时 diff + 跑框架自带单测；定制优先走主题/包装层 |
| **minSdk 21 低于 cordova-android 15 默认 24** | 装不上/白屏/WebGL 不可用 | `config.xml` 显式 `android-minSdkVersion=21`；API 21 模拟器 + 真机实测；启动时检测 WebGL 并给友好提示；不达标则回退 24 并告知 |
| Phaser 4 与网上 Phaser 3 教程不兼容 | 踩坑 | 只读 Phaser 4 迁移指南与框架 PITFALLS；不用 `setMask` 等 v3 写法 |
| 手机高 DPR 下文字/像素发糊 | 观感差 | `gameSize = 设计 × scale` + 相机缩放 + `designResolution`；像素纹理 NEAREST、文本 LINEAR；2× 素材 |
| HD-2D 像素素材风格不统一 | 观感廉价 | 先定主视觉与 32–48 色色板；生成时用参考图锁定风格；角色/序列帧后续走 sprite/sequence 模块 + 人工修像素 |
| 竖屏高度差异（16:9～20:9） | 布局错位/黑边 | 固定设计宽 720、高 1280–1600 自适应；按钮放安全区；4:3 平板允许留边 |
| 中文长句换行/字体缺失 | 排版崩 | 框架的逐码点换行；像素字体只做标题、正文用黑体；字体子集预加载 |
| Cordova 15 需要 JDK/SDK 版本匹配 | 打不出包 | 动工前 `cordova requirements`；装 JDK 17/21、SDK 36；必要时退回 cordova-android 14 |
| 签名 keystore 丢失 | 无法覆盖升级 | **已预生成**；keystore + `keystore.properties` 离线双备份（本地加密 + 私密云盘）；SHA-256 记录进交付文档 |
| WebView 音频自动播放限制 | 标题无 BGM | 首触解锁 + 静音缓冲；UI 明确「点击开始」 |
| AI 音乐授权不确定 | 上架风险 | 先核对条款；保留免版税/委托备选 |
| 小说未完结 | 剧情断点 | 以七卷主题为章节骨架；第一季建议收在第 138 章「梦星」 |
| 资源体积膨胀 | 首启慢 | 预算门禁 + 章节分包 + 图集 + WebP；预取上限 |

---

## 12. 已定方案与待补信息

**已补齐（2026-10-24）：**

| 项 | 结果 |
| --- | --- |
| 包名 | `com.universest.avm` |
| 英文名 | **Assassins vs. Miners**（Android 桌面/商店用 `Assassins vs Miners`；如需另拟告诉我） |
| keystore | 已生成 `cordova/keys/avm-release.keystore`（PKCS#12，alias `avm`，RSA 4096，至 2054-03-11）；密码在 `keystore.properties`（600，gitignore） |
| 素材预算 | ≤ 50（按实际扣费）；先 BGM + 主视觉，累计 45 停 |
| BGM | 直接用游戏素材大师生成；上架前核对商用条款 |
| 屏幕 | 竖屏 |
| 美术 | 国风 HD-2D 像素 |
| phaser-mvvm | 源码复制，可改，留 PATCHES |
| 素材审核 | auto |

**仍建议你做的一件事（不阻塞）：** 把 `cordova/keys/` 整个目录复制到离线加密盘或私密云盘。keystore 丢了，应用就无法覆盖升级；密码文件与 keystore 最好分开两处保存。

**需要你知情的选择（不阻塞）：** minSdk 21 是低于 Cordova 15 官方默认（24）的降级。我会在 API 21 模拟器上实测 WebGL/字体/音频；如果实测不通过，会在 M0.7 汇报并请你决定「抬到 24」还是「保留 21 但砍新特性」。

---

## 附录 A：目录树（M0 完成态）

```
assassins-vs-miners/
├─ docs/{PLAN-M0,ARCHITECTURE,RESOURCE-SPEC,ART-STYLE,STORY-BIBLE,ANDROID,ASSET-CREDITS}.md
├─ docs/adr/0001..0004
├─ public/assets/
│  ├─ img/{core,title,ui}/
│  ├─ audio/{bgm,sfx}/
│  └─ font/
├─ src/{app,resource,audio,scenes,ui,assets,theme,game}/
├─ tools/{build-manifest,make-atlas,audio-post,make-build-json,check-budgets}.mjs
├─ cordova/{config.xml,build.json,hooks/,www/,keys/（gitignore）}
├─ vendor/phaser-mvvm/{LICENSE,UPSTREAM.md,PATCHES.md,tsconfig.base.json,packages/{core,layout,phaser,widgets}}
├─ reference/{刺客与矿工.txt,notes/chunks/}
└─ README.md / AGENTS.md / .gitignore / package.json / vite.config.ts
```

## 附录 B：M0 的 bundle 草案

| bundle | 内容 | 预算 | 加载点 |
| --- | --- | --- | --- |
| `core` | 字体、UI 图集、图标、加载页背景、按钮音效 | 2 MB | 冷启动（全屏） |
| `title` | 主视觉、Logo、标题 BGM | 6 MB | 与 core 合并批次（全屏） |
| `ui` | 设置弹窗、滑块、通用面板（可并入 core） | 1 MB | 首次打开设置（细条） |
| `ch.00` | 占位页背景（M1 换成序章资源） | — | 点击开始（细条） |
| `battle.common` | 预留：战斗 UI/技能图标/命中特效 | ≤ 3 MB | M1 起 |
| `ch.NN` | 每章背景/立绘/敌人/BGM | ≤ 8 MB | 章前 + 预取 |

## 附录 C：模块声明模板（后续每个场景照抄）

```ts
export const ch01: GameModule = {
  id: 'ch.01',
  requires: ['ui', 'ch.01'],
  prefetch: ['ch.02', 'battle.common'],
  gate: {
    showProgress: 'auto',
    title: '记忆碎片重组中',
    tip: ['梦域规则由梦主的认知决定', '矿工的核心在暗红色节点', '锚点每日只能开启三次'],
    minVisibleMs: 400,
  },
};
```

---

> 附：小说原文与分卷切片存放于 `reference/`（`刺客与矿工.txt` + `notes/chunks/part01–08.txt`），不参与构建；8 段精读结论已提炼进本文。本文所有剧情判断均来自该版本全文；七星座与卷主题的对应为文本内推断，已在 §2.2 标注。
