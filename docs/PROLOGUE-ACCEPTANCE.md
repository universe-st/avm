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
- 文案逐句与用户原文一致；舞台提示「深夜天幕，一颗流星划过」以无括号小字幕出现。
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
- 来源、提示词与后期步骤见 [ASSET-CREDITS.md](ASSET-CREDITS.md) §5；剧情补充登记见 [STORY-BIBLE.md](STORY-BIBLE.md) §8.1。

## 5. 已知限制

1. 开幕正文是 Phaser Text，暂未接入 DOM a11y 镜像；跳过按钮与「点击继续」提示可键盘/读屏访问。
2. 1080×1920×5 解码约 41 MB；低端机若出现纹理压力，可重编码为 900×1600，代码不变。
3. 不新增 BGM/配音；沿用标题曲《潜入》，跳过按钮复用 `audio.sfx.click`。
4. Android 模拟器系统 ANR 影响完整交互复测；Web 端已覆盖完整流程。
5. 「继续游戏」仍为置灰；没有「看过后跳过」的存档标记，每次开始都会播放。
