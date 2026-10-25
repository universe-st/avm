# 开幕剧情验收记录

- 日期：2026-10-24
- 范围：标题页「开始游戏」后的开幕剧情（5 张配图 + 逐字文案 + 实时动画）、跳过/返回/继续、资源 bundle、文档
- 文案真值：`src/story/prologue.ts`

## 1. 构建与自动检查

| 项 | 结果 |
| --- | --- |
| `pnpm typecheck` | 通过 |
| `pnpm test` | 通过，23/23（新增 `prologue-script` 10 项、`prologue-player` 7 项） |
| `pnpm assets:check` | 通过，11 key / 11 url，无重复、无缺失 |
| `pnpm build` | 通过；JS 1,673.83 kB / gzip 457.91 kB |
| `pnpm android:debug` | 通过；APK 6.9 MB |
| `cutscene.prologue` 体积 | 5 张 WebP 合计约 1.1 MB（预算 6 MB） |

## 2. Web 验收

视口：390×844、1200×648。

- 标题 → 开始游戏 → 加载（或标题页预取后直接进入）→ 开幕剧情完整播放 → 日期卡 → 点击继续 → 占位页。
- 文案逐句与用户原文一致；舞台提示「深夜天幕，一颗流星划过」以无括号小字幕出现。（2026-10-25 改版：该字幕已删除，见 §5）
- 交互：
  - 打字中轻触：补全当前句；
  - 停留中轻触：进入下一句；
  - 最后一 cue：显示「点击继续」，轻触进入占位页；
  - 右上角「跳过」：直接进入占位页；
  - Esc/返回：回到标题。
- 减少动态（`prefers-reduced-motion: reduce`）：`scene.reduced === true`，无震屏；剧情仍可完整播放。
- 控制台：修复 favicon 后，新页面加载 0 error / 0 warning。
- 截图：
  - [深夜天幕](screenshots/web-prologue-sky.png)
  - [你，有做过梦吗？](screenshots/web-prologue-question.png)
  - [梦的本源](screenshots/web-prologue-dream.png)
  - [梦坠地球](screenshots/web-prologue-disaster.png)
  - [无声的战争](screenshots/web-prologue-war.png)
  - [群英高中](screenshots/web-prologue-school.png)
  - [日期卡](screenshots/web-prologue-card.png)
  - [1200×648](screenshots/web-prologue-1200x648.png)

## 3. Android 验收

- 设备：Android Emulator API 36，1080×2400。
- 安装：`adb install -r dist/android/assassins-vs-miners-0.1.0-debug.apk` 成功（先卸载了旧签名的同包名应用）。
- 启动：`am start -n com.universest.avm/.MainActivity` 成功，标题正常渲染。
- 开幕：点击/键盘激活「开始游戏」后进入开幕，夜空、流星、字幕、跳过按钮、「你，有做过梦吗？」均正常渲染。
- 返回键：开幕中按系统返回，回到标题。
- logcat：未发现 `Uncaught` / JS `TypeError` / `ReferenceError`；仅有 Chromium/Google 服务的网络握手日志。
- 截图：
  - [Android 标题](screenshots/android-title-0.1.0.png)
  - [Android 开幕](screenshots/android-prologue.png)
- 已知环境问题：模拟器在冷启动时多次弹出 `System UI / Pixel Launcher isn't responding`，属于模拟器系统负载；应用本身可操作。完整「点击继续 → 占位页」与「跳过」交互已在 Web 端验证。

## 4. 资源与版权

- bundle：`src/assets/bundles.ts` 的 `cutscene.prologue`。
- 文件：`public/assets/img/prologue/*.webp`（1080×1920，WebP q88）。
- 原图：`assets-src/prologue/*.png`（1584×2816）。
- 任务：`imvmh0kec47db75`、`imvmh22g1783dbc`、`imvmh22ghe4c80f`、`imvmh22goaf93e4`、`imvmh22gubffd56`。
- 来源、提示词与后期步骤见 [ASSET-CREDITS.md](ASSET-CREDITS.md) §7；剧情补充登记见 [STORY-BIBLE.md](STORY-BIBLE.md) §8.1。

## 5. 已知限制

1. 开幕正文是 Phaser Text，暂未接入 DOM a11y 镜像；跳过按钮与「点击继续」提示可键盘/读屏访问。
2. 1080×1920×5 解码约 41 MB；低端机若出现纹理压力，可重编码为 900×1600，代码不变。
3. 不新增 BGM/配音；沿用标题曲《潜入》，跳过按钮复用 `audio.sfx.click`。
4. Android 模拟器系统 ANR 影响完整交互复测；Web 端已覆盖完整流程。
5. 「继续游戏」仍为置灰；没有「看过后跳过」的存档标记，每次开始都会播放。

## 5. 2026-10-25 改版：删开场字幕、逐字提示音、手动/自动

### 5.1 改动

| 项 | 之前 | 现在 |
| --- | --- | --- |
| 开场字幕 | 夜空上以无括号小字幕显示「深夜天幕，一颗流星划过」 | 删除（`PrologueCue.caption` 一并移除），第一句直接从「你，有做过梦吗？」开始；流星扫掠动画保留 |
| 逐字音效 | 无 | 每冒出一个字播一声短促提示音；三档音高（G5/A5/B5）轮流，`audio.sfx.type1..3` |
| 节奏 | 打完一句按 `holdMs` 自动进下一句 | **默认手动**：每句打完停住（底部「点击继续」），点一下补全当前句、再点进入下一句 |
| 控制按钮 | 文字「自动：开/关」与「跳过」 | 改为无边框图标：▶▶ 自动播放、▶| 跳过剧情（56×56 触控区，可见文字为空，读屏名由 `label` 提供） |
| 自动播放 | — | 右上角无边框图标按钮 ▶▶（自动播放）与 ▶|（跳过）；自动开启时按钮变鎏金底、图标转墨色，用颜色表示选中。自动模式按 `holdMs` 过句，但最后一张日期卡仍然等点击 |

实现位置：`src/story/prologue.ts`（cue 真值）、`src/story/prologue-player.ts`（`waiting/holding` 两种等待）、`src/scenes/prologue-scene.ts`（提示音与图标按钮）、`src/audio/audio-director.ts`（`playTypeBlip`）。图标按钮走 Compose：`Button('', { icon, label, width: 56, toggle, value })`，可见文字为空，读屏名由 `label` 提供（自动播放是 checkbox，`checked` 即开关状态）。

### 5.2 验证

- 单测：`pnpm check` 通过（62 tests）。`prologue-player` 覆盖手动等待不自动过句、点击补全/推进、自动 `holdMs` 倒计时、运行中切换自动/手动、日期卡永不自动播完、空 cue 自行通过；`prologue-script` 断言不再有任何 `caption`。
- Web（390×844、1200×648）：
  - 开场不再出现「深夜天幕，一颗流星划过」；首句打完出现「点击继续」，放置 30s 仍停在同一句；
  - 逐字音：第二句 12 个字触发 12 次 `Sound.play()`；点「补全整句」补声 0 次（避免爆音）；
  - ▶▶ 未选中时是宣纸白图标、无边框无底色；点一下变鎏金底 + 墨色图标（`autoIcon.tint = 0x05060a`）并自动过句；亮底图（梦的本源）上白图标仍清晰；
  - 两个图标在 390×844 与 1200×648 下都居中于 56×56 热区，`Toggle` 状态在 DOM 镜像里是 `checkbox 自动播放 [checked]`；日期卡在自动模式停留 > 8s 未进入占位页；
  - 「跳过」→ 占位页；返回键 → 标题；`prefers-reduced-motion: reduce` 下仍是手动逐句、无震屏；
  - 控制台 0 error、0 warning。逐字音在首次用户手势解锁音频前自动静音（`SoundManager.locked`），因此无手势的 `?stage=` 首屏也不会刷 AudioContext autoplay 警告。
- 已知：舞台预览 HUD 会盖住右上角 ▶▶ 图标；预览验收用 `&hud=0`，或先点 HUD 的「×」收起。
- 截图：[首句（手动）](screenshots/web-prologue-first-line.png)、[自动模式](screenshots/web-prologue-auto-mode.png)、[舞台预览](screenshots/stage-preview-prologue-390x844.png)

### 5.3 资源

- 新增 `audio.sfx.type1..3`（`core` bundle，`required: false`），文件 `public/assets/audio/sfx/type_blip_{1,2,3}.wav`（各约 1.3 KB，22.05kHz / 16bit 单声道）。
- 新增 `img.ui.icon.auto` / `img.ui.icon.skip`（`core` bundle，`required: false`），文件 `public/assets/img/ui/icon_auto.png`、`icon_skip.png`（96×96 纯白 + 透明底，界面按 28 设计 px 显示）。
- 生成脚本：`tools/make-type-blips.py`（逐字音，仅标准库）与 `tools/make-ui-icons.py`（图标，Pillow）；版权登记见 `docs/ASSET-CREDITS.md` §5、§6。
- `pnpm assets:scan` / `pnpm assets:check` 通过（16 key / 16 url）。

## 6. 2026-10-25 新增：BGM 管理器与开幕曲《星夜梦境》

### 6.1 结构

| 文件 | 职责 |
| --- | --- |
| `src/audio/bgm-tracks.ts` | 纯数据：曲目表、`场景 → 曲子` 映射（`undefined` = 保持，`null` = 淡出）、目标音量计算；不依赖 Phaser，可单测 |
| `src/audio/bgm-manager.ts` | 播放 / 切曲 / 交叉淡化 / 首触解锁补播；场景在 `create()` 里调用 `bgmManager.enterScene(this)` |
| `src/audio/audio-director.ts` | 只剩 SFX（点击、逐字提示音）、WebAudio 首触解锁、后台暂停 |

场景表：`title → 标题曲`、`prologue → 开幕曲`、`placeholder → null`（淡出）。CG 预览与战斗沙盒故意不登记，从标题进预览时不会被打断。

### 6.2 开幕曲

- key `audio.bgm.prologue`，文件 `public/assets/audio/bgm/prologue.mp3`（61.6s，987 KB，-15.8 LUFS / 真峰值 -1.9 dBFS）。
- 生成：游戏素材大师（Suno `chirp-v6`，纯音乐），方向「星空 / 宇宙 / 人类对梦境的迷惘」；裁剪与后期见 `docs/ASSET-CREDITS.md` §3。
- 登记在 `cutscene.prologue` bundle，随标题页预取一起加载，进入开幕不会额外等。

### 6.3 验证

- `pnpm check` 通过（70 tests，其中 `test/bgm.test.ts` 8 项：场景映射、曲目 key 必须在 bundles 里、淡入淡出区间、音量钳制）。
- Web（1200×648）实测：
  - 标题曲 0 → 0.60 淡入；点「开始游戏」后标题曲 0.57 → 0.36 → 0 淡出，开幕曲 0.01 → 0.07 → 0.24 → 0.53 → 0.60 淡入（交叉淡化，没有硬切）；
  - 点跳过 → 占位页：开幕曲淡出并被销毁，`game.sound.sounds` 里不再有 BGM；
  - 占位页「返回标题」：标题曲重新淡入到 0.60；
  - 设置里的静音按钮：BGM 立即到 0，再点回 0.60；
  - `?stage=scene.prologue` 单独预览会起开幕曲，`?stage=scene.placeholder` 无 BGM，CG 预览保持现状；
  - 控制台 0 error / 0 warning。
- 已知：舞台预览 HUD 仍会盖住右上角图标（同 §5）。

## 7. 2026-10-25：开幕落点改为第一章

- 开幕播放完成或点「跳过」后，不再进入 `placeholder`，而是 `enterModule(this, 'ch01Dorm')` 进入第一章第一节《寝室》。
- `placeholder` 保留为舞台预览专用，正常流程不再到达。
- 开幕播放期间静默预取 `ch.01`；弱网/省流量跳过。
- 新流程验收见 `docs/CH01-ACCEPTANCE.md`。
