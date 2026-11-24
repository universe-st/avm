> **历史计划**：v3.2（2026-11-24）已把七点位改成视觉正六边形、敌人改为执行时重选/不空放、加入闪避与受击血条动画；本文的「意图锁定/打空/45° 环位」只作 v3 设计史，当前规则以 `docs/DESIGN-BATTLE.md` 为准。

# 战斗系统 v3 改造计划（七点位 / 无转向行动 / 双怪御膳房 / 追击 AI）

> 状态：**D1–D6 已确认并落地（2026-11-22）**。实现见 `src/battle/`、`src/scenes/battle-ch01-scene.ts`；验收见 `docs/DESIGN-BATTLE.md` §10。日期：2026-11-22。
>
> 目标来源（用户 2026-11-22）：
> 1. 不再显示行动条，但行动表（圆圈头像）依旧显示。
> 2. 原本六个移动点位，中间那个点位也成为合法移动点位。
> 3. 怪物不再有单独的转身行动；受击后转向攻击者，进攻时自由选择方向并转身向该方向。
> 4. 怪物支持移动行动：移动到临近点位，移动后面朝移动方向。
> 5. 支持多个怪物：按剧情或随机放置在任意点位。
>
> 已确认：7 点位；保留 SPD 跑条引擎、只隐藏量条；御膳房改成 2 怪；怪物暂时用追击 AI，并为将来多玩家角色预留数据结构。D1–D6 全部按默认项执行。
>
> 关联：[战斗设计 v2](DESIGN-BATTLE.md)、[舞台预览](STAGE-PREVIEW.md)、[第一章验收](CH01-ACCEPTANCE.md)、[开发约定](../AGENTS.md)。

## 0. 一句话

把战场从「6 环位 + 居中怪物」改成「7 点位（6 环 + 中心）+ 任意站位怪物」；怪物的一次行动只有**技能**或**移动**，转身不再单独消耗行动；顶部去掉 SPD 量条，只留头像行动表与每个怪物的意图；御膳房改成双怪，玩家点敌人选目标。

## 1. 现状（代码事实）

| 项 | 现状 | 代码 |
| --- | --- | --- |
| 点位 | 6 个环位（右/右上/左上/左/左下/右下），怪物固定在中心 | `src/battle/core/slots.ts`、`src/battle/layout.ts` |
| 玩家移动 | 只能到环上相邻一格；中心不可站 | `adjacentSlots()` |
| 怪物行动 | `intent.kind = 'turn' \| 'skill'`；转向占一次行动 | `src/battle/core/ai.ts`、`core/battle.ts` |
| 朝向 | 怪物朝 8 向；技能只打面向的前方；背袭 ≥135° | `zoneOfSlot()`、`hitSlotsFor()` |
| 敌人 | 单数 `state.enemy` / `setup.enemy` | `src/battle/types.ts`、两场数据 |
| 顶部 | 「行动条」标题 + 双方 300×10 连续量条 + 「接下来」6 个头像 chip + 意图行 | `battle-ch01-scene.ts` 的 `createBarsAndRail/drawGauges/drawActionBar`、`railHeight=116/fieldTop=244` |
| 目标 | 1v1，没有目标选择 | — |
| 御膳房 | 1 只御厨·幻影（HP 56 / ATK 12 / SPD 12） | `src/battle/data/ch01-kitchen.ts` |
| 多玩家 | 单数 `state.player`；底部指令区只服务一个角色 | 同上 |

## 2. 目标形态（v3）

### 2.1 七点位

```text
          upperLeft ────── upperRight
            /  \              /  \
           /    \            /    \
        left ─────── center ─────── right
           \    /            \    /
            \  /              \  /
          lowerLeft ────── lowerRight
```

- 6 个环位 + `center`；中心就是现在怪物站的那个红圈。
- **占据互斥**：一个点位同时只能站一个单位（玩家/任一怪物）。
- 相邻关系：
  - `center` ↔ 6 个环位全部相邻；
  - 每个环位 ↔ 左右两个环位 + `center`（3 个邻点）。
- 玩家/怪物都遵守同一套相邻关系；中心只在空出来时才是合法落点。
  - 开局玩家在 `left`、怪物在 `center`：玩家第一动仍只能到 `upperLeft/lowerLeft`；怪物离开中心后，玩家可以从任意环位一步走进中心。
- 中心被怪物占据时，原来画在中心的红圈改为「普通金色点位环 + 站着的怪物脚下红环」；怪物离开后中心显示为合法空位。

### 2.2 攻击射程 = 相邻点位（近战）

为了让「追击 AI」和「中心点位」有意义，本轮把普通攻击/技能定义为**只打相邻点位**：

| 技能命中类型 | v3 语义 |
| --- | --- |
| `single-front` | 以「瞄准点」方向 ±45° 内的**相邻点** |
| `front-arc` | 以「瞄准点」方向 ±135° 内的**相邻点** |
| `all-slots` | 全场 7 点，无视距离/朝向 |

- 怪物在中心、玩家在环位：6 个环位都与中心相邻，所以 1v1 的手感与 v2 基本一致；single 仍然覆盖瞄准方向上的 3 个环位。
- 怪物离开中心后，玩家必须走到 `center` 或它的相邻环位才能攻击它；AOE 是唯一能从远处打到玩家的招式。
- 玩家攻击也遵守相邻射程：目标不在相邻点位时攻击按钮禁用，提示「目标不在相邻点位」。
- 这是本轮最需要拍板的一条（已确认）；如果希望「任意方向远程」，追击 AI 会失去意义，整套距离设计要重来（见 §15）。

### 2.3 怪物的行动

怪物的每次行动二选一：

| 行动 | 规则 | 消耗 |
| --- | --- | --- |
| **技能** | 自由选择瞄准点（不要求当前面朝它）；执行时先免费转身面向瞄准方向，再出招；命中集合由「怪物点位 + 瞄准点 + 技能类型」算出 | 1 行动 |
| **移动** | 移动到相邻的可站点位；移动后**面朝移动方向**；目标点被占则移动失败（空耗这一动，撞一下） | 1 行动 |

- **删除 `intent.kind='turn'`**，也删除 `enemy-turn` 行动事件与 380ms 的转向演出。
- 受击后**免费转身面向攻击者出手时的点位**：不算行动、不进行动表。转身发生在伤害结算之后；如果这一下把怪物打死则不转。玩家命中后如果闪现走了，怪物仍面向**攻击来向**（`from`），不是闪现后的落点。
- 进攻时的转身也是免费的：意图里保存的是**瞄准点**（`aim`），执行时怪物转向 `aim` 再出招；玩家在意图锁定后挪出命中集合就能看它打空。
- 清除协议计数仍按**怪物行动数**（技能/移动都算），不是玩家回合数；第一场没有移动（中心到任意环位都相邻），所以仍是第 4 次怪物行动触发。

### 2.4 多怪

- 核心从单数改成数组：`state.party[]` + `state.enemies[]`；行动表、跑条、意图、HP 全部按单位 id 处理。
- **御膳房改成 2 怪**：1 只「御厨·幻影」+ 1 只「帮厨·幻影」，都复用餐厨八向/技能帧/头像；用编号徽标区分（见 §9）。不新增美术资源；如果之后要独立帮厨立绘，另开素材任务。
- 怪物初始点位：
  - **剧情指定**：`enemies[i].slot` 显式写（现有两场都写死，保证演出稳定）；
  - **随机**：不写 `slot` 时用 seed 从空点位里不放回抽取；同 seed + 同 setup 必定同一布置。
- 胜利条件：所有怪物 HP 0；只打死一只不会结束。
- 目标选择：玩家**点敌人身体选中**，选中目标有白环；攻击按钮/提示会写目标名。默认目标 = 相邻敌人里 HP 最低者；没有相邻敌人时保留最近敌人用于提示，但攻击禁用。
- 第一场仍是 1 怪、必败、第 4 次怪物行动清除协议；不改剧本。
- 未来多玩家：本轮**只把数据结构做成 N-ready**（`party[]`、按 `activeId` 找行动者、目标选择按 id），不实现队伍 UI/换人/多角色立绘；现在 `party.length === 1`。

## 3. 本轮决定（D1–D6 已确认）

| # | 默认决定 | 理由 | 如果否决 |
| --- | --- | --- | --- |
| D1 | 攻击射程 = 相邻点位 | 追击 AI、中心点位、怪物移动都需要「距离」才有意义 | 改成任意方向远程后，移动只剩余演出价值，需要重做 AI 与距离 |
| D2 | 解离突刺的闪现仍以**战场中心**为轴（不是以目标脚下为轴） | 6 环位镜像行为不变；目标离开中心后落点仍可预测 | 改成目标轴镜像需要补 7×7 落点表与占位兜底，规则更绕 |
| D3 | 第二只怪复用御厨八向/头像，命名「帮厨·幻影」，用 1/2 徽标区分 | 不新增素材、不增加包体；先验证多怪系统 | 需要生成独立帮厨八向/技能帧，约一轮美术任务 |
| D4 | 目标选择 = 点敌人选中，不额外加底部目标按钮 | 战场上的敌人本来就可见；少一行 UI，390 宽更稳 | 改成底部目标 chip；需要重排指令区 |
| D5 | 顶部标题改为「行动表」，不再显示 SPD 量条与 SPD 文案 | 用户明确要保留头像表、不要行动条 | 可以保留 SPD 数字但去掉量条；信息更挤 |
| D6 | 多玩家只做数据结构，不做队伍 UI | 本轮需求是多怪，不是多人小队 | 需要同时设计换人/队伍条，范围会翻倍 |

## 4. 几何与判定（纯逻辑）

### 4.1 点位角度

- 环位仍用屏幕坐标角度：`right 0° / upperRight 45° / upperLeft 135° / left 180° / lowerLeft 225° / lowerRight 315°`；`center` 是原点，没有固定角度。
- 单位之间的朝向/区域不再只看「玩家站位相对怪物固定角度」，而是看**两个点位的实际方向**：

```ts
facingFromPoints(from: SlotId, to: SlotId): Facing8   // 两点方向 → 最近 8 向
zoneOfPoint(attacker: SlotId, target: SlotId, targetFacing: Facing8): Zone
```

- 角度差先归一化再比较（`normalizeDegrees(angle(to) - angle(from))`）；不能像求点角度那样把 180° 折成 -180° 后直接相减，否则 `center→left` 会把左上/左下漏掉。
- 兼容旧行为：怪物在 `center`、玩家在环位时，`zoneOfPoint` 等价于原来的 `zoneOfSlot`。
- 新增中心后仍然没有 NaN：两点相同视为数据错误（占据互斥保证不会发生），测试要覆盖所有 7×7 方向。
- 环位方向会出现 67.5°/112.5° 这种**正好夹在两个 8 向之间**的情况（左→左上、右上→右等）。`facingFromPoints` 的平局规则：角差相同取 `|cos|` 更大的一向（即环的切线/斜向，而不是正上/正下）；单测锁死，避免不同机器舍入不一致。

### 4.2 命中集合

```ts
hitPointsFor(origin: SlotId, aim: SlotId, hit: SkillHit): SlotId[]
```

- 先取 `origin` 的相邻点（中心 → 6 环；环 → 中心 + 两邻），再用 `aim` 方向过滤：
  - `single-front`：角差 ≤45°；
  - `front-arc`：角差 <135°；
  - `all-slots`：全部 7 点。
- 参考结果（测试真值）：

| origin | aim | single-front | front-arc |
| --- | --- | --- | --- |
| center | left | left / upperLeft / lowerLeft | 同左（其余环位角差 ±180/±135 被排除） |
| center | upperRight | right / upperRight | right / upperRight / upperLeft / lowerRight |
| center | right | right / upperRight / lowerRight | 同左 |
| left | center | center | center / upperLeft / lowerLeft |
| left | upperLeft | upperLeft | center / upperLeft（lowerLeft 正好 135°，按背面排除） |
| upperRight | center | center / upperLeft | center / upperLeft / right |
| center | — | all-slots = 7 点 | all-slots = 7 点 |

> 上表是按规范角度（环位 0/45/135/180/225/315°）算的测试真值；实现时用同一份几何函数生成，不手写死表。

- 意图里保存 `origin / aim / targetId / targetSlot / hitSlots / aoe`；`hitsPlayer` = 目标角色点位在 `hitSlots` 里。
- **玩家解离突刺按「选中的目标点」结算，不用命中集合**：它是单一目标突刺，只要目标相邻就命中；`hitPointsFor` 只服务怪物技能与意图。不要把玩家的 `SkillDef.hit='single-front'` 误读成「正面 3 格 AOE」。
- 玩家在意图锁定后走到 `hitSlots` 之外就躲开；AOE 只能靠防御减半。

### 4.3 背袭

- `zoneOfPoint(playerSlot, enemySlot, enemyFacing)`；`|相对角| ≥135°` 仍是背面。
- 玩家攻击前用**怪物当前朝向**判定背袭；伤害结算后怪物转向攻击者，所以同一位置连续砍第二刀通常变正面——想连续背袭要绕位/利用闪现。
- 受击转向只改朝向，不改已锁定的意图；怪物下一次出招仍会转回 `aim`。

### 4.4 移动与占位

- 新增纯函数：
  - `occupiedSlots(units)`：点位 → 单位 id；
  - `freeAdjacentPoints(state, unitId)`：相邻且没人站的点；
  - `shortestStepToward(state, from, target, blocked)`：7 点图上的 BFS 一步（追击 AI 用）。
- 玩家移动：`adjacentSlots(from)` 且目标点空闲；中心被占时不能进。
- 怪物移动：意图锁定 `to`；执行时若 `to` 被玩家/另一只怪占了，**移动失败**（原地撞一下，空耗行动）。这样玩家可以用身体堵路。
- 闪现：以战场中心镜像（`mirrorSlot`，`center→center`）；落点被占则**不闪现**，伤害照常，日志写「落点被占，留在原地」。玩家在中心时镜像仍是中心，不产生位移。

## 5. 回合与行动表

### 5.1 跑条引擎保留，量条 UI 删除

- 引擎不变：`gauge 0..1000`、SPD 推进、行动后归零；只是**不画**顶部两条 300×10 量条。
- 删除：`drawGauges()`、`gaugeGraphics`、`railPlayerText`、`railEnemyText`、顶部 `SPD 14 / 20` 文案。
- 保留并强化：头像行动表（`previewOrder` → `railTransition`）、当前行动者白描边、每个怪物的意图行。
- `previewOrder` 从 2 个 actor 推广到 N 个；行动表最多画 6 个 chip（玩家 + 5 怪），怪物更多时截断。
- 跑条值只留在 `__avmBattle()` 调试快照里，不再上屏。

### 5.2 顶部布局（目标值，实机再校）

去掉量条行后，rail 从 116 缩到约 96（1–2 只怪）/ 116（3 只怪）：

| 元素 | 位置（设计坐标） |
| --- | --- |
| 标题「行动表」 | x=24, y=railTop+2，字号 16 |
| 头像 chip | 中心 y=railTop+30，直径 44，中心距 52，firstX=96 |
| 意图行 1 | x=24, y=railTop+56，字号 15 |
| 意图行 2 | x=24, y=railTop+76，字号 15 |
| 协议计数（仅第一场） | 右上角，danger 色，字号 14 |

- `railHeight = 96 + max(0, intentRows - 2) * 20`，`intentRows = clamp(怪物数, 2, 3)`；`fieldTop = 118 + railHeight + 10`。
- 1–2 怪：`fieldTop=224`（比现在上移 20px，战场略大）；3 怪沙盒：`fieldTop=244`。
- `battle-hud.ts` 的 `Spacer(118)` 是 Compose 占位，必须与 `railHeight` 用同一常量/参数，避免以后改布局时两层错位。
- 行动表下方意图行按敌人逐行：`御厨·幻影：热油泼洒 · 命中 左/左上/左下`、`帮厨·幻影：移动 · 左上（面朝左）`；第一场仍把「清除协议 · 剩余 N 次行动」放右上角。

### 5.3 行动表 chip

- 玩家固定周全头像；怪物按 `art` 对位（矿工/御厨）。
- 双御厨同头像时，chip 右下角加 12px 数字徽标（1/2）；场上怪物名牌也用同一编号，避免认错。
- 顺序变化仍只走 `railTransition(prev, next)` 190ms；reduced-motion 直接落终态。
- 顺序源仍是 `previewOrder()`（只是改成 N 个 actor）。

## 6. 追击 AI

### 6.1 规则（确定性、无随机）

每只怪物独立决策；`planEnemyIntents(state, setup)` 给所有活着的怪物各算一个意图。

1. 选目标：最近的玩家角色（BFS 步数）；平局取 HP 低者 → id 字典序。现在只有 1 个玩家角色。
2. **目标相邻**：
   - 按优先级选可用技能：`single-front` → `front-arc` → `all-slots`（冷却好的才选；都有冷却则用第一个 0 冷却技能）；
   - `aim` = 目标点位；`hitSlots` 由 `hitPointsFor` 算出。
3. **目标不相邻**：
   - 有 `all-slots` 且冷却好 → 直接 AOE（唯一能打到远处的招式）；
   - 否则 BFS 找一步能缩短距离的空闲相邻点 → 移动意图；
   - 没有任何可走的一步 → 仍出技能瞄准目标（会打空），日志写「够不着」。
4. `behavior: 'stationary'` 的怪物永不移动（第一场用它，保持教程稳定）；`'chaser'` 走上面的追击逻辑。默认 `chaser`。

### 6.2 意图锁定

- 每只怪物在自己行动结束后重算**自己的**意图；其他怪物的意图保持锁定。
- 玩家移动**不改**任何已锁定意图；所以可以「读两只怪的意图 → 走到两只都打不到的点 / 堵住移动落点 → 看它们打空或撞住」。
- 受击转向不重算意图；下一次出招仍转向 `aim`。
- 意图两种：`skill`（含 `aim/hitSlots/aoe`）与 `move`（含 `from/to/facing`）；不再有 `turn`。

### 6.3 典型读法

- 中心怪瞄准左：single 覆盖左/左上/左下；玩家从左上挪到右上才真正出圈（要走两步或利用闪现）。
- 环位怪在左上、玩家在左：不相邻 → 意图「移动 · 中心/左」之类；玩家可以先站住那个落点把它堵住。
- 怪物在中心、玩家在中心？不可能（占据互斥）。
- 双怪：一只中心攻击、一只从右上追击；玩家先杀中心，中心空出来后另一只可能走进中心。

## 7. 数据契约

### 7.1 类型草图

```ts
// SlotId 仍沿用旧名，语义变为「7 个点位之一」：center + 6 环位。
export type SlotId = 'center' | 'right' | 'upperRight' | 'upperLeft'
  | 'left' | 'lowerLeft' | 'lowerRight';

export interface BattleSetup {
  id: string;
  title: string;
  arena: 'palace' | 'kitchen';          // 场景/背景/返回目标不再靠 id 猜
  party: readonly (BattleUnitSetup & { slot?: SlotId })[];
  enemies: readonly (BattleUnitSetup & {
    art: EnemyArtId;
    slot?: SlotId;                    // 不写 = seed 随机空位
    behavior?: 'chaser' | 'stationary';
  })[];
  script?: { protocolAfterEnemyActions: number; protocolDamage: number; protocolText: string };
  intro: {...};
  victory: {...};
  defeat: {...};
}

export interface BattleUnit {
  id: string; name: string; team: 'party' | 'enemy';
  hp: number; maxHp: number; atk: number; spd: number;
  gauge: number; guarding: boolean;
  slot: SlotId;                       // 所有单位都有点位
  facing: Facing8 | null;             // 只有怪物有
  cooldowns: Readonly<Record<string, number>>;
  art?: EnemyArtId;                   // 怪物渲染用
}

export interface BattleState {
  encounterId: string; title: string; seed: number;
  phase: BattlePhase; activeId: string | null;
  party: readonly BattleUnit[];
  enemies: readonly BattleUnit[];
  intents: Readonly<Record<string, EnemyIntent>>; // 每只怪一条
  enemyActions: number; seq: number; log: readonly BattleLogEntry[];
}

export type EnemyIntent =
  | { kind: 'skill'; skillId: string; skillName: string;
      origin: SlotId; aim: SlotId; facing: Facing8;
      targetId: string; targetSlot: SlotId;
      hitSlots: readonly SlotId[]; hitsPlayer: boolean; aoe: boolean; text: string }
  | { kind: 'move'; from: SlotId; to: SlotId; facing: Facing8;
      targetId: string; text: string };

export type BattleAction =
  | { kind: 'move'; slot: SlotId }
  | { kind: 'attack'; skillId: string; targetId: string }
  | { kind: 'guard' }
  | { kind: 'enemy-act' };
```

### 7.2 事件

| 事件 | 变化 |
| --- | --- |
| `turn-start` | 不变（actorId/name/team） |
| `move` | 增加 `actorId`（玩家 id；将来多人用） |
| `attack` | 增加 `targetSlot`；`from/to` 仍是玩家点位（`to` = 闪现落点） |
| `enemy-face` | **新增**：`{actorId, facing, reason:'aim'\|'hit', text}`；替代 `enemy-turn` |
| `enemy-move` | **新增**：`{actorId, from, to, facing, blocked, text}` |
| `enemy-skill` | 增加 `targetId/targetSlot/from/aim/facing/aoe`；`playerHp` → `targetHp` |
| `enemy-turn` | **删除** |
| `protocol / victory / defeat / log` | 不变；victory 改为所有怪物 HP 0 |

- 动画顺序：
  - 出招：`enemy-face(aim)` → `enemy-skill`；
  - 受击：`attack`（结算/闪白/伤害数字）→ `enemy-face(hit)`（存活才发）；
  - 移动：`enemy-move`（含朝向）。
- 场景只消费事件；核心仍不 import Phaser。

### 7.3 双怪示例（御膳房）

```ts
// 初始值，按 §12 的实机/模拟再调。
party: [{ id: 'zhou-quan', name: '周全', hp: 90, atk: 16, spd: 14,
          skills: ['player.jielitusi'], slot: 'left' }],
enemies: [
  { id: 'cook-phantom-a', name: '御厨·幻影', hp: 40, atk: 10, spd: 12,
    art: 'cook', slot: 'center', behavior: 'stationary',
    skills: ['cook.sweep', 'cook.oil'] },
  { id: 'cook-phantom-b', name: '帮厨·幻影', hp: 24, atk: 7, spd: 10,
    art: 'cook', slot: 'upperRight', behavior: 'chaser',
    skills: ['cook.sweep', 'cook.oil'] },
],
```

- 初始节奏：玩家先动（SPD 14）→ 御厨（12）→ 帮厨（10）；帮厨在右上、玩家在左，第一动大概率是「移动到左上」而不是直接攻击，给玩家一个读移动意图的窗口。
- 目标：4–6 次玩家行动结束，胜利时玩家 HP 不低于 20；如果实测过难，先降 `帮厨` 的 atk，再降 `御厨` 的 HP，不要改玩家技能。

## 8. 场景与 UI 改造

### 8.1 角色与点位

- `enemyActor` → `Map<string, BattleActor>`；`playerActor` 先保留单数，但按 `party[0]` 取（将来扩成 Map）。
- 场景创建时按 `setup`/`state` 给每只怪建 actor，放在 `layout.slots[enemy.slot]`；`syncActorPositions()` 遍历所有单位。
- 每个怪物独立：名牌 + HP 条（`headPoint` 上方）、朝向箭头、背袭楔形、AOE 标签、目标白环。
- 中心点位：`layout.slots.center` = 原 `layout.monster` 的脚底坐标；中心画普通金色点位环；每个怪物脚下另画红环表示占据。
- 点位标签：中心「中」，其余「左/左上/…」；被怪物占据的点位标签压暗。

### 8.2 输入

- 移动：点亮的相邻空点位（中心也算）；被占点位不点亮；`onSlotPointer` 加空闲/相邻校验（核心仍会兜底）。
- 目标：每只怪一个 pointer zone（脚底上方 160×200），点击设 `selectedTargetId`；选中目标画白环。
- 攻击：`onAttack()` 取 `selectedTargetId`；没有相邻目标时 `flashHint('目标不在相邻点位。')`；只有 1 只怪时自动选中，行为与现在一致。
- 默认目标：玩家回合开始时，若当前目标已死/不相邻，自动选「相邻敌人中 HP 最低」；没有相邻敌人则保留最近敌人（仅提示），攻击禁用。
- 移动模式下点敌人仍然可以切目标（不冲突：敌人点位不是空位，不会被当作移动目标）。

### 8.3 表现

| 事件 | 表现 |
| --- | --- |
| 怪物出招 | 快速转身（8 向贴图 + 白扫光 + 箭头，160ms）→ 技能 strip；strip 的 flip 由 `aim` 的左右决定 |
| 怪物受击后转身 | 命中/伤害数字之后 160ms 转身；不再有 380ms 的大转向演出；死亡则不转 |
| 怪物移动 | 260ms 弧线/踏步到相邻点 + 落地尘 + 朝向切到移动方向；被堵则原地撞一下 + 「被挡住」 |
| 怪物被打空 | 沿用现有 `打空` 浮字；AOE 仍画全场红环/双冲击波 |
| 目标 | 选中怪物脚下白环；攻击预览的闪现落点仍用白环 |
| 行动表 | 头像 chip + 当前行动者白描边；同一 art 的多只怪加 1/2 徽标 |
| 意图 | 每只怪一行；地图上每只怪有朝向箭头/背袭楔形；AOE 怪物脚下「全站位」 |

- 音效：转向音只保留短促的 `battle_turn`（低音量），移动复用 `battle_blink`（低音量）+ 落地环；不新增音频资源。
- `prefers-reduced-motion`：去掉位移/白闪/残影，转身直接切图；伤害数字/意图/结果完整保留。

### 8.4 HUD 文案

- 顶栏 objective：`第 N 动 · 敌方 2`（不再写 SPD）。
- 玩家行：`周全 HP 90/90`（防御中加「防御中」；不再重复 SPD）。
- 攻击按钮：`攻击 · 御厨·幻影 · 24` / `攻击 · 目标太远` / `攻击 · 无「解」`。
- 提示行：`目标：御厨·幻影（相邻）· 背袭 ×1.5，命中后留在原地` 或 `非背袭命中后可选择目标附近点位落地`；没有相邻目标时提示先移动。
- 日志保留最近 2 条；多怪日志带名字，避免「它」指代不清。
- 副标题 `剧情战 · 七点位` / `遭遇战 · 七点位`。

## 9. 顶部/布局代码点

- `src/battle/layout.ts`：
  - `BATTLE_LAYOUT.railHeight` 改成按意图行数计算（96/116）；
  - `slots` 加 `center`，指向原 `monster` 脚底坐标；
  - 保留 `playerHeadOffset`；`monsterHeadY` 由各 actor 的 `headPoint` 取代；
  - 更新 `fieldTop/fieldBottom/radiusY` 的注释与测试。
- `battle-ch01-scene.ts`：
  - 删 `gaugeGraphics/drawGauges/railPlayerText/railEnemyText`；
  - `createBarsAndRail` 改成标题「行动表」+ chips + `intentTexts: Text[]`（最多 3 行）+ 协议角标；
  - `drawActionBar` 用 N 个 id；`paintOrderChip` 支持徽标；
  - `enemyActor`/名牌/血条/AOE 标签全部改成按 id 的 Map；
  - `animateEnemyTurn` 删除，新增 `animateEnemyFace` / `animateEnemyMove`；
  - `animateEnemySkill` 用事件里的 actor/from/aim/facing，而不是 `state.enemy`；
  - `animateAttack` 用 `targetId` 找目标 actor；玩家在中心时用目标 x 决定镜像/手部方向；
  - `runEnemyTurn`/`beginTurn` 按 `activeId` 找单位；
  - `afterAction` 的胜利判断改成「所有怪 HP 0」；
  - `debugSnapshot` 返回 party/enemies/intents/selectedTargetId/order/gauges。
- `src/ui/battle-hud.ts`：副标题/注释；`Spacer` 与 rail 高度同源；不加目标按钮（D4）。
- `src/ui/battle-fx.ts`：`drawBackArc/drawFacingMark` 已接受坐标，循环调用即可；如需「目标白环」直接复用 `drawSlotRing`。
- `src/dev/stage-catalog.ts`：更新两场描述；新增多怪沙盒（见 §10）。
- 资源：不新增 key；`battle.common/battle.ch01/battle.kitchen` 不动。双御厨共用 `head_cook` 与厨子八向/技能帧；徽标是文字。

## 10. 御膳房双怪与多怪沙盒

### 10.1 御膳房（`battle.ch01.kitchen`）

- 2 怪：御厨·幻影（中心、stationary）+ 帮厨·幻影（右上、chaser）。
- 开场卡 `target` 改「御厨·幻影 / 帮厨·幻影」；`ruleText` 加一句「点敌人切换目标；只打相邻点位」。
- 胜利文案不变（幻影散尽）；`clearedEnemyId` 逻辑不变（这一场巡逻整体清除）。
- 战败回御膳房的检查点不变；不写 `dorm.after`。

### 10.2 多怪沙盒（新增舞台）

- `battle.sandbox.multi`：厨房舞台，3 只怪（2 厨 + 1 矿？矿需要 `battle.ch01` 资源，太重；先 3 只厨/帮厨），点位随机（seed），用来验收：
  - 随机点位不重叠、同 seed 可复现；
  - 3 行意图 + 116 rail；
  - 追击/堵路/目标切换/只杀一只不胜利。
- `requires: ['core','battle.common','battle.kitchen','ch01.bgm']`，`sceneKey: SCENE_KEYS.battleCh01`，`encounterId` 走新 setup；`arena: 'kitchen'`，返回御膳房/标题。
- 只在 DEV 舞台目录出现，不进正式剧情。

## 11. 实施阶段

| 阶段 | 内容 | 完成判据 |
| --- | --- | --- |
| P0 | 本计划评审 | 用户点头/改口径 |
| P1 | 核心：types、slots 7 点、gauge N、AI、battle reducer、placement、preview；数据改 party/enemies | `test/battle-*` 纯逻辑全绿；`pnpm typecheck` 只剩场景未改的预期错误（或同批修完） |
| P2 | 场景 1v1 对齐：删量条、中心点位、无转向行动、受击转身、行动表 | 第一场/御膳房单怪预览可走；390×844 实机无重叠 |
| P3 | 双怪：目标选择、按 id 的 actor/名牌/意图、御膳房 2 怪、沙盒 | 双怪可胜/可败；只杀一只不结束；追击移动可见 |
| P4 | 文档、平衡、验收、截图/GIF | `pnpm check` 全绿；全流程实机；文档更新 |

- P1/P2 的类型/事件契约先冻结；场景按契约并行，避免 core 与 scene 互相改字段。
- 实施中不新增美术/音频；如果平衡或表现需要，优先调数据/表现层，不阻塞在素材上。

## 12. 测试与验收

### 12.1 纯逻辑单测

| 文件 | 覆盖 |
| --- | --- |
| `test/battle-slots.test.ts` | 7 点位；中心/环位相邻；所有 7×7 `zoneOfPoint/facingFromPoints`；`hitPointsFor` 表；`mirrorSlot(center)=center`；无 NaN |
| `test/battle-ai.test.ts` | 不再产生 `turn`；相邻技能优先级；不相邻 AOE/追击/堵路；双怪各一条意图；确定性 |
| `test/battle-flow.test.ts` | 第一场 4 次怪物行动协议；受击转身；移动被堵；攻击射程；双怪只杀一只不胜利；全灭胜利 |
| `test/battle-gauge.test.ts` | 3 actor 顺序；行动者归零、其他人保留；previewOrder N |
| `test/battle-preview.test.ts` | 御膳房 opening 有 2 怪；mid/victory；沙盒 |
| `test/battle-layout.test.ts` | 中心点位；railHeight 96/116；fieldTop；7 个 slot |
| `test/battle-rail-transition.test.ts` | 3–4 个 id 的前移/进出；同组不重播 |
| `test/battle-multi.test.ts`（新） | 指定点位去重；随机点位不重叠/同 seed 复现；chaser 一步；移动堵路 |
| `test/battle-balance.test.ts`（新） | 御膳房「攻击相邻最低 HP + 低血防御」策略 8 次玩家行动内胜利且 HP>0；只防御必败；第一场不可胜 |
| `test/battle-assets.test.ts` | 不变；双厨复用 head_cook / 厨子帧，宽度仍 <4096 |
| `test/battle-contract.test.ts`（可选） | 事件/意图联合类型里没有 `'turn'`；数据里没有重复点位 |

### 12.2 实机/预览验收

```text
/?stage=battle.ch01.first&phase=opening|mid|defeat&hud=0
/?stage=battle.ch01.kitchen&phase=opening|mid|victory|defeat&hud=0
/?stage=battle.sandbox.multi&phase=opening|mid&hud=0
/?stage=battle.ch01.kitchen&skip=1&hud=0
```

- `__avmBattle()` 扩展为：`{phase,activeId,party,enemies,intents,order,gauges,selectedTargetId,enemyActions,seq,busy,actionsDisabled,attackDisabled}`；用 Playwright 断言，不靠截图猜。
- 必验：
  - 顶部没有量条，但有「行动表」和当前行动者白描边；
  - 玩家能走进空出来的中心；怪物能移动到相邻点并面朝移动方向；
  - 怪物受击后转身面向攻击来向（包括玩家闪现走的场合）；
  - 怪物没有单独的转向回合；意图行只出现技能/移动；
  - 双怪：点选目标、只杀一只不结束、全灭胜利；帮厨追击/被堵；
  - 第一场仍在第 4 次怪物行动触发清除协议，战败回寝室；
  - `prefers-reduced-motion` 下无位移/白闪但信息完整。
- 布局：390×844、1200×648，另测 360/394/430/788 宽；canvas 填满、无黑边、按钮/行动表不重叠、console 0 error。
- 全流程：标题 → 开幕 → 寝室 → 金殿剧情战 → 御膳房 → 双怪遭遇 → 结束卡；战败/重开/返回标题都走一遍。
- 取证：实机截图/GIF 放 `.evidence/docs/screenshots/battle-v3/`（gitignored）；文档引用的成品图才放 `docs/images/`。
- 动态验收给 GIF：怪物移动、受击转身、双怪目标切换各 8–14 帧；整场表演如需要再录 mp4。

### 12.3 平衡

- 先跑纯逻辑平衡探针，再实机玩 3 次；目标御膳房 4–6 次玩家行动、胜利 HP ≥20、失败不是必败。
- 第一场保持「不能赢、4 次行动协议、战败回寝室」三条；改数值时不要破坏。
- 双怪如果过难：先降帮厨 atk/HP，再降御厨 HP；不要给玩家加血/加技能（本场是「有解之后第一场完整战斗」）。

## 13. 风险与回退

| 风险 | 缓解 |
| --- | --- |
| 场景 2081 行，单/复数改造面大 | P1 纯逻辑先绿；P2 保持 1v1 行为对齐后再加第二只怪；事件契约先冻结 |
| 删除转向行动后怪物更凶，御膳房变难 | 双怪初始值压低 + 平衡探针 + 实机 3 次；第一场仍协议收尾 |
| 攻击射程改成相邻后，玩家在中心/环位的操作需要重新学 | 意图行写清「命中格」，移动点亮相邻空位；开场规则文案加一句「只打相邻点位」 |
| 双怪同头像认错 | chip/名牌 1/2 徽标；目标白环；攻击按钮带名字 |
| 中心点位被怪物/玩家占用的视觉歧义 | 金色点位环 + 怪物脚下红环；被占标签压暗；空出来后点亮 |
| 行动表去掉量条后信息变少 | 保留 6 个 chip + 当前描边 + 每怪意图；不退回一行文字 |
| 多玩家未来改动 | 现在就用 `party[]/enemies[]`、按 id 找 actor；本轮不实现队伍 UI |
| 随机点位破坏演出 | 现有两场显式写点位；随机只用于沙盒/未来遭遇 |

## 14. 文件清单

**核心（P1）**
- `src/battle/types.ts`
- `src/battle/core/slots.ts`（7 点、方向、命中集合、镜像）
- `src/battle/core/gauge.ts`（N actor）
- `src/battle/core/ai.ts`（重写：无 turn、追击、AOE、移动）
- `src/battle/core/battle.ts`（party/enemies、受击转身、移动、目标、全灭）
- `src/battle/core/placement.ts`（新：指定/随机点位、去重）
- `src/battle/core/preview.ts`（双怪/沙盒）
- `src/battle/data/ch01-first.ts`（party/enemies/arena/behavior）
- `src/battle/data/ch01-kitchen.ts`（双怪）
- `src/battle/data/skills.ts`（只改注释语义；数值不动）

**场景/UI（P2–P3）**
- `src/battle/layout.ts`
- `src/scenes/battle-ch01-scene.ts`
- `src/ui/battle-hud.ts`
- `src/ui/battle-fx.ts`（如需要目标环，复用现有绘制）
- `src/dev/stage-catalog.ts`（厨房双怪、沙盒）
- `src/app/modules.ts`（如果沙盒需要新模块；优先复用 `battleKitchen`）
- `src/assets/keys.ts` / `bundles.ts`：**不改**（复用现有头像/八向/技能帧）

**文档（P4）**
- `docs/DESIGN-BATTLE.md`（v3 重写相关章节）
- `docs/STAGE-PREVIEW.md`（厨房双怪、沙盒、debug 快照）
- `docs/CH01-ACCEPTANCE.md` / `docs/PLAYTEST-CH01-KITCHEN.md`（双怪验收）
- `AGENTS.md`（硬规则：7 点位、无转向行动、相邻射程、目标、多怪数组、无行动条）
- `docs/RESOURCE-SPEC.md`（注明双厨复用/徽标，不新增 key）
- `docs/PLAN-BATTLE-V3.md`（本文件）

**测试（P1–P4）**
- 更新：`battle-slots/ai/flow/gauge/preview/layout/rail-transition`
- 新增：`battle-multi`、`battle-balance`（可选 `battle-contract`）
- 不改：`battle-assets`、`battle-damage`、`battle-frame-sequence`

## 15. 已确认项（2026-11-22）

- [x] **D1 攻击射程 = 相邻点位**：已实现；玩家解离突刺是单一目标，怪物技能用 `hitPointsFor`。
- [x] **D2 闪现仍以战场中心为轴**：落点被占则不闪、伤害照常。
- [x] **D3 第二只怪复用御厨美术**（帮厨·幻影）：不新增资源 key，chip/名牌用 1/2 徽标。
- [x] **D4 点敌人选目标**：默认相邻最低 HP；攻击按钮/提示带目标名。
- [x] **D5 顶部只留「行动表」+ 意图行**：SPD 量条/标题/文案已删除；rail 96/116。
- [x] **D6 多玩家本轮只做数据结构**：`party[]/enemies[]` N-ready，不做队伍 UI/换人。

P1–P4 已落地并通过 `pnpm check` / `pnpm build`（见提交记录与交付报告）。

## 16. v3.1 迭代（2026-11-22，覆盖 §15 的 D2/D5）

- **D2 已被覆盖**：删除 `SkillDef.teleport`，非背袭命中进入 `pendingMove` 落点选择；背袭留在原地，不再自动镜像闪现。
- **D5 已被覆盖**：顶部只留「行动表」标题 + 头像 chip（rail 64），删除每只怪意图行；场上同时删除名牌/HP/点位方位/背袭楔形/朝向三角/AOE 红环文字/目标白圈/静态点位环。地面圈只在普通移动/落点选择出现。
- 新增：攻击技能窗（`openBattleSkill`，一个技能也弹）、平减防御 + 背袭穿防、`pendingMove/post-move`、小白图鉴（`src/battle/codex.ts`）、未知怪不显示预计伤害。
- 测试新增 `battle-pending`、`battle-codex`；`battle-damage/flow/preview/balance/layout` 已按新公式/rail 64/pending 更新。
