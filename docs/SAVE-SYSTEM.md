# 正式存档系统（3 槽 · localStorage）

> 状态：v1（2026-11-17，M1a 需求 B）
> 代码真值：`src/app/save/`（纯逻辑） + `src/ui/game-menu.ts` / `src/ui/save-slots.ts`（UI）
> 护栏：`test/save-schema.test.ts`、`test/save-store.test.ts`、`test/save-availability.test.ts`、
> `test/ch01-flow-snapshot.test.ts`、`test/save-restore-plan.test.ts`
> 相关契约：`docs/CUE-CONTRACT.md`（BGM 属状态型 cue）、`AGENTS.md` §2 第 14 条（预览不写盘）

## 1. 目标与范围

**目标**：让玩家在自由探索时能随时把「此刻」写进 3 个存档位之一，退出应用后从标题页读回来，
落点、目标、剧情进度与 BGM 都与存档那一刻一致。

范围（M1a）：

| 能存 | 不能存 |
| --- | --- |
| 第一章第一节《寝室》· 自由探索 | 寝室的开场演出/对话/梦域入梦/战后征召/结束卡 |
| 第一章第二节《御膳房》· 自由探索（`explore` 幕） | 御膳房的门卫/躲藏/配对/草堆/结束与失败 |
| — | 金殿（纯演出）、剧情战（回合制） |

**为什么不做「任意时刻存档」**：存档要能恢复成一个*可玩的局面*。对话/表演进行到一半时没有
可复现的游标（`DialoguePlayer` 的行号、`PalacePlayer` 的拍子、表演时间线的剩余步骤都不进存档），
硬存只会读回一段半截演出。所以判定收敛成一句：**只有玩家真的能自由走动时才允许存档**（§3）。

**入口**（需求 A）：

- 四个阶段场景（寝室/御膳房/金殿/剧情战）右上角都有**汉堡图标**（`hud-kit.ts` 的
  `buildMenuIcon()`：56×56 的可交互 Panel + 三条矢量 `Rect`，a11y 名字「菜单」，不引 png、不写文字）；
- 点开是 Compose 模态菜单：**音量设置 / 读取存档 / 保存存档 / 返回标题**（「返回标题」是破坏性操作，固定放最后）；
- 菜单打开期间**游戏暂停**：对话逐字与自动播放停住（`cancelAutoAdvance()` + `update()` 早退），
  SPACE/ENTER 与点屏推进被 `menuModal` 挡掉，点菜单面板不会顺带推进对话；
- 「返回标题」沿用各场景原有的二次确认（`openCh01ExitConfirm` / `openKitchenExitConfirm` /
  `openBattleExit`），菜单留在下面，取消后还能继续操作。

## 2. 分层

| 文件 | 职责 | 依赖 |
| --- | --- | --- |
| `src/app/save/schema.ts` | 格式/版本/字段白名单/解析/序列化/元信息/构造 | 无 Phaser |
| `src/app/save/save-store.ts` | 3 个 `localStorage` key 的读/写/覆盖/配额判断 | 无 Phaser（存储可注入） |
| `src/app/save/save-availability.ts` | 「现在能不能存档」的规则表与中文提示 | 无 Phaser |
| `src/app/save/restore-plan.ts` | 落点校验、BGM 恢复决策、寝室 flow 快照、读档路由 | 无 Phaser |
| `src/app/save/load.ts` | 场景跳转胶水（同场景 `restart`，跨场景 `enterModule`） | 只 import 类型 |
| `src/ui/game-menu.ts` | 菜单模态（Branch 切页：根/音量/存/读/确认/结果） | Compose |
| `src/ui/save-slots.ts` | 三行槽位列表（标题页读档与场景内菜单共用） | Compose |
| `src/scenes/*.ts` | 采集/恢复场景状态、暂停与输入屏蔽 | Phaser |

**为什么 UI 与逻辑分开**：解析、判定、落点、BGM 决策全部能在 Node 里跑，单测覆盖 60 条；
Phaser 侧只剩「把字段抄出来 / 抄回去」。

## 3. 自由活动判定表

唯一入口：`evaluateSaveAvailability(context)`。规则按 `SAVE_BLOCK_ORDER` 顺序求值，命中即返回原因：

| 顺序 | 原因 | 触发条件 | 菜单提示 |
| --- | --- | --- | --- |
| 1 | `preview` | `StageLaunchContext.preview === true`（预览一律不写盘） | 预览模式不写存档 |
| 2 | `unsupported-module` | 模块不是 `ch01Dorm` / `ch01Kitchen`（金殿、战斗、标题） | 纯剧情演出 / 战斗不能存档 |
| 3 | `ended` | 本节结束（结束卡/失败卡） | 本节已结束，不能存档 |
| 4 | `card` | 章节字卡在播 | 章节卡播放中不能存档 |
| 5 | `transition` | 正在切场景（入梦白场/进战斗） | 场景切换中不能存档 |
| 6 | `cutscene` | 手机 CG 播放中 | 过场动画播放中不能存档 |
| 7 | `performance` | 表演时间线进行中（`performing`） | 剧情演出中不能存档 |
| 8 | `dialogue` | 对话进行中 | 对话进行中不能存档 |
| 9 | `modal` | 有模态弹窗（记录/退出确认） | 有弹窗打开时不能存档 |
| 10 | `not-free-roam` | phase 不是该模块的自由探索 phase | 当前不是自由活动，不能存档 |

模块 × phase 矩阵（✅ = 可存）：

| 模块 | intro | explore | dream/battle | after | gate/hide/pair/haystack | done/failed/complete |
| --- | --- | --- | --- | --- | --- | --- |
| `ch01Dorm`（寝室） | ❌ | ✅ | ❌ | ❌ | — | ❌ |
| `ch01Kitchen`（御膳房） | ❌ | ✅ | — | — | ❌ | ❌ |
| `ch01Palace`（金殿） | ❌（模块级拒绝，与 phase 无关） | | | | | |
| `battleCh01`（剧情战） | ❌（同上） | | | | | |

再叠加：对话 ✕ / 表演 ✕ / 过场 ✕ / 切场 ✕ / 章节卡 ✕ / 结束 ✕ / 弹窗 ✕ / 预览 ✕。

场景侧传什么（`private saveAvailability()`）：

- 寝室：`module:'ch01Dorm'`、`phase: flow.state.phase`、`dialogue/performance/transition/cutscene/card/ended`
  全部取场景当前字段；
- 御膳房：`module:'ch01Kitchen'`、`phase: this.phase`；
- 金殿：`module:'ch01Palace'`（保存项恒禁用）；战斗：`module:'battleCh01'`。

## 4. 存档状态清单（逐字段：为什么存、怎么恢复）

格式（`SaveDataV1`，`version: 1`）：

| 字段 | 类型 | 为什么存 | 怎么恢复 |
| --- | --- | --- | --- |
| `version` | `1` | 格式版本；未知版本当不可读（不迁移） | 解析入口先判，`!== 1` → `unsupported-version` |
| `savedAt` | number(ms) | 槽位列表的时间；判断新旧档 | 只展示，不参与恢复 |
| `slot` | `1｜2｜3` | 防串档：槽位号必须与 key 一致 | 与存储位置不符 → `corrupt` |
| `chapter` | `'ch01'` | 章节维度（为多章节预留） | 校验；不合法 → `corrupt` |
| `module` | `'ch01Dorm'｜'ch01Kitchen'` | 读档进哪个场景 | `saveLoadRoute()` → `enterModule` / `scene.restart` |
| `checkpoint` | `CheckpointId` | 写盘那一刻的检查点，与标题「继续游戏」对齐 | 只展示/校验；读档走 `restore` 数据，不改进度 |
| `sceneLabel` | string | 列表第二行「寝室 / 御膳房」 | 只展示 |
| `chapterLabel` | string | 列表第一行「第一章 · 第一节」 | 只展示 |
| `objective` | string | 列表里的目标摘要；寝室恢复后 HUD 目标 | 寝室：进 `Ch01Flow` 快照 / 直接写 `objective.value` |
| `bgmId` | `BgmId｜null` | **状态型 cue**：场景绑定表只知道默认曲 | `enterScene()` 之后 `planBgmRestore()` 决策 → `bgmManager.play(id)` |
| `player.x/y` | number | 精确落点（**房间局部坐标**，不含 `room.origin`） | `resolvePlayerRestore()`：加回 origin → 边界/可走格校验 → `moveTo` |
| `player.facing` | `Facing`（八向） | 读档后朝向一致 | 同上；非法朝向回落出生朝向 |
| `dorm.talkedZheng` | boolean | 寝室：郑卿是否已被叫醒（决定能否查看手机/目标） | 进 `Ch01Flow({ snapshot })` |
| `dorm.phoneFound` | boolean | 寝室：手机是否已找到（决定目标/结局推进） | 同上 |
| `flags` | `Record<string, string｜number｜boolean>` | 预留通用桶（M1a 无道具，写 `{}`） | 目前不消费；解析只放行标量 |

**为什么坐标存房间局部**：设计高度随设备比例变化（`app/viewport.ts` 的 `designHeight`），寝室的
`room.origin.y` 会跟着变。存世界坐标会在换视口/换设备后整体偏移，局部坐标与视口无关。
恢复时 `resolvePlayerRestore()` 还要过 `canStandAt()`（脚盒四角 + 底边中点必须落在可走格），
异常坐标回退出生点并在 console 留一行原因（`invalid` / `blocked`）。

**御膳房档的 `dorm` 字段**：写 `{ talkedZheng: true, phoneFound: true }`。能进第二节就说明第一节
已经打完，这是状态事实；读档时不会拿它恢复寝室流程（`flowSnapshotFromSave()` 只认寝室档）。

## 5. 格式、版本与损坏兜底

- **存储**：每槽一份 JSON，key `avm.save.v1.slot1` / `slot2` / `slot3`（`SAVE_KEY_PREFIX`）。
  逐槽独立解析：一个槽坏掉不影响另外两个。
- **版本**：`version` 不是本代码认识的数值 → `unsupported-version`，**不做字段级降级、不做迁移**。
  以后加 v2 就换 key 后缀（`avm.save.v2.slotN`）并保留 v1 读取路径，两者并存。
- **解析**：字段白名单，未知字段直接丢弃（旧档被删字段/手工加字段都能读）；`bgmId`、`module`、
  `checkpoint`、`facing` 都按枚举校验；`flags` 只收标量。
- **损坏兜底**：空/坏 JSON/缺字段/取值为非法 → `corrupt`；UI 显示「存档损坏」并**允许覆盖**；
  损坏槽不会让应用崩（解析全程 try/catch，`readSlot()` 拿不到存储也返回 `empty`）。
- **存储不可用/配额满**：`writeSlot()` 返回 `unavailable` / `quota` / `io` / `serialize`，
  菜单显示中文提示（`SAVE_WRITE_MESSAGES`），不抛异常。标题「读取存档」按钮只在
  `hasReadableSave()` 为真时点亮。
- **不做截图**：槽位只显示元信息（时间/章节/场景/目标）。WebGL `snapshot` 在部分 WebView/Android
  GPU 上会返回空白或翻转图，还要多写一份 `dataURL` 撑爆 localStorage 配额；截图省下来的几百 KB
  换不来「读档能不能玩」这个真正重要的信息。

## 6. BGM 这类状态型 cue 的恢复

**问题**：BGM 是状态型（`docs/CUE-CONTRACT.md` §2）。场景绑定表 `SCENE_BGM` 只知道
「寝室默认放校园日常 / 御膳房默认放危机曲」。玩家在寝室回忆段结束后（BGM 已是 `ch01Crisis`）
存档，读档时 `enterScene()` 会把曲子切回 `ch01Dorm`——这就是 740ec3d / ede0145 修过的同一类坑。

**实现**（两个场景一致，顺序不能反）：

```ts
bgmManager.enterScene(this);   // 1. 场景默认绑定
this.applyRestoredBgm();       // 2. 存档里的 BGM 显式补播
```

- `applyRestoredBgm()` 读 `planBgmRestore({ saved, currentId, playing })`：
  - `saved === null` → 不动（静场存档）；
  - `saved === currentId && playing` → 不动（同实例续播，不重头播）；
  - 其他 → `bgmManager.play(saved)`（显式、在 `enterScene` 之后）。
- 寝室还有第二道保险：`startExploreAudio()` 原本会 `applySceneBinding()`，读档时会把曲子顶回默认。
  恢复成功后置 `restoredBgm = true`，该分支跳过绑定重放（蝉鸣等环境音照常起）。
- **验证**：`window.__avmBgm.snapshot().currentId` 必须等于存档里的 `bgmId`
  （DEV 构建暴露，见 `src/main.ts`）。浏览器验收记录见 `.evidence/docs/screenshots/2026-11-17-five-items/save-menu/`
  （取证截图，不入库）。

## 7. 不存什么，以及为什么

| 不存 | 理由 |
| --- | --- |
| 敌人巡逻位置/警觉值/已清除名单 | 御膳房只允许在 `explore` 幕存档：那时巡逻是「时间函数」，读档从初始相位重来才是可复现的；把半个追逐赛写进档反而会出现「读档即被抓」 |
| 对话逐字进度/行号/历史记录 | 存档只在没有对话时发生；历史记录是会话内的回看功能，跨读档保留会与「回到存档那一刻」矛盾 |
| 表演时间线剩余步骤 | 同上：可存时刻表演一定已经结束 |
| 御膳房的视野已探索区域 | 属于当次潜入的即时信息，读档重开一块新视野更符合「重新潜入」；也避免为它存一大块位图 |
| 战斗回合/血量 | 剧情战不许存档 |
| 截图 | 见 §5 最后一条 |

## 8. 分槽与覆盖

- 3 个槽位，保存时选一槽；**已有存档会先二次确认「覆盖第 N 槽？」**，空槽/坏槽/旧版本槽直接写入
  （损坏槽允许覆盖）。
- 读取时先二次确认「读取第 N 槽？读档会离开当前场景，未保存的进度会丢失」。
- 标题页「读取存档」直接选槽（没有当前场景状态需要丢弃），选中后
  `enterModule(route.module, { restore })`；场景内读档若目标就是当前场景，走 `scene.restart({ restore })`。

## 9. 测试矩阵

| 关注点 | 用例（文件） |
| --- | --- |
| 序列化往返 / 坐标取整 / `bgmId: null` | `test/save-schema.test.ts`（15） |
| 空/坏 JSON/缺字段/未知版本/串槽/未知字段丢弃/flags 白名单 | 同上 |
| 元信息（时间格式、章节、场景、目标） | 同上 |
| 逐槽解析、坏槽隔离、覆盖损坏槽、配额满、存储不可用、标题入口条件 | `test/save-store.test.ts`（13） |
| canSave 判定表（每个 phase × 对话/表演/过场/切场/章节卡/结束/弹窗/预览）与规则顺序 | `test/save-availability.test.ts`（9） |
| flow 快照往返 / 快照优先 resume / 非法快照回退 / 旧调用兼容 | `test/ch01-flow-snapshot.test.ts`（7） |
| 落点精确/越界/压墙回退、两种脚盒、BGM 恢复决策、寝室快照、标题读档路由 | `test/save-restore-plan.test.ts`（16） |
| 场景生命周期闩（读档 `restart` 后回调不许失效、旧轮回调不许串进新局） | `test/scene-lifecycle.test.ts`（8） |

```bash
pnpm vitest run test/save-schema.test.ts test/save-store.test.ts test/save-availability.test.ts \
  test/ch01-flow-snapshot.test.ts test/save-restore-plan.test.ts test/scene-lifecycle.test.ts
pnpm typecheck
```

浏览器验收（2026-11-17，自起 `pnpm dev --port 5201`，用独立 Chromium 脚本走真实指针/键盘，
390×844 与 1200×648 两档；取证截图在 `.evidence/docs/screenshots/2026-11-17-five-items/save-menu/`，
`.evidence/` 不入库）：

| # | 验收项 | 结果 |
| --- | --- | --- |
| 1 | 汉堡图标外观（三条横线、无文字、无 png） | 390/1200 两档均显示；设计框内 `x=640 w=56`（右缘 696 = 720−24），不越界 |
| 2 | 四项菜单（音量设置/读取存档/保存存档/返回标题） | 寝室/御膳房/金殿/剧情战四个场景都可打开；对话框状态下列表齐全 |
| 3 | 音量滑杆实时生效 + 刷新保持 | 音乐滑杆 60→19：`settings.bgm=0.19` 落盘，`__avmBgm.snapshot().volume=0.19`；`location.reload()` 后 `avm.settings.v1.bgm` 仍 0.19 |
| 4 | 对话中保存被禁用并有提示 | `保存存档` 置灰；`saveAvailability()` = `{allowed:false, reason:'dialogue', message:'对话进行中不能存档'}`，面板下显示同一句 |
| 5 | 预览模式不写存档 | `?stage=scene.ch01.dorm&phase=explore`：reason=`preview`，三个槽位保持 `null` |
| 6 | 寝室存档 → 刷新 → 标题读档 | 存档 `player={x:316.36,y:272.73}`（房间局部）→ 读档世界坐标 `{316.36, 410.73}`（+origin.y 138）逐像素一致；`objective` 一致 |
| 7 | 寝室 BGM 状态型恢复 | 构造存档 `bgmId='ch01Crisis'` 读档：`__avmBgm.snapshot().currentId='ch01Crisis'`，而 `binding` 仍是 `{track:'ch01Dorm'}`；再存第 3 槽，`bgmId` 仍为 `ch01Crisis`（写盘取的是"当前曲"而非默认曲） |
| 8 | 御膳房存档 → 刷新 → 标题读档 | `player={x:624,y:5328}` 严格一致；`bgmId='ch01Crisis'` 读回 `currentId='ch01Crisis'` |
| 9 | 御膳房 BGM 覆盖场景绑定 | 构造 `bgmId='ch01Dream'` 读档：`currentId='ch01Dream'`，`binding` 仍是 `ch01Crisis` |
| 10 | 坏槽/空槽显示 | 槽 2 写坏 JSON → 列表显示「存档损坏」且按钮仍可用（可覆盖）；空槽显示「空档位」 |
| 11 | 覆盖确认 | 已有存档的槽按钮变「覆盖第 N 槽」，点开二次确认（显示该槽时间/章节/场景） |
| 11b | 场景内读档 | 菜单 → 读取存档 → 第 1 槽 → 二次确认（「读档会离开当前场景」）→ `scene.restart({restore})` 回寝室探索 |
| 12 | 控制台 | 寝室/御膳房/标题/金殿/战斗各流程 **0 error**（验收期间另一次金殿预览曾报 2 个竖版立绘缺图，是对面并行工程当时还没落 png，随后已补上） |

## 10. 验收中发现并修掉的两个真问题（留档）

| 现象 | 根因 | 修法 |
| --- | --- | --- |
| 御膳房点菜单"没反应"（其实弹窗已打开，只是画在屏幕外） | 御膳房的相机跟随玩家滚动，而 `mvvm.modal` 生成的模态层默认走 world 空间；`appliedRect` 是层内坐标，点到的是屏幕上的空处 | `openGameMenu()` / `openLoadSlotsModal()` 打开后 `modal.widget.setScrollFactor(0)`（与 `kitchen-modals.ts` 既有做法一致） |
| 寝室读档后目标/叫醒状态/BGM 全是默认值 | `init()` 读到 `restore`，但 `create()` 开头 `resetState()` 把 `this.restore = null` 清掉了 | `resetState()` 不再清 `restore`（`init()` 每轮都会重新赋值）；仓里注释写明原因，防回归 |
| 读档后「查看手机」：CG 播完不接小白台词，一直自由行动（小白也不出现） | `scene.restart()`（菜单读档走的就是它）复用同一个场景实例；`SHUTDOWN` 里置位的 `shuttingDown = true` 从未在下一轮 `create()` 复位 → 手机 CG 的 `onDone` 被 `if (this.shuttingDown) return` 永久吞掉。同一个闩还吞掉了战后「坐 → 站」起身表演（离开寝室去金殿时寝室已经 SHUTDOWN） | 生命周期闩改由 `src/app/scene-lifecycle.ts` 的 `SceneLifecycle` 管理：`create()`（寝室是 `resetState()`）里 `beginRun()` 换 runId、SHUTDOWN 里 `close()`、异步回调先 `isLive(runId)`；`phoneCutsceneSeen` 一并按轮清零（读档后重走手机节点要重新播 CG）。顺手修了金殿：清理原本写在场景子类 `shutdown()` 里（Phaser 只派发 SHUTDOWN 事件，不调用该方法，等于没写），现注册到 SHUTDOWN 事件。护栏 `test/scene-lifecycle.test.ts` |

后续加"任意场景菜单"或新的跨帧回调（视频/CG/延时表演）时，这三条都会原样复现——尤其第二条：**`init()` 读到的启动数据不要在 `create()` 里清**；第三条：**重新 `create()` 之后，上一轮排的回调还该生效吗？**
