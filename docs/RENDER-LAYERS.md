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
| characters | `LAYERS.characters + feetY` | `actors/` | 周全、郑卿、小白、矿工 |
| effects | `LAYERS.effects` | 场景/UI 辅助 | `[E]` 提示、伤害数字、HP 条 |
| input | `LAYERS.input` | `ui/joystick.ts` | 触屏摇杆 |
| cinematic | `LAYERS.cinematic` | `ui/cinematic.ts` | 章节卡、过场 |
| cg | `LAYERS.cg` | `ui/cg-overlay.ts` | 手机白光、醒来 CG |
| debug | `LAYERS.debug` | `world/`（debug 参数） | 碰撞格、交互半径 |
| Compose UI | `UI_ROOT_DEPTH` = 10000 | `ui/*-hud.ts` / `ui/*-modals.ts` | 目标条、对话框、按钮、模态 |

### 1.1 三条硬规则

1. **原生层不写魔法 depth**：一律 `LAYERS.*`；角色用 `characterDepth(feetY)`。
2. **CG 必须盖住角色**：`LAYERS.cg > characterDepth(maxY)`；当前 5000 vs 角色约 2000。
3. **Compose UI 永远在原生层之上**：`MVVMPlugin.configure({ depth: UI_ROOT_DEPTH })`；HUD/对话/按钮不要用原生 `Text` 去画控制层。

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
