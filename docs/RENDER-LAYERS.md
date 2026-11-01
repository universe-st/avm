# 渲染层级与模块边界

> 状态：v1.0（2026-10-25，第一章第一节落地）
> 唯一深度真值：`src/render/layers.ts`
> 唯一资源 key 分组：`src/assets/keys.ts`

## 0. 一句话

**地图在底、角色按脚底排序、CG 盖住世界、Compose UI 的 UIRoot depth 固定 10000，永远在 CG/debug 之上；代码按 `world / actors / ui / cg` 分文件，资源按 `map / character / cg / ui / battle` 分目录。**

## 1. 原生层（Phaser）

从下到上：

```
┌────────────────────────────────────────────┐
│ Compose UI（HUD / 对话 / 按钮 / 模态）        │  UI_ROOT_DEPTH = 10000（MVVM 层）
├────────────────────────────────────────────┤
│ screen（过场专用：立绘/遮幅/字卡/速度线/硬切） │  SCREEN_LAYERS = 7000–7050
├────────────────────────────────────────────┤
│ debug（碰撞/交互半径）                       │  LAYERS.debug = 6000
│ CG（全屏剧情图）                             │  LAYERS.cg = 5000
│ cinematic（章节卡/黑边）                     │  LAYERS.cinematic = 4000
│ input（摇杆等原生输入）                      │  LAYERS.input = 3200
│ effects（交互提示/飘字/HP 条/光效）          │  LAYERS.effects = 3000
│ characters（角色；depth = 1000 + 脚底 y）    │  LAYERS.characters = 1000
│ markers（交互点/地面箭头）                   │  LAYERS.markers = 200
│ props（家具/地面贴花）                       │  LAYERS.props = 100
│ background（房间/战斗背景）                  │  LAYERS.background = 0
└────────────────────────────────────────────┘
```

| 层 | 常量 | 归属 | 例子 |
| --- | --- | --- | --- |
| background | `LAYERS.background` | `world/` / 战斗场景 | 寝室房间图、梦域金殿背景 |
| props | `LAYERS.props` | `world/` / 战斗场景 | 家具、地面阴影、战斗尘埃底 |
| markers | `LAYERS.markers` | `world/` | 交互点、`Zzz` |
| characters | `LAYERS.characters + feetY`（小图）；大图用有界映射 | `actors/` | 周全、郑卿、小白、矿工 |
| effects | `LAYERS.effects` | 场景/UI 辅助 | `[E]` 提示、伤害数字、HP 条 |
| input | `LAYERS.input` | `ui/joystick.ts` | 触屏摇杆 |
| cinematic | `LAYERS.cinematic` | `ui/cinematic.ts` | 章节卡、过场 |
| cg | `LAYERS.cg` | `ui/cg-overlay.ts` | 手机白光、醒来 CG |
| debug | `LAYERS.debug` | `world/`（debug 参数） | 碰撞格、交互半径 |
| Compose UI | `UI_ROOT_DEPTH` = 10000 | `ui/*-hud.ts` / `ui/*-modals.ts` | 目标条、对话框、按钮、模态 |

### 1.1 三条硬规则

1. **原生层不写魔法 depth**：一律 `LAYERS.*`；角色用 `characterDepth(feetY)`。
2. **CG 必须盖住角色**：`LAYERS.cg > characterDepth(maxY)`；小图当前 5000 vs 角色约 2000。
3. **Compose UI 永远在原生层之上**：`MVVMPlugin.configure({ depth: UI_ROOT_DEPTH })`；HUD/对话/按钮不要用原生 `Text` 去画控制层。

> **2026-10-31 大图**：`characterDepth` 改为有界映射 `characterDepth(feetY, mapHeight)` → `characters..characters+900`（1000–1900），御膳房 64 行 × 96 = **6144** 高时角色不会盖过 `effects`/`cinematic`/`cg`。
>
> **2026-10-31 迷雾下移（重要）**：`LAYERS.fog` 由 2500 改到 **500**，也就是 **在 `markers`(200) 之上、`characters`(1000) 之下**。
> 原因：角色高 245px ≈ 2.5–3.5 格，脚所在格以北几格只要没探索，原本压在角色上面的黑幕就会把上半身整块吃掉，看起来像「人被切了一半」。
> 迷雾是**地面上的黑暗**，不是盖在所有东西上的黑布；角色的可见性由 `npcSeen()` + 180ms alpha 自己负责，不需要雾来盖人。
> 连带效果：区域名/门牌/地标（`markers`）在未探索区不再穿透显示。

## 2. 代码模块

```text
src/
  world/
    ch01-dorm-room-view.ts   # 地图背景/家具/交互标记/Zzz/debug
  actors/
    player-actor.ts          # 角色 sprite、四向静态图/行走 sheet、脚底 depth
  ui/
    ch01-hud.ts              # 寝室 Compose HUD（目标/对话/交互）
    ch01-modals.ts           # 寝室 Compose 结束卡/退出确认
    battle-ch01-hud.ts       # 剧情战 Compose HUD（HP/指令/日志）
    battle-ch01-modals.ts    # 剧情战 Intro/战败/退出
    cg-overlay.ts            # 全屏 CG + 轻量特效
    emotion-bubble.ts        # 角色头顶表情气泡（原生 effects 层）
    cinematic.ts             # 章节卡/星空/震屏等通用视觉
    joystick.ts              # 触屏摇杆（原生输入，非 Compose）
    pixel.ts                 # NEAREST 纹理
  render/
    layers.ts                # 深度契约（唯一真值）
  assets/
    keys.ts                  # map / char / cg / battle / audio key 分组
  scenes/
    ch01-dorm-scene.ts       # 编排：流程、输入、碰撞、对话、转场
```

- **world** 只画地图，不搬角色、不弹 UI。
- **actors** 只画角色，不读剧情、不做碰撞。
- **ui/cg-overlay** 只显示/隐藏 CG，不读台词。
- **scenes** 负责“什么时候显示什么”，调用以上模块。
- 剧情数据仍在 `src/story/`，地图数据/纯碰撞在 `src/map/`，战斗数据/纯逻辑在 `src/battle/`。

## 3. 资源目录与 key

```text
public/assets/img/
  map/<chapter>/...          img.map.<chapter>.<name>
  character/<chapter>/...    img.char.<chapter>.<name>
  cg/<chapter>/...           img.cg.<chapter>.<name>
  battle/<chapter>/...       img.battle.<chapter>.<name>
  ui/...                     img.ui.<name>
  title/... / prologue/...   img.title.* / img.prologue.*
```

第一章示例：

| 类别 | 文件 | key |
| --- | --- | --- |
| 地图 | `map/ch01/dorm_room.png` | `img.map.ch01.dorm_room` |
| 地图道具 | `map/ch01/chair.png` | `img.map.ch01.chair` |
| 角色静态 | `character/ch01/zhou_down.png` | `img.char.ch01.zhou_down` |
| 角色行走 | `character/ch01/zhou_walk_down.png` | `img.char.ch01.zhou_walk_down` |
| 角色坐姿 | `character/ch01/zhou_sit.png` | `img.char.ch01.zhou_sit` |
| CG | `cg/ch01/phone.webp` | `img.cg.ch01.phone` |
| 战斗背景 | `battle/ch01/dream_hall.webp` | `img.battle.ch01.dream_hall` |
| 呼噜 SFX | `audio/sfx/ch01_snore.mp3` | `audio.sfx.ch01_snore` |

- key 统一从 `src/assets/keys.ts` 取；不要在场景/剧情里手写字符串。
- `assets-src/` 与 `public/assets/img/` 同构：`map/`、`character/`、`cg/`、`battle/`。
- 新增资源仍必须走 `bundles.ts` + `assets:scan` + `assets:check`。

## 4. 战斗场景的同一套层

战斗背景使用 `background`，敌人/玩家用 `characterDepth`，HP 条/伤害数字用 `effects`，战败/胜利面板用 Compose 模态。战斗不需要地图层，但仍遵守“背景 → 角色 → 特效 → UI”。

## 5. 验收

- `pnpm check`：类型、单测、资源检查。
- 视觉：390×844/1200×648；确认 CG 盖住角色、对话面板在 CG 之上、调试层只在 `debug=1` 出现。
- 代码 review：场景里搜 `setDepth(`，只允许 `LAYERS.*` / `characterDepth()`；搜 `img.ch01.` 旧 key 应为 0。

## 6. 变更记录

- v1.0（2026-10-25）：第一章第一节落地；新增 `LAYERS`、`CH01_ASSET_KEYS`、`PlayerActor`、`Ch01DormRoomView`、`CgOverlay`；资源按 map/character/cg/battle 分目录。

## 8. 过场（cinematic）的两条硬规则（2026-10-31 补，踩过坑）

1. **镜头推拉只能缩放「世界层容器」，不能改 `cameras.main.zoom`。**
   相机 zoom 会把 Compose 页面（对话框）一起放大，出现「镜头一推，对话框飞出屏幕」。
   做法：地图与角色都 add 进一个 `worldRoot` 容器，推拉 = 改容器的 `scale` 与位置（以屏幕中心为锚点）。
2. **贴在屏幕上的东西，depth 只能取 `SCREEN_LAYERS`。**
   立绘/遮幅/字卡/速度线属于屏幕层，必须高于 `LAYERS.debug` 且低于 `UI_ROOT_DEPTH`；
   以前用 40–46 这种小数字，结果立绘被角色挡住、黑边压不住人物——现已归入 7000 段。

`test/render-layers.test.ts` 里有两条守卫：屏幕层区间有序（且低于 UI 根），以及
`cinematic-director.ts / portrait-layer.ts / ch01-palace-scene.ts` 里出现写死的 `setDepth(数字)` 直接失败。

## 迷雾渲染：从「格子方块」到「累积暗幕 + 射线扇形」（2026-11-01）

用户要求「视野是扇形或者圆形的，不是固定格子」。改法只动渲染层，判定完全没变。

**判定仍然是格子**：`visibleTiles()` 继续返回 `col,row` 集合，巡逻/背刺/发现判定全用它。改判定等于重做关卡平衡，不做。

**渲染换了两样东西**：

1. **连续朝向**：`facing` 只有 8 档，扇形会每 45° 跳一下。场景新增 `headingRad`（由输入向量 `atan2` 得来），`facing` 只负责选贴图。
2. **累积暗幕**：`LAYERS.fog` 上不再是一堆 `fillRect`，而是一张 **CanvasTexture**（房间尺寸 ÷8 = 384×768，显示时 8× 线性放大）：
   - 创建时整张填 `#05060a`；
   - 每次视野更新（100ms 节流，且只在玩家挪动 >6px 或转向 >0.02rad 时触发）用 `destination-out` 把**扇形多边形**擦掉；
   - 擦除是累积的 —— "已探索"天然等于历代扇形的并集，**边界是弧线不是台阶**，且不需要另存一张探索图；
   - 扇形边缘用径向渐变淡出（射程 55% 内全亮，到边缘归零），脚下 2.5 格另擦一圈柔光圆。

**射线**：`src/map/core/vision.ts` 新增 `castRay()`（DDA 逐格步进，撞到 `blocksSight` 的格子即停）与 `castVisionPolygon()`（视锥内均匀打 72–96 条射线连成多边形）。于是**墙和柱子后面会真的出现影子**，这是格子版做不出来的。敌人视锥 (`LAYERS.markers+20`) 同样改成扇形。

**开销实测**（390×844，Chromium）：待机 58fps / 行走 59fps / 关掉暗幕 60fps —— 暗幕约 1–2fps。

**坑**：
- 多边形只给弧上的点，直接 `closePath()` 会连成一道弦，把玩家自己那格擦不到（贴脸一条暗缝）。必须 `moveTo(脚下)` 再连弧 → 画成「扇形」而不是「弓形」。
- DDA 里"到下一条格线的距离"必须减去原点坐标；写成绝对坐标会让**正方向**（右下）的射线永远打空，扇形只剩脚下那圈光。四象限都要有单测。
- `RenderTexture.erase()` 在这套 Phaser 下不稳定（整张没变黑），换 CanvasTexture + `destination-out` 一次就对。

### 玩家视野改为「射程无限，只受墙阻挡」（2026-11-01）

用户要求：「把玩家（非怪物）视野半径改成无限的（受墙壁阻挡）」。
- 射程直接取房间对角线（`Math.hypot(w, h)`），射线撞墙即停，所以"无限"落到画面上就是"到墙为止"。
- **判定也跟着改了**：`visibleTiles()` 是「全房间每格算一次 LOS」，无限射程下每次 2048 格 × 上千采样，直接卡死。
  改成先算射线多边形（遮挡已经在里面），再用 `tilesInPolygon()` 反推格子集合（格心在多边形内，或离边界 < 半格 → 算看见）。
  渲染和逻辑共用**同一份多边形**，不会出现"看得见却没算看见"。
- 敌人视野不变（仍是各自 `rangeTiles`），只有玩家是无限的。
- 实测：灶房正中朝上，扇形最远打到 39.2 格（原来是 7.5 格），可见格 505，fps 58。
- 坑（第二次踩）：`castVisionPolygon()` 只给弧上的点，`tilesInPolygon` 如果直接拿它做点内判定，
  靠近玩家的那块会被判成"外面"——必须把圆心补进多边形才是扇形。渲染和判定两处都要补。
