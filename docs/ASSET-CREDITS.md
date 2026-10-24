# 素材版权与生成记录

> 所有 AI 生成素材在上架前需按所用后端的商用条款复核；商店页建议注明「AI 生成音乐/美术」。

## 1. 标题主视觉

- 文件：`public/assets/img/title/title_bg.webp`
- 来源：游戏素材大师 · 图片生成（火山方舟 `doubao-seedream-5-0-flash-260915`）
- 任务：`imvmah1jc0d5863`（AVM 标题主视觉 v1，2026-10-24）
- 生成：请求 2 张，1 张成功（`out/img-01.png`），1 张下载失败
- 提示词要点：国风 HD-2D 像素、纯白梦境裂隙、七星座、锈蚀矿工、学生背影持白光匕首、无文字
- 后期：1584×2816 → 1440×2560 裁切 → 亮度 0.94 + 暗角 → 480×853 降采样 → 56 色量化 → NEAREST 放大 → WebP q90（360 KB）
- 原始件：`assets-src/title/title_bg_v1.png`、`title_bg_pixel_1440x2560.png`

## 2. 标题 BGM《潜入》（v2 · 科幻版）

- 文件：`public/assets/audio/bgm/title.mp3`
- 来源：游戏素材大师 · 音乐生成（Suno `chirp-v6`，纯音乐）
- 任务：`amvmcgwmjbdeb61`（2026-10-24，v2 科幻版）
- 方向：科幻 / 反抗 / 梦境；计算机与信息文明的音律；叙事感；明确排除国风与人声
- 生成：2 首（Dream Sim Rebellion，207.6s / 197.2s）；选用第 2 首
- 后期：截取 24.0–112.0s（88.0s），首尾 0.3/0.5s 淡化，`loudnorm I=-16`，实测 -15.5 LUFS / 峰值 -3.8 dBFS，MP3 128 kbps
- 原始件：`assets-src/audio/title_v2_song1.mp3`、`title_v2_song2.mp3`、`title_v2_loop.mp3`
- 历史：v1 国风版（任务 `amvmak5zoff3e85`）已被 v2 取代，母带仍在 `assets-src/audio/title_song1.mp3`

## 3. UI 点击音效

- 文件：`public/assets/audio/sfx/ui_click.mp3`
- 来源：游戏素材大师 · 音效生成（火山引擎 Seed-Audio）
- 任务：`fmvmcgl2765b582`；take `kmvmchdy8b5e51d`（2.50s 原始 WAV）
- 提示词：科幻界面按钮点击，短促清脆的数字化「嘀」声，细微电路脉冲与短金属尾音，近场、无混响
- 后期：截取 0.19–0.57s（0.38s），+22 dB，80ms 淡出，单声道 128 kbps
- 实测：峰值 -4.3 dBFS，平均 -19.4 dB
- 原始件：`assets-src/audio/sfx_click_source.wav`

## 4. 程序生成占位（待替换）

| 文件 | 生成方式 | 说明 |
| --- | --- | --- |
| `public/assets/img/title/logo_mark.png` | Pillow 绘制 | 徽记占位；M1 换成正式 logo |
| `public/assets/img/core/white.png` | Pillow 绘制 | 1×1 白纹理，资源框架自检用 |
| `public/assets/img/ch00/bg.png` | Pillow 绘制 | 序章占位背景；M1 换正式场景图 |

## 5. 字体

- 当前：系统字体（PingFang SC / Noto Sans CJK / 微软雅黑），未随包分发。
- 计划：方舟像素字体（Ark Pixel，OFL 1.1）用于标题/数字；思源黑体（Source Han Sans，OFL）子集用于正文。引入时把 OFL 文本放到 `docs/licenses/`。

## 6. 剧情蓝本

- 《刺客与矿工》：用户提供的原创小说（61.5 万字，未完结），仅作为本项目改编蓝本，不在仓库外分发。
- 仓库内 `reference/` 为本地参考，不参与构建、不随 APK 打包。

## 7. 第三方代码

- Phaser 4.2.1 — MIT
- phaser-mvvm 1.0.0 — MIT（源码内置，见 `vendor/phaser-mvvm/LICENSE` 与 `UPSTREAM.md`）
- Cordova / cordova-android — Apache-2.0
