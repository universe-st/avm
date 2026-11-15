# 金殿过场：逐字打字机证据（t62）

场景：`?stage=scene.ch01.palace&hud=0`，390×844，`textSpeed=normal`，第一句旁白
「白光褪去，你发现自己跪在冰冷光滑的地板上。」（21 字）。

## 文件

| 文件 | 内容 |
| --- | --- |
| `palace-typewriter.gif` | 逐字过程 9 帧（0 / 2 / 4 / 7 / 10 / 13 / 16 / 19 / 21 字），200ms/帧，无限循环 |
| `frame-00-blank.png` … `frame-08-21done.png` | GIF 原始帧：文本盒、行数、行高全程不变；提示从「点击补全」切到「点击继续」 |
| `palace-typewriter-demo.mp4` | 真实时间录屏 2.7s（390×844 H.264 + **真实游戏音轨** AAC 48k 双声道） |
| `palace-typing-real-audio.webm` | 从游戏 WebAudio 图抽头录下的原始音轨（Opus 48k 双声道，mean -20.5dB / max -5.7dB） |
| `palace-typewriter-history.png` | 逐字进行到 6 字时打开「记录」：面板只显示 6 字，记录里已是完整原句（不是遮罩串） |

## 怎么录的

- **GIF**：把 Phaser 的 `requestAnimationFrame` 换成手动步进，按 16ms/帧推进；到目标字数后再补一个
  0ms 帧（只让 Compose 把 ref 画出来、不吐新字）再截图，所以每帧字数与状态严格对应、可复现。
- **mp4 / 音轨**：Playwright `recordVideo` 没有音轨，所以用 CDP `Page.startScreencast` 抓真实时间帧
  （约 59fps），同时把 Phaser 的 `masterVolumeNode` 接到 `MediaStreamDestination`，用 `MediaRecorder`
  录下包含 BGM、环境音与逐字提示音的完整输出。两者按 CDP 帧时间戳与录音开始时间对齐后由 ffmpeg 合成。
- 逐字音声线：本轮全部为旁白，`typeVoiceForSpeaker` → `narrator`（`TYPE_VOICE_GAIN.narrator = 0.55`，最轻一档）。

## 实测数据（16ms 定步长，虚拟时间）

| 速度档 | 每字间隔 | 打完 21 字 | 逐字音次数 | 单帧最多 blip |
| --- | --- | --- | --- | --- |
| `normal` | 32ms | 656ms（41 帧） | 21 | 1 |
| `fast` | 18ms | 368ms（23 帧） | 21 | 1 |
| `slow` | 51ms | 1056ms（66 帧） | 21 | 1 |
| `instant` | 0（整句直出） | 0ms | 0 | 0 |

一帧强行补 15 个字的实测：`revealed 5 → 20`，blip 只 +1。
