# 梦域·金殿：可演出宫殿场景（进行中）

> 2026-10-30 起。目标：把「白光吞没 → 直接 CG 切战斗」改成**在宫殿地图上把剧情演出来**。
> 本文只记当前状态与下一步，设计细节定稿后并入 `docs/STORY-BIBLE.md`。

## 1. 原文出处（`reference/刺客与矿工/第001章-天子.txt` / `第002章-小白.txt`）

1. 白光吞没 → 周全**跪在冰冷地板**上，抬头看见四根红柱、金色龙椅，龙椅上坐着穿明黄五爪龙袍、戴冕旒的郑卿（嘴角是他熟悉的满足的笑）。
2. 周全失声：「老郑？！郑卿？！」
3. 尖细嗓音：「有刺客！护驾！！」→ 几个**太监服饰却肌肉虬结的大汉**从阴影里扑出，把周全按倒在地。
4. 脸贴地，周全抬头，看见龙椅旁一个**瘦高、熊猫眼**的身影：「楚……楚老师？！」
5. 郑卿缓步下阶，居高临下：「哼。谁派你来的？」
6. 郑卿偏头困惑 → 震怒点名「楚公公」：加派人手、脑袋不想要了？楚公公**噗通跪下磕头**求饶。
7. 周全醒悟这是郑卿的梦，咆哮「郑！卿！快！醒！醒！你！爸！来！学！校！查！寝！了——！！！」
8. 大殿地震般一晃，郑卿石化；小白机械音：「心防出现剧烈震荡，目标精神屏障异常薄弱。」
9. 「呔！大胆贼子！纳命来！」太监把周全像麻袋一样摔出去。
10. 太监**皮肉裂开剥落**，露出金属骨架、幽蓝关节光、猩红 LED 眼：「入侵单元确认！执行矿场清除协议！」→ 接战斗。

关键点：**楚老师 = 楚公公**（同一个人，两套衣服，靠参考图保持同一张脸）；太监是矿工的伪装形态，所以「裂开变矿工」是这一段的视觉爆点。

## 2. 素材清单与状态

| 素材 | 状态 | 位置 |
| --- | --- | --- |
| 楚平生（老师）人设图 | ✅ | `assets-src/palace/raw/chu-pingsheng-sheet.png` |
| 郑卿 皇袍 Q 版源图 | ✅ | `raw/zheng-emperor-green.png` |
| 郑卿 八方向静态（160×400） | ✅ 正背面干净 | `public/assets/img/character/palace/zheng_emperor_<dir>.png` |
| 楚公公 Q 版源图（同一张脸） | ✅ | `raw/chu-gonggong-green.png` |
| 楚公公 八方向静态 | ⚠️ 背向帧抠像有绿晕、拂尘超框 | 同上 `chu_gonggong_<dir>.png` |
| 周全 跪姿源图（正面/背面） | ✅（比例偏写实，待定是否重出三头身） | `raw/zhou-kneel-green.png` |
| 太监 Q 版源图 | ✅（第三次重试成功） | `raw/eunuch-green.png` |
| 金殿地砖 | ✅ | `raw/floor-tile.png` |
| 北墙窗、红柱、龙椅屏风、台阶 | ✅（北墙此前是尺寸参数错误 HTTP 400，改 1536×1024 后即出图） | `raw/wall-north.png`、`raw/pillar-green.png`、`raw/throne-green.png` |
| 大殿 45° 合成图 | ✅ v5：换成脚本合成（踏面/立面、接触阴影、光池、泛光） | `tools/compose-palace-hall.py` → `public/assets/img/map/palace/hall.png` |
| 太监裂皮帧 / 矿工铁皮骨架 | ✅ | `public/assets/img/character/palace/eunuch_crack.png`、`miner.png` |
| 八方向行走 sheet（郑卿 / 楚公公） | ✅ 各 8 张 × 16 帧 | `public/assets/img/character/palace/*_walk_<dir>.webp` |
| 楚公公跪姿 | ✅ | `public/assets/img/character/palace/chu_gonggong_kneel.png` |
| 金殿音效 14 条 | ✅ | `public/assets/audio/sfx/palace_*.mp3`（`cutscene.ch01palace.sfx`） |
| 半身立绘（郑卿 / 楚公公） | ✅ | `portrait_zheng.png`、`portrait_chu.png` |
| 角色贴图（统一 200×420、高 371、底边 400） | ✅ 郑卿 8 向 / 楚公公 8 向 / 太监 1 向 / 周全跪姿 2 张 | `public/assets/img/character/palace/` |

## 3. 地图方案

- 与寝室同一套：33×54 格、tile 32 美术像素（显示 720 宽）、整图 1056×1728、ASCII 通行格 + `map-manifest.json`。
- 合成顺序：地砖平铺 → 北墙 → 高台 → 三级台阶 → 地毯 → 龙椅 → 红柱 → 暖光/暗角，全部用 Pillow 脚本（`tools/compose-palace-hall.py`，待落盘）。
- 可行走：地毯两侧的殿面 + 台阶前的广场；高台/龙椅区不可走（Boss 区）。
- 镜头：固定（不滚动），因为整座殿要一屏看全；角色靠走位与朝向演戏。

## 4. 场景结构（计划）

新场景 `scene.ch01.palace`（sceneKey `ch01-palace`），三幕：

1. **落地**：白闪 → 周全出现在殿中央、跪姿（背向镜头朝龙椅）；两行旁白。
2. **对峙**：周全喊「老郑？！」→ 太监从两侧冲出、按倒（太监位移 + 周全切伏地 + 震屏）→ 楚公公从龙椅侧走下台阶 → 周全「楚……楚老师？！」→ 郑卿下阶 → 居高临下那句。
3. **揭破**：郑卿斥楚公公 → 楚公公跪下磕头 → 周全咆哮 → 全殿震 → 郑卿石化 → 小白机械音 → 太监摔人 → 太监裂皮变矿工（贴图替换 + 光效）→ 进战斗。

实现方式：沿用 `prologue-player.ts` 的**纯逻辑时间线**（无 Phaser、可单测），场景只消费事件（`cue`：移动、切姿势、震屏、闪光、换贴图、播台词）。

## 5. 待办

- [x] 地图合成 v4（`hall-final.png`，1056×1728）
- [x] 角色贴图重打包到 200×420（原 160 帧会裁掉太监的手臂）
- [ ] 楚公公背向帧抠像仍有绿晕（等 Clash 直连规则修好再重挑帧）
- [ ] ASCII 通行格 + `map-manifest.json` + 资源登记
- [x] 剧本 `src/story/ch01-palace.ts`（含楚老师=楚公公的揭示）
- [x] 时间线 `src/story/palace-player.ts` + `test/palace-player.test.ts`
- [x] 场景 `src/scenes/ch01-palace-scene.ts` + HUD `src/ui/palace-hud.ts`，舞台入口 `scene.ch01.palace`
- [x] 战斗背景迁到新地图（`img.map.palace.hall`）
- [x] 寝室 `dream` 节点改走金殿：`beginPalace()` → `ch01Palace` → `battleCh01`
- [x] `pnpm check` 全绿 → 打包 APK → 坚果云
- [x] 视觉打磨第一轮：地图合成脚本 `tools/compose-palace-hall.py`（台阶踏面/立面、柱与椅的接触阴影、光池、泛光与暗角）；楚公公八方向按帧重挑 + 镜像重出

## 6. 2026-10-31 视觉增强（已完成）

- `hall.png` 由 `tools/enhance-palace-map.py` 重新叠加：5 道窗棂斜光柱（对应旁白「光从雕花窗棂里斜进来」）、香炉烟/浮尘、台脚与红柱地面反光、毯边金边、金红色温、泛光/暗角/颗粒。
- 场景侧接入 `src/ui/fx-kit.ts`：窗光柱 ×2、浮尘、余烬、暗角；每名角色加脚底接触阴影并跟随走位。
- 太监裂皮 → 矿工的两拍增加金属碎片、火星、冲击环与矿工核心脉动红光。
- 战斗不再复用宫殿全景：`tools/compose-battle-plate.py` 产出 720×1280 专用舞台（聚光锥 + 前景台阶 + 暗角）。
- 舞台上下留白用 `src/ui/stage-frame.ts` 做成墨色画框 + 鎏金细线，不再是纯黑边。
