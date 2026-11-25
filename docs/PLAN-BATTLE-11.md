# 战斗战场扩容：七点位 → 十一点位（四三四）改造计划

> 状态：**已确认 A（2026-11-25）；.md 里 §5 的选项只作决策记录**。方案 A（等距六边形四三四）已实现：`src/battle/`、两场战斗、测试与文档均已按 A 改完。
>
> 目标来源（用户 2026-11-25 原话）：
> 「我感觉现在战斗活动场地还是太小了。后面四个角色的话容纳不了太多敌人。增加四个移动点位吧：
> 在第一行和第三行两端各增加一个可移动点位，形成“四三四”阵型。」
>
> 关联：[战斗设计](DESIGN-BATTLE.md)、[舞台预览](STAGE-PREVIEW.md)、[第一章验收](CH01-ACCEPTANCE.md)、[v3 改造计划](PLAN-BATTLE-V3.md)。

## 0. 一句话

把 7 点位（6 环 + 中心）扩成 **11 点位**：第一行/第三行各 4 个、中间行 3 个（四三四），
全部是合法站位（玩家和怪物都能站），容量从 7 个单位提到 11 个；判定改为**按真实网格坐标算角度**，
不再保留 v2 的 45° 环抽象。

## 1. 现状（代码事实）

| 项 | 现状 | 代码 |
| --- | --- | --- |
| 点位 | `center` + 6 个环位，共 7 个 | `src/battle/types.ts` 的 `SlotId` |
| 相邻 | `center` ↔ 6 环；环 ↔ `center` + 左右两环邻（每点 3 个邻点，共 12 条边） | `core/slots.ts` 的 `adjacentSlots()` |
| 逻辑角度 | `POINT_VECTORS` 是 45° 单位圆（右上 45°、左上 135°…），**与视觉位置不一致** | `core/slots.ts` |
| 视觉位置 | `planBattleLayout`：正六边形，环半径 = 相邻边 = radius（1280 高时 219） | `battle/layout.ts` |
| 判定 | 正面 ≤45°、背面 ≥135°；`single-front` 取 ±45° 内的相邻点（通常 3 个） | `zoneOfPoint()`、`hitPointsFor()` |
| 容量 | 最多 7 个单位（`placeUnits` 报错文案写死 7） | `core/placement.ts` |

## 2. 目标形态

### 2.1 四三四网格

```text
      upperFarLeft ─ upperLeft ────── upperRight ─ upperFarRight
            \          /   \            /   \          /
             \        /     \          /     \        /
              left ───────── center ───────── right
             /        \     /          \     /        \
            /          \   /            \   /          \
      lowerFarLeft ─ lowerLeft ────── lowerRight ─ lowerFarRight
```

- 新增 4 个点位：`upperFarLeft`（左上端）、`upperFarRight`（右上端）、`lowerFarLeft`（左下端）、`lowerFarRight`（右下端）。
- 11 个点位语义完全一致：占据互斥（一点一人），玩家/怪物都能站、都能走。
- 坐标（以相邻间距 `s` 为单位，y 向上；屏幕 y = 中心 y − 该值 × s）：

| 点位 | x | y | 中文 | 邻点数 |
| --- | --- | --- | --- | --- |
| `upperFarLeft` | −1.5 | +0.866 | 左上端 | 2（`upperLeft`、`left`） |
| `upperLeft` | −0.5 | +0.866 | 左上 | 4 |
| `upperRight` | +0.5 | +0.866 | 右上 | 4 |
| `upperFarRight` | +1.5 | +0.866 | 右上端 | 2（`upperRight`、`right`） |
| `left` | −1 | 0 | 左 | 5 |
| `center` | 0 | 0 | 中 | 6（与现在相同） |
| `right` | +1 | 0 | 右 | 5 |
| `lowerFarLeft` | −1.5 | −0.866 | 左下端 | 2 |
| `lowerLeft` | −0.5 | −0.866 | 左下 | 4 |
| `lowerRight` | +0.5 | −0.866 | 右下 | 4 |
| `lowerFarRight` | +1.5 | −0.866 | 右下端 | 2 |

- 相邻 = 网格距离恰好 1（20 条边）。四角是**死胡同**（只能进出 2 个点），中排两侧各 5 个邻点，中心仍是 6 个。
- 现有 7 个点位的相对位置不变（`center` 原点、`left/right` 水平、上下两排各缩进半格），只是整体按 `s` 缩放。

### 2.2 布局尺寸

`s` 由两个约束取小：

1. **横向（主约束）**：最外侧点位在 `360 − 1.5s`。最宽角色是矿工 `down`（正文宽 260px × 0.7 = 182，半宽 91），
   留 11px 边距 → `1.5s ≤ 258` → **s = 172**（外角 x = 102 / 618，水平跨度 516）。
2. **纵向**：上排脚底 `centerY − 0.866s`，头顶要留 8px 给行动表（敌人 200 高）→ `0.866s ≤ centerY − fieldTop − 208`。

| 设计高 | s | 三排 y | 上排头顶 | 下排脚底 | 场地范围 |
| --- | --- | --- | --- | --- | --- |
| 1558（390×844 手机） | 172 | 606 / 755 / 904 | 406 | 904 | 516 × 298 |
| 1280 | 172 | 451 / 600 / 749 | 251 | 749 | 516 × 298 |
| 1100（短屏） | 114 | 400 / 499 / 598 | 200 | 598 | 342 × 198 |

对比现状：1280 高时是 438 × 380。**变宽 78px、变矮 82px**（行距 190 → 149）。

### 2.3 判定变化（改按真实坐标）

`POINT_VECTORS` 换成 `SLOT_COORDS`（上表），`angleFromTo()` 直接用真实坐标，于是：

| 规则 | 现在 | 改后 | 理由 |
| --- | --- | --- | --- |
| 正面 / 侧面 / 背面 | ≤45° / <135° / ≥135° | **≤60° / <120° / ≥120°** | 网格邻点方向恰好相差 60°，「一步之内=正面、两步以上=背面」 |
| `single-front`（矿工突进） | ±45° 内相邻点（中心出手时 3 个） | **±30°（就是瞄准的那一个点）** | 邻点间隔 60°，±30° 只落一个；1 人队伍行为不变 |
| `front-arc`（横扫） | ±135° 内相邻点（中心出手命中 4/6） | **<120°（中心出手命中 3/6）** | 与「正面+侧面」扇区一致，背后打不到 |
| `all-slots` | 7 点 | **11 点** | 全站位 |

- 不变的一条：**中心怪朝左时，左上/左/左下都在它正面**（120°/180°/240° 对新阈值 60/120 仍然成立）。
- 会变的一条：站在**角落点**时邻点少（2 个），背袭/正面扇区天然变窄——这是四角是死胡同的直接后果，属于设计代价。
- 随机点位/追击/闪避/落点选择全部走 `adjacentSlots()`、`pointDistance()`、`shortestStepToward()`，**这些函数不用改逻辑**，改数据即可。

## 3. 影响面

| 文件 | 改动 |
| --- | --- |
| `src/battle/types.ts` | `SlotId` 加 4 个；注释改成十一点位/四三四 |
| `src/battle/core/slots.ts` | `SLOT_COORDS`（真实网格）替代 `POINT_VECTORS`/`RING_ANGLES`；`SLOT_ORDER` 改空间序；`ADJACENT` 由坐标距离 1 生成（20 条边）；`zoneOfPoint` 60/120；`hitPointsFor` 30/120；`mirrorSlot` 改成坐标镜像；标签加「左上端/右上端/左下端/右下端」 |
| `src/battle/layout.ts` | 按网格出 11 点：`maxSpacing=172`、`minSpacing=96`，`dx = s/2`、`dy = s×√3/2`；`centerPoint`/`fieldTop`/`railHeight` 不变 |
| `src/battle/core/placement.ts` | 容量 7 → 11、报错文案；`RING_ORDER` 换成队伍补位顺序（`left` 仍是第一顺位） |
| `src/battle/core/ai.ts` | 只改注释里的「7 点图」（逻辑走通用图搜索） |
| `src/scenes/battle-ch01-scene.ts` | 点位点击区宽高按 `spacing` 收（`min(104, spacing×0.9)`），其余通用代码不用动 |
| `test/battle-*.test.ts` | `battle-slots`（11 点/20 边/度数/镜像/命中表）、`battle-layout`（等距=间距/安全区/对称）、`battle-ai`（命中集合）、`battle-flow`/`battle-dodge`/`battle-pending`/`battle-preview`/`battle-multi`/`battle-balance` 的预期点位 |
| `docs/DESIGN-BATTLE.md` | 标题 v3.3、§1.1 图+坐标表+邻接、§1.2 理由、命中表、变更记录 |
| `AGENTS.md` | §0 战斗版本描述、§4 验证、§5「七点位…」四条坑改成四三四 |
| `docs/STAGE-PREVIEW.md` / `CH01-ACCEPTANCE.md` / `PLAYTEST-CH01-KITCHEN.md` | 七点位 → 十一点位（四三四） |

不改：美术/资源（`miner_hall`/`kitchen_hall` 是 720×1280 的 cover 图，横向 102–618 完全覆盖）、HUD 行动表、技能数值、两场战斗的初始点位（`left`/`center`/`upperRight` 都还在）。

## 4. 验收

1. `pnpm check`（typecheck + vitest + assets:check）全绿；新增护栏：11 个点位唯一、20 条边、每条边视觉距离相同、每点 BFS 可达、镜像对合、放置 11 个单位不报错。
2. `?stage=battle.ch01.kitchen&phase=mid`：能打赢、背袭 +50% 生效、非背袭进落点选择、闪避位移、只杀一只不结束。
3. `?stage=battle.ch01.first`：仍必败（第 4 次怪物行动清除协议）、教程四段对话节拍正常（含首次移动/防御），玩家跑到远角不会卡住流程。
4. `?stage=battle.sandbox.multi`：随机点位不重叠、追击绕行、`__avmBattle()` 能读出 11 点位占位。
5. 截图 390×844（两场 + 沙盒放 5 个敌人看拥挤度）、360/394/430/788 宽量一次布局（canvas 填满/无黑边），console 0 error；截图落 `.evidence/docs/screenshots/battle-11-slots/`。
6. 真机观感：三排间距是否显挤、角落点位是否看清、头像行动表与点位是否打架——按实机图再微调 `maxSpacing` 或 `centerY` 比例。

## 5. 需要拍板

见对话里的选项（A 等距六边形 / B 行距保持 190）。两者都是 11 点位，只差「行距」与「判定阈值」：

| | A 等距六边形（推荐） | B 行距保持 190 |
| --- | --- | --- |
| 场地 | 516 × 298 | 516 × 380（与现在同高） |
| 相邻边 | 全部 172，视觉等距 | 横 172 / 斜 209（差 21%） |
| 判定阈值 | 60 / 120（网格天然 60°） | 68 / 122（按斜向邻点校准） |
| 观感 | 三排更紧凑，跨排遮挡多一点 | 纵向和现在一样松 |

## 6. 实测记录（2026-11-25，实现后）

- `pnpm check`：79 个测试文件 / 795 个用例全绿，`assets:check` 271 key / 271 url；`typecheck` 0 error。
- 布局实测（720 宽）：390×844 → `spacing 172`，三排 y 606/755/904，两侧 x 102..618；1200×648（短屏，设计高 640）→ `spacing 114`，三排 y 400/499/598；360×640 → 同上，canvas 填满。
- 取证脚本 `.evidence/scripts/capture-battle-11slots-2026-11-25.mjs`：两场战斗（opening/mid）+ 沙盒 + 短屏共 6 个画面，逐项断言「11 点位 / 20 条等距边（容差 1.5px）/ 左右对称 / 点在 fieldTop..fieldBottom 内 / 点击区 11 个 / canvas 填满（手机）/ console 0 error」，全部通过；截图在 `.evidence/docs/screenshots/battle-11-slots/`（gitignored）。
- 实机流程（Playwright，390×844，真点击）：
  - 御膳房：技能窗 → 选解离突刺 → 黄圈可选 / 绿圈选中 / 头顶名字血条 → 确认攻击（正面 −13）→ 落点选择 4 个黄圈 → 打赢（HP 34/90，两个怪都清掉）→ 胜利卡「重开/返回标题」正常。
  - 金殿：开场卡 → 教程对话 → 机器人先攻 → 首次攻击（拳 0 伤害、对话后按钮锁死）→ 首次移动（左上端点位可走，敌人追打）→ 首次防御 → 第 4 次怪物行动清除协议战败（HP 0，`enemyActions=4`）。
  - 沙盒三怪：敌人从 `lowerFarLeft` 连续两动追到 `lowerRight`（贴脸），另一只守 `lowerFarRight`；11 点图上的追击/堵路正常。
  - 整段 console 0 error。
- 拥挤度：390×844 实机图里 3～4 人很松；11 人满编的极限画面用真实贴图 + 真实缩放合成了 `.evidence/docs/screenshots/battle-11-slots/00-full-11-units.png`（5 矿工 + 5 厨 + 周全），矿工（182px 宽）在 172 间距下会互相压一点，属预期上限。

## 7. 拍板结果（2026-11-25 下午）

- **拥挤度不处理**：用户原话「一般也不会占满，没啥问题」——11 人满编只是上限，不改行距、不缩角色。
- **点位点击区改成圆形**（用户：「点击点位改成圆形命中区没问题」）：新增 `slotHitCircle(spacing)` → `{radius: min(65, floor(spacing×0.46)), offsetY: radius}`，圆心在脚底正上方、圆底贴脚底，直径恒 ≤ 间距（手机 172→r65、短屏 114→r52），相邻点位点击区不再重叠；场景改用 `Phaser.Geom.Circle` 命中区。旧矩形 104×124 的底部会盖到脚底下方 16px，短屏跨排有小片重叠，这次一并消掉。
- 实机验证（390×844，真点击）：`lowerRight` 圆心点得进（`right → lowerRight`）；`lowerFarRight` 脚底下方 11px（旧矩形内、新圆外）点了不生效，圆内偏下 44px 生效（`lowerFarRight`）。点位被敌人占时点击优先落到敌人 sprite（移动模式下无响应，落点本来就非法）。
