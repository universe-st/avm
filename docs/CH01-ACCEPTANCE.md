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
4. 郑卿：12 句对话；逐字，点「继续」补全/推进；结束后目标变「找到手机」。
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
3. 寝室是单房间；门、巡逻、视线、潜行、善变、锚点、小地图未接入。
4. 对话正文是 Phaser/Compose 文本，暂未接 DOM a11y 镜像。
5. 寝室日常 BGM 已换成校园日常《午后小憩》；梦域/音效仍是程序化占位，后续用 music/sfx 模块重做。
6. 周全行走使用四向行走 sheet（front/back/left/right，各 8 帧）；上半身取静态图、下半身取行走帧，并用并集 bbox 归一化，避免变瘦。四个斜向行走尚未接入地图。
7. 坐姿是单张图，不是可动画的坐姿骨骼；站起来时切回站立图。
8. 像素素材在非整数 DPR 下可能被画布缩放；已用 NEAREST + 2× 资源，首版接受。
9. Android 真机/模拟器未跑（按默认约定）。
