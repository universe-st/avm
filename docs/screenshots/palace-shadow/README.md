# 金殿跪姿周全「脚下阴影悬空」修复证据

`?stage=scene.ch01.palace&hud=0`，390×844，第 1–3 拍（楚公公「有刺客！护驾！！」）。
所有图都是同一机位、同一句台词、`hud=0`；推拉镜头已等到稳定（worldRoot scale = 1.12）再截。

## 四个数（改前）

| 量 | 值 |
| --- | --- |
| `zhou_kneel_up` 不透明底边 | 画布 y=383（alpha ≥ 40 计）；落点钉在 y=400 → **比落点高 8.5 设计 px**，其余 21 张贴图都画到 y=399（−0.5） |
| 该贴图接触面（膝+小腿，底边往上 24 画布 px 最宽一行） | 104 画布 px = **52 设计 px 宽**，中心在画布 x=111.5（比中线右 5.75 设计 px） |
| 阴影椭圆（五个角色共用） | 118×24 设计 px、alpha 0.28、中心在落点 **+3**；390 宽屏幕上 64×13 css px（推近 1.12 后 72×15） |
| 空隙 | 椭圆上边缘 −9 设计 px vs 不透明底边 −8.5 → 几何只差 0.5px，但椭圆最黑处落在脚下 7 设计 px；按列量「可见缝」= 中心 0–1px、鞋外侧 3–7px，且椭圆比接触面宽 2.3 倍 → 读成「人悬在一摊影子上面」 |
| depth | 阴影恒为 `LAYERS.props - 1 = 99`，人物 `characterDepth(y)` = 1334…1502，地图/地毯同一张 PNG depth 0 → 阴影压在地毯上、永远被人物盖住；地毯/台阶没有独立图层，不存在盖住阴影的问题 |

## 改法

按贴图 alpha 轮廓定阴影（表在 `src/scenes/ch01-palace-shadow.ts`，数字由 `tools/measure-actor-footprint.py` 量）：

- 跪姿：`width = 接触宽 × 1.4 = 73`，`height = 73 × 0.22 = 16`，`alpha 0.3`，
  上边缘压住不透明底边 **6 设计 px**，横向跟接触面中心（+5.75）。
- 站姿：仍由同一套公式复现既有的 **118×24 / alpha 0.28 / 落点 +3**（观感零变化）。
- 换贴图（跪/裂皮/矿工）、翻面、走完停下都会重算；走位每帧跟一次。

实测（390×844，推近 1.12）：周全身高 30×70 css px，阴影 44×10 css px；
按列量可见重叠 **2–3px**（改前 0–1px 且椭圆 71px 宽）；其余四人改前改后逐像素一致。

## 文件

| 文件 | 内容 |
| --- | --- |
| `before-kneel-390x844.png` / `after-kneel-390x844.png` | 同机位「有刺客！护驾！！」改前/改后 |
| `compare-kneel-3x.png` | 上面两张裁到脚下 3× 并排（左改前 / 右改后） |
| `before-thrown-390x844.png` / `after-thrown-390x844.png` | 周全被摔出去（`move` 到 8.2,35.2）之后：阴影跟着落点走 |
| `before-miner-390x844.png` / `after-miner-390x844.png` | 太监裂皮成矿工、楚公公跪地那拍 |
| `after-thrown-reduced-390x844.png` | 同上，但开 `prefers-reduced-motion`（走位瞬间到位）：影子照样贴着（落在浅色石地上，接触面看得最清楚） |
| `after-shadow-follow.gif` | 摔出去那一下的 14 帧（240 宽），阴影全程贴着身体 |
| `after-kneel-1200x648.png` | 1200×648 桌面视口（4:3 会左右留边，属已知行为） |

## 复跑

```bash
python3 tools/measure-actor-footprint.py     # 贴图接触面（换图后重跑，把数抄回表）
pnpm test -- palace-shadow                   # 像素对表 + 几何对位 + 源码护栏
pnpm dev --port 5199                         # ?stage=scene.ch01.palace&hud=0
```
