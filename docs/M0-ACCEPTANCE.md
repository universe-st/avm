# M0 验收记录

- 日期：2026-10-24
- 范围：开始界面、资源管理与预加载框架、标题 BGM、文档、Web + Android（签名 APK）

## 1. 构建与检查

| 项 | 结果 |
| --- | --- |
| `pnpm typecheck` | 通过（含 vendor 四个包） |
| `pnpm test` | 6/6 通过（权重、进度、必填失败、缺失筛选） |
| `pnpm assets:check` | 5 key / 5 url，无重复、无缺失 |
| `pnpm build` | 通过；JS 1.65 MB / gzip 452 KB；无 sourcemap |
| `pnpm android:debug` | 通过；APK 5.7 MB |
| `pnpm android:release` | 通过；APK 4.9 MB，apksigner 校验通过；SHA-256 `5a07dbbd27f5bfb8369d13bbee3b407542acc287987f185f81f4969251aaf325` |

## 2. Web 验收

- 1200×648（桌面）与 390×844（手机视口）均正常：标题、按钮、设置弹窗、占位页。
- 键盘（Tab/Enter/Esc）与鼠标/触摸均可操作。
- 设置：音乐/音效滑杆、静音、恢复默认；重启后保留（localStorage）。
- BGM 首触解锁、淡入；切到占位页不重启；返回标题继续播放。
- 加载页：`show: 'always'` 冷启动显示；`auto` 短加载不闪（已修复「延迟显示定时器未取消」导致的 100% 卡住）。

截图：

- `docs/screenshots/web-title-390x844.png`
- `docs/screenshots/web-title-360x640.png`
- `docs/screenshots/web-settings.png`
- `docs/screenshots/web-credits.png`

## 3. Android 验收

- 设备：Android Emulator API 36，1080×2400。
- 包名 `com.universest.avm`，versionName 0.1.0，versionCode 1。
- `minSdkVersion 21`、`targetSdkVersion 36`（`aapt2 dump xmltree` 读取）。
- 签名：PKCS#12 / alias `avm` / RSA 4096；证书 SHA-256
  `8e965642e1f0d78794024d225c7a5afd6b86b98182e4308aa4673a610fb7f6c5`。
- 冷启动到标题约 9–15s（最终包 12s，模拟器；真机应更快）；状态栏已隐藏。
- 触摸：点「开始游戏」→ 占位页；返回键：占位页 → 标题；设置弹窗打开后返回键关闭弹窗（标题页的返回被吞掉，避免误退出）。
- 无 JS 控制台错误（`chrome://inspect` / `adb logcat` 均未见 Uncaught）。

截图：

- `docs/screenshots/android-title.png`
- `docs/screenshots/android-placeholder.png`

## 4. 资源与素材

- 标题主视觉：AI 生成 + 裁切/压暗/56 色量化/WebP；360 KB。
- BGM：Suno 生成 2 首，选 1 首，截 20–108.4s，-15.8 LUFS，128kbps；1.3 MB。
- 资源清单：`src/assets/bundles.ts`；字节表：`src/assets/catalog.gen.json`。
- 资源总预算：title 6 MB（实际约 1.6 MB），core 2 MB。

## 5. 已知限制 / 未完成

1. **API 21 运行未实测**：本机只有 API 36 系统镜像；`minSdk 21` 已在 Manifest 确认（`aapt2` 读取），但 API 21 系统镜像下载卡在 56MB 后中止，没有运行证据。需在 M1 补一次 API 21 真机/模拟器验证。
2. 首次加载在模拟器上偏慢（9–15s）；真机需复测，必要时做代码拆分/资源预压缩。
3. 字体仍是系统字；方舟像素字体与思源黑体子集未内置。
4. 标题主视觉是首版 AI 图 + 像素化后处理，不是严格 32×32 网格的像素画；M1 可重做。
5. 设置页的「清除缓存」「全屏切换」未做；制作名单为静态文本。
6. 预取调度器（C/D 类）与章节缓存淘汰未实现，只留了 API。
7. Android 标题页返回键目前被吞掉（不退出），避免 Cordova 双重返回直接杀进程；M1 加「再按一次退出」。

## 6. 交付物位置

- Web 构建：`dist/`
- 签名 APK：`dist/android/assassins-vs-miners-0.1.0.apk`
- 调试 APK：`dist/android/assassins-vs-miners-0.1.0-debug.apk`
- 计划：`docs/PLAN-M0.md`
- 文档：`README.md`、`docs/ARCHITECTURE.md`、`docs/RESOURCE-SPEC.md`、`docs/ART-STYLE.md`、`docs/ANDROID.md`、`docs/ASSET-CREDITS.md`、`docs/STORY-BIBLE.md`、`AGENTS.md`

## 7. 修订（2026-10-24 晚）

- **标题 BGM 换为科幻版**：任务 `amvmcgwmjbdeb61`（Suno，2 首，选第 2 首 Dream Sim Rebellion），截 24–112s 为 88s 循环，-15.5 LUFS；旧国风版仅保留母带，不再使用。
- **新增 UI 点击音效**：任务 `fmvmcgl2765b582`，原始 2.5s，截 0.19–0.57s 为 0.38s，+22dB，峰值 -4.3 dBFS；所有按钮 onClick 已接入 `AudioDirector.playClick()`。
- **Android 复测**：新包冷启动 23s（模拟器），`audio.bgm.title` 88s 正常播放，`audio.sfx.click` 已缓存；签名与 minSdk 不变。
- **制作名单更新**：策划/程序 `universe-st`，美术 `seedance 模型`，代码 `deepseek 模型`；删除 UI 框架与剧情蓝本两行。
- **BGM 管理器 + 开幕曲**：新增 `src/audio/bgm-tracks.ts`（场景 → 曲目表）与 `BgmManager`（交叉淡化、解锁补播、音量记账）；开幕曲《星夜梦境》（游戏素材大师 / Suno chirp-v6，61.6s 循环，-15.8 LUFS），占位页淡出。
- **M0.9 开幕剧情接入**：「开始游戏」→ 开幕剧情（5 张配图 / 逐字文案 + 逐字提示音 / 流星 / 白闪 / 震屏 / 红脉冲 / 日期卡；默认手动逐句，右上角「自动」可切自动）→ 占位页；新增 `cutscene.prologue` bundle 与标题页预取。验收见 [PROLOGUE-ACCEPTANCE.md](PROLOGUE-ACCEPTANCE.md)。
