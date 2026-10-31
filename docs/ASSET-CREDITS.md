# 素材版权与生成记录

> 所有 AI 生成素材在上架前需按所用后端的商用条款复核；商店页建议注明「AI 生成音乐/美术」。

## 1. 标题主视觉

- 文件：`public/assets/img/title/title_bg.webp`
- 来源：游戏素材大师 · 图片生成（火山方舟 `doubao-seedream-5-0-flash-260915`）
- 任务：`imvmah1jc0d5863`（AVM 标题主视觉 v1，2026-10-24）
- 生成：请求 2 张，1 张成功（`out/img-01.png`），1 张下载失败
- 提示词要点：国风 HD-2D 像素、纯白梦境裂隙、七星座、锈蚀矿工、学生背影持白光匕首、无文字
- 后期：1584×2816 → 1440×2560 裁切 → 亮度 0.94 + 暗角 → 480×853 降采样 → 56 色量化 → NEAREST 放大 → WebP q90（360 KB）
  - 2026-10-31：为进一步消除手机端 canvas 缩小产生的摩尔纹，重出 720×1280 Lanczos + WebP q90（120 KB）；构图不变。
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

## 3. 开幕 CG BGM《星夜梦境》

- 文件：`public/assets/audio/bgm/prologue.mp3`（61.6s，987 KB，MP3 128 kbps / 立体声 44.1kHz；实测 -15.8 LUFS、真峰值 -1.9 dBFS）
- 来源：游戏素材大师 · 音乐生成（Suno `chirp-v6`，纯音乐，`mode: prompt`）
- 任务：`amvn0wv1he3a7f7`（2026-10-25），歌曲 `82a6cd72-723c-471c-ab45-c771c2871397`《Drift Under Stars》（219.2s）
- 方向：星空 / 宇宙 / 人类对梦境的迷惘；氛围、漂浮、不要密集鼓点
- 提示词要点：`Instrumental, no vocals. Cinematic ambient, ethereal, weightless, 60 BPM. Sparse felt piano, glassy bell tones, warm analog pads, deep sub drone, faint granular textures. A vast starry night sky and silent cosmos; humanity adrift and wondering what dreams really are. Contemplative, tender, quietly unsettled. Seamless loop, no intro hit, no final cadence.`
- 生成：同批 2 首（219.2s / 210.0s），选第 1 首——动态层次更清楚、结尾会自然收束；第 2 首密度更高，不适合做循环底
- 后期：截取 129.0–190.6s（61.6s，首尾都落在低能量段）→ 淡入 0.3s / 淡出 0.6s → loudnorm 目标 -16 LUFS（实测 -15.8 LUFS / 真峰值 -1.9 dBFS）→ MP3 128 kbps
- 循环：首尾音量都在 -17 dB 附近，接缝是一次轻微的呼吸；游戏内 `loop: true`，BGM 管理器负责跨场景交叉淡化
- 原始件：`~/.dsh/game-material-master/music-jobs/amvn0wv1he3a7f7/`（母带 + 各编辑版本）
- 复核：上架前按谱乐 AI / Suno 条款复核，商店页注明「AI 生成音乐」

## 4. UI 点击音效

- 文件：`public/assets/audio/sfx/ui_click.mp3`
- 来源：游戏素材大师 · 音效生成（火山引擎 Seed-Audio）
- 任务：`fmvmcgl2765b582`；take `kmvmchdy8b5e51d`（2.50s 原始 WAV）
- 提示词：科幻界面按钮点击，短促清脆的数字化「嘀」声，细微电路脉冲与短金属尾音，近场、无混响
- 后期：截取 0.19–0.57s（0.38s），+22 dB，80ms 淡出，单声道 128 kbps
- 实测：峰值 -4.3 dBFS，平均 -19.4 dB
- 原始件：`assets-src/audio/sfx_click_source.wav`

## 5. 程序生成的位图与图标

| 文件 | 生成方式 | 说明 |
| --- | --- | --- |
| `public/assets/img/title/logo_mark.png` | Pillow 绘制 | 徽记占位；M1 换成正式 logo |
| `public/assets/img/core/white.png` | Pillow 绘制 | 1×1 白纹理，资源框架自检用 |
| `public/assets/img/ch00/bg.png` | Pillow 绘制 | 序章占位背景；M1 换正式场景图 |
| `public/assets/img/ui/icon_auto.png` | Pillow 绘制（`tools/make-ui-icons.py`） | 开幕「自动播放」图标（▶▶，96×96，纯白 + 透明底，运行时 `setTint` 染色） |
| `public/assets/img/ui/icon_skip.png` | Pillow 绘制（`tools/make-ui-icons.py`） | 开幕「跳过剧情」图标（▶|，96×96，同上） |

## 6. 逐字提示音与角色声线（程序合成）

- 通用 blip：`public/assets/audio/sfx/type_blip_1.wav`、`type_blip_2.wav`、`type_blip_3.wav`（各约 1.3 KB）
- 角色声线（2026-10-29）：`voice_blip_narrator.wav`、`voice_blip_zhou.wav`、`voice_blip_zheng.wav`、`voice_blip_xiaobai.wav`
- 来源：本仓库脚本合成，`python3 tools/make-type-blips.py`（仅标准库，可复现）
- 设计：三角波 + 正弦，30–45ms 内音高下滑（小白反向上扬），指数衰减。
  - 旁白 520Hz→470Hz、近百毫秒级软衰减，最轻（混音 ×0.55）
  - 周全 740Hz→700Hz，干脆（×0.95）
  - 郑卿 392Hz→356Hz，低、闷、慢衰减（×0.85）
  - 小白 1046Hz→1568Hz 上扬 + 二次谐波，玻璃感（×0.72）
  - 其他角色：`type_blip_1/2` 两条普通 blip 轮换（×0.85）
- 格式：22.05kHz / 16bit / 单声道 WAV；刻意不用 MP3（编码前导静音会让每 55ms 一次的提示音拖拍）

## 7. 开幕剧情配图（5 张）

- 文件：`public/assets/img/prologue/01_night_sky.webp`、`02_dream_root.webp`、`03_dreamfall.webp`、`04_hidden_war.webp`、`05_qunying_school.webp`
- 来源：游戏素材大师 · 图片生成（火山方舟 `doubao-seedream-5-0-flash-260915`）
- 任务与原始件：
  | 图 | jobId | 原始件 |
  | --- | --- | --- |
  | 深夜天幕 | `imvmh0kec47db75` | `assets-src/prologue/01_night_sky.png` |
  | 梦的本源 | `imvmh22g1783dbc` | `assets-src/prologue/02_dream_root.png` |
  | 梦坠地球 | `imvmh22ghe4c80f` | `assets-src/prologue/03_dreamfall.png` |
  | 无声的战争 | `imvmh22goaf93e4` | `assets-src/prologue/04_hidden_war.png` |
  | 群英高中 | `imvmh22gubffd56` | `assets-src/prologue/05_qunying_school.png` |
- 生成：每张 `size: 2K`、`count: 1`、`watermark: false`；「深夜天幕」首次下载失败，重跑 1 次成功；其余一次成功
- 提示词要点：竖屏 9:16；国风 HD-2D 像素 + 电影级体积光/景深/移轴；冷蓝/纯白/墨黑为主，朱红只用于危险；中央竖向安全区；无文字/水印/logo/明显人脸。逐张画面：
  1. 深夜县城上空、银河、楼群剪影、无流星（流星由程序叠加）
  2. 白色梦境、半透明人影、胸口光丝与微型星座、水面倒影
  3. 近地轨道、地球弧面被白色裂隙贯穿、流星雨、裂隙渗朱红光
  4. 县城夜晚街道、楼宇/行人剪影的暗红电子眼、校服学生背影
  5. 清晨群英高中校门、红横幅（无字）、晨雾暖光、校服学生
- 后期：1584×2816 → 中心裁 9:16 → 1080×1920 → UnsharpMask(半径 1.1，55%，阈值 2) → 对比度 1.025 → WebP q88；总体积约 1.1 MB
- 复核：上架前按火山方舟商用条款复核，商店页注明「AI 生成美术」

## 8. 字体

- 当前：系统字体（PingFang SC / Noto Sans CJK / 微软雅黑），未随包分发。
- 计划：方舟像素字体（Ark Pixel，OFL 1.1）用于标题/数字；思源黑体（Source Han Sans，OFL）子集用于正文。引入时把 OFL 文本放到 `docs/licenses/`。

## 9. 剧情蓝本

- 《刺客与矿工》：用户提供的原创小说（61.5 万字，未完结），仅作为本项目改编蓝本，不在仓库外分发。
- 仓库内 `reference/` 为本地参考，不参与构建、不随 APK 打包。

## 10. 第三方代码

- Phaser 4.2.1 — MIT
- phaser-mvvm 1.0.0 — MIT（源码内置，见 `vendor/phaser-mvvm/LICENSE` 与 `UPSTREAM.md`）
- Cordova / cordova-android — Apache-2.0

## 11. 第一章第一节《寝室》素材（2026-10-25）

> 工作流：先用「游戏素材大师」image 生成人物设定图；再以设定图为参考，生成角色精灵图/八方向图、寝室零部件与 CG。所有 jobId 均可在插件界面复查。

### 11.1 人物设定图（参考母图，v2）

v2 起改成每人一张、纯绿幕底（方便抠像），替换原来的 2×2 深色底合板：

- 文件与任务（均为 `doubao-seedream-5-0-flash-260915`，2048×2048）：
  - `assets-src/character/ch01/sheets/character-zhou-v2.png` — 周全 — `imvnq3am836473b`
  - `assets-src/character/ch01/sheets/character-zheng-v2.png` — 郑卿 — `imvnq3ami158616`
  - `assets-src/character/ch01/sheets/character-xiaobai-v2.png` — 小白 — `imvnq3ampabd971`
- 版式：上部正面 / 侧面 / 背面三视图，下部一排三个表情头像。
- 背景：纯 chroma key 绿 `#00FF00`（整幅均匀、无渐变无阴影），角色边缘做了防溢色。
- 设定调整：周全面相更温和；郑卿「壮而不胖」（宽肩厚背、腹部平坦）；小白更可爱、更女性化。
- 旧版：原 2×2 深色底合板已归档到 `assets-src/character/ch01/sheets/character-sheet-v1.png`
  （任务 `imvn2twfx8d7622`），仅作历史留档，新素材不再引用。
- 用途：后续所有角色/场景素材的参考图；不作为游戏内资源。
- 说明：模型输出 2048×2048；源文件是 JPEG 内容，处理时统一转 PNG 后上传参考。

#### 11.1.1 Q 版形象（2026-10-25）

- 文件：
  - `assets-src/character/ch01/q/zhou-qchibi.png` — 定稿，透明底 655×1896，约 3 头身，整身一次生成
  - `assets-src/character/ch01/q/zhou-qchibi-green.png` — 同图绿幕版，751×1992
  - `assets-src/character/ch01/q/zhou-qchibi-preview.png` — 浅色底预览
  - `assets-src/character/ch01/q/zhou-qchibi-generated.png` — 模型原始输出（2048×2048），留档
- 任务：`imvnrkym706329e`（AVM 周全 Q版 2.5 头身 v3，粗骨架参考）
- 参考：`character-zhou-v2.png`（造型/配色）+ 本地绘制的比例骨架（头约占全身 40%）。
- 流程：`doubao-seedream-5-0-flash-260915` 2K 整身生成 → 本地绿幕抠像 → 裁透明边。没有做任何头/身拼接。
- 说明：
  - 模型对「二头身」文字约束不敏感，多次产出约 3 头身；只有头占画面 40% 的骨架参考能逼出约 2 头身（`imvnr60tzda68e0`）。
  - 2 头身被否（「头太大」）后，曾尝试本地把头部缩到 0.70 做 2.5 头身，但切割线穿过领口，肩线出现平直断口（用户指出「肩膀断了」），该做法废弃。
  - 定稿回到「整身一次生成」：肩颈、衣领连续，比例约 3 头身，头部明显小于 2 头身版。
- 用途：Q 版立绘/表情包/后续 Q 版精灵的造型基准；尚未接入游戏资源。

### 11.2 角色精灵图（参考设定图）

- 文件：`assets-src/character/ch01/character-sprites-keyed.webp`（透明；绿幕源已清理）
- 来源：游戏素材大师 · 图片生成（参考 `character-sheet.png`）
- 任务：`imvn30dkgd7657a`（AVM 第一章 角色精灵图）
- 内容：2×2 绿幕角色：周全、郑卿、小白、矿工；纯绿背景、无文字。
- 后期：`tools/process-ch01-generated-sprites.py` 裁切/缩放：
  - `public/assets/img/character/ch01/xiaobai.png` 96×96
  - `public/assets/img/character/ch01/miner.png` 128×160
  - `public/assets/img/character/ch01/zheng.png` 64×96（预留）

### 11.3 周全八方向与行走帧（sprite 模块）

- 项目：`pmvn34v6h8e2773`（AVM 周全 八方向）
- 源图：`assets-src/character/ch01/zhou-source-clean.png`（从 11.2 的周全正面裁切、合成到纯绿背景）
- 阶段①：sprite 模块 · 转圈视频（MiniMax）→ 32 帧候选 → 八方向截帧（front/back/left/right/downLeft/downRight/upLeft/upRight）。
- 阶段②：`runVideos` 生成 front/back/left/right 四向行走视频 → `runFrames` 各 8 帧。
- 处理：`tools/process-ch01-generated-sprites.py`（静态四向）与 `tools/process-ch01-walk.py`（行走 sheet）：
  - `public/assets/img/character/ch01/zhou_{down,up,left,right}.png` 64×96
  - `public/assets/img/character/ch01/zhou_walk_{down,up,left,right}.png` 512×96（8 帧 × 64）
- 说明：第一次源图误用了含「小背面剪影」的裁切图，导致 front 帧带残影；已换干净源重跑。四个斜向改用 sprite 项目的 `direct` 模式逐张生成（任务 `pmvn34v6h8e2773`，downLeft/downRight/upLeft/upRight），避免转圈视频抽不到准确 45°；四向行走帧用整段并集 bbox 统一缩放，并用静态图上身覆盖行走帧上半身，避免人物「越走越瘦」。

#### 11.3.1 八方向 v2（2026-10-25 晚，替代上方 v1）

- 项目：`pmvnq61kwe5056a`（AVM 周全 八方向 v2（新设定图））
- 源图：取自 11.1 的 `character-zhou-v2.png`，裁正面全身并统一成纯绿 `#00FF00`（`source/zhou-v2-green.png`，768×768）。
- 阶段①：MiniMax 转圈视频 → 32 帧候选；本片转角速度不匀（前 8 帧几乎没转），四向截帧改用 `front=0 / right=12 / back=16 / left=25`，四个斜向再用 `direct` 逐张生成（同项目 downLeft/downRight/upLeft/upRight；downLeft 首次下载失败，重跑一次成功）。
- 产物：8 张已替换 `assets-src/character/ch01/sprite/{front,back,left,right,downLeft,downRight,upLeft,upRight}.png`（四向 768×768，斜向 2048×2048）。
- 未做：行走视频 / 行走帧（阶段②③）与运行时 `public/assets/img/character/ch01/zhou_*.png`、`zhou_walk_*.png` 仍是 v1 的产物，需要时再跑。

#### 11.3.2 Q 版三头身八方向行走（2026-10-25，当前版本）

- 项目：`pmvnrpn64691ee5`（AVM 周全 Q版 3头身 八方向行走）；源图取 11.1.1 的 `zhou-qchibi.png`，缩到 1536×1536 纯绿画布（人物高 1320）。
- 阶段①：MiniMax 转圈视频 5.17 秒 / 32 帧候选。本片为顺时针转，默认 CCW 截帧位置全反，已改为 `front=0 / downRight=7 / right=10 / upRight=14 / back=16 / upLeft=20 / left=24 / downLeft=26`。
- 阶段②：8 个方向各一段原地行走视频（MiniMax，5 秒）。斜向行走视频会被模型漂成侧面（45° 站不住），重跑后仍有 `downLeft`/`upRight` 两个方向不对；最终改为**镜像**：`downLeft = 水平镜像 downRight`、`upRight = 水平镜像 upLeft`，静态图同步镜像，四个斜向严格对称、同一人物。
- 阶段③④：每方向抽 8 帧（768×768）→ 抠像 → 按 8 行并集 bbox（294×706）统一缩放、脚底对齐 → `out/sheet.png` 2048×2048（8 列 × 8 行，格子 256×256，行序按罗盘 N→NE→E→SE→S→SW→W→NW）。
- 产物（源文件，尚未接入 `public/`）：
  - `assets-src/character/ch01/q/walk8/sheet.png` — 8 方向 × 8 帧总表
  - `assets-src/character/ch01/q/walk8/walk-<dir>.png` — 每方向 8 帧横带（2048×256）
  - `assets-src/character/ch01/q/walk8/frames/<dir>/f00..f07.png` — 单帧（768×768，透明）
  - `assets-src/character/ch01/q/walk8/static/<dir>.png` — 八方向静态（256×256，透明，同一比例与基线）
  - `assets-src/character/ch01/q/walk8/manifest.json` — 行序、方向、格尺寸、帧数
- 说明：行走视频 5.17 秒走三步，抽帧为等间隔 8 帧，游戏内播放速度需按实际效果调（manifest 暂记 8fps）。「八方向行走」是这个版本的定稿方向，后续角色/精灵沿用 `zhou-qchibi.png`。
- 游戏内二次加工（2026-10-28）：`tools/make-ch01-q-walk20.py` 直接读项目里的 8 段行走视频 `<dir>.mp4`（1408×1408 / 24fps / 5.2s），**按步态周期重新抽 20 帧**（不再做帧间插值）：每方向找首尾最闭合、且**人物没被画面边缘切到**的周期窗口，均匀取 20 帧，抠像后按静态图的高度/底边/水平中心对齐，输出 `public/assets/img/character/ch01/q/zhou_q_walk_<dir>.webp`（3200×400，WebP q92）。
  - 抠像（绿幕）：按 `greenness = g - max(r,b)` 做软键（`GREEN_LOW=70 / GREEN_HIGH=190`）+ 绿色溢出抑制。**不能用 RGB 距离**：背光那半边带绿幕反光，与 #00FF00 的欧氏距离很小，距离键会把半个身子判成半透明（实机上就是「角色少一半」）。
  - 抠像（白底）：`back.mp4` 后半段绿幕掉了变白底，从角落 flood fill 圈背景（角色内部的白校服与边缘不连通，不会被抠穿）。
  - 取帧约束：`left/right` 视频里人物会走出画面，被切边的帧一律跳过（`is_clipped`），否则行走图会缺半身。

#### 11.3.3 正北（back）方向返工（2026-10-29）

- 起因：实机观察「向正北走（背朝镜头）」的角色朝向偏，其余七向正常。
- 实测：取 `images/back.png`（转圈第 16 帧）与四斜做同口径比对——头部可见皮肤（脸颊/耳侧）的横向重心偏 **+0.13**（`upLeft=-0.25 / upRight=+0.24`，即偏 `upRight` 一侧约 10–15°）；同一段 `back.mp4`（行走视频）全 124 帧平均 **+0.11**，说明偏移烘在视频里，不是某几帧抽坏。
- 返工 ①（静态，免费）：转圈截帧 `back` 由 **16 → 18**。按「脖子以下轮廓镜像 IoU」逐帧扫 f14–f20：f18 = 0.979（f16 = 0.882 / f17 = 0.953），是这段转圈里真正的正背面。新静态 160×400（高 371 / 底边 394 / 中心 80），躯干镜像 IoU 0.85 → 0.97。
- 返工 ②（行走视频，MiniMax 1 次）：给 `back` 单独写了**朝向锁定**提示词（`prompts.videoPerDirection.back`），强调「正背面、左右完全对称、两肩两臂对称、不许露耳朵/脸颊、不许偏成四分之三」。新视频 1440×1440 / 24fps / 5.17s。
- 新视频带来的两个新毛病与处理（已写进 `avm-8dir-sprite` 技能与脚本）：
  - **镜头缓缓拉远**：5.2s 里人物高度 676 → 485px（-28%），一个周期内缩 7%。`make-walk-sheet.py` 新增 `--scale-trend`：按 20 帧高度的**线性趋势**把每帧缩回窗口中心高度（绕各自脚底中心缩放），只削低频漂移，不动步态起伏。
  - **接缝跳**：只用缩略图闭合误差挑窗口，出成品后 f19→f0 的差是相邻帧的 2 倍。新增 `--refine-cycle`：在 ±3 帧 / ±2 帧邻域里按**成品帧**的「接缝 / 相邻差」再挑一次，最终取 `L=28 / s=60`。
- 最终指标（`zhou_q_walk_up.webp`）：接缝 2.6 vs 相邻 3.9；20 帧角色高 366–368、底边 390–393、无贴边帧；头部皮肤重心 **+0.12 → −0.05**。
- 复现命令：
  ```bash
  python3 .dsh/skills/avm-8dir-sprite/scripts/make-static-sprite.py --only up
  python3 .dsh/skills/avm-8dir-sprite/scripts/make-walk-sheet.py --dir-map "back=up"
  ```
- 对比图：[正北返工前后](screenshots/ch01-q-up-orientation-fix.png)（静态 + 行走，f0/f5/f10/f15）、[实机朝上站立](screenshots/ch01-q-up-ingame-390x844.png)。

### 11.4 寝室零部件（模块化，不画整张）

- 文件：`assets-src/map/ch01/room-parts-green.webp`（3×3 零部件）
- 来源：游戏素材大师 · 图片生成（参考 `character-sheet.png`）
- 任务：`imvn3eto3c810f8`（AVM 第一章 寝室零部件拼图）
- 内容：木地板砖、深色墙砖、红地毯（生成但**不使用**）、双层床、书桌、衣柜、储物箱/行李箱、木门、吊扇。
- 郑卿睡床：`assets-src/map/ch01/bed-zheng-green.webp`
  - 任务：`imvn5fa2s10b830`（AVM 第一章 郑卿睡床道具）
  - 内容：双层床、下铺郑卿盖蓝白格子被睡觉；纯绿背景。
- 后期：`tools/compose-ch01-room.py`
  - 地板/墙程序化；左侧睡床、右侧空床（镜像）、左下衣柜、右下书桌（镜像）、底部木门、顶部吊扇；
  - **不铺地毯**（高中寝室不铺地毯，按用户反馈移除）；
  - 输出 `public/assets/img/map/ch01/dorm_room.png` 704×960。
- 说明：先前整张绘制方向（任务 `imvn3apqi71ea70` / `imvn3c1487e6cbd`）已废弃，改用零部件拼图。

#### 11.4.1 书桌椅

- 文件：`assets-src/map/ch01/chair-source.jpg` → `public/assets/img/map/ch01/chair.png`（128×256，运行时显示 64×128）
- 来源：游戏素材大师 · 图片生成，任务 `imvn72wgy6c2e22`
- 内容：旧木色靠背椅，四条腿；纯绿背景；用于书桌下。
- 说明：椅子是单独运行时的 `img.map.ch01.chair`，开局坐姿 CG 包含椅子时隐藏它，站起来后显示。

#### 11.4.2 周全坐姿（直接坐在椅子上）

- 文件：`assets-src/character/ch01/zhou-sit-on-chair-source.png` → `public/assets/img/character/ch01/zhou_sit.png`（96×160）
- 来源：游戏素材大师 · 图片生成，任务 `imvn79yqwefd365`（参考 `chair-source.jpg` + `character-sheet.png`）
- 内容：周全坐在同一把木椅上、背向镜头、双手放在大腿上，椅子完整，**不含书桌**；整张图完整保留，不裁人物。
- 说明：开局坐姿直接使用这张图（`sittingOffsetY=96`），坐着时隐藏独立椅子；开始探索时切回站立 `zhou_up` 并显示独立椅子。
- 无桌任务前两次下载失败，第三次成功；带桌版本 `imvn78fup9f20e6` 仅作废稿，不随包。

### 11.5 梦域金殿战斗背景

- 文件：`public/assets/img/battle/ch01/dream_hall.webp`
- 来源：游戏素材大师 · 图片生成（参考 `character-sheet.png`）
- 任务：`imvn39ore9b726f`（AVM 第一章 梦域金殿战斗背景）
- 内容：金红宫墙、红柱、白玉阶、龙椅虚影、金色尘埃；无人物。
- 后期：1584×2816 → cover 裁 9:16 → 1080×1920 → WebP q88（309 KB）。

### 11.6 剧情 CG（参考设定图）

| CG | 文件 | 任务 | 说明 |
| --- | --- | --- | --- |
| 手机白光 | `public/assets/img/cg/ch01/phone.webp` | `imvn5folx3e4307` | 旧手机悬停、白光娃娃脸、只出现手；首次下载失败，重跑 1 次成功 |
| 小白登场 | `public/assets/img/cg/ch01/xiaobai.webp` | `imvn5g41n4c67a2` | 宿舍里小白悬浮、前景少年；当前只作 CG 预览，剧情主线使用手机/醒来两张 |
| 醒来 | `public/assets/img/cg/ch01/wake.webp` | `imvn5gis58f0193` | 周全趴地、小白悬浮、郑卿在床；首次下载失败，重跑 1 次成功 |
| 沉睡症新闻（黑白回忆） | `public/assets/img/cg/ch01/news.webp` | `imvtezcbo6fb98e` | 夜晚客厅，老式电视占画面上半部；屏幕里两名新闻主持人（左男右女）播报，屏幕下方字幕条留空；整体黑白胶片、扫描线、暗角 |

- 来源：游戏素材大师 · 图片生成（参考 `character-sheet.png`），1584×2816 → 9:16 → 1080×1920 → WebP q88。
- 源图：`assets-src/cg/ch01/{phone,xiaobai,wake,news}-source.jpg`。
- 新闻 CG 后期：整图转灰度 + 1% 自动对比 + 亮度 1.10 / 对比 1.06，保证手机上暗部不糊；无文字、无水印。

### 11.7 音频

- 寝室日常 BGM《午后小憩》：
  - 文件：`public/assets/audio/bgm/ch01_dorm.mp3`（80.0s，1.28 MB）
  - 来源：游戏素材大师 · 音乐生成（Suno `chirp-v6`，纯音乐），任务 `amvn5h2bh14c4b7`，歌曲 `3cf9a225-365c-40be-b33c-b2dea2b0c4fd`
  - 方向：校园日常 / 午后 / 木吉他 + 软钢琴 + 轻沙锤 + 远处蝉鸣；明确排除恐怖 drone 与工业脉冲
  - 后期：截取 12–92s（80s），首尾 0.6/0.8s 淡化，loudnorm -16 LUFS，MP3 128k
  - 原始件：`assets-src/audio/ch01/ch01_campus_source.m4a`
- 梦域与音效：`ch01_dream.mp3`、`ch01_punch.mp3`、`ch01_metal.mp3`、`ch01_phone.mp3` 仍由 `tools/make-ch01-audio.py` 程序化合成（临时占位，零计费）。
- 呼噜声 SFX：
  - 文件：`public/assets/audio/sfx/ch01_snore.mp3`（6.03s，96 KB，可循环）
  - 来源：游戏素材大师 · 音效生成，任务 `fmvn72wj9687b04`，take `kmvn73xdec716e1`
  - 用法：剧情开始（章节卡/开场对白）循环播放，进入探索时停止并切校园 BGM。
- 回忆 BGM《危机来临》（2026-10-29）：
  - 文件：`public/assets/audio/bgm/ch01_crisis.mp3`（84.0s，1.34 MB，128 kbps / 44.1 kHz）
  - 来源：游戏素材大师 · 音乐生成（Suno `chirp-v6`，纯音乐），任务 `amvteznun49fe85`，歌曲 `e0a4aafd-430c-4f2e-95b2-c4d6e58cd491`（Suno 标题《Cold Wire Report》）
  - 方向：74 BPM 小调；低频合成器脉冲 + 弱音钢琴 + 心跳式底鼓 + 细弦泛音 + 极轻的电视噪点；冷、压抑、纪录片感，压在对白下面，不做恐怖尖叫/英雄式高潮
  - 后期：截取 2–86s（84s），首尾 0.8/1.5s 淡化，loudnorm -16 LUFS / TP -1.5，MP3 128k
  - 原始件：`assets-src/audio/ch01/ch01_crisis_source.mp3`
- 状态：寝室 BGM 已替换为校园日常；梦域/音效后续可继续用 music/sfx 模块重做。
- 呼噜音量修复（2026-10-26）：原 `ch01_snore.mp3` 导出电平只有 -65 dB，已用 `loudnorm I=-16:TP=-1.5` 重新导出（mean -17.8 dB / peak -2.0 dB），key 与 6.03s 时长不变；游戏内 `startSnore` 音量降到 `settings.sfx * 0.6`。

### 11.8 废弃方向

- 整张寝室绘制（任务 `imvn3apqi71ea70` / `imvn3c1487e6cbd`）：按用户要求改为零部件拼图，源图不再随包。
- 早期程序化像素图/音频：仅作为 fallback，不参与最终构建。

### 11.9 宿舍地图重做（2026-10-25，Q 版 5 格宽角色）

- 目标：按「角色宽 5 格」重排四床 + 四周墙 + 一桌，全部使用整图素材；基础地图四张空床，郑卿睡觉动画是运行时素材、按剧情替换，不放进地图编辑器。
- 比例：格 32px；外框 50×54 格（1600×1728）；室内 44×48；墙 3 格；门 6 格。角色显示 128×371（4 格宽），按与床上郑卿同尺寸校正（初版 160×463 偏大）。
- 生成（均为 `doubao-seedream-5-0-flash-260915`，2K）：
  - 地板整图 — `imvnsvlra40638e`
  - 空床 — `imvnswmiq8ba46f`
  - 书桌（纯俯视 v2）— `imvnt1htlf8910e`
  - 砖墙材质 — `imvnt3tb8e8e4ff`
  - 郑卿睡床（仅用于运行时动画素材）— `imvnt73c4107a75`
- 地图项目：`mmvnsvgbrfc5e10`（AVM 宿舍 俯视 5格宽角色，50×54，32px）
- 产物：`assets-src/map/ch01/dorm-map/`
  - `map-final.png`（四张空床）/ `map-story-zheng.png`（剧情状态预览）/ `map-pass.png` / `map-scale-check.png`
  - `floor.png`、`wall-{north,south,west,east}.png`、`bed.png`、`table.png`
  - 运行时动画：`bed-zheng-anim.png`（4 帧横排 1152×704）、`bed-zheng-anim.json`、`frames/zheng-{0..3}-fit.png`、`bed-zheng-loop.gif`
  - `pass-grid.json`（50×54 通行矩阵，权威）
- 后期：绿幕/抠像、按格缩放、墙条拼装、郑卿 4 帧胸口位移循环。动画单独作为运行时资源，基础地图不包含郑卿整图。
- 说明：整图素材的逐格「通行」标记在 API 导入时没有被写进地图项目，因此以 `pass-grid.json` 和 `map-pass.png` 为通行真值；地图项目保留空床/墙/桌素材与坐标，郑卿整图已从项目中移除；供后续在编辑器里重标通行。
- 设计文档：`docs/DESIGN-DORM-MAP.md`。
- 游戏接入（2026-10-25）：`img.map.ch01.dorm_q`（1600×1728 房间整图，按 720 宽显示）、`img.map.ch01.bed_zheng`（4 帧睡床）、`img.char.ch01.q.*`（Q 版八向静态/行走 160×400 帧，场景缩放 0.45，斜向四套齐全）；房间改为 50×54、tile 14.4，剧情开场/交互点已按新布局重写。

### 11.9 第一章开场动画（2026-10-28）

- 素材：`public/assets/video/ch01-opening.mp4`（720×1280，12.83s，H.264 + AAC，3.4 MB）
- 来源：短剧工程 `drama/剧集/EP001` →「游戏素材大师」执行
  - 图片：火山方舟 Seedream 5.0（角色板 `imvrwe50vfa5e25` / `imvrwe514442e31`、起始帧 `imvrwmx7xb14605` / `imvrwff7o8ff8f9`）
  - 视频：MiniMax-H3（优云智算），第一镜首帧模式 `smvrwps8h1670fe`（6s），第二镜多模态参考模式 `smvrxixcace7ca2`（8s，起始帧 + 周全板 + 郑卿板）
- 后处理：两张 1440×2520 母版裁成 9:16、缩到 1080×1920，1.2s 交叉溶解拼接成 12.83s 成片；再压成 720×1280 供游戏内播放（`ffmpeg -crf 24 -movflags +faststart`）。
- 用法：开幕剧情结束/跳过后播放，播完或点「跳过」进第一章寝室；视频自带蝉声、鼾声与椅子声，不叠 BGM。

### 11.10 第一章手机 CG：图版与两镜起始帧（EP002，2026-10-30）

- 工程：短剧 `drama/剧集/EP002`（《屏幕里的脸》，两镜 6s + 8s，1.2s 溶解，约 12.8s）
- 图片：火山方舟 Seedream 5.0（`doubao-seedream-5-0-flash-260915`，1440×2560）
  - 小白角色板 v1 `imvupe1jp7ef39e` → 作废（膜翼）；改用 v2 `imvuryuri036652` → `剧集/EP002/制作成果/images/XIAOBAI-SHEET.png`（白袍兜帽、两点黑眼、胸口淡蓝核心、白色羽毛小翅膀；以 v1 为参考做定点修改）
  - 手机道具板 `imvupe1jyff6cf6` → 作废（老式功能机，与设定不符）；改用 `imvure5154680b1` → `PHONE-SHEET.png`（深灰直板触屏手机 + 背面双摄 + USB-C）
  - 书桌与北窗场景板 `imvupe1k77e6c2f` → `DESK-PLATE.png`（北窗在桌后偏右、旧书在左、搪瓷缸在右后）
  - SHOT-EP002-001 起始帧 `imvupgvbgcbd2de` → 作废（老式功能机）；改用 `imvurj3d3532cff` → `SHOT-EP002-001.png`（参考：场景板 + 触屏手机板 + EP001 周全校服板）
  - SHOT-EP002-002 起始帧 `imvupgvbpb0e8f3` → 作废（手机背面朝镜头）；改用 `imvurp5ft919104` → `SHOT-EP002-002.png`（参考：上一帧 + 触屏手机板 + 周全校服板）
- 视频：MiniMax-H3（优云智算）
  - 第一镜 `smvus7btj202d66`（首帧模式，6s，起始帧 = SHOT-EP002-001.png）
  - 第二镜 v1 `smvus7bttc39640` → 作废（白光后手机翻面）；v2 `smvutdyhl1fe0d6` 作废（未做瘫坐）；v3 `smvuufmoca24c1d` 作废（坐倒像身体不适、左侧床被拍成木板）；当前 v4 `smvuv7mkl9dd07b`（多模态参考，8s，参考同上；正文写死「屏幕始终朝镜头」+「受惊动作链」+「左侧必须带床与蓝白被」）
  - 第三镜 `smvuw29yubb468c`（首帧模式，8s；首帧 = v4 第二镜的最后一帧 `images/SHOT-EP002-003.png`）
  - 成片：`剧集/EP002/制作成果/video/EP002-手机CG-v5-扫描-20.2s.mp4`（1080×1920，20.21s，两处 1.2s 交叉溶解）；游戏内版 `public/assets/video/ch01-phone.mp4`（720×1280，4.4 MB，key `video.ch01.phone`，bundle `cutscene.ch01phone`）
- 说明：本集只入画手、前臂、侧脸与半身；小白形制按 `img.char.ch01.xiaobai` 精灵与 `剧集/EP002/视觉设定.md` 统一。旧的 `public/assets/img/cg/ch01/xiaobai.webp`（两个学生在明亮屋里看翅膀小孩）与本集设定冲突，接入时以 EP002 帧替换或弃用。

### 11.11 梦域金殿：殿上过场素材（2026-10-31）

- 地图：火山方舟 Seedream 5.0
  - 金殿整图 v1 `imvv3zxki42c14d` → 作废（出来是正视角，Q 版角色站上去像贴纸）
  - 金殿地砖 `imvv4lfwr6be1f8`（可平铺白玉砖）、北墙窗 `imvv4lfx3d4ec48`（红漆花窗，1536×1024）、红柱 `imvv4zh296dbe7d`、龙椅+龙纹屏风 `imvv4zh2k796bca`
  - 合成：`assets-src/palace/hall-final.png` → `public/assets/img/map/palace/hall.png`（1056×1728，33×54 格，Pillow 拼装）
- 人物（同一个人不同衣服用参考图保持同一张脸）：
  - 楚平生（老师）人设图 `imvv3zxks17d846` → `assets-src/palace/raw/chu-pingsheng-sheet.png`
  - 郑卿（皇袍）Q 版源图 `imvv44yzo344c87`（参考 EP001 `ZHENG-SHEET.png`）
  - 楚公公（太监总管）Q 版源图 `imvv46puw9fd31e`（参考楚平生人设图）
  - 太监 Q 版源图 `imvv48liv90bbbc`（三次重试才拿到，前两次是下载失败）
  - 周全跪姿（正面/背面双姿势）`imvv49uqa8acd20`
- 八方向：sprite 项目 `pmvv4i4n5754bde`（郑卿 · 转圈截帧）、`pmvv4i4npef471f`（楚公公 · 转圈截帧）
  - 产物重打包到 200×420（人物高 371、底边 400、中心 100），落在 `public/assets/img/character/palace/`
  - 已知：楚公公背向帧抠像带一圈绿晕、拂尘超框，等 Clash 直连规则加好再重挑截帧
- 变形素材（2026-10-31 追加，替掉最初「同一张图染金属色」的偷懒做法）：
  - 太监裂皮瞬间 `imvvgt4ik6ead8c`（半人半铁、铁肋发光、猩红 LED 眼、碎片飞散；以太监源图为参考）
  - 矿工铁皮骨架 `imvvgt4iu8f6162`（黑铁皮 + 幽蓝关节 + 螺旋桨手臂）
  - 三段演出：太监 → 裂皮（白闪）→ 矿工（红闪 + 换贴图 + 缩放弹一下）
- 八方向返工：楚公公原来 8 张里背向带转圈视频的彩色光环、up_left/up_right 取到了正侧。改成
  「f00 正面 / f01 前左 / f09 左侧 / f13 后左 / f14 正背」五帧抠像 + 镜像出 right / down_right / up_right，
  产物仍是 200×420（高 371、底边 400、中心 100）。
- 八方向行走（2026-10-31）：两个 sprite 项目各补 8 段行走视频（MiniMax-H3），
  用 `make-walk-sheet.py` 按步态周期抽 16 帧、200×420 对齐，落在 `public/assets/img/character/palace/{zheng,chu}_walk_<dir>.webp`（共 16 张，约 5.6 MB）。
  有 4 个方向闭合误差 > 10（郑卿 down/right/up_left/up_right），本段只用到 down，先不动；要更顺可重跑那几段视频。
- 楚公公跪姿 `imvvhx7zhd125fe`（磕头求饶），接在「陛下饶命」之前：换贴图 + 震屏，不给走位时间。
- 说明：殿上过场不用视频 CG，角色在 `hall.png` 上用走位/朝向/换贴图演出来。

### 11.12 金殿音效与半身立绘（2026-10-31）

- 音效：火山引擎 Seed-Audio（`sfx` 模块，`seed-audio`，24kHz，每次生成一条 take）
  - 14 条：`palace_hall_ambience`（`fmvvk8zxzcf6c72`）、`palace_step_stone`（`fmvvk8zye7865b2`）、`palace_kneel_thud`（`fmvvk9k19b3432c`）、`palace_crack_metal`（`fmvvk9k1h7c7400`）、`palace_servo_whir`（`fmvvka4pxc06e84`）、`palace_stamp_hit`（`fmvvka4q45111cf`）、`palace_led_power`（`fmvvkf75ab054b2`）、`palace_rumble_hall`（`fmvvkf75j49b31a`）、`palace_whoosh_heavy`（`fmvvkfsrq18a6e6`）、`palace_heartbeat`（`fmvvkfsry06233d`）、`palace_knock_head`（`fmvvkgdsv4cb8db`）、`palace_cloth_rustle`（`fmvvkgdt5fb68bd`）、`palace_blade_spin`（`fmvvkgyfse6a6ee`）、`palace_gasp`（`fmvvkgyg01f3633`）
  - 后处理：`tools/normalize-palace-sfx.sh`（截到设定时长 → `loudnorm I=-16:TP=-1.5` → mp3 24kHz 单声道），产物 `public/assets/audio/sfx/palace_*.mp3`，共约 300 KB
  - 注意：**不要用 silenceremove** 处理大殿环境音（整段在 -45dB 以下会被削成空文件，已踩过）
- 半身立绘：火山方舟 Seedream 5.0，以 Q 版源图为参考保持同一张脸
  - 郑卿皇帝 `imvvl3lp901faff` → `portrait_zheng.png`（720×900）
  - 楚公公 `imvvl3lpkafbcd8` → `portrait_chu.png`（720×900）

### 11.13 全面优化：寝室重组、金殿增强、战斗舞台、环境音（2026-10-31）

**本地合成（零生成费用，可复现）**

- `tools/compose-dorm-map.py`：读 `assets-src/map/ch01/dorm-map/map-manifest.json` 重组寝室底图，叠加北窗光楔/地面光池/窗棂投影/浮尘、床桌墙根接触阴影、墙裙与砖缝脏迹、暖冷色温、泛光/暗角/固定 seed 颗粒；复用旧零件 `rug.png`（可行走地毯）与 `boxes.png`（两处行李箱，占格写进 `map-manifest.blockers`）。
  - 产物：`public/assets/img/map/ch01/dorm_q.png`、`assets-src/map/ch01/dorm-map/map-final.png`、`prop-placement.json`
  - 校验：`dorm_q_v2-pass.png`；`pnpm assets:pass` = 509 / 1782 可走格
- `tools/enhance-palace-map.py`：读 `hall.png`，叠加 5 道窗棂斜光柱（含格影）、香炉烟/浮尘、台脚与红柱地面反光、毯边金边、金红色温、泛光/暗角/颗粒。
  - 产物：`public/assets/img/map/palace/hall.png`、`assets-src/palace/hall-final.png`
- `tools/compose-battle-plate.py`：从金殿合图裁 720×1280 战斗专用舞台，前景台阶虚化、聚光锥 + 红毯光池（敌位 360,820）、左下玩家位冷调补光、浮尘、暗角。
  - 产物：`public/assets/img/battle/ch01/miner_hall.webp`（WebP q88，69 KB）
  - 原始 PNG：`.tmp/art-review/battle_plate.png`（不入库，可重跑脚本）

**音效（真实计费）**

| 用途 | 任务 id | 原始时长 | 后处理 | 产物 |
| --- | --- | --- | --- | --- |
| 寝室午后环境音（蝉鸣/操场/吊扇，循环） | `fmvvqbjri7f80b1` | 30.00s | `loudnorm I=-21:TP=-2.5:LRA=7`，mp3 96k | `public/assets/audio/sfx/ch01_ambience_day.mp3`（361 KB） |
| 木地板脚步 | `fmvvqbjrr997b54` | 2.50s | 截 0.5s + 尾部淡出 + `loudnorm I=-13`；B 版 `asetrate×1.06` 变调 | `ch01_step_wood_a.mp3` / `ch01_step_wood_b.mp3`（各 ~9 KB） |

- 生成模型：火山引擎 Seed-Audio `seed-audio-1.0`，44.1kHz，单声道 mp3；自动审核模式。
- 提示词见任务记录；环境音刻意压到 -21 LUFS，作为 BGM 之下的底噪。

### 11.14 章节卡钟声（2026-10-31，程序化）

- `tools/make-ch01-chime.py`：G5 784Hz / C6 1046.5Hz / G6 1568Hz 三个正弦钟音 + 二次/三次泛音，指数衰减，18ms 噪声槌子；2.2s，44.1kHz 单声道，mp3 96k。
- 产物：`public/assets/audio/sfx/ch01_chapter_chime.mp3`（27 KB），章节卡与结束卡各播一次（音量 0.45 / 0.38）。
