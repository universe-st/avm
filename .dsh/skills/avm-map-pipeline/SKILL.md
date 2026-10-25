---
name: avm-map-pipeline
description: 在「刺客大战矿工」项目里用游戏素材大师生成俯视地图、整图家具和八方向角色，并把地图、碰撞、交互接进 Phaser 场景。Use when redesigning a dorm/room map, importing whole-image map stamps, wiring map assets into the chapter scene, or fixing 4/8-direction character sprites.
---

# AVM 地图管线（游戏素材大师 → 游戏场景）

本项目的地图不是手画整图，而是「游戏素材大师」生成素材 → 地图片段导入/拼合 → 生成碰撞矩阵 → 接进 Phaser。第一版寝室（2026-10-25）走过的坑都写在下面。

## 0. 开工先读

1. `AGENTS.md` 的硬规则（资源必须进 bundle、舞台目录、`pnpm check`）。
2. `docs/DESIGN-MAP.md`（正交俯视、720 设计宽）与 `docs/DESIGN-DORM-MAP.md`（当前寝室的比例/通行）。
3. `game_material({action:"guide",topic:"map"})`、`topic:"map-agent"`；要生成素材再读 `image` / `sprite`。
4. 现有实现：`src/map/rooms/ch01-dorm.ts`、`src/world/ch01-dorm-room-view.ts`、`src/scenes/ch01-dorm-scene.ts`、`src/assets/keys.ts`、`src/assets/bundles.ts`。

**不要**直接改 `~/.dsh/game-material-master/map-jobs/*/map.json` 或 `project.json`。

## 1. 先定比例（比先画图重要）

地图编辑器的格子最小 32px，但游戏设计宽是 720。当前寝室的基准：

| 项 | 值 |
| --- | --- |
| 地图项目格 | 32px（编辑器） |
| 地图内容 | 50×54 格 = 1600×1728 |
| 游戏显示 | 按 720 宽 → 缩放 0.45，tile 14.4 |
| 角色 | Q 版 160×400 帧，显示缩放 0.45（内容约 128×371） |
| 碰撞脚底 | 58×20；移动速度 140 |
| 房间视图 | `setDisplaySize(720, 777.6)`，LINEAR 采样 |

- 「角色宽度占 N 格」只是**定家具格子数**的基准，不要拿它直接当游戏像素。第一版按 5 格定床 9×22、桌 9×6，后来用户要求「和床上郑卿同尺寸」，角色显示收到 128px（4 格）；家具格子数不回改。
- 床/桌/墙的格子数一旦定了，先写进 `docs/DESIGN-DORM-MAP.md`，再生成素材，避免素材回来又改布局。
- 任何通道、门洞至少留 **角色宽 + 1 格**；当前中央廊 22 格、桌侧 6–7 格、门 6 格。

## 2. 生成整图素材

统一风格提示词骨架（俯视、整图、纯绿幕）：

```text
正交正上方俯视（90 度垂直向下）的游戏地图道具：<物件>，单独一件，不含其它家具/人物/地面。
【视角】只能看到物件顶面，不要透视、不要侧视、不要桌腿/抽屉立面、不要投影。
【风格】国风 HD-2D 像素风，清晰像素描边，扁平光影，硬边色块；参考图只用于色彩/木质统一。
【背景】纯 chroma key 绿 #00FF00，均匀无渐变无阴影，四周留少量绿边，物件完整不裁切。
【禁止】人物、文字、水印、logo、阴影。
```

- 2K 生成（`doubao-seedream-5-0-flash-260915`），每件一个 job，jobId 记进 `docs/ASSET-CREDITS.md`。
- 地板用「整张地面」提示词，**不要绿幕**，铺满画布。
- 墙不要生成一整条 16:1 的图（模型会糊）；生成可平铺砖墙材质，再用 Pillow 拼北/南/东/西墙条，加内阴影、门洞、窗。
- 郑卿睡床：以空床为参考图 + 郑卿设定图，生成「仰睡、被子盖到胸口」；再以胸口/被子区域做 4 帧轻微位移（3fps）得到呼吸循环。
- 抠像后一定要**放大看领口/肩线**：不要用一条水平切割线把头/身切开（2026-10-25 的 Q 版就因此「肩膀断了」）。宁可整张重生成，也不要把头缩小后贴在身体上。

## 3. 导入地图编辑器（整图素材）

```text
createMapProject({name, grid:32, cols:50, rows:54})
importMapTileset({
  projectId, name, path, shape:"stamp",
  cell:{width:32,height:32},
  stamp:{cols, rows, frames, pass:[...]}
})
```

- `pass` 是 **行优先**、长度 = cols×rows 的 0/1 数组；1 = 可走。地板整图要全 1，墙/床/桌全 0，门洞所在格 1。
- 家具层用 `l1`、墙用 `l2`、地面层用 `l0`。
- `applyMapOps` 摆整图：`{kind:"stampPlace", tilesetId, layerId, r, c}`，`r,c` 是左上角；先 `dryRun:true`。
- 一张整图会被宿主按 4 个旋转烘焙，**大图（尤其整块地板）会膨胀**；编辑器里的地板可以改用一张无缝 plain tile，最终合图再用整张地板。
- **API 导入的整图可能 render 报「素材不见了」**：宿主没有按 UI 的方式烘焙 4 个旋转。`recomposeMapTileset` 能修好显示，但会丢掉 `pass`。因此：
  - 交付图/通行以本地 `map-final.png` + `pass-grid.json` 为准；编辑器项目只作素材/坐标/标记参考。
  - 若必须让编辑器里通行正确，走 `composeMapAsset` 返回的 `openUrl`，在 UI「新增素材」里点通行格确认。
- 标记（spawn/exit/event）用 `applyMapOps` 的 `marker add`，坐标是 `r,c`。

## 4. 生成碰撞矩阵

在 `assets-src/map/ch01/dorm-map/` 产出：

- `map-final.png`（1600×1728，整图合成，含四床/桌/墙/窗/门）
- `pass-grid.json`：`{cols:50, rows:54, passable: ["0101…", …]}`，`1` 可通过
- `map-pass.png`：绿/红检查图（16px/格）
- `map-scale-check.png`：角色 128×371 与 5 格脚印叠在空床上，检查比例

`pass-grid.json` → ASCII 的规则：`1` → `.`，`0` → `#`，门格 → `=`，出生点 → `P`（只能一个）。写进 `RoomDef` 的 `ascii`，`size:[50,54]`、`tileSize:14.4`。

## 5. 接进游戏

### 5.1 资源

```text
public/assets/img/map/ch01/dorm_q.png        ← map-final.png
public/assets/img/map/ch01/bed_zheng.png     ← 4 帧横排 1152×704
public/assets/img/character/ch01/q/zhou_q_*.png
```

- `src/assets/keys.ts` 加 key；`src/assets/bundles.ts` 的 `ch.01` 加 asset；跑 `pnpm assets:scan` + `pnpm assets:check`。
- 地图/角色用 `setLinearTextures`（0.45 非整数缩放，NEAREST 会锯齿）；不要用 `setPixelTexture`。

### 5.2 房间视图

`src/world/ch01-dorm-room-view.ts`：

- 背景 `dorm_q`，`setDisplaySize(cols*tileSize, rows*tileSize)`，depth `LAYERS.background`。
- 郑卿睡床：4 帧 sprite，位置 `(5,5)` 格、`setDisplaySize(9*tileSize, 22*tileSize)`，depth `LAYERS.props + 30`；用 `anims.create` 3fps 循环。
- 不要再摆旧椅子/课程表；Zzz 放到郑卿床头（tile 9,6）。
- 调试层用 `isWalkableTile` 画不可走格。

### 5.3 场景

`src/scenes/ch01-dorm-scene.ts`：

- `ROOM.origin.y` 按 `playTop/playBottom` 居中；房间高 777.6，720 宽一屏放得下，相机仍 `applyCamera`。
- 玩家 `PlayerActor` 传 Q 版八向表、`frameWidth:160, frameHeight:400, spriteScale:0.45, headOffset:170, linearTextures:true`。
- 开局 spawn 放桌边（如 `[24,36]`），不要坐着；`FOOT={width:58,height:20}`。
- 交互点放**可走格**：床 marker 在床边（如 `[14,15]`）、手机/书桌在桌侧、窗在 `[25,2]`、门在 `[25,52]`。`validateRoom` 要求 marker 四邻至少一个可走格。

### 5.4 剧情

改 `src/story/ch01-dorm.ts` 的布局相关文案/节点：

- 旧版有下铺/吊扇/衣柜/书桌椅，新地图是四张单人床 + 中桌 + 窗 + 门；删掉 `fan` 节点和提示词。
- 手机改到「桌上书堆底下」，郑卿睡靠窗单人床；`CH01_INTERACTABLE_NODES` 与 `INTERACTABLE_PROMPTS` 同步。
- 同步 `docs/CH01-ACCEPTANCE.md`、`docs/RESOURCE-SPEC.md`、`docs/ASSET-CREDITS.md`。

## 6. 八方向角色

- 静态八向：sprite 项目转圈视频抽 32 帧，斜向按实际帧校准；或对 `direct` 四斜单独生成。
- 行走八向：MiniMax 每方向 5s；**斜向视频会把 45° 漂成侧面**，重跑也难稳住。
- 已验证的兜底：`downLeft = 水平镜像 downRight`、`upRight = 水平镜像 upLeft`，静态与行走帧一起镜像；四斜严格对称，同一人物。
- 游戏侧八向要一起改：
  - `src/map/types.ts` 的 `Facing` 扩成 8 值；
  - `facingFromVector` 两轴占比都 ≥35% 才判斜向；
  - `src/assets/keys.ts` 的 `CH01_Q_STATIC_SPRITES` / `CH01_Q_WALK_SHEETS` 补 4 斜；
  - `bundles.ts` 补 8 个 Q 资源；`PlayerActor` 的 `Record<Facing,string>` 自然生效；
  - 旧四向 `CH01_STATIC_SPRITES` / `CH01_WALK_SHEETS` 的斜向回退到主轴，避免旧资源报错。

## 7. 验收清单

```bash
pnpm assets:scan
pnpm assets:check
pnpm check            # typecheck + vitest + assets
```

浏览器（`pnpm dev`）：

- `?stage=scene.ch01.dorm&phase=opening&hud=0`：章节卡 → 简介 → 桌边出生 → 郑卿睡左上床。
- `?stage=scene.ch01.dorm&phase=explore&hud=0`：门口出生；8 个方向各按一次，贴图 key 应为 `img.char.ch01.q.walk_{up,up_right,...}`。
- 交互：床/手机/书桌/窗/门都能靠近并触发；床在 `[14,15]` 附近。
- 390×844 与 1200×648 各看一遍；控制台 0 error。
- 截图进 `docs/screenshots/`。

## 8. 已知坑（按出现频率）

| 现象 | 原因 / 处理 |
| --- | --- |
| 整图 render 说「素材不见了」 | API 导入的旋转布局不对；用 `recomposeMapTileset` 修显示（会丢 pass），或走 UI `openUrl` 确认 |
| 地板 stamp 巨大、编辑器卡 | 整图地板被烘焙 4 旋转；编辑器用无缝 plain tile，最终合图用整张地板 |
| 角色头在房间上方露出黑边 | 角色 371px 高，靠近北墙时头会超出 1728 地图；需要前景墙遮挡或限制北侧站位，不能只靠碰撞 |
| 斜向行走变侧脸 | MiniMax 不稳；镜像 `downRight`/`upLeft`，不要继续重跑烧钱 |
| Q 版静态图只有一半高 | 静态 256 格和行走 768 帧的 bbox 比例不同；静态按 371/自身高度单独缩放 |
| 角色显示太大/太小 | 先拿郑卿睡床当标尺：Q 版 128×371 与床上人物同尺寸；家具格子数不回改 |
| 抠像后绿边/阴影 | 生成时要求无阴影；本地 key 时先抠绿、去 despill，再放大看边缘 |
| 地图编辑器 pass 全 0 | `importMapTileset` 必须带 `stamp.pass`；API 导入不写 UI 通行标记时，以 `pass-grid.json` 为准 |

## 9. 最小交付

- `assets-src/map/<chapter>/<room>/`：`map-final.png`、`pass-grid.json`、`map-pass.png`、`map-scale-check.png`、`manifest.json`、各整图素材。
- `docs/DESIGN-<ROOM>-MAP.md`：比例、格子数、通行、动画、接入。
- `docs/ASSET-CREDITS.md`：jobId、模型、后期步骤。
- 游戏侧：keys/bundles、room def、room view、scene、story、tests、截图。

## 10. 维护约定（必须）

**使用本技能的过程中，凡是遇到新问题并解决，都要把该问题和解决办法更新回本技能**（优先追加到 §8「已知坑」，必要时补进流程或验收清单）。不要只修当前任务、不写回技能——下次还会踩同一个坑。更新后请顺手确认命令、路径、版本仍然适用。
