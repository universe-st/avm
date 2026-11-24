# 战斗系统设计（v3.2 · 七点位 / 无转向行动 / 多怪 / 技能窗 / 小白图鉴）

> 状态：**v3.1 已实现并接入第一章两场战斗**。金殿剧情战仍为 1 怪必败；御膳房为双怪。
> v3.1 战场不画意图/常驻名牌/点位圈/朝向/目标白圈（**当前选中敌人脚下的闪烁绿圈、头顶名字/血条例外**），属性只在小白图鉴；攻击先弹技能窗；防御平减；非背袭命中进入落点选择。
> 多人队伍（多个可操控角色）只做了数据结构预留，队伍 UI/换人仍后置。
>
> 本文是战斗规则的**唯一真值**，代码真值在 `src/battle/`；场景只消费事件，不自己算伤害/顺序/命中。
>
> 关联：[第一章探索](DESIGN-CH01-EXPLORE.md)、[剧情圣经](STORY-BIBLE.md)、[美术风格](ART-STYLE.md)、[舞台预览](STAGE-PREVIEW.md)、[资源规范](RESOURCE-SPEC.md)、[素材版权](ASSET-CREDITS.md)。

## 0. 核心决策速览

- **7 个点位**：6 个环位 + `center`；一个点位同时只站一个单位。中心空出后玩家/怪物都能进。
- **跑条决定先后**：双方有 SPD，行动条 0–1000；行动后归零。**引擎保留，但顶部不再画 SPD 量条/意图行**，只画头像行动表（rail 64）。
- **怪物没有单独的转身行动**：一次行动只有「技能」或「移动」。
  - 技能可自由瞄准；执行时免费转身面向瞄准点。
  - 受击后免费转身面向**攻击来向**（不是落点）。
  - 移动后免费面朝移动方向。
- **攻击射程 = 相邻点位**：玩家解离突刺是单一目标，目标相邻才命中；怪物技能用 `hitPointsFor` 算命中集合。
- **背袭**：相对目标朝向 `≥135°`；解离突刺背袭 **×1.5**，并**无视目标一半防御**（`backstabDefensePierce=0.5`）。
- **防御是平减法**：`max(1, round(atk×power×背袭 − 防御×(背袭?1−穿防:1)))`，防御动作最后 ×0.5。
- **落点选择**：解离突刺非背袭命中进入 `pendingMove`，可选目标相邻空闲点或留在原地；**不再自动镜像闪现**。
- **多怪**：`party[]` / `enemies[]` 按 N 单位设计；御膳房 2 怪，先选技能、再点敌人 sprite 选目标；所有怪 HP 0 才胜利。
- **小白图鉴**：攻击命中一次解锁该敌；图鉴是所有数值的唯一展示处，预览不写盘。
- 手机竖屏：不做命中率/暴击/实时 ATB；闪避是唯一概率项（见 §5.4）；其他伤害与顺序确定，可回放、可单测。

### 0.1 v3.1 变更摘要（2026-11-22）

- 删除场上所有常显地面圈/文字：意图行、常驻怪物名字/HP/血条、点位方位文字、背袭楔形、朝向三角、AOE 红圈/文字、目标白圈、静态点位列/中心红环/敌人脚下红环。**地面圈只在普通移动/落点选择时出现；选目标阶段另有可选黄圈（闪烁）/已选绿圈/非法红圈（闪 3 次）；选中目标头顶显示名字/血条，其余不画。**
- `railHeight=64`、`fieldTop=192`，只有「行动表」标题 + 头像 chip + 清除协议倒计时。
- 攻击先弹技能窗（一个技能也弹）；未知怪不显示预计伤害，已知怪才显示。
- `SkillDef` 删除 `teleport`，新增 `postHitMove:'near-target'`、`backstabDefensePierce`；`BattleUnitSetup/Unit` 增加 `defense`；`BattleState` 增加 `pendingMove`；`BattleAction` 增加 `post-move`。
- 新增 `src/battle/codex.ts`（localStorage `avm.battle.codex.v1`）与 HUD「小白」按钮/图鉴弹窗。

## 1. 战场结构

### 1.1 七点位

```text
          upperLeft ────── upperRight
            /  \              /  \
           /    \            /    \
        left ─────── center ─────── right
           \    /            \    /
            \  /              \  /
          lowerLeft ────── lowerRight
```

| 点位 | 规范角度（屏幕坐标，0°=右、90°=上） | 说明 |
| --- | --- | --- |
| `right` 右 | 0° | 环位 |
| `upperRight` 右上 | 45°（逻辑）/ 60°（视觉） | 环位 |
| `upperLeft` 左上 | 135°（逻辑）/ 120°（视觉） | 环位 |
| `left` 左 | 180° | 环位，玩家默认 |
| `lowerLeft` 左下 | 225°（逻辑）/ 240°（视觉） | 环位 |
| `lowerRight` 右下 | 315°（逻辑）/ 300°（视觉） | 环位 |
| `center` 中 | — | 原点；等于 v2 怪物站的红圈 |

- 布局唯一真值：`src/battle/layout.ts` 的 `planBattleLayout(720, designH)`。
- 相邻关系：`center` ↔ 6 环位全部相邻；每个环位 ↔ `center` + 左右两个环邻（3 个邻点）。
- 占据互斥：一个点位最多一个单位。中心被占时不能进；怪物离开后玩家可以一步走进去。
- `layout.slots.center` = `layout.centerPoint` = 原 v2 `layout.monster` 的脚底坐标。
- 顶部预留 = 页眉 118 + 行动表 64 + 间距 10 = `fieldTop 192`；底部指令面板 360。
- 角色脚底锚点 `origin(0.5, 0.985)`；玩家屏显高约 170，矿工约 260（八向图 371 高），御厨约 200。

### 1.2 为什么是 7 点位

v2 的 6 环位能让「左/左上/左下都在它背后」，但中心只属于怪物，怪物也没有离开中心的理由。v3 让中心成为第 7 个合法点位：
怪物可以走到环位，中心空出来后玩家可以占；玩家占中心时，怪物从环位打中心是「向内」、玩家打它是「背袭」——站位第一次同时影响双方的攻防。

### 1.3 初始点位

- 玩家默认 `left`；怪物点位由剧情写死，或未写时用 seed 从空点位随机（不重叠、可复现）。
- 怪物初始朝向 = 从它自己的点位指向第一个玩家角色；所以金殿/御膳房中心怪默认面向左。
- 8 向美术只在朝向/移动/演出用；中心怪也可朝上/下，不再只限 6 个环位方向。

## 2. 跑条与行动表

- 常量：`GAUGE_MAX = 1000`；每个单位每「tick」累积 `spd` 点。
- 推进入口：`planNextActor(state)` 取所有存活单位到顶所需的最小 tick，统一推进；先到者行动。
- 同 tick 到顶：SPD 高者优先 → 敌方优先 → id 字典序（稳定、可复现）。
- 行动（攻击/移动/防御/怪物技能/怪物移动）结束把行动者 gauge 归零。
- 防御持续到该单位**下一次行动开始**；期间受伤 ×0.5。
- `previewOrder(state, n)` 给 HUD 的行动表；纯模拟，不改 state。
- **不是严格交替**：14 / 12 / 10 三只单位会出现「你→御厨→帮厨→你」的节奏。

| 单位 | SPD | 说明 |
| --- | --- | --- |
| 周全（两场相同） | 14 | 基准；金殿先手在矿工之后 |
| 矿工·清除单元 | 20 | 明显快于周全；第一场先手 |
| 御厨·幻影（甲） | 12 | 中心站桩；略慢于周全 |
| 帮厨·幻影（乙） | 10 | 右上追击；最慢 |

### 2.1 顶部只画行动表（不画量条）

- **删除**：标题「行动条」、两条 300×10 SPD 连续量条、顶部 `SPD 14 / 20` 文案、`drawGauges()`、每只怪一行意图。
- **保留**：标题「行动表」、头像 chip（直径 44、中心距 52、当前行动者 2px 白描边）、清除协议倒计时小字。
- `railHeight` 恒 **64**（`fieldTop=192`）；`battle-hud.ts` 的 Spacer 从 layout 传入。
- 顺序刷新走 `railTransition(prev, next)`：最左滑出渐隐 → 其余整体左移一格 → 末位从右侧 +1 格渐现，190ms；同组不重播；reduced-motion 直接落终态。
- 双御厨同头像时，chip 右下角加 1/2 编号区分（场上不再有名牌/HP）。
- 跑条值只留在 `__avmBattle()` 调试快照里，不上屏。

## 3. 朝向、区域、背袭与命中集合

### 3.1 两点方向

- `facingFromPoints(from, to)`：两点方向 → 最近 8 向。
- 角度差必须先 `normalizeDegrees(angle(to) - angle(from))`；不能分别归一化后相减（180→-180 会漏掉左上/左下）。
- 环位之间出现 67.5°/112.5° 这种正好夹在两向中间的方向（左→左上、右上→右等）；平局取 `|cos|` 更大的一向（环的切线/斜向）。

### 3.2 区域

`zoneOfPoint(attacker, target, targetFacing)`，`rel = normalize(angle(target→attacker) - targetFacing)`：

| 区域 | 判定 | 效果 |
| --- | --- | --- |
| 正面 front | `|rel| ≤ 45°` | 无加成 |
| 侧面 side | `45° < |rel| < 135°` | 无背袭；可躲开只打正面的技能 |
| 背面 back | `|rel| ≥ 135°` | 背袭；解离突刺 ×1.5、无视一半防御，且不位移 |

- 背袭只影响伤害，不做暴击/命中率。
- 怪物在中心、玩家默认在左时，第一刀是正面；想背袭要绕到右侧。
- 受击后怪物免费转向攻击来向，所以同一位置连续砍第二刀通常变正面；想连续背袭要绕位。非背袭命中进入落点选择，背袭留在原地。

### 3.3 命中集合

```ts
hitPointsFor(origin, aim, hit): SlotId[]
```

- 先取 `origin` 的相邻点，再按 `aim` 方向过滤：
  - `single-front`：角差 ≤45°
  - `front-arc`：角差 <135°（正好 135° 按背面排除）
  - `all-slots`：全部 7 点
- 参考真值：

| origin | aim | single-front | front-arc |
| --- | --- | --- | --- |
| center | left | left / upperLeft / lowerLeft | 同左 |
| center | upperRight | right / upperRight | right / upperRight / upperLeft / lowerRight |
| center | right | right / upperRight / lowerRight | 同左 |
| left | center | center | center / upperLeft / lowerLeft |
| left | upperLeft | upperLeft | center / upperLeft |
| upperRight | center | center / upperLeft | center / upperLeft / right |

- **玩家解离突刺是单一目标**：目标相邻就命中，不走 `hitPointsFor` 的锥形集合。`hitPointsFor` 只服务怪物技能/意图。
- 意图不上屏；**怪物行动开始时按当前站位重新选目标**，不再锁死旧 aim。目标相邻才出技能，AOE 才远打；没有可命中目标/没有可走一步就等待，不空放。
- AOE 只能靠防御减半，走位躲不掉；v3.1 不再画 AOE 红圈/文字。

## 4. 玩家操作

| 操作 | 规则 | 消耗 |
| --- | --- | --- |
| **攻击（解离突刺）** | 点攻击先弹技能窗；单一目标，目标必须相邻；`max(1, round(atk×power×背袭 − 防御×(背袭?1−穿防:1)))`；非背袭命中进入 `pendingMove`，可选目标相邻空闲点或留在原地；背袭不进入、无视一半防御 | 1 行动 |
| **移动** | 移动到相邻空点位（中心也算）；不能停在原格 | 1 行动 |
| **防御** | 到下一次行动前受伤 ×0.5；护盾环 + 格挡姿态 | 1 行动 |

- 目标选择：点「攻击」先弹出技能窗，**技能选好后再点敌人身体选中**（未选中不画名字/HP/目标白圈；**选目标阶段所有可选相邻敌人脚下黄圈闪烁；选中目标变绿圈，并在头顶显示名字/血条；非法目标红圈闪 3 次**）；目标不再自动预选，选目标阶段顶部红字「请选择攻击目标」（与落点红字同款同位置），移动键变「取消」可退出；**选中有效目标后攻击键变成暗底红字「确认攻击」，带红色发光脉冲（reduced 下静态）**，再点它发动；点距离不够的非法目标时，脚下红圈闪 3 次 + 顶部红字闪「距离不够」，随后红圈消失、仍不选中。攻击按钮基础只显示「攻击」；目标名/预计伤害只在下方提示里。
- 未知怪提示不显示预计伤害，已知怪（图鉴解锁）才显示；命中后伤害数字照常显示。
- **没有「解」时攻击按钮禁用**（第一场）：按钮文字仍是「攻击」，不弹技能窗，点击给「你还没有「解」——这一场只能移动或防御」。
- 非背袭命中后 `activeId` 仍是玩家、gauge 先不归零；攻击/防御/换目标禁用，移动键变「留在原地」；选 `pendingMove.slots` 或当前点后发 `post-move`，才归零并进入下一动。
- 移动只允许相邻：`adjacentSlots()` 是唯一判定；中心空出后才能进。除选目标阶段黄/绿/红圈外，普通移动/落点选择之外不画地面圈。

## 5. 怪物技能、AI 与意图

### 5.1 怪物的行动

| 行动 | 规则 | 消耗 |
| --- | --- | --- |
| **技能** | 自由选择瞄准点；执行时先免费转身面向瞄准方向，再出招；命中集合由 `origin + aim + hit` 算出 | 1 行动 |
| **移动** | 移动到相邻空点位；移动后面朝移动方向；目标点被占则移动失败（空耗行动） | 1 行动 |

- 不再有 `intent.kind='turn'`，也没有 `enemy-turn` 行动事件/380ms 大转向。
- 受击后免费转身面向攻击来向（`from`），伤害结算之后；被打死则不转。
- 进攻转身免费：执行时朝当前目标转身；不预先锁死旧瞄准点。
- 清除协议计数按**所有怪物行动数**（技能/移动都算），不是玩家回合数。

### 5.2 技能表

| 怪物 | 技能 | 命中 | 伤害（atk） | 冷却 |
| --- | --- | --- | --- | --- |
| 矿工·清除单元（atk 16） | 铁臂横扫 `miner.sweep` | 瞄准方向 ±135° 的相邻点 | 10 | 0 |
| | 钻头突进 `miner.thrust` | 瞄准方向 ±45° 的相邻点 | 18 | 2 次行动 |
| | 核心脉冲 `miner.quake` | 全部 7 点 | 6 | 3 次行动 |
| 御厨·幻影（atk 10） | 菜刀横扫 `cook.sweep` | 瞄准方向 ±135° 的相邻点 | 8 | 0 |
| | 热油泼洒 `cook.oil` | 瞄准方向 ±45° 的相邻点 | 11 | 2 |
| 帮厨·幻影（atk 7） | 菜刀横扫 `cook.sweep` | 同上 | 5 | 0 |
| | 热油泼洒 `cook.oil` | 同上 | 8 | 2 |

- 命中集合由 `hitPointsFor(origin, aim, hit)` 给出（内部）；场景不提前把受击点染红。
- 目标不在命中集合内 → 打空（仅防御/异常兜底会看到；AI 不会主动空放）。
- **全站位技能**（核心脉冲/灶台震地）是内部判定，命中全部 7 点、不靠朝向/距离；v3.1 不写「全站位」/红环/意图文案，只保留砸地/冲击波/伤害数字等技能动画。纯逻辑仍用 `SkillHit:'all-slots'`、`EnemyIntent.aoe=true`。
- 冷却在怪物回合开始时 −1；使用后写回技能表的 `cooldown`。

### 5.3 敌人行动（执行时重选）

- 每只怪物在自己行动**开始时**按当前站位/目标重选技能或移动；`state.intents` 仅作计划/调试，不锁死。
- 意图两种：
  - `skill`：`skillId / origin / aim / facing / targetId / targetSlot / hitSlots / hitsPlayer / aoe / text`
  - `move`：`from / to / facing / targetId / text`
- 意图不上屏；玩家通过走位、堵落点、防御、闪避来应对。
- 受击后免费转向攻击来向；下一次行动开始时再按新站位重选目标。

### 5.4 追击 AI（确定性）

1. 目标 = 最近的玩家角色（7 点图 BFS 步数）；平局取 HP 低者 → id 字典序。
2. 目标相邻：`single-front` → `front-arc` → `all-slots` 选冷却好的技能；都有冷却用第一个 0 冷却技能。
3. 目标不相邻：
   - `all-slots` 冷却好 → 直接 AOE；
   - `chaser` 用 BFS 走一步缩短距离（避开占位）；无路可走 → **等待**（不空放）。
4. `behavior:'stationary'` 永不移动（第一场教程战）；默认 `chaser`。

`planEnemyIntent(s)` 是纯函数；同 state 同计划，可单测。执行时还会按当前站位再计划一次，避免玩家移动后打旧点。

### 5.5 闪避（2026-11-24）

- `BattleUnit.dodge` 是整数，闪避率 `1 - 200/(3x+200)`：0→0%，100→60%，越大越接近 100%，永不达到。
- 触发：防御方有相邻空位 + 掷骰成功 → 移动到相邻空位并**完全免伤**；没有相邻空位时**不掷骰**，直接命中。
- 范围攻击也可闪：只要目标有相邻空位且判定成功，就移动并无视这次 AoE 伤害。
- 目标空位选择：按 7 点图距离远离攻击者，平局按 `SlotId` 字典序；纯函数、seed 确定性。
- 当前数值：玩家周全 1（约 1.5%），御厨·幻影 2（约 2.9%），帮厨/矿工/杂役 0；图鉴显示怪物闪避点，HUD 玩家行显示「闪避 1」。
- 事件：`dodge`（actor/attacker/skill/from/to/aoe），场景播闪避浮字 + 残影 + 位移；`attack`/`enemy-skill` 带 `dodged:true`、`amount:0`。

### 5.6 受击血条

- 选中目标：`targetHpFill` Rectangle 从旧 HP 宽度 tween 到新 HP（360ms），名字/背景条不变；死亡时 tween 到 0，随后随选择清除隐藏。
- 玩家受击：临时 `playerHpBar/playerHpFill` 出现在头顶，从旧值 tween 到新值，950ms 后隐藏；未受击/闪避不显示。
- 伤害数字、闪避浮字、目标绿圈/名字/血条同一套 `BattleEvent` 队列；reduced-motion 直接落终值。

## 6. 多怪

- 核心：`state.party[]` + `state.enemies[]`；行动表、跑条、意图、HP 全部按单位 id 处理；按 `activeId` 找当前行动者。
- 站位互斥：一个点位最多一个单位；玩家/怪物都不能移到被占点；怪物移动失败也消耗行动。
- 目标选择：先选技能，再点敌人 sprite 选中（不自动预选）；选目标阶段可选相邻敌人脚下黄圈闪烁，选中有效目标变红色发光「确认攻击」，点它发动，移动键「取消」退出；选中目标脚下有闪烁绿圈、头顶显示名字/血条；点距离不够的非法目标会红圈闪 3 次 + 顶部闪「距离不够」，随后消失、不选中；只杀一只不结束，所有怪 HP 0 才胜利。未选中不画目标白圈/名字/HP。
- 御膳房双怪：
  - 御厨·幻影：`center`、stationary、HP 40 / ATK 10 / DEF 3 / SPD 12、sweep + oil。
  - 帮厨·幻影：`upperRight`、chaser、HP 24 / ATK 7 / DEF 2 / SPD 10、sweep + oil。
  - 都复用厨子八向/头像/技能帧；只有行动表 chip 用 1/2 编号区分。
- 多怪沙盒：`battle.sandbox.multi`，厨房舞台、3 只厨系幻影、随机点位，用来验收随机/追击/堵路/目标切换/落点选择。
- 图鉴：`src/battle/codex.ts` 跨战斗/会话记录被攻击过的敌人；命中一次解锁，属性只在图鉴展示。
- 未来多玩家：数据结构 N-ready；本轮只实现 1 个玩家角色，不做队伍 UI/换人。

## 7. 两场战斗

### 7.1 金殿·矿工（`battle.ch01.first`）

| 项 | 值 |
| --- | --- |
| 周全 | HP 90 / ATK 16 / SPD 14；**无技能** |
| 矿工 | HP 120 / ATK 16 / SPD 20 / DEF 4 / center / stationary |
| 结束 | 第 4 次怪物行动后「清除协议」999 → 战败；HP 0 也战败 |
| 存档 | 战败写 `dorm.after` |
| 时长 | 约 15–20 秒 |

设计意图：不能赢。玩家只学会「移动、防御」和「它比你快」。怪物没有转向行动，所以每一动都在攻击；清除协议按行动数收尾。v3.1 不显示意图，玩家靠移动/防御试错。

### 7.2 御膳房·双幻影（`battle.ch01.kitchen`）

| 项 | 值 |
| --- | --- |
| 周全 | HP 90 / ATK 16 / SPD 14；**解离突刺**已解锁 |
| 御厨·幻影 | HP 40 / ATK 10 / DEF 3 / SPD 12 / center / stationary |
| 帮厨·幻影 | HP 24 / ATK 7 / DEF 2 / SPD 10 / upperRight / chaser |
| 结束 | 两只都 HP 0 → 胜利，回御膳房并标记巡逻清除；玩家 HP 0 → 战败回检查点 |
| 存档 | **不写** `dorm.after` |
| 目标 | 4–6 次玩家行动，胜利 HP ≥20（`test/battle-balance.test.ts`） |

伤害路径：正面 13（16−3）→ 进入落点选择、落到右侧（背后）→ 背袭 23（24−1.5）；两只合计约 64 血，实际 4–6 刀。帮厨第一动通常在右上往左上追击；v3.1 不显示意图，玩家靠站位/防御。

## 8. 表现与音效

- 御膳房战斗舞台 `kitchen_hall.webp` 是**纯地面**：从厨房地图裁地面、镜像纵向铺满、加聚光/暗角，不再有门洞/墙砖/架上墙；角色不会站在墙上。

| 事件 | 表现 | 音效 |
| --- | --- | --- |
| 待机 | 呼吸 scaleY 1.0↔1.015（不位移） | — |
| 玩家移动 | 弧线冲刺 + 2 个残影 + 落地环 + 尘（只走相邻一格） | `battle_blink`（低音量） |
| 玩家攻击 | 12 帧 × 55ms + 命中冻结 60ms + 斩击弧 + 金字伤害 | `battle_slash` → `battle_hit` / `battle_backstab` |
| 落点选择 | 攻击后画当前点 + 目标相邻空闲点；选点后 340ms 弧线移动；留在原地不发 move | `battle_blink` |
| 防御 | 格挡姿态 + 护盾弧 + 冷白粒子 | `battle_guard` |
| 怪物出招 | 快速转身（8 向贴图，160ms）→ 技能 strip；flip 由 `aim` 左右决定 | 对应技能音 |
| 怪物受击转身 | 命中/伤害数字之后 160ms 转身；死亡不转 | `battle_turn`（低音量） |
| 怪物移动 | 260ms 弧线/踏步 + 落地尘 + 朝向切到移动方向；被堵则原地撞一下 + 「被挡住」 | `battle_blink`（低音量） |
| 横扫/突进/震地 | 前冲/挥击/震地环 + 受击点火花 | `battle_sweep` / `battle_quake` |
| 清除协议 | 压暗 + 红协议环 + 大字 + 震屏 | `battle_protocol` |
| 胜利/战败 | 怪物碎裂 / 玩家倒地 → 结算卡 | `battle_victory` / 命中音 |

- `prefers-reduced-motion`：去掉位移/震屏/白闪/残影，动画缩短；伤害数字/结果完整保留。
- BGM：第一章战斗共用《刺王杀驾》（`audio.bgm.ch01_battle`）。
- 音效在 `battle.common`（打击/闪现）与 `battle.ch01`（矿工技能/协议/胜利）分组；御膳房复用共享打击音 + 厨子八向。
- **常驻无名牌/HP/方位文字/背袭楔形/朝向三角/目标白圈/静态点位环**；地面圈只在普通移动/落点选择时出现，选目标阶段另有可选黄圈/选中绿圈/非法红圈；**选中目标头顶名字/血条是唯一例外**。属性只在「小白」图鉴。
- 双御厨同头像：只有行动表 chip 加 1/2 徽标。
- 技能窗：`src/ui/battle-ch01-modals.ts` 的 `openBattleSkill`；图鉴窗：`openBattleCodex`；HUD「小白」按钮用 `img.char.battle.head_xiaobai`（96×96 复用图）。

## 9. 代码结构与数据契约

```
src/battle/
  types.ts                # SlotId(7 点)/Facing8/Zone/SkillDef/BattleSetup[party,enemies]/PendingMove
  layout.ts               # 7 点位 + centerPoint + BATTLE_RAIL_HEIGHT=64
  codex.ts                # 小白图鉴：localStorage avm.battle.codex.v1，纯逻辑
  core/
    slots.ts              # 角度/区域/背袭/相邻/命中集合/镜像/BFS 一步
    gauge.ts              # 跑条推进、并列裁决、N actor 顺序预览
    rail-transition.ts    # 行动表 chip 的 prev→next 位移（纯逻辑）
    damage.ts             # 伤害公式（平减防御 / 背袭穿防 / 防御动作）
    placement.ts          # 初始点位：剧情指定 / seed 随机不重叠
    ai.ts                 # 每怪意图：无 turn、追击、AOE、移动（内部，不上屏）
    battle.ts             # createBattle / startNextTurn / applyBattleAction / pendingMove/post-move / 预览
    frame-sequence.ts     # 帧时钟（纯函数）
    preview.ts            # 舞台预览：opening/mid/victory/defeat（驱动器处理 pending）
  data/
    skills.ts             # 技能表（postHitMove / backstabDefensePierce）
    ch01-first.ts         # 金殿剧情战（1 怪 stationary）
    ch01-kitchen.ts       # 御膳房（2 怪）
    sandbox-multi.ts      # DEV 多怪沙盒（3 怪随机点位）
src/scenes/battle-ch01-scene.ts   # 只消费事件：动画队列 / 目标点击区 / 落点选择 / HUD 同步
src/actors/battle-actor.ts        # 贴图/朝向/帧序列/受击/倒地
src/ui/battle-hud.ts              # Compose：顶栏 + 底部指令区 + 小白图鉴按钮
src/ui/battle-ch01-modals.ts      # 开场/胜负/技能窗/图鉴窗/离开
src/ui/battle-fx.ts               # 斩击/残影/护盾/协议（背袭扇区/朝向标记已不再调用）
```

- `core/` 不 import Phaser；场景不自己算伤害/顺序/命中。
- 随机：判定不用 RNG；只有未写 `slot` 的初始点位用 seed（`mulberry32`/`hashSeed`），同 seed 同画面。
- 事件：`turn-start / move / attack / guard / enemy-face / enemy-move / enemy-skill / protocol / victory / defeat / log`；场景按队列播，播完再推进。攻击非背袭命中后 state 进入 `pendingMove`，场景用 `post-move` 收尾。
- 场景生命周期统一走 `SceneLifecycle`；SHUTDOWN 事件里 cleanup（不是依赖子类 `shutdown()`）。

## 10. 舞台预览与验收

```text
/?stage=battle.ch01.first&phase=opening|mid|defeat&hud=0
/?stage=battle.ch01.kitchen&phase=opening|mid|victory|defeat&hud=0
/?stage=battle.sandbox.multi&phase=opening|mid&hud=0
/?stage=battle.ch01.kitchen&skip=1&hud=0
```

- DEV 后门：`__avmBattle()` 返回 `{phase, activeId, party, enemies, intents, pendingMove, knownEnemies, order, gauges, selectedTargetId, playerHp, enemyHp, slot, facing, intent, log, busy, actionsDisabled, attackDisabled}`。
- 验收要点：
  - 顶部只有「行动表」+ chip + 清除协议倒计时；没有量条/意图行/名牌/点位圈/朝向/目标白圈（**选目标阶段的黄/绿/红圈除外**）。
  - 先选技能、再点敌人选目标；顶部红字「请选择攻击目标」；可选相邻敌人脚下黄圈闪烁，选中后变绿圈/红色发光「确认攻击」，头顶显示名字/血条，点它发动；非法目标（距离不够）红圈闪 3 次 + 顶部闪「距离不够」后消失、不选中；场上除黄/绿/红圈和选中目标头顶名字/血条外无圈；技能窗不显示目标；未知怪不显示预计伤害，已知怪才显示；目标可取消。
  - 落点选择：与「你的回合」同位置显示红色常驻「请选择移动位置」，下方提示选目标附近点位或「留在原地」。
  - 玩家能走进空出来的中心；普通移动只画当前点 + 相邻空位；非背袭命中进入落点选择，画当前点 + 目标相邻空位；背袭不进入。
  - 怪物受击后转身面向攻击来向；没有单独的转向回合。
  - 双怪：点选目标、只杀一只不结束、全灭胜利；帮厨追击/被堵。
  - 图鉴：未命中过显示 `？？？`，命中一次解锁 HP/攻击/防御/速度/技能；预览命中不写盘。
  - 第一场仍在第 4 次怪物行动触发清除协议，战败回寝室；攻击按钮禁用、不弹技能窗。
  - `prefers-reduced-motion` 下无位移/白闪但信息完整。
- 布局：390×844、1200×648，另测 360/394/430/788 宽；canvas 填满、无黑边、按钮/行动表不重叠、console 0 error。
- 单测：`test/battle-slots/ai/flow/gauge/preview/layout/rail-transition/multi/balance/damage/frame-sequence/assets/pending/codex.test.ts`。

## 11. 未来扩展（不在本轮）

- 多个可操控角色：`party[]` 已 N-ready；需要队伍 UI/换人/多角色立绘与技能目标（友方/自身）。
- EP / 技能上限 / 冷却型玩家技能：`SkillDef` 已有 `cooldown`，加 `ep` 即可。
- 核心暴露 / 破核 / Boss 阶段：在 `damage` 里加 ×1.5 与处决标记。
- 地图接敌四档（背袭/侧袭/正面/被袭）：在 `createBattle` 里加先制/初始点位/初始朝向参数，不改 reducer。

## 12. 版本

- v1.0（2026-10-25）：三排/换位/夹击/核心/EP 的完整回合制设计（未实现）。
- v2.0（2026-11-21）：六站位跑条制；1v1、跑条、方向性技能、背袭/镜像位移、意图锁定；第一章两场接入。
- v3.0（2026-11-22）：七点位（中心可站）、删除转向行动、怪物自由瞄准/受击转身/移动追击、御膳房双怪、点选目标、顶部只留行动表；多人队伍数据结构预留。
- v3.1（2026-11-22）：删场上意图/常驻名牌/点位圈/朝向/目标白圈/静态地面圈（保留选中目标闪烁绿圈 + 头顶名字/血条，v0.1.39）；rail 64；攻击技能窗；防御平减+背袭穿防；`pendingMove` 落点选择（删除自动闪现）；小白图鉴；攻击前未知怪隐藏预计伤害。
- v3.2（2026-11-24）：七点位视觉正六边形等距（逻辑角度不变）；敌人执行时重选目标/不空放；闪避属性与位移；目标/玩家受击血条动画；御膳房战斗背景纯地面。
