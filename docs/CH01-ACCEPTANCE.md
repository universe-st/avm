# 第一章第一节《寝室》验收记录

- 日期：2026-10-25
- 范围：开幕之后的第一章第一节——寝室单房间探索、小白登场、首次梦域、1v1 剧情战（必败）、战后征召、结束卡。
- 文案真值：`src/story/ch01-dorm.ts`
- 流程真值：`src/story/ch01-flow.ts`
- 地图：`src/map/rooms/ch01-dorm.ts`（11×15，单房间，无地毯）
- 战斗：`src/battle/data/ch01-first.ts`、`src/battle/core/scripted-battle.ts`

## 1. 构建与自动检查

| 项 | 结果 |
| --- | --- |
| `pnpm typecheck` | 通过 |
| `pnpm test` | 通过，115 tests / 13 files |
| `pnpm assets:check` | 通过，41 key / 41 url，无重复、无缺失、无未引用警告 |
| `pnpm build` | 通过；JS 1,767.33 kB / gzip 486.71 kB |
| `pnpm android:debug` | 本次未跑（按 AGENTS 默认不启动 Android 模拟器） |

新增单测：

- `dialogue-player`：逐字、补全、推进、最后确认、空行、Unicode。
- `ch01-flow`：手机在郑卿之前只提示、郑卿→手机→梦→战斗、战败返回、预览 phase、可选交互。
- `map-room`：11×15 行宽、唯一出生点、家具碰撞、交互点可达、BFS。
- `map-collision`：撞墙、滑墙、拐角不切、中央地板可走。
- `scripted-battle`：每次攻击恰好 1 伤害、防御减半、2³ 种行动序列全部战败、清除协议、无胜利分支。
- `render-layers`：原生层顺序、角色脚底排序、UI_ROOT_DEPTH 高于所有原生层、chapter key 分组与 bundle 登记一致。

## 2. 正常流程验收（Web，390×844）

1. 标题 → 开始游戏 → 开幕第一句；点右上角「跳过」。
2. 进入第一章第一节：章节卡 → 寝室 → 目标「叫醒郑卿」。
3. 移动：WASD/摇杆；撞床/柜/墙被挡；在床、柜、桌、窗、风扇、门附近出现 `[E]` 提示。
4. 郑卿：12 句对话；逐字，**点屏幕任意位置**补全/推进（面板上没有按钮；右上角「跳过」按钮区除外，点它不会误推进）；右上角「跳过」直接结束整段对话；结束后目标变「找到手机」。
   - 面板固定 300 高、字号 34；**一句放得下 5 行 × 约 14 字 ≈ 68 字**，超出由 `DialoguePlayer` 按标点分页，点一下翻下一页（页内先补全再翻页）。
5. 手机：小白登场（白色兜帽精灵），说明沉睡症/因泰里；目标变「听听这个外星小东西怎么说」。
6. 「视觉确认」→ 白闪 → 梦域金殿战斗。
7. 战斗：
   - 敌方 HP 120；每次攻击显示「1」，120→119→118→117。
   - 敌方每次 30 伤害；第 3 回合玩家 HP 0，出现「剧情战 · 战败」。
   - 「醒来」→ 寝室，目标「听小白说完」，小白解释 30/40/150 天与征召。
8. 结束卡：第一节 · 寝室 / 第一章《天子》未完待续；「重看本节」「返回标题」。
9. 返回键：弹「返回标题？」确认；取消可继续。

## 3. 舞台预览

```text
/?stage=scene.ch01.dorm&phase=opening|explore|after|complete&hud=0
/?stage=scene.ch01.dorm&phase=explore&debug=1&hud=0
/?stage=battle.ch01.first&phase=opening|mid|defeat&hud=0
```

- `phase=explore` 跳过章节卡与开场对话，直接自由探索。
- `phase=after` 从战后征召对话开始；`phase=complete` 直接结束卡。
- `battle.ch01.first&phase=defeat` 直接显示剧情战败覆盖层；预览显示「重开战斗 / 返回标题」。
- 未知 phase 回退 opening 并 `console.warn`，不白屏。
- 预览模式不写存档/进度；同 seed 同画面（seed 只影响金殿尘埃/光点）。

## 4. 视口与截图

| 图 | 说明 |
| --- | --- |
| [寝室 390×844](screenshots/ch01-dorm-390x844.png) | 探索、目标条、摇杆、交互按钮 |
| [对话 390×844](screenshots/ch01-dialogue-390x844.png) | 逐字对话、说话人、继续 |
| [CG 390×844](screenshots/ch01-cg-phone-390x844.png) | 手机白光 CG；UI 在 CG 之上 |
| [行走 390×844](screenshots/ch01-walk-390x844.png) | 行走中段；上身与静态图同宽 |
| [八方向](screenshots/ch01-directions-8.png) | 四个斜向改为 direct 逐张生成 |
| [正北返工前后](screenshots/ch01-q-up-orientation-fix.png) | `back` 截帧 16→18、行走视频按「正背面锁定」重出；见 `ASSET-CREDITS.md` 11.3.3 |
| [朝上站立 390×844](screenshots/ch01-q-up-ingame-390x844.png) | 实机正背面：两肩对称、头部左右露耳一致 |
| [角色 90% 缩放](screenshots/ch01-q-player-scale-90.png) | `spriteScale 0.682 → 0.6138`、`headOffset 258 → 232`；对比图左 0.682 / 右 0.6138 |
| [开局坐姿](screenshots/ch01-sitting-390x844.png) | 周全坐在书桌前；先放呼噜声、不播 BGM |
| [心情气泡](screenshots/ch01-emotion-390x844.png) | 表情气泡在头顶，然后才开始打字 |
| [战斗 390×844](screenshots/ch01-battle-390x844.png) | 金殿背景、矿工、HP、攻击/防御 |
| [战败 390×844](screenshots/ch01-battle-defeat-390x844.png) | 剧情战败覆盖层（必败） |
| [结束卡 390×844](screenshots/ch01-end-390x844.png) | 第一节完、重看/返回 |
| [寝室 1200×648](screenshots/ch01-dorm-1200x648.png) | 横屏居留边 |
| [战斗 1200×648](screenshots/ch01-battle-1200x648.png) | 横屏战败覆盖层 |

- 390×844 与 1200×648 均检查：目标/按钮不重叠、对话不溢出、房间完整可见。
- 控制台 0 error / 0 warning。
- `prefers-reduced-motion`：关闭白闪/震屏/漂浮；流程仍完整（首版通过代码路径检查，未做逐帧截图）。

## 5. 素材与版权

工作流：**先人物设定图，再以图为参考生成**。

| 用途 | 来源/job |
| --- | --- |
| 人物设定图（参考母图） | 游戏素材大师 image `imvn2twfx8d7622` |
| 角色精灵图（小白/矿工/郑卿） | image `imvn30dkgd7657a`，`tools/process-ch01-generated-sprites.py` |
| 周全八方向 + 行走帧 | sprite 项目 `pmvn34v6h8e2773`（四向转圈 + 四向行走视频；四个斜向 direct 逐张生成），`tools/process-ch01-walk.py` |
| 寝室零部件 | image `imvn3eto3c810f8` |
| 郑卿睡床 | image `imvn5fa2s10b830` |
| 书桌椅 | image `imvn72wgy6c2e22` |
| 周全坐椅 | image `imvn78fup9f20e6` |
| 呼噜声 | sfx `fmvn72wj9687b04` |
| 寝室地图 | `assets-src/map/ch01/dorm-map/map-final.png` → `img.map.ch01.dorm_q` |
| 手机白光 CG | image `imvn5folx3e4307` |
| 醒来 CG | image `imvn5gis58f0193` |
| 小白登场 CG（预览） | image `imvn5g41n4c67a2` |
| 梦域金殿背景 | image `imvn39ore9b726f` |
| 寝室日常 BGM | music `amvn5h2bh14c4b7`（《午后小憩》） |
| 梦域/音效 | `tools/make-ch01-audio.py` 程序化占位 |

- 寝室 2026-10-25 重做：50×54 俯视整图（`img.map.ch01.dorm_q`），四张单人床、中央书桌、北窗、南门；郑卿睡在左上床（4 帧呼吸动画）。
- 资源按 `map / character / cg / battle / ui` 分层，深度契约见 [RENDER-LAYERS.md](RENDER-LAYERS.md)。
- 设定图与全部生成记录见 [ASSET-CREDITS.md](ASSET-CREDITS.md) §11。
- 整张寝室绘制方向（`imvn3apqi71ea70` / `imvn3c1487e6cbd`）已废弃。

## 6. 已知限制

1. 本节无存档；刷新页面或返回标题后从头开始，「继续游戏」仍置灰。
2. 第一场战斗是 1v1 剧情战，不是完整回合制；无技能/EP/背刺/核心/队伍。
3. 寝室是单房间；门、巡逻、视线、潜行、善变、小地图未接入。2026-10-31 起第二节《御膳房》P1 白盒已实现，预览地址 `?stage=scene.ch01.kitchen&phase=explore`；正式流程/存档/美术仍待接入，并**删除「锚点」说法**，见 [`DESIGN-CH01-EXPLORE.md`](DESIGN-CH01-EXPLORE.md)。
4. 对话正文是 Phaser/Compose 文本，暂未接 DOM a11y 镜像。
5. 寝室日常 BGM 已换成校园日常《午后小憩》；梦域/音效仍是程序化占位，后续用 music/sfx 模块重做。
6. 周全行走使用四向行走 sheet（front/back/left/right，各 8 帧）；上半身取静态图、下半身取行走帧，并用并集 bbox 归一化，避免变瘦。四个斜向行走尚未接入地图。
7. 坐姿是单张图，不是可动画的坐姿骨骼；站起来时切回站立图。
8. 像素素材在非整数 DPR 下可能被画布缩放；已用 NEAREST + 2× 资源，首版接受。
9. Android 真机/模拟器未跑（按默认约定）。

## 7. 2026-10-29 修订（出生点 / 新手引导 / 郑卿段落）

本节记录对第一节的增量修改；上面的 2026-10-25 流程记录仍是当时验收状态。

| 项 | 结果 |
| --- | --- |
| `pnpm typecheck` | 通过 |
| `pnpm test` | 通过，137 tests / 16 files |
| `pnpm assets:check` | 通过，66 key / 66 url，无重复、无缺失 |
| 浏览器 | 390×844 与 1200×648 各走一遍，控制台 0 error |

改动：

1. **出生点**：`[14,12]`、朝下，位于书桌下方靠左侧床的一侧；`ascii` 的 `P` 同步移动，地图单测改为断言新坐标。
2. **新手引导**：首次进入探索（`phase=explore` 或开场对白结束）在画面中部弹出「新手指引」，说明摇杆/方向键与 `E`/「交互」；玩家第一次推动方向即收起，不再弹出。不会挡住主角与郑卿。
3. **郑卿交互点**：判定点从床尾 `[25,26]` 移到枕头左侧床沿 `[21,13]`，半径 150；玩家沿左侧过道走到头边即可触发，`[E] 叫醒郑卿` 提示与表情气泡都跟着落到头侧。
4. **摇醒剧情**：补 4 句（抓肩猛摇 → 软面条 → 呼噜不乱 → 嘴角带笑），带一次镜头震动与郑卿「笑」表情气泡。
5. **沉睡症新闻回忆**：删掉「校门口小报标题」旁白，改为 `周全：怎么回事？难道说……` → 黑白新闻 CG（家里的电视 + 男女主持）→ 4 句新闻播报 → 画面暗下、回到寝室。旁白明确写成「脑海里闪出画面 / 几天前」，这是周全的**回忆**，不是寝室里正在播放；回忆结束后 BGM 不切回日常，**维持《危机来临》** 直到进入梦域。新增 `img.cg.ch01.news`、`audio.bgm.ch01_crisis`，并登记 `cg.ch01.news` 舞台。
6. **跳过时的 BGM**：回忆段点「跳过」也保持《危机来临》，不切回日常；只有进入梦域战斗才由战斗场景换成《清除协议》。
7. **分页修正**：`paginateText` 不再把句尾标点单独剩成一页（例如 69 字 / 上限 68 时不再出现只有「。」的第二页）。
8. **旁白表现**：说话人不再显示「旁白」二字；正文用天蓝色 `#87ceeb`；整段旁白统一用第二人称「你」指代周全（不再出现「周全扑到床边」这种第三人称写法）。
9. **逐字声线**：旁白 / 周全 / 郑卿 / 小白各一条专属 blip（音高、波形、衰减不同），其他角色用 `type_blip_1/2` 两条轮换；映射在 `src/audio/type-voice.ts`，有单测。

截图：

- `docs/screenshots/ch01-tutorial-spawn-390x844.png`（出生点 + 新手指引）
- `docs/screenshots/ch01-tutorial-dismissed.png`（首次移动后指引收起）
- `docs/screenshots/ch01-tutorial-1200x648.png`（1200×648 视口）
- `docs/screenshots/zheng-approach.png`（郑卿头侧的 `[E]` 提示）
- `docs/screenshots/zheng-shake.png`、`zheng-smile.png`（摇醒 + 笑气泡）
- `docs/screenshots/ch01-news-cg.png`、`ch01-news-male.png`、`ch01-news-female2.png`、`ch01-news-back.png`（黑白新闻回忆、回到寝室）
- `docs/screenshots/ch01-crisis-explore.png`（回忆结束后自由探索，BGM 仍是《危机来临》）
- `docs/screenshots/ch01-narration-skyblue.png`（旁白：无说话人、天蓝色、第二人称）
- `docs/screenshots/ch01-speech-normal.png`、`ch01-xiaobai-voice.png`、`ch01-anchor-generic-voice.png`（周全 / 小白 / 配角普通文字与声线）
- `docs/screenshots/ch01-narration-1200x648.png`（1200×648 下的旁白排版）
- `docs/screenshots/cg-ch01-news-stage.png`（`?stage=cg.ch01.news`）

## 8. 2026-10-31 全面优化（界面 / 美术 / 特效 / 剧情）

本节记录「不新增章节、不改战斗数值」的一次横向打磨。前面的流程记录仍是当时的验收状态。

### 8.1 自动化

| 项 | 结果 |
| --- | --- |
| `pnpm typecheck` | 通过 |
| `pnpm test` | 通过，171 tests / 20 files |
| `pnpm assets:check` | 通过，118 key / 118 url；`assets:pass` 通过（可走格 509 / 1782） |
| `pnpm build` | 通过；JS 1,862.18 kB / gzip 513.81 kB（优化前 1,767.33 kB / 486.71 kB） |

新增单测：`progress`（解析/写入/预览不写/继续映射）、`settings`（旧存档兼容、速度倍率、自动播放停留）、`speaker-tone`（旁白/小白/矿工/默认）、`dialogue-history`（环形缓冲）、`ch01-flow`（恢复探索/结束卡、dream 空节点直达战斗）、`dialogue-player`（`typeMs=0` 立即显示）。

### 8.2 界面与系统

1. **HUD 统一**：新增 `src/ui/hud-kit.ts`，寝室/金殿/战斗共用顶部信息条与 672×300 对话面板；旁白按语义色显示（天蓝），说话人按角色分色（周全纸白、郑卿鎏金、小白淡青、矿工朱红），多页显示 `1/2`，右下提示「继续 / 补全 / 点击继续」；长句在标点处折行，避免第二行只剩句号。
2. **对话记录**：最近 80 句，顶栏「记录」打开分页弹窗（每页 8 句），打开时暂停自动播放。
3. **自动播放 / 文字速度 / 减弱动效**：设置面板新增三项；`instant` 整句立即显示但仍分页；自动播放按字数计算停留；减动效强制关闭位移/抖动/速度线，保留信息层。
4. **单章节检查点**：`avm.progress.v1`，检查点为 `dorm.explore / dorm.palace / dorm.after / ch01.complete`；标题「继续游戏」亮起并显示「上次：…」；预览模式一律不写盘；「重看本节」把检查点退回寝室探索。
5. **结束卡 / 战斗开场**：结束卡改成章节卡（金线 + 第一章 / 第一节 / 第二节待续）；战斗开场改成「矿场清除协议」终端卡；「返回标题」文案改为「进度已记在继续游戏」。

### 8.3 剧情与节奏

1. **删除重复演出**：`CH01_NODES.dream` 的 8 句金殿台词清空，只负责把流程推到战斗；金殿细节由 `PALACE_BEATS` 独占。小白那句「建议：先活下来。」挪进金殿收尾。
2. 白光只闪一次（寝室末句不再 `fx:flash`，金殿首拍负责白场）。
3. 金殿旁白改用统一语义色；`dream` 空节点不再闪一帧空白对话面板。

### 8.4 画面与特效

1. **寝室图重组**：`tools/compose-dorm-map.py` 按 `map-manifest.json` 重组，叠加北窗光楔/光池、床桌接触阴影、墙裙与砖缝脏迹、暖冷色温、泛光/暗角/颗粒；新增地毯（可走）与两处行李箱（`map-manifest.blockers` 同步封掉 10 格碰撞）。
2. **金殿图增强**：`tools/enhance-palace-map.py` 叠加窗棂斜光柱、香炉烟/浮尘、地面反光、金红色温与暗角。
3. **战斗舞台**：`tools/compose-battle-plate.py` 产出 720×1280 专用图（聚光锥、前景台阶虚化、暗角），战斗不再直接截宫殿地图；矿工/周全按 2× 整数倍放大，血条贴角色头顶，敌方加核心脉动与待机呼吸。
4. **舞台框**：`src/ui/stage-frame.ts` 把寝室/金殿上下留白做成墨色底板 + 鎏金细线 + 颗粒 + 暗角。
5. **视频填充与转场**：`src/ui/video-surface.ts` 用「前景 contain + 背景同源模糊 cover」填掉开场/手机 CG 的上下黑边，保留跳过按钮与声音开关；开场结束抓当前帧缩到 48×104 再 pixelated 放大，做成像素化定格溶解，解释「写实视频 → 像素游戏内」的画风切换。
6. **特效**：`src/ui/fx-kit.ts`（暗角/光柱/浮尘/余烬/接触阴影/冲击环/火星/碎片/LED/抖屏）接入寝室、金殿与战斗；全部遵守 reduced 与单特效 ≤40 对象。
7. **接触阴影**：玩家、金殿五名角色、战斗双方都有脚底阴影。

### 8.5 音频

- 寝室探索循环《蝉鸣/操场/吊扇》环境音（`audio.sfx.ch01_ambience_day`，音量 0.22），离开寝室/结束卡/场景关闭时停掉。
- 木地板脚步 A/B 交替（每约 34 设计像素一步），带轻微音高差。
- 章节卡/结束卡钟声（G5/C6/G6 程序化钟音，`tools/make-ch01-chime.py`，零计费）。
- 音效由「游戏素材大师」生成：`fmvvqbjri7f80b1`（环境音 30s）、`fmvvqbjrr997b54`（脚步 2.5s，ffmpeg 裁到 0.5s 并做 A/B 变调）。

### 8.6 截图与已知限制

| 图 | 说明 |
| --- | --- |
| [标题 390](screenshots/opt-title-390.png) | 继续游戏可用 + 上次检查点 |
| [寝室 390](screenshots/opt-dorm-390.png) | 重组后的窗光/地毯/行李箱/接触阴影 |
| [对话 390](screenshots/opt-dialogue-390.png) | 统一 HUD、天蓝旁白、记录/自动 |
| [金殿 390](screenshots/opt-palace-390.png) | 窗棂光柱、角色接触阴影 |
| [战斗 390](screenshots/opt-battle-390.png) | 战斗舞台图、贴头血条、核心脉动 |
| [战败 390](screenshots/opt-defeat-390.png) | 清除协议 · 战败 |
| [结束卡 390](screenshots/opt-endcard-390.png) | 章节卡式结束页 |
| [标题 1200](screenshots/opt-title-1200.png) / [寝室 1200](screenshots/opt-dorm-1200.png) / [战斗 1200](screenshots/opt-battle-1200.png) | 横屏居留边 |

已知限制：

1. 寝室图为静态烘焙光照；以后上昼夜/动态光需要重新拆层。
2. 下排两张床的床图素材比上排小约 6%，本次未统一（统一会改动现图床体尺寸）。
3. 战斗舞台图为 9:16（720×1280），20:9 手机上会由 `addCoverImage` 裁两侧。
4. 视频填充需要两层同源解码，低端 Android 若掉帧，手机 CG 可改回 `layout:'contain'`。
5. 对话记录用分页而非滚动（避免 ScrollView 在短生命周期弹窗里的焦点风险）。
6. 仍无多槽存档；检查点只记「第一章走到哪一段」，不含战斗内状态。

## 7. P1 白盒：第一章第二节《御膳房》

- 预览：`?stage=scene.ch01.kitchen&phase=explore`（`phase=intro|explore|gate|hide|haystack|done|fail`；`debug=1` 画巡逻/躲藏/触发区；`spot=kitchen|backstab|hay|gate` 为验收定位）
- 自动检查：`pnpm check` 通过，24 files / 192 tests；`assets:check` 509 / 1782 可走格一致。
- 已验：32×64 连续灰盒地图、玩家 120°/7.5 格视锥 + 1.5 格环境光、三层 tile 迷雾、3 条巡逻 + 教学御厨 + 门卫、警戒 `?/!`、背后偷袭、屏风躲藏、双人进门、失败卡/重开、草堆偷袭老肯、善变染色、P1 结束卡。
- 未验/待接：完整第四/五幕、正式进度/「继续游戏」、美术/音频、Android 包。

| 图 | 说明 |
| --- | --- |
| [视锥/迷雾 390](screenshots/ch01-kitchen-fov-390.png) | 玩家面朝方向的扇形可见区，未探索区全黑、记忆区压暗 |
| [背后偷袭 390](screenshots/ch01-kitchen-backstab-390.png) | 教学御厨背后的 `[J] 偷袭` 与右下高亮按钮 |
| [草堆偷袭 390](screenshots/ch01-kitchen-haystack-390.png) | 善变前：藏在干草堆，老肯贴脸搜索，`[J] 偷袭` 就绪 |
| [结束卡 390](screenshots/ch01-kitchen-end-390.png) | P1 第三幕到此；第四/五幕待接入 |
| [失败重开 390](screenshots/ch01-kitchen-fail-390.png) | 被巡逻抓住 → 「再进去」回检查点 |
| [门口躲藏 390](screenshots/ch01-kitchen-hide-390.png) | 第二幕门开，老麦/老肯/门卫进门，玩家躲屏风 |
| [横屏 1200](screenshots/ch01-kitchen-fov-1200.png) | 1200×648 竖屏居留边（HUD 压在中部，横屏不是目标形态） |
