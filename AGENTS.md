# 开发约定（给后续 AI / 协作者）

## 0. 当前阶段

M1a。已交付：M0.9 的全部内容 + 第一章第一节《寝室》（单房间探索、小白登场、第一场剧情战、战后征召与命名、准备阶段、结束卡）
+ 第一章第二节《御膳房》（五幕探索、无限射程扇形视野与三层暗幕、遭遇战、结束卡）。

**正式流程已串起来**：标题 → 开幕 → 寝室 → 金殿剧情战 → 结束卡「进入第二节」→ 御膳房 → 结束卡。
检查点 `dorm.*` / `ch01.complete` / `kitchen.explore` / `kitchen.done`，标题「继续游戏」可直达御膳房。
标题左下角有**游戏内测试入口**（见 `docs/STAGE-PREVIEW.md` §13），APK 里也能跳任意场景。

**战斗系统 v3.3（十一点位四三四 / 真实网格坐标判定 / 无转向行动 / 多怪 / 技能窗 / 小白图鉴 + 等距布局/闪避/敌人不空放/血条动画）已接入第一章两场**：金殿剧情战（`battle.ch01.first`，没有「解」、只能移动/防御、第 4 次怪物行动清除协议必败）与御膳房双怪遭遇战（`battle.ch01.kitchen`，解离突刺 / 背袭 / 平减防御 / 非背袭落点选择 / 追击 AI / 小白图鉴）。战场不画常驻名牌/点位圈/朝向；选目标阶段有**可选黄圈（闪烁）/选中绿圈/非法红圈（闪一下）**，选中目标头顶显示**名字/血条**（受击血条有下降动画），玩家受击临时显示头顶血条；十一点位按**四三四等距六边形网格**布置（上 4 / 中 3 / 下 4）；参战者有**闪避**（1−200/(3x+200)，成功闪到相邻空位），御膳房战场为**纯地面无墙**。属性只在图鉴。规则见 `docs/DESIGN-BATTLE.md`，入口/验收见 `docs/STAGE-PREVIEW.md`。

尚未接入：多个可操控角色（队伍 UI/换人）、EP/核心暴露/Boss、第三节。没有计划不要继续扩章节。

正式存档（3 槽 localStorage）已接入：自由活动判定、字段清单、损坏兜底与 BGM 恢复见
`docs/SAVE-SYSTEM.md`；右上角「菜单」图标在 `src/ui/hud-kit.ts`，存读档 UI 在 `src/ui/game-menu.ts`。

## 1. 命令

```bash
pnpm dev            # 5173
pnpm build          # dist/
pnpm check          # typecheck + vitest + assets:check
pnpm test
pnpm assets:scan    # 资源字节 → catalog.gen.json
pnpm assets:check   # key 唯一 / 文件存在
pnpm android:debug
pnpm android:release
```

## 2. 硬规则

1. **场景里禁止 `this.load.*`**。资源先进 `src/assets/bundles.ts`，再走 `enterModule(this, id)`。
2. 新增 bundle/资源必须跑 `assets:scan` + `assets:check`，并在 `docs/RESOURCE-SPEC.md` 登记。
3. 切换场景用 `from.scene.start()`（`enterModule` 已封装）；不要用全局 `game.scene.start()`，会留旧场景。唯一例外是 `src/dev/stage-runner.ts` 的显式预览跳转：它会先停掉所有内容场景再启动，别在别处模仿。
4. 设计坐标按 **720 宽**写；不要读 `window.innerWidth` 做布局（视口在 `app/viewport.ts` 统一算）。
5. 相机统一走 `applyCamera(scene)`：`setZoom(plan.scale)` **且** `centerOn(360, designH/2)`。`plan.scale` 现在固定为 1（见 §5 的倍率坑），不要自己算设备倍率。
6. 像素素材纹理 NEAREST，UI 文本 LINEAR；不要非整数倍缩放像素 sprite。
7. 不提交 `cordova/keys/`、`cordova/build.json`、`cordova/www/`、`cordova/platforms/`。
8. vendor 的 phaser-mvvm 可以改，但每次改动写进 `vendor/phaser-mvvm/PATCHES.md`，并跑框架单测。
9. 字体/文案不要写死到 canvas 纹理；中文长句用 Label 的换行能力。
10. 新依赖先确认许可证；AI 素材必须登记 `docs/ASSET-CREDITS.md`。
11. 剧情长文文案以 `src/story/` 为唯一真值；场景里不硬编码台词。过场时间线写成无 Phaser 的纯逻辑并补单测（参考 `prologue-player.ts`）。
12. **所有可玩场景/CG/战斗都必须登记舞台目录**：`src/dev/stage-catalog.ts`；场景 key 还要进 `src/app/scene-keys.ts`。`pnpm check` 会检查模块/内容场景覆盖，不登记就失败。
13. 预览/验收只走 `launchStage()`、`?stage=<id>` 或 `__AVM__.stages`；场景不要自己解析 query，也不要直接 `scene.start()` 做预览跳转。新增场景/CG/战斗照 `docs/STAGE-PREVIEW.md` 的接入步骤做。**游戏内测试入口在标题页左下角「测试」**，清单由 `STAGE_CATALOG` 自动生成——新增场景只登记目录，禁止在 UI 里手写第二份列表（见 STAGE-PREVIEW §13）。
14. 预览模式（`StageLaunchContext.preview === true`）**不得写存档/进度/成就**；随机必须用 `seed`（`src/dev/random.ts`），禁止直接 `Math.random()`。同一 seed + params 必须能复现同一画面/开局。
15. 原生渲染分层只能取 `src/render/layers.ts` 的 `LAYERS` / `SCREEN_LAYERS` / `characterDepth()`；资源 key 只能取 `src/assets/keys.ts` 的分组。**过场里推拉镜头只能缩放世界层容器（`worldRoot`），禁止改 `cameras.main.zoom`（会把 Compose 对话框一起放大、挤出屏幕）；屏幕层特效（立绘/遮幅/字卡/速度线）只能用 `SCREEN_LAYERS`。**地图、角色、UI、CG 的归属见 `docs/RENDER-LAYERS.md`，不要在场景里写魔法 depth 或手写资源 key。
16. **资源随场景走**：内容场景只通过 `GameModule.requires` 声明资源，切场景必须走 `enterModule` / `launchStage`；`AssetService` 会在目标场景 `create` 后释放旧 bundle（`core`/`ui` 常驻）。禁止跨场景 `prefetch`，禁止场景里手工 `textures.remove` / `cache.*.remove`；验收看 `__AVM__.assets.bundles()`。
17. **状态型 cue 不得挂在单行台词显示上**：行 cue 的现状是**只有 `bgm` 属于状态型**，`cg` / `fx` / `emotion` 属于表现型（分类真值：`src/story/dialogue.ts` 的 `DIALOGUE_CUE_KINDS`）。状态型 cue 只能由节点/阶段收尾的幂等归约（`reduceStateCues` → 场景 `flushStateCues()`）给出，**「跳过」与自然过完必须走同一条收尾并补状态型 cue**；表现型跳过时**不得**补播。以后加目标/检查点这类世界状态（往 `DialogueStateCues` 加字段）同样走归约，不许挂在行显示上；新增 cue 先在分类表里表态（漏分类 `pnpm typecheck` 直接失败），并补「每个 lineIndex 都当跳过点」的单测；禁止在 `skipDialogue()` 里硬写某首曲子。契约见 `docs/CUE-CONTRACT.md`，护栏 `test/dorm-stateful-cues.test.ts`。

18. **立绘必须与说话人对位（金殿）**：谁开口，屏幕上就只能是那个人的立绘。对位表 `PALACE_SPEAKER_PORTRAIT`（`src/story/ch01-palace.ts`）+ 归约 `reducePortraitForSay()` 是唯一判定，场景在 `say` 分支调用 `alignPortraitForLine()`；**不要靠手写 `portrait` act 记住换脸**（2026-11-18 的「周全的台词配郑卿的脸」就是这么来的）。旁白不换脸；没立绘的角色（矿工）开口时收脸，不许顶上一张。新增说话人必须在表里表态，护栏 `test/palace-portrait-speaker.test.ts` 会逐句走时间线。

19. **台词换行遵守行首禁则（2026-11-21）**：一句台词太长要翻页时，**页与页之间优先在句末标点断开**；**任何换行（翻页、页内折行、渲染层按宽度折行）后，新行第一个字符不能是标点**——只有前引号 `「『“` 与前书名号 `《〈` 例外。判定唯一源 `isForbiddenLineStart()`（`src/story/dialogue.ts`，按 Unicode `\p{P}` 分类，不手写标点表）；翻页在 `paginateText()`（`src/story/dialogue-player.ts`），页内只做孤行控制 `balanceDialogueLine()`，真正按字宽折行在框架 `rewrapOverflowingLines()`（vendor 补丁，两边判定要对拍）。**数字/英文词（`32.47%`、`TEAR-27`）是不可拆 token**（`isTokenChar()`）：翻页时整词留在上一页，渲染折行时整词换行。**金殿过场也走同一套分页**（`PalacePlayer` 的 `say` 交给 `paginateText`/`balanceDialogueLine`，点击顺序=补全本页→翻页→推进时间线）。新增/改写台词不用手数行，护栏 `test/dialogue-linebreak.test.ts` 会把**全部剧本**逐页折一遍。规则与取舍见 [台词排版](docs/DIALOGUE-TYPOGRAPHY.md)。

20. **暗场/黑场演出不要用黑色画「压边、暗角、遮挡」**：世界层已经是黑的，黑色压在黑色上等于没画
    （2026-11-21 黑场胁迫 v1 实测：黑边与分带暗角完全看不见）。要表达「画面被夹住」，用**亮的冷光软边**
    ——canvas 线性/径向渐变贴图，不要用 Graphics 同心圆或一叠矩形条（会露出色带/像相框）。
    同一段的音效也有坑：心跳素材 `ch01_dark_heartbeat.mp3` 是**一组两记**，按 `120000/bpm` 排组、
    用 `rate` 对齐组内间距；按 `60000/bpm` 逐记排会叠三层、听起来像心律不齐（实测）。
    六拍数值表在 `src/story/ch01-dark-scene.ts`，表现层 `src/ui/dark-pressure.ts`，契约见 `docs/CUE-CONTRACT.md` §4.7。
    收尾的「压趴下 → 喘气 → 撑起身」：趴姿是**临时贴图层**（`zhou_prone`），起身走
    `CH01_GETUP_PERFORMANCE`；任何跳过/收尾/重开都必须取消压趴延时器并 `clearPronePose()`。

21. **对话必须有人物立绘，且对位只有一张表（2026-11-24）**：寝室 / 御膳房 / 金殿 / 战斗的每一句台词，
    谁开口屏幕上就是谁的半身贴图；战斗里的插入对话（`src/story/ch01-first-battle.ts`）**不再用居中模态卡**，
    改用与剧情同一个底部 `buildDialoguePanel`（672×300、打字机、分页、点任意位置补全/继续）。
    - 对位唯一真值是 `src/story/portraits.ts` 的 `SPEAKER_PORTRAITS` + `reducePortraitForLine()`；
      场景只调 `DialoguePortrait.alignForLine(line)`，**不许在场景里写「谁说话挂哪张脸」的 if**。
    - **旁白不挂立绘**（2026-11-25 用户要求）：有脸就收；下一位说话人重新上脸，同一个人紧接着再开口时走 soft 原地淡回来（不滑入）。明确没立绘的人（新闻主持人＝CG 里的人）给 `null` 收脸；**未登记的说话人一律收脸**，
      并由 `test/dialogue-portrait-registry.test.ts` 报错——加角色必须先在表里表态。
    - 带 `cg` / `blackout` / `dark` 的行不叠立绘（画面已经由 CG / 暗场承载）。
    - 立绘是**屏幕层**：`PortraitLayer` 必须 `setScrollFactor(0)`。御膳房相机跟着玩家滚动，
      漏了这行立绘会被滚出画面（2026-11-24 实测：寝室/金殿正常、御膳房只剩黑边）。
    - 立绘 PNG 720×900 RGBA、透明底、左右留边。**2026-11-25 起透明图一律用 Seedream 5.5 原生 Alpha**
      （游戏素材大师 `keyBackdrop=transparent` + `arkModel=doubao-seedream-5-5-*`），**不再生成绿幕再抠像**
      （视频仍绿幕）；老素材的绿边兜底工具 `tools/despill-portrait.py` 保留。按角色共用程度分三个 bundle：
      `ch01.portraits`（周全/小白/矿工，四个场景共用）、`ch01.kitchen`（老麦/老肯）、
      `cutscene.ch01palace`（郑卿/楚公公/侍卫/周全慌张）。key 统一 `img.char.portrait.*`。
    - 对话结束/跳过/进菜单必须 `portrait.hide()`，SHUTDOWN 必须 `destroy()`（场景实例会复用）。
    - **情绪差分**（2026-11-25）：周全有平常/皱眉/震惊/快乐/尴尬五张，郑卿有平常/震惊/得意/尴尬四张；
      台词用 `DialogueLine.portraitEmotion`（行 cue，表现型）指定，缺省 = 角色默认脸。
      表在 `SPEAKER_PORTRAIT_EMOTIONS`，切换由 `reducePortraitForLine` 统一给出；**换表情是同一个人
      原地换图（`soft: true`，不播入场滑入），换人才播入场**。金殿周全用的是被按跪慌张特写，不套差分。

## 3. 代码风格

- TypeScript strict；`verbatimModuleSyntax`；类型导入用 `import type`。
- 文件位置：`app/` 决策与胶水、`resource/` 资源、`audio/` 音频、`scenes/` 场景编排、`world/` 地图/房间视图、`actors/` 角色表现、`ui/` HUD/CG/视觉辅助、`render/` 深度契约、`story/` 剧情数据与纯时间线、`map/` 地图数据与碰撞、`battle/` 战斗数据与纯逻辑、`dev/` 舞台目录与测试后门、`theme/` 令牌。
- UI 优先 Compose DSL（`Panel/Column/Row/Text/Button/Slider`），少用 `this.add.*` 工厂。过场/电影化画面可以用原生层，但控制层（跳过/继续）仍放 Compose，保证焦点与安全区。
- 纯逻辑抽到无 Phaser 依赖的模块（如 `resource/plan.ts`）并写单测。

## 4. 验证

- **默认不启动 Android 模拟器**：除非用户主动要求，否则测试验收无需启动模拟器调试 Android 端。
- 改 UI：`pnpm dev`，用浏览器在 **390×844** 与 **1200×648** 两个视口各看一眼；检查控制台 0 error。
- 改对话/立绘：`pnpm check` 会跑 `test/dialogue-portrait-registry.test.ts`（说话人表态 + bundle 闭包 + 归约语义 + 战斗面板同款）；实机取证 `.evidence/scripts/capture-portraits-2026-11-24.mjs` 逐场景推进到指定说话人，断言 `portrait.currentKey` 与屏幕上 image 的 texture/alpha，并截图 390×844。
- 改开幕/过场：完整走一遍「开始 → 全部 cue → 点击继续 → 第一章寝室」，再测「跳过」「返回键」和 `prefers-reduced-motion`；`?stage=scene.prologue` 直接进开幕。
- 改第一章/地图：`?stage=scene.ch01.dorm&phase=explore&hud=0`；验移动/碰撞/交互/目标/对话/返回标题；`debug=1` 看碰撞格。
- 改命名段（2026-11-26 新稿）：`?stage=scene.ch01.dorm&phase=naming&hud=0` 从「行吧。不过，你得答应我三个条件。」开始；
  验光雾三拍（翻涌 → 坍塌 → 平息）、冷风（冷蓝闪 + 冷色暗角脉冲）、「好耶」星火、显示名在「代号更新确认」处切成「小白」、
  演完回到自由活动（`phase=prep`，目标「准备好后，跟小白对话」）、走到小白身边按交互 → 白闪 → 结束卡；
  再验「跳过」（第一句就点跳过 → 仍到 prep、光雾不残留）与 `prefers-reduced-motion`（静态光雾、能走到 prep）。
  取证：`.evidence/scripts/verify-naming-2026-11-26.mjs`（逐拍截图 + 交互 + 结束卡）、
  `.evidence/scripts/verify-naming-flow-2026-11-26.mjs`（正式 after 流程 / 跳过 / reduced 三段）。
- 改战斗（v3.3）：
  - 金殿剧情战：`?stage=battle.ch01.first&phase=opening|mid|defeat&hud=0`（`victory` 会回退 mid）；验攻击可点一次（触发教程对话后灰掉）、机器人先攻、第 4 次怪物行动后清除协议必败、战败回寝室、预览可重开/返回。
  - 御膳房双怪：`?stage=battle.ch01.kitchen&phase=opening|mid|victory|defeat&hud=0`；验「攻击」按钮基础只显示“攻击”（不带目标名/伤害）→ 先弹技能窗 → 选好技能后点敌人选目标（可取消，取消键是移动键）→ **选中有效目标后按钮变红色发光的「确认攻击」** → 点确认发动；选目标阶段顶部红字「请选择攻击目标」，与落点红字「请选择移动位置」同款同位置；**可选的相邻目标脚下黄圈闪烁**（选中后变绿圈，其他可选仍黄圈）；**选中目标头顶显示名字 + 红色血条，取消/死亡/胜负后隐藏**；点非法目标（距离不够）时脚下红圈闪 3 次 + 顶部红字闪「距离不够」，随后红圈消失、保持未选中；场上除选目标黄/绿/红圈和选中目标头顶名字/血条外无圈、无常规名牌、无 HP、未知怪不显示预计伤害、命中后非背袭进入落点选择、背袭留在原地、平减防御、只杀一只不结束、全灭胜利、回御膳房（不写 `dorm.after`）。正常进战斗时开场卡期间战斗曲不提前起，`intro` 关闭后 `ch01Battle` 从 0 起播。
  - 小白图鉴：底部 HP 行右侧「小白」按钮；未攻击过的怪显示 `？？？`，攻击命中一次后显示 HP/攻击/防御/速度/技能；预览命中只更新内存不写盘；跨战斗/跨会话持久。
  - 多怪沙盒：`?stage=battle.sandbox.multi&phase=opening|mid&hud=0`；验随机点位/追击/堵路/落点选择。
  - 8 向美术：`&facing=up|upRight|right|downRight|down|downLeft|left|upLeft`。
  - DEV 后门：`__avmBattle()` 读 `{phase, activeId, party, enemies, intents, pendingMove, knownEnemies, order, gauges, selectedTargetId, targetingSkillId, playerHp, enemyHp, slot, facing, intent, log}`；别靠截图猜回合数。
  - `?stage=...&skip=1` 跳过开场卡直接玩家回合；`hud=0` 关预览 HUD。
  - 改战斗数据/判定必须同时跑 `test/battle-*.test.ts`；AI 按当前目标重选/不空放、十一点位四三四（20 条边）/命中集合、等距布局、容量 11、闪避、跑条序列、防御平减、pending 落点、图鉴、双怪平衡都有纯逻辑护栏。
- 改战后黑场胁迫（小白压制周全）：`?stage=scene.ch01.dorm&phase=dark&hud=0` 从「呃……」那一拍直接开始；
  验六拍顺序、黑屏收尾、跳过（结尾卡背后不留黑屏/心跳/小白放大）、`prefers-reduced-motion`。
- 改舞台目录/预览：`pnpm check`；按 `docs/STAGE-PREVIEW.md` §10 验「URL / 控制台 / HUD 目录 / 未知 id 回退 / hud=0」；新增场景/CG/战斗必须能单点打开、带 seed 重开、返回标题。
- 改资源：`pnpm assets:check`；确认 `public/assets` 下没有未引用文件。
- 改 Android：`pnpm android:debug` 出调试包即可；只有用户主动要求时才装模拟器/真机，验「启动到标题、点击开始、返回键」。
- 改 vendor：`pnpm --filter @phaser-mvvm/phaser test`（在 vendor 包内）或至少 `pnpm typecheck`。
- 改场景生命周期 / 读档 / 过场回调：`pnpm smoke:lifecycle`（自起临时 vite + 真 Chromium）。
  A 段验「读档 `restart` 后手机 CG 必须接小白台词」，B 段验「金殿切场清理真的执行、重进复位」，
  C 段验控制台 0 error。**静态护栏 `test/scene-lifecycle.test.ts` 只能证明接线，不能证明回调真的跑**
  （金殿的 `shutdown()` 死代码就是这么骗过静态测试的），两者都要跑；需要本机 playwright-core/Chromium，
  缺依赖时脚本会明确报错而不是静默跳过。

## 5. 已知坑

- **场景实例在 `scene.restart()`（菜单读档）与「离开后再次进入」时是同一个对象，类字段不会重置。**
  `SHUTDOWN` 里置位的生命周期闩（旧写法 `private shuttingDown`）必须在新一轮 `create()` 复位；否则这个实例
  之后的所有异步回调都会被永久判成「场景已关闭」。2026-11-18 的「寝室读档后手机 CG 播完不接小白台词、
  直接变自由行动」就是它，同一个闩还吞掉了战后「坐 → 站」起身表演（去金殿时寝室已 SHUTDOWN）。
  现在统一用 `src/app/scene-lifecycle.ts` 的 `SceneLifecycle`：`create()`（寝室是 `resetState()`）里
  `beginRun()`、SHUTDOWN 里 `close()`、异步回调先 `isLive(runId)`；`test/scene-lifecycle.test.ts`
  会拦住返祖成裸 `shuttingDown` 布尔，以及忘记接线。
  另外 **Phaser 的 `Systems.shutdown()` 只派发 SHUTDOWN 事件，不会调用场景子类的 `shutdown()` 方法**——
  金殿的清理以前写在那里等于没写（切进战斗时立绘/世界层不销毁）。收尾一律
  `this.events.once(Phaser.Scenes.Events.SHUTDOWN, ...)` 注册。
- `cordova/config.xml` 的 `BackgroundColor` 必须 `#RRGGBB`，写 `0xff...` 会让 AAPT 报 `raw string`。
- Android 首次启动 WebView 可能超过默认 20s 加载超时；已把 `LoadUrlTimeoutValue` 设 120000。
- 系统「Viewing full screen」提示会盖住应用，点 Got it 后才是游戏。
- 4:3 平板会留边；20:9 手机无黑边。
- **渲染倍率固定 1**（`planViewport` 里 `scale = 1`）。别改回「物理像素/720」：UIRoot 不会跟着放大，
  而相机会 `setZoom(scale)`，结果是手机上 HUD 整体偏移、摇杆飞出去（2026-11-02 实机复现）。
- 真机 WebView 的 `innerHeight` 常在启动后变一次；`watchViewport` 会在显著变化时按新尺寸重载一次。
- 标题主视觉是首版 AI 图 + 像素化后处理；M1 可重做。
- 第一章素材由游戏素材大师生成；人物先出设定图，再以图为参考生成精灵/八方向/场景。寝室是零部件拼图，不画整张细图，也不铺地毯。
- 角色精灵工具（sprite）的转圈视频一旦源图里混入第二个人物/剪影，截帧会带残影；源图必须是单人、全身、纯色背景。
- 行走帧不能逐帧按各自 bbox 缩放，否则人物会「越走越瘦」；必须用整段 8 帧的并集 bbox 统一缩放，脚底对齐。
- 八方向行走视频里，`up`（背对镜头）那组常被模型画成「往远处走」：同一段动画里人物先小后大（实测 ±24%），
  播出来就是"往上走一会儿大一会儿小"。`normalize-walk-sheet.py` 现在**逐帧等比校正**到同一高度，
  别再退回"一组 sx/sy 打天下"。
- **行走 sheet 整张宽度必须 < 4096**（手机 GPU 常见上限，桌面 16384 测不出来）。20 帧 × 帧宽，
  帧宽 224 就是 4480 → 真机上纹理创建失败、角色渲染成纯黑块。现在帧宽 192（3840），
  由 `test/kitchen-sheet-size.test.ts` 守住，别再往上加。
- sprite 转圈的斜向 pick 要按实际帧校准：西北/东北容易取到正侧或正背；抽不准就直接用 `direct` 逐张生成，验收时看 8 方向图而不是只看四向。
- 坐姿图如果自带椅子，必须用 `sittingOffsetY` 把椅子脚对齐地面，并在坐着时隐藏独立椅子；表情气泡用 `headPoint` 定位，别用脚底坐标。
- 角色贴图的**不透明底边不一定等于 origin 的脚底线**：`setOrigin(0.5, 400/420)` 把落点钉在画布第 400 行，但跪姿 `zhou_kneel_up` 只画到第 383 行（比落点高 8.5 设计 px），站姿都画到 399。所以脚底阴影不能给所有角色共用一条 `ellipse(x, y+3, 118, 24)`——跪着的周全就是这么悬起来的。金殿现在按贴图 alpha 轮廓查表（`src/scenes/ch01-palace-shadow.ts` + `tools/measure-actor-footprint.py`），换贴图重跑工具、把数抄回表，`test/palace-shadow.test.ts` 会现场解码 PNG 对表。

- **立绘是屏幕层，不是世界层**：`PortraitLayer` 的 image 必须 `setScrollFactor(0)`。金殿/寝室相机固定时
  看不出来，御膳房相机跟随玩家滚动，漏掉就会被滚出画面。截图里「有文字没脸」先查这一行。
- **战斗对话不再是模态卡**：`openBattleTalk` 已删除。第一场教程对话走 `DialoguePlayer` + `buildDialoguePanel`
  + `DialoguePortrait`；只保留「点击继续」，不接跳过/自动/记录（后面还接着真实攻击/出拳，跳过会断节拍）。
  对话期间 `talkVisible` 同时挡住选目标/落点 Zone 的点击。
- **战斗 v3.1 的判定只在 `src/battle/`**：场景 `battle-ch01-scene.ts` 只消费 `BattleEvent`（动画队列），不得自己算伤害/顺序/命中。新增技能/敌人只加 `data/` 数据；新增行为先加 `core/` 纯函数与单测。
- **第一场教程对话（2026-11-24）**：文案/节拍在 `src/story/ch01-first-battle.ts`（进入战斗、首次攻击、首次移动、首次防御四段），场景只消费 beat，不硬编码台词；`enemy-attack`/`punch` 是真动作，其余用底部对话面板（`DialoguePlayer` + `buildDialoguePanel` + `DialoguePortrait`）逐句插入。攻击按钮第一场初始可点一次，教程对话后 `firstBattleAttackLocked` 才灰；脚本攻击临时把周全 dodge 置 0 强制命中，避免「闪避了却喊痛」。**首次移动/首次防御的矿工回手是指定全站位招式**（`miner.quake` 核心脉冲）：11 点位之后玩家一步就能走出近战范围，普通招式会打空、剧本却照旧播「痛」（用户 2026-11-25 实测报的 bug）；现在走 `BattleAction.forceSkillId` + `planScriptedSkillIntent`（不看距离/冷却，招式必须在该敌人 `skills` 里，否则回落正常 AI），别改回让它走 AI 选招。前/后置台词仍按「敌人真出手后」播；进入战斗那一下后**直接切玩家回合**，不要 `startNextTurn` 让 SPD20 矿工连动。护栏 `test/ch01-first-battle-talk.test.ts`。
- **第一场不能赢**：`player.skills=[]` + `script.protocolAfterEnemyActions=4`。改第一场数值时保留「攻击只可点一次（教程对话后灰） / 必然战败 / 战败回寝室」三条，否则剧情断。
- **`battleCh01` 与 `battleKitchen` 两个模块共用同一个场景 key**（`battle-ch01`），资源闭包不同：前者 `battle.ch01`（矿工 8 向 + 金殿舞台），后者 `battle.kitchen`（御膳房舞台 + 依赖 `ch01.kitchen` 取厨子八向）。别把两个包合并，否则第一场会被迫加载 14 MB 御膳房素材。
- **战斗贴图宽度**：解离突刺 12 帧 × 320 = 3840，已接近手机 GPU 4096 上限；矿工八向是 272×400 单张。加帧/加宽前先跑 `test/battle-assets.test.ts`（宽度 <4096）。
- **1200×648 / 360×640 短屏**：`planBattleLayout` 的点位间距会被压到约 114（下限 96 / 上限 172；上下排垂直偏移 = spacing×√3/2，上排给 200 高的御厨留头）；行动表只留一行（rail 64 / fieldTop 192），战场无常规名牌/意图/点位圈，所以短屏只剩角色、行动表 chip、底部 HUD。**常驻无名牌，属性只在小白图鉴；选中目标头顶名字/血条是唯一例外**；不要再加回 `point.y-300` 名牌、全怪 HP 条、方位文字、背袭楔形/朝向三角或静态点位环。
- **点位点击区是圆形，且必须盖住脚下的黄圈（2026-11-25 用户拍板 + 实测返修）**：`slotHitCircle(spacing)`（`src/battle/layout.ts`）给出 `{radius, offsetY}`——半径 `min(84, spacing×0.49)`（直径 ≤ 间距，相邻点位不重叠），圆心**下移**到「整个移动/落点黄圈都在圆内」的位置（黄圈是 `drawSlotRing` 默认椭圆：中心 脚底+4、46×15；用 24 点采样倒推 offset，手机 172→r84/offset40、短屏 114→r55/24、96→r47/22）。**不要把圆心放回脚底正上方、圆底贴脚底**：那样黄圈下半圈点不动，用户实测「点黄圈没反应、要往上点」。圈尺寸跟点击区同源：`slotRingSize(spacing)` 短屏等比收圈（46×15 上限），`drawMoveMarker` 与 `slotHitCircle` 必须用同一套。场景用 `zone.setInteractive(new Phaser.Geom.Circle(r, r, r), Phaser.Geom.Circle.Contains)`；护栏 `test/battle-layout.test.ts` 的 `slotHitCircle` / 黄圈整圈覆盖用例。
- **玩家/怪物一次只能走到相邻点位**：`adjacentSlots()`（`src/battle/core/slots.ts`）是唯一判定；**11 点位四三四**（上 4 / 中 3 / 下 4，共 20 条边）= 邻接由**网格距离 1** 生成，四角只有 2 个邻点（死胡同）、上下排内侧 4 邻、中排两侧 5 邻、中心 6 邻；中心被占时不能进，空出后可以站。除**选目标阶段的黄圈/绿圈/红圈**外，普通移动/落点选择以外不画任何地面圈；解离突刺的非背袭命中进入 `pendingMove`，落点选择画当前点 + 目标相邻空位。
- **行动表必须真的画出来，SPD 量条/意图行不画**：顶部原生 rail 只有「行动表」标题 + **头像 chip**（周/矿/厨，按 actor 对位，直径 44、中心距 52，当前行动者 2px 白描边，双厨用 1/2 徽标）+ 清除协议倒计时；不再画「行动条」、SPD 量条、SPD 文案或每只怪的意图行。顺序刷新仍走 `src/battle/core/rail-transition.ts` 的 `railTransition(prev, next)`（最左滑出渐隐 → 其余整体左移一格 → 末位从右侧 +1 格渐现，190ms；位移 ease-out、alpha 线性铺满全程），同一组 order 不重播、一次跨多格只播一轮，`prefers-reduced-motion` 直接落终态；`railHeight=64`、`fieldTop=192`，由 `BATTLE_RAIL_HEIGHT` 与 `battle-hud.ts` 的 Spacer 同源。不要退化成「接下来：你→它」一行文字，也不要加回意图行。
- **怪物技能攻击动画按技能分条**：每个技能一条**左向** 12 帧 strip（`BATTLE_MINER_ATTACKS` / `BATTLE_COOK_ATTACKS`），右侧三方位由 `playStrike` 的 `flip` 镜像；宽帧（如突刺）在 meta 里写 `originX`，播放时临时改原点，播完恢复 0.5。缺图自动退回程序化 nudge/斩击弧，不能阻断回合。
- **近身攻击冲刺（2026-11-25）**：玩家攻击 / 怪物近身技能（`!event.aoe`）/ 教程出拳，都先沿「攻击者→目标」连线冲到目标身旁（`meleeStrikePoint(from, target, spacing)`：停在目标脚底前 `spacing×40%`，夹 42..68px），再播攻击帧，播完 125ms 回原点位。冲刺**只动 `BattleActor.setPosition`（脚底/影子/深度一起走），不改 `state` 点位、不改朝向判定**；`event.aoe`（核心脉冲/灶台震地）原地砸地不冲；`reduced` 整段取消。
  **周全的解离突刺是唯一例外**：`state.pendingMove` 非空时攻击后**停在目标身旁**（`playerStrikeHold`），等 `post-move` 从冲刺位弧线落到选中点位；选「留在原地」才退回原点位。三个必须保住的接点：①`syncActorPositions()` 在 hold 期间跳过玩家（否则拉回原点）；②`playerAction` 里只有 `action.kind === 'post-move'` 才消费 hold，攻击行动自己的 `playSteps` 回调不许退（2026-11-25 实测踩过：攻击一结束就被自己的回调送回原点）；③`animateMove` 在有 hold 时从 `actor.position` 起步，不要先 `setPosition(from)`。护栏 `test/battle-layout.test.ts` 的 `meleeStrikePoint` 用例；实机取证 `.evidence/scripts/capture-strike-dash-2026-11-25.mjs`（冲刺/停身/落地/敌人回位四段断言 + 截帧 GIF）与 `capture-strike-reduced-2026-11-25.mjs`（reduced 不位移）。
- **敌人不空放/不锁死旧意图（2026-11-24 用户要求）**：意图不上屏；每只怪在自己行动开始时按当前站位重新选目标（`planEnemyIntent`）——目标相邻才出技能，冷却好的 AOE 才能远打；没有可命中目标、没有 AOE、也没有可走一步 → **本动等待**（日志「按住阵脚」），绝不瞄无人点位。`state.intents` 只是计划/调试，不是锁定；旧「玩家移动不改意图、可以看它打空」的规则已废弃。落点选择、AOE、清除协议计数不受影响。
- **怪物没有单独的转向行动**：一次行动只有 `skill`（自由瞄准，执行时免费转身）或 `move`（相邻空位，移动后面朝移动方向；被占则失败、空耗行动）；受击后免费转向攻击来向（`from`）。不要加回 `intent.kind='turn'`。
- **清除协议计数按所有怪物行动数**（技能/移动都算），不是玩家回合数；别改成按玩家回合数，否则玩家可以靠绕背无限拖。
- **全站位技能是内部判定，不再上屏**：核心脉冲/灶台震地命中全部 11 点（不靠朝向/距离）。v3.1 起 HUD **不再**写「全站位」/红环/意图文案；保留怪物砸地、冲击波、伤害数字等技能动画。纯逻辑里它是 `SkillHit: 'all-slots'`，`EnemyIntent.aoe=true`；`test/battle-ai.test.ts` 仍断言内部意图的 `aoe` 标记，但场景不渲染意图。
- **攻击射程 = 相邻点位**：玩家解离突刺是单一目标（目标相邻即命中，不要用 `hitPointsFor` 当锥形 AOE）；怪物技能用 `hitPointsFor(origin, aim, hit)`。伤害是**平减防御**：`max(1, round(atk×power×背袭 − 防御×(背袭?1−穿防:1)))`，防御动作最后 ×0.5；`SkillDef.backstabDefensePierce` 当前解离突刺 0.5。非背袭命中进入 `pendingMove` 落点选择，背袭不进入；不再有自动镜像闪现。
- **多怪是数组**：`state.party[]` / `state.enemies[]`，按 `activeId` 找行动者；行动表/目标/图鉴全部按 id 处理。御膳房双怪、`battle.sandbox.multi` 三怪都走同一套；只杀一只不结束，所有怪 HP 0 才胜利。不画常驻敌人名字/HP；点击敌人 sprite 选目标，选中目标脚下有**闪烁绿圈** + 头顶**名字/血条**，属性只在「小白」图鉴里（未知 `？？？`，命中一次解锁）。
- **选中目标绿圈 + 头顶信息**：独立 `targetRingGraphics` + alpha 脉冲（650ms yoyo；reduced-motion 静态），不要跟移动/落点高亮共用 `highlightGraphics`（后者每次 sync 会 `clear()`，绿圈会被一起清掉）。绿圈画在选中敌人脚下，目标死亡/胜负后隐藏；深度 `LAYERS.markers + 5`。**头顶名字/血条用独立 `targetNameText` + `targetHpBar`，位置取 `BattleActor.headPoint`（名字 `head.y-38`、血条 `head.y-20`，深 `effects+19/20`），只跟随当前选中目标，取消/死亡/胜负隐藏；不要用 `point.y-300` 的旧名牌。** 选目标阶段的黄圈（可选）和红圈（非法闪烁）是临时层，黄圈 `validTargetsGraphics`、红圈 `invalidRingGraphics`，不要与绿圈混用。
- **技能弹窗/图鉴/落点选择**：点攻击先弹 `openBattleSkill`（一个技能也弹；第一场无技能不弹技能窗，点攻击走一次性教程对话、不结算伤害）；选好技能后进入选目标阶段（技能窗不显示目标），**未选到有效目标时顶部红字「请选择攻击目标」；所有可选的相邻存活目标脚下黄圈闪烁，已选中的绿圈不再重复黄圈，选中目标头顶显示名字/血条**；点敌人选中，选目标阶段移动键变「取消」，攻击/防御禁用（未选到相邻目标时攻击禁用），可取消；**点距离不够的非法目标时，不写入 `selectedTargetId`，脚下红圈闪 3 次 + 顶部红字闪不可选理由「距离不够」，随后红圈消失、仍保持未选中**。**选中有效目标后攻击键变暗底红字「确认攻击」，带红色发光脉冲（`reduced` 下只保留静态红色）**，点它发动。目标不再自动预选。未知怪提示不显示预计伤害，已知怪可以显示。落点选择时 `pendingMove` 保持 `activeId=玩家`、gauge 不归零，攻击/防御/换目标禁用，移动键变「留在原地」，只点亮当前点 + 目标相邻空位；与「你的回合」同位置显示红色常驻「请选择移动位置」；`post-move` 后才归零并进入下一动。图鉴走 `src/battle/codex.ts` 的 localStorage `avm.battle.codex.v1`，预览只更新内存不写盘。
- **BGM 进场景必须从头**：每个内容场景 `create()` 的 `bgmManager.enterScene(this)` 会重建该场景 `track` 实例（同曲也从 0），整首 `loop:true` 循环到尾；只有场景内 `play`/`bindScene`/`applySceneBinding` 同曲才 `continue/resume`，`hold` 场景（CG 预览/沙盒）沿用前曲。**战斗场景是开场卡特例：开场卡期间不提前起战斗曲（沿用上一场景 BGM），`intro` 关闭/`skip=1` 后才 `enterScene` 从 0 起战斗曲**。不要退回「同曲跨场景续播」（用户 2026-11-22 明确要求每场景从头到尾循环）；细节见 `docs/AUDIO-BGM.md` §4。
- **十一点位视觉等距**：四三四按**正六边形网格**布置，`planBattleLayout` 的 20 条相邻边共用同一个 `spacing`（96..172，172 由「1.5s ≤ 258」横向预算卡死）；判定直接用 `SLOT_COORDS` 的真实网格坐标算角度（邻点方向相差 60°），**不要再加回「视觉半径 / 逻辑 45° 环」两套角度**：`POINT_VECTORS`/`RING_ANGLES` 已删除，正面 ≤60°、背面 ≥120°、`single-front` ±30°（只命中瞄准点）、`front-arc` <120°。改布局只动 `spacing`，不要手写边表或改阈值去迁就视觉。护栏 `test/battle-layout.test.ts` 逐边比距离 + 容量 11。
- **闪避（2026-11-24）**：`BattleUnit.dodge` 整数，闪避率 `1 - 200/(3x+200)`（100→60%，永不 100%）；成功且目标有相邻空位时移动到空位并免伤，没有空位不掷骰、直接命中；AoE 也可闪。玩家周全 1（约 1.5%），御厨 2（约 2.9%），帮厨/矿工/杂役 0；图鉴/HUD 显示闪避点。纯逻辑 `core/dodge.ts` + `test/battle-dodge.test.ts`。
- **受击血条**：选中目标血条用 `targetHpFill` Rectangle 从旧值 tween 到新值；玩家受击用临时 `playerHpBar/playerHpFill`（950ms 后隐藏）；不要只改文字/瞬时跳变。伤害数字、闪避浮字、目标绿圈/名字/血条同一套事件队列。
- **御膳房战斗背景**：`kitchen_hall.webp` 是**纯地面**（从厨房地图裁地面、镜像铺满、去墙/门/架上墙/砧板），角色不会站在墙上；不要再加墙砖/门/架上墙到战斗舞台。
- **解离突刺的 320 宽已经是上限**：12 帧 × 320 = 3840 < 4096；改 400 宽会到 4800，真机纹理创建失败变黑块。源视频在突刺峰值把光刃推到自己画幅外，成品第 3–10 帧刃尖被右缘裁掉；**不要靠加宽帧解决**，表现层用 `ui/battle-fx.ts` 的 `bladeTrail()` 从手部向目标补光刃（命中帧起 320ms）。矿工八向是 272×400，别为了「凑整 240」把钻井臂压矮——八向会一缩一胀。

- **命名段（2026-11-26）不要用整屏 CG**：这一段的主角是寝室里一只 43px 的小精灵，
  第一版做了整屏命名 CG（换掉了房间/光照/角色比例），用户当场回滚。现在全部是 in-scene 原生层
  （`src/ui/naming-fx.ts`：canvas 径向渐变雾团 + Georgia 数学符号环 + 光晕，27 个对象），镜头一格不动。
  三拍 `fx: 'naming' | 'naming-collapse' | 'naming-settle'` 都是**表现型**：跳过不补播，但
  `finishDialogue()` / `clearDialoguePanel()` / SHUTDOWN 必须 `namingFx?.destroy()`。
  `phase=prep` 是命名完的自由活动，**不进存档**（`FREE_ROAM_PHASES` 只认 explore）：
  玩家要自己走到小白身边开口（`flow.finishPrep()`）才会出结束卡。

## 6. 提交

- 提交信息用 `feat/fix/docs/chore(scope): ...`。
- 一次提交只做一件事；不要混入素材重生成与代码重构。
- 涉及视觉的改动附截图：**文档实际引用的成品图**放 `docs/images/`（跟 md 一起入库）；
  调试/取证截图一律放 `.evidence/docs/screenshots/`（`.evidence/` 已 gitignore，不入库，也不要在文档里当链接提交）。
  仓库里只留游戏素材与文档，验证截图不是素材。
