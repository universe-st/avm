# 资源规范与场景作用域

> 目的：每个场景只持有自己需要的资源；进入新场景前一定经过加载页；离开后自动回收。
> 后续资源会越来越多，**禁止把资源当成全局常驻**。

## 1. 唯一真值

资源清单只有一个地方：`src/assets/bundles.ts`。

```ts
interface AssetDef {
  key: string;          // 全局唯一，Phaser cache key
  kind: 'image' | 'audio' | 'json';
  url: string;          // 相对站点根，如 assets/img/title/title_bg.webp
  weight?: number;      // 可选，缺省按 catalog 字节/1KB
  required?: boolean;   // 默认 true；false 时失败只降级
  label?: string;       // 加载页显示名
}
```

- 改资源先改 `bundles.ts`，再跑 `pnpm assets:scan`（更新字节数）与 `pnpm assets:check`。
- key 命名：`img.<bundle>.<name>` / `audio.bgm.<name>` / `audio.sfx.<name>` / `font.<name>`。
- 文件路径：`public/assets/{img,audio,font,data}/<bundle>/<name>[@2x].<ext>`。
- `BundleDef.persistent: true` 只给真正的全局资源（`core` / `ui`）。章节、剧情、战斗包**不要**标常驻。

## 2. 当前 bundle 表

| bundle | 内容 | 预算 | 常驻 | 加载点 |
| --- | --- | --- | --- | --- |
| `core` | 基础纹理（白像素）、按钮点击音、逐字提示音（通用 ×3 + 角色声线 ×4）、播放控制图标 ×2 | 2 MB | ✅ | 冷启动（之后每批自动带上） |
| `ui` | 设置弹窗/通用 UI（本期为空，用主题绘制） | 1 MB | ✅ | 冷启动（之后每批自动带上） |
| `title` | 标题主视觉、徽记、标题 BGM | 6 MB | — | 进入标题 |
| `ch.00` | 序章占位背景 | 2 MB | — | 进入占位页 |
| `cutscene.prologue` | 开幕剧情 5 张配图 + 开幕曲《星夜梦境》 | 6 MB | — | 点击开始 / 进入开幕 |
| `cutscene.ch01opening` | 开场动画 `ch01-opening.mp4`（720×1280、12.8s、带同轨声音） | 5 MB | — | 开幕结束 / 跳过 → 进开场动画 |
| `cutscene.ch01phone` | 手机 CG `ch01-phone.mp4`（720×1280、20.2s、三镜、带同轨声音） | 6 MB | — | 进入寝室时随场景加载；「查看手机」时全屏播放 |
| `cutscene.ch01palace` | 梦域金殿地图 `hall.png`（1056×1728）+ 14 张殿上角色图（200×420）+ 4 张半身立绘（720×900：郑卿 / 楚公公 / 小白 / 周全慌张） | 8 MB | — | 金殿过场 `scene.ch01.palace`（战斗 v2 用自己的 `battle.ch01` 舞台图，不再复用殿图） |
| `cutscene.ch01palace.walk` | 郑卿 / 楚公公 八方向行走 sheet（各 8 张 × 16 帧 × 200×420，WebP） | 12 MB | `cutscene.ch01palace` | 只在金殿过场加载；走位时播帧，停下回静态图 |
| `cutscene.ch01palace.sfx` | 金殿音效 14 条（环境/脚步/跪地/裂皮/心跳…，mp3 24kHz 单声道，共约 300 KB） | 1 MB | `cutscene.ch01palace` | 过场音效；缺失时静默跳过，不阻断 |
| `ch.01` | 33×54 寝室整图（重组窗光版）、郑卿睡床 4 帧、周全 Q 版八向/行走、小白/郑卿、沉睡症新闻 CG、呼噜/拳击/手机 SFX、寝室环境音与木地板脚步 A/B；`img.char.ch01.zhou_sit_right`（坐地朝右正式图 160×400）+ `img.char.ch01.zhou_stand_up`（起身 8 帧 × 160×400 横排）+ `img.char.ch01.zhou_idle_right`（正侧面站立 idle 160×400，t39 入库、暂未接场景）；依赖 `ch01.bgm`（寝室曲 + 回忆 cue） | 12 MB | — | 进入第一章 |
| `ch01.bgm` | 第一章共享 BGM 五首：《午后小憩》`ch01_dorm`（寝室）、《危机来临》`ch01_crisis`（回忆/御膳房）、《清除协议》`ch01_dream`（裂皮之后/金殿过场）、《小皇帝的早朝》`ch01_palace`（金殿过场前半）、《刺王杀驾》`ch01_battle`（两场战斗，**完整 180s 版**），约 8.2 MB | 10 MB | — | `ch.01` / `battle.ch01` / `battle.kitchen` 依赖它；`ch01Kitchen` / `ch01Palace` 显式 requires |
| `battle.common` | 战斗 v3.1 公共：周全起手式/格挡/解离突刺 12 帧横排（320×400）、行动表头像 `head_zhou`（128×128）、图鉴按钮 `head_xiaobai`（96×96，复用第一章小白图）、打击/背袭/格挡/闪现 SFX；依赖 `ui` | 4 MB | — | 两场战斗共用（周全是两场都上场的角色，头像放公共包，避免同一 key 在两个包重复登记；小白图鉴按钮也两场共用） |
| `battle.ch01` | 金殿战斗舞台 `miner_hall.webp`、矿工战斗八向（272×400 × 8）、矿工三技能左向 12 帧（272/336×400）、行动条头像 `head_miner`（128×128）、旧单面兜底、矿工技能/协议/胜利 SFX；依赖 `battle.common` + `ch01.bgm` | 6 MB | — | 金殿剧情战 |
| `battle.kitchen` | 御膳房战斗舞台 `kitchen_hall.webp`（720×1280，本地从 `kitchen.webp` 合成）、御厨三技能左向 10 帧（400×400 → 4000×400）、行动表头像 `head_cook`（128×128）、依赖 `battle.common` + `ch01.kitchen`（御厨八向）+ `ch01.bgm` | 1.5 MB | — | 御膳房双怪遭遇战；第二只帮厨复用同一套厨子八向/头像/技能帧，不新增 key |

后续：`ch.NN`（单章 ≤ 8 MB）、`battle.<id>`（≤ 5 MB）、`cutscene.<id>`（单段 ≤ 8 MB）。
章节包不得互相依赖；公共资源上移到 `ui` / `battle.common`。

第一章资源说明：

- `ch.01` 的寝室改用 33×54 俯视整图 `dorm_q.png`（1056×1728，32px/格，按 720 宽显示），配套郑卿睡床 4 帧与 Q 版周全 160×400 帧（场景缩放 **0.6138** = 原 0.682 × 0.9，`headOffset` 232；按需求在 2026-10-29 整体缩到 90%）;旧 `dorm_room.png` 仅留作历史资源。
- 周全四向静态图/行走 sheet 由游戏素材大师 sprite 模块生成；小白/矿工/郑卿由参考设定图的精灵图裁切。
- Q 版行走 sheet 为 **20 帧 × 160×400（3200×400，WebP q92 约 200–400KB/张）**，由 `tools/make-ch01-q-walk20.py` 从「游戏素材大师」sprite 项目 `pmvnrpn64691ee5` 的 8 段行走视频**按步态周期重新抽帧**（不再插值）：每方向先找首尾最闭合的周期窗口（23–30 帧），再均匀取 20 帧，并按静态图统一缩放、脚底对齐；播放 65ms/帧。改帧数时要同步 `CH01_Q_WALK_FRAME_COUNT` 与场景构造 `walkFrameCount`；改尺寸/格式要同步 `bundles.ts` 的 url。
- 重出某一方向时用技能脚本（与上面同一套规则，外加镜头拉远校正与接缝重挑）：`make-static-sprite.py --only <dir>` → `make-walk-sheet.py --dir-map "<源目录>=<dir>"`。静态帧的固定基准是**角色高 371 / 底边 394 / 水平中心 80**（160×400），八向必须一致，行走帧以静态图为对齐基准。
- 资源路径/key 按 `map / character / cg / battle / ui` 分组，key 统一从 `src/assets/keys.ts` 取，详见 `docs/RENDER-LAYERS.md`。当前 `ch.01` 共 40 个文件。
- 2026-10-29 新增：沉睡症新闻回忆 CG `img.cg.ch01.news`（1080×1920 黑白 WebP，257 KB）与回忆 BGM `audio.bgm.ch01_crisis`（84s，1.34 MB）。Q 版 8 向 20 帧行走 sheet 占约 3.2 MB，章节包实际约 10.2 MB；`budgetKB` 已按实际登记为 12 MB，后续压缩行走帧时再回收。
- BGM/SFX 标 `required:false`：音频失败只静音，不阻断剧情。
- 2026-11-21（黑场收尾趴姿）：`ch.01` 新增 `img.char.ch01.zhou_prone` → `assets/img/character/ch01/zhou_prone.png`
  （250×400 RGBA，人物横躺 225×100、底边 392、水平中心 125；人物长度≈站立高 228，所以画布比站立宽）。
  由游戏素材大师 `image` 模块生成（job `imwpx1zuvb80bfe`，带 `zhou_idle_right` / `zhou_sit_right` 参考图）后抠像 + 去绿边 + 等比缩放合成；见 `docs/ASSET-CREDITS.md` §14。
- 2026-11-21（战斗系统 v2 素材）：
  - `battle.common`：`img.char.battle.zhou_idle_right.png`（160×400，图高 371 / 底边 394 / 中心 80）、
    `zhou_guard_right.png`（同基准）、`zhou_attack_right.webp`（**12 × 320×400 = 3840×400**，< 4096；
    突刺有横向位移，160 宽会裁掉刀锋/前脚）；`audio.sfx.battle_{slash,hit,backstab,guard,blink}.mp3`。
  - `battle.ch01`：`img.char.battle.miner_{down,up,left,right,down_left,down_right,up_left,up_right}.png`
    （各 **272×400**，图高 371 / 底边 394 / 中心 136；272 是为了钻井臂不被裁矮，八向同一基准）；
    `img.battle.ch01.miner_hall.webp`（沿用）；`audio.sfx.battle_{turn,sweep,quake,protocol,victory}.mp3`。
  - `battle.kitchen`：`img.battle.ch01.kitchen_hall.webp`（720×1280，109.5 KB；由 `tools/compose-kitchen-battle-plate.py`
    从 `kitchen.webp` 裁传膳廊区域 + 聚光/暗角，纯 Pillow、确定性）；御厨八向来自 `ch01.kitchen` 的 `cook_*`；
    御厨三技能左向 10 帧 `img.char.battle.cook_attack_{sweep,oil,quake}`（400×400，4000×400 < 4096）。
  - 怪物技能帧：`battle.ch01` 的 `img.char.battle.miner_attack_{sweep,thrust,quake}`（12 帧，272/336/272×400），
    `battle.kitchen` 的 `img.char.battle.cook_attack_{sweep,oil,quake}`（10 帧，400×400）；都只做**左向**，
    右侧三方位运行时 `flipX` 镜像，帧元数据在 `BATTLE_MINER_ATTACKS` / `BATTLE_COOK_ATTACKS`。
  - 2026-11-22（战斗 v3.1 小白图鉴）：`battle.common` 新增 `img.char.battle.head_xiaobai`（96×96 RGBA），URL 为 `assets/img/character/battle/heads/xiaobai.png`；它是 `assets/img/character/ch01/xiaobai.png` 的**逐字节副本**（避免同一 URL 在两个 key 重复登记被 `assets:check` 拒绝），不算新增美术。`head_xiaobai` 只用作底部 HUD「小白」按钮图标，图鉴窗文字由场景传入。
  - 2026-11-22（战斗 v3 双怪）：御膳房新增的「帮厨·幻影」**不新增任何资源 key**——复用 `battle.kitchen` 的 `head_cook`、`ch01.kitchen` 的厨子八向与 `cook_attack_{sweep,oil,quake}` 技能帧；行动表 chip 用 1/2 数字徽标区分（场上已不再显示名牌）。
  - 2026-11-22（行动条头像 chip）：`battle.common` 新增 `img.char.battle.head_zhou`，`battle.ch01` 新增
    `img.char.battle.head_miner`，`battle.kitchen` 新增 `img.char.battle.head_cook`；三张都是 **128×128 RGBA**
    （内容 116px + 四周 6px 透明边，圆形裁切已预裁进 PNG），由 `tools/make-battle-heads.py` 从现有正面全身图派生：
    `head_zhou` ← `assets/img/character/ch01/q/zhou_q_down.png`（Q 版头部约 107px；非 Q 版 `zhou_down.png` 仅 64×96，放大必糊）、
    `head_miner` ← `assets/img/character/battle/miner/miner_down.png`、`head_cook` ← `assets/img/character/ch01/kitchen/cook/cook_down.png`。
    裁切规则：alpha bbox 定人物头顶/身高 → 取人物高 40% 的方形（水平以头部 alpha 带中心对齐）→ 116px + 6px 边。
    游戏里按 44px 圆形显示（中心距 52px），LINEAR 采样；缺图时场景回退为「周/矿/厨」字母 chip。
  - `ch01.bgm`：`audio.bgm.ch01_battle.mp3`（《刺王杀驾》，**180.01s 完整版**，128kbps 立体声，-15.8 LUFS；整曲循环，不裁剪）。
- 2026-11-21（战后黑场胁迫段音效）：`ch.01` 新增 4 条 `required:false` 音效 →
  `assets/audio/sfx/ch01_dark_pressure.mp3`（10.55s 无缝循环，127 KB）、
  `ch01_dark_grip.mp3`（1.41s，18 KB）、`ch01_dark_release.mp3`（1.91s，24 KB）、
  `ch01_dark_heartbeat.mp3`（1.25s，由金殿心跳裁出的「一组两记」，16 KB）。
  前三条由游戏素材大师生成（Seed-Audio），原始 take 95% 能量在 120Hz 以下、手机外放等于没声音，
  后期各叠了一层 200–4kHz 的中频（见 `docs/ASSET-CREDITS.md` §4.2）；全部 24kHz 单声道 96kbps。
  接入：`src/ui/dark-pressure.ts`（压迫底噪 loop / 攥紧 / 释压 / 心跳）。
- 2026-11-15（t61 表情气泡音效）：`ch.01` 新增 `audio.sfx.ch01_bubble_pop` → `assets/audio/sfx/ch01_bubble_pop.mp3`（200ms、4.2 KB、峰值 -5.7 dBFS，`required:false`）。头顶气泡冒出时由 `EmotionBubble.show()` 走 `audioDirector.playSfxAt(key, { volume: 0.18, rate })` 播一记；120ms 节流，六情绪靠固定 rate 微变。音量 t68 按 t67 运行时 tap 复测下调（pop 有效峰值 −22.5 dBFS，比旁白 blip 低 6.1dB）。来源/后期见 `docs/ASSET-CREDITS.md` §4.1。
- 2026-11-06（t23 寝室入梦/起身表演白盒）：新增占位 key `img.char.ch01.zhou_sit_right`，url 先指向现有 `zhou_sit.png`（正式「坐地朝右」素材出来只改 url）；寝室模块 `ch01Dorm` 预载 `cutscene.ch01palace.sfx`（约 300 KB）作为白光/坐下/起身的占位音效，避免表演中途静音。
- 2026-11-07（t29 寝室演出重排）：新增占位 key `img.char.ch01.zhou_stand_up`（起身帧序列，url 先指向 `zhou_sit.png`）。正式素材约定：横排 strip **8 帧 × 160×400 = 1280×400**、透明背景、脚底 y≈394、65ms/帧；到位后只改 `bundles.ts` 的 url（`kind` 仍是 image，场景按 frameWidth 自动切帧）。坐姿显示缩放由 `sittingScaleFor(贴图源图高)` 按贴图换算，不再写死 `ZHOU_SIT_SCALE`。
- 2026-11-07（t28 坐地朝右 + 起身序列）：`img.char.ch01.zhou_sit_right` 换成正式图 `zhou_sit_right.png`（160×400，人物高 160 / 底边 394 / 水平中心 80，**按 scale 1.0 显示**，约 51 KB）；新增 `img.char.ch01.zhou_stand_up`（8 帧横排 1280×400 WebP q92，约 67 KB，65ms/帧，**同样 scale 1.0**，末帧高 228 = 站立帧 371×0.6138）。两份都由 `tools/make-zhou-sit-standup.py` 产出，帧元数据在 `CH01_ZHOU_STAND_UP` / `CH01_ZHOU_SIT_RIGHT`（`src/assets/keys.ts`）与 `assets-src/character/ch01/standup-manifest.json`；`test/ch01-sit-standup.test.ts` 守住宽度 < 4096、帧数、单调递增与头宽波动。旧的 `zhou_sit.png`（坐椅子 96×160）只留作 `resolveSittingKey()` 的第二级回退，不再上屏。
- 2026-11-07（合并 t28 ↔ t29 的缩放口径）：t29 的 `sittingScaleFor` 假设「正式坐姿图人物占满 400 高」，实际 t28 素材是**160 高人物 + 400 高画布**（留白只为脚底 y≈394 与站立帧对齐），按 `160/400=0.4` 显示会把人缩成 64px。现在场景对 `zhou_sit_right` / `zhou_stand_up` 直接取 `CH01_ZHOU_SIT_RIGHT.displayScale` / `CH01_ZHOU_STAND_UP.displayScale`（均 1.0），其余回退贴图仍走 `sittingScaleFor(源图高)`。
- 2026-11-07（t33 起身帧序列落地）：`wakeUp` 的起身步骤从 tween 缩放改成 `kind: 'frame-sequence'`（8 帧 × 65ms = 520ms，`Linear`；reduced 260ms 等比例减半）。帧号由纯函数 `standUpFrameAt(elapsedMs, frameCount=8, durationMs=520)` 决定，播完切回站立静态图；素材不可用时直接落回静态图，不再做「缩小的站立图」tween。新增 `CH01_ZHOU_STAND_FRAME`（站立 Q 帧 160×400 / 人物高 371 / 底边 394 / scale 0.6138），与 `CH01_ZHOU_SIT_RIGHT`、`CH01_ZHOU_STAND_UP` 共用底边 394，`test/ch01-sit-standup.test.ts` 守住三者对齐与屏显高 160 → 228。
- 2026-11-07（t39 侧面站立 idle）：新增 `img.char.ch01.zhou_idle_right` → `zhou_idle_right.png`（160×400，人物高 371 / 底边 394 / 水平中心 80，约 51 KB，正侧面朝右，与 `CH01_ZHOU_STAND_FRAME` 同一套画布基准、同一个 `displayScale` 0.6138）。存在理由：起身末帧是正侧面，`q/zhou_q_right.png` 是 3/4 朝镜头，切过去要 110ms 交叉淡入伪装转身；这张接在起身末帧后面不用转身。实测与起身末帧（归一到 371 高）头顶/肩高/脚底差均为 0、头宽 −3、剪影 IoU 0.882；基线在 `assets-src/character/ch01/idle-right-manifest.json`，`test/ch01-idle-right.test.ts` 守住包围盒。
- 2026-11-07（t41 起身接侧面 idle）：寝室 `wakeUp` 的起身序列末帧不再切 3/4 面的 `q.right`，直接硬切到 `zhou_idle_right`（朝向一致，`STANDUP_TO_IDLE_FADE_MS = 0`，原来 110ms 的「转身」交叉淡入删除；上限 `STANDUP_TO_IDLE_FADE_MAX_MS = 40`，真机若闪 1 帧才允许极短融合）。姿态由 `PlayerPose.sideIdle` 表达，贴图归属链抽成纯函数 `planPlayerTexture()`（坐姿 > 行走 > 侧面 idle > 站立）；只在「起身后、玩家还没动」生效，一迈步/转向就回八向逻辑。`test/ch01-standup-idle.test.ts` 锁场景接线与过渡层兜底销毁。
- 2026-11-17（t53 金殿补两张半身立绘）：`cutscene.ch01palace` 新增 `img.char.palace.portrait_xiaobai`（小白，517 KB）与 `img.char.palace.portrait_zhou_panic`（周全被按跪慌张，756 KB），都是 **720×900 RGBA 透明底**，与 `portrait_zheng` / `portrait_chu` 同一套画风与构图口径（`src/ui/portrait-metrics.ts` 按 720:900 算显示尺寸 = 屏高 15.8% × 18.4% 宽）。两张由 `tools/make-palace-portrait.py` 从「游戏素材大师」抠像输出裁成（左右各留 ≥24px 透明边，避免贴屏幕右侧时露出直切边）。`cutscene.ch01palace` 实测约 7.1 MB，`budgetKB` 由 6144 调到 8192。来源/任务/后期见 `docs/ASSET-CREDITS.md` §11.15。
- 2026-11-18（t54 金殿侍卫立绘）：`cutscene.ch01palace` 新增 `img.char.palace.portrait_shiwei` → `assets/img/character/palace/portrait_shiwei.png`（720×900 RGBA 透明底、820 KB，内容 696×812、左右各留 12px）。剧本「侍卫：是！」开口前 `portrait`（左侧）、说完 `portraitHide`。由 `tools/make-palace-portrait.py --margin-x 12` 从「游戏素材大师」抠像输出裁成；抠像必须 `bgTolerance 0`（深蓝袍子会被空间分割吃掉）。`cutscene.ch01palace` 实测约 7.9 MB，`budgetKB` 由 8192 调到 9216。来源/任务/后期见 `docs/ASSET-CREDITS.md` §11.16。
- 2026-11-18（t55 金殿矿工立绘）：`cutscene.ch01palace` 新增 `img.char.palace.portrait_miner` → `assets/img/character/palace/portrait_miner.png`（720×900 RGBA 透明底、936 KB，内容 696×826、左右各留 12px），以 `miner.png` 为身份基准。台词「入侵单元确认！执行矿场清除协议！」由 `PALACE_SPEAKER_PORTRAIT` 对位表自动上脸（左侧），不再留空。`cutscene.ch01palace` 实测约 8.9 MB，`budgetKB` 由 9216 调到 10240。来源/任务/后期见 `docs/ASSET-CREDITS.md` §11.17。

## 3. 场景资源作用域（核心机制）

实现位置：

| 文件 | 职责 |
| --- | --- |
| `src/assets/bundles.ts` | `expandBundleIds()` 依赖闭包、`persistentBundleIds()` 常驻包、`collectAssets()` 扁平资源 |
| `src/resource/scope.ts` | `planRelease()` 纯函数：算「切场景后该删哪些 bundle/资源 key」 |
| `src/resource/asset-service.ts` | 串行加载、已加载账本、`releaseExcept()` 真正删除纹理/音频/JSON |
| `src/resource/scene-resources.ts` | 场景门禁 `loadSceneResources()` + 目标场景 `create` 后回收 |
| `src/app/director.ts` | `enterModule()`：加载 → 切场景 → 回收 |
| `src/dev/stage-runner.ts` | 舞台预览走同一套门禁与回收 |

### 3.1 生命周期

```
enterModule(from, module)
  ├─ loadSceneResources(module.requires, { show:'always' })
  │    └─ AssetService.ensure(requires + 依赖闭包 + 常驻包)
  │         └─ LoaderScene 立即显示；加载完成后至少停留 520ms
  ├─ releaseSceneResourcesAfterCreate(target, module.requires)
  │    └─ 监听目标场景 CREATE（此时旧场景已 shutdown、GameObject 已销毁）
  ├─ from.scene.start(module.sceneKey, data)
  └─ 目标场景 CREATE 后 setTimeout(0)
       └─ AssetService.releaseExcept(module.requires)
            ├─ planRelease()：保留 requires 闭包 + 常驻包
            ├─ 删除非常驻 bundle 的 texture（先删引用该纹理的动画）
            └─ 删除非常驻 bundle 的 audio / json cache
```

为什么回收要等目标场景 `create`：

- 旧场景的 `SHUTDOWN` 早于新场景 `CREATE`；在 `CREATE` 里再让出一帧，旧 GameObject 已全部销毁，新场景的 `create()` 也已引用完自己的纹理；
- 新场景需要的 bundle 仍在 keep 闭包里，不会被误删；
- 正在播放的 Sound 实例在 Phaser 内部持有 `audioBuffer`，删 cache 不会打断 BGM 交叉淡化。

### 3.2 依赖闭包与常驻包

- `requires: ['battle.ch01']` 自动包含 `battle.common`、`ch01.bgm`、`ui`、`core`；御膳房战斗走 `['battle.kitchen']`，闭包里带 `ch01.kitchen`。两个战斗模块共用场景 key `battle-ch01`，但资源闭包不同，别合并。
- `core` / `ui` 标 `persistent: true`：每个加载批次自动带上，切场景时永不释放。
- 两个 bundle 共享同一个资源 key 时，只要还有一个 bundle 保留，该 key 就不删（`planRelease` 已处理）。
- 运行时用 Canvas 生成的 UI 纹理（`__avm.scrim.*`、`__avm.cine.vignette` 等）是引擎级装饰，按设计常驻，不进入 bundle 账本；它们不含文件资源，体积极小。

### 3.3 禁止跨场景预取

**不要在场景里预取下一个场景的 bundle。** 预取会让「点击开始」时缓存命中，加载页一闪而过甚至完全不出现，既违背「每次进入新场景都有加载页」，也让内存里常驻了玩家可能永远不会去的资源。所有跨场景资源都在门禁里加载。

### 3.4 验收/调试

浏览器控制台：

```js
__AVM__.assets.bundles()  // 当前排队的 bundle（含依赖闭包）
__AVM__.assets.keys()     // 当前 cache 里真实存在的资源 key
```

切换场景前后对比即可确认：进入寝室后只剩 `core/ui/ch.01/ch01.bgm`（以及 `ch01.char`），回到标题后章节包与共享 BGM 包都已释放。

舞台预览不新增一套资源表：`scene.<id>` / `battle.<id>` 的 `requires` 必须与 `GameModule.requires` 或战斗模块声明一致；`cg.<id>` 的帧 key 必须在 `requires` 的依赖闭包里。`stage-catalog` 单测会校验。预览启动同样走 `loadSceneResources()` 与 `releaseSceneResourcesAfterCreate()`。

## 4. 进度契约

UI 只认 `LoadState`（`src/assets/types.ts`）：

```ts
{
  phase: 'idle' | 'loading' | 'ready' | 'error',
  progress: 0..1,        // 按权重、批次内单调递增
  currentKey, currentLabel,
  loaded, total,         // 文件计数
  bytesLoaded, bytesTotal,
  startedAt, show, holdMs, error
}
```

- **进度 = Σ已完成权重 / Σ总权重**；不用 Phaser 的 `load.progress`（文件计数）。
- 权重 = `bytes / 1024`，钳制 [1, 4096]；BGM 与 1×1 图标不会同权。
- `total = 0` 时进度视为 1（资源全在缓存）；仍然会先发一次 `loading` 再发 `ready`，让 `show:'always'` 能亮起加载页。
- 同一批次内进度只增不减；失败重试不回退。
- 必填资源失败 → `phase = 'error'` 并 reject；可选资源失败 → 继续并记为降级。
- `holdMs` 由调用方指定：场景门禁默认 520ms，舞台预览显式 420ms。

## 5. 加载页策略

| 场景 | 行为 |
| --- | --- |
| 冷启动 | 进入标题前显示；加载 `core + ui + title` |
| 任意场景切换 | **总是显示**；`show:'always'`，同步亮起遮罩，最短 520ms，淡出 200ms |
| 缓存全命中 | 仍然显示 520ms，作为场景转场，不闪进目标画面 |
| 舞台预览 | 总是显示，最短 420ms |
| 取消显示 | 只有未来明确的资源预热才允许 `show:'never'`；当前无调用方 |
| 失败 | 立即显示错误文案，不自动隐藏 |

加载页是常驻的 `LoaderScene`，用 Phaser 原生 Rectangle/Graphics/Text 绘制，**不依赖任何待加载资源**；否则「加载字体/图集才能显示加载条」会变成死锁。

## 6. 硬规则

1. 场景 `create()` 里禁止 `this.load`；新增资源必须登记 bundle。
2. 进入任何内容场景前必须走 `enterModule()` / `launchStage()`；禁止绕过门禁直接 `scene.start()`。
3. 每个 `GameModule.requires` 必须覆盖该场景用到的所有资源 key；新增场景先补 `requires` 再写视图。
4. 只有 `core` / `ui` 允许 `persistent: true`；章节/剧情/战斗资源一律随场景回收。
5. 禁止跨场景预取（`prefetch` 已移除）；加载页必须真实反映本次进入所需的资源。
6. 资源回收只由 `AssetService.releaseExcept()` 负责；场景/UI 不要手工 `textures.remove()` 或 `cache.audio.remove()`。
7. 回收后重新进入同一场景必须能重新加载；新场景的 `create()` 不能假设上一个场景的资源还在。
8. 加载页三档保留：`always`（内容场景）、`auto`（预留）、`never`（预留）；内容场景只准用 `always`。
9. 防闪烁：`always` 同步显示、最短 520ms、完成后再停留 120ms 才淡出；`auto` 延迟 120ms。
10. 同一时刻只跑一个加载批次；`ensure()` / `releaseExcept()` 共用一条队列。
11. 弱网/省流量：加载页照常显示；不做静默预取。
12. 必填资源失败必须阻断并可重试；可选资源必须有占位。
13. 舞台预览与正常进入共用同一套门禁与回收；预览同样禁止 `this.load`。

> 以后若要接入「下一章空闲预取」，必须先改掉 `releaseExcept` 的淘汰口径，并在文档里重新定义加载页何时显示；不要偷偷恢复 `prefetch()`。

## 7. 失败与降级

- 单文件失败：Phaser 的 `loaderror` 记录 key；批次继续。
- 批次完成时：`requiredFailures()` 非空 → `error` + reject（加载页显示错误，不自动隐藏）。
- 可选失败：保留占位（目前是空纹理/静音），下次 `ensure` 仍会重试。
- 断网恢复：监听 `online` 后重新 `ensure` 即可（M1 在错误页提供按钮）。

## 8. 命名与格式

| 类别 | 规范 |
| --- | --- |
| 图像 | 2× 设计；WebP（含 alpha）优先，PNG 回退；单边 ≤ 2048；小图打图集，留 1px extrude + 2px padding。全屏过场图用 1080×1920（1.5× 设计）优先保证显存；标题主视觉 1440×2560 是已存在的例外 |
| 音频 | BGM 60–120s 可循环，-16 LUFS；SFX ≤ 2s；MP3 128k（BGM）/96k（SFX）。≤ 50ms 的连续触发音（逐字提示音）用 22.05kHz / 16bit 单声道 WAV，避免 MP3 编码前导静音拖拍 |
| 字体 | WOFF2 子集；首屏前 `document.fonts.ready` 等待 |
| 数据 | JSON UTF-8 无 BOM |
| 体积 | 清单与 catalog 记录 bytes/hash/mtime |

## 9. 新资源接入清单

- [ ] `bundles.ts` 新增 AssetDef（key 唯一）
- [ ] 文件放到 `public/assets/...`
- [ ] `pnpm assets:scan`
- [ ] `pnpm assets:check`
- [ ] 目标场景的 `GameModule.requires` / 舞台条目的 `requires` 覆盖新 key（依赖闭包自动展开，不用手写依赖）
- [ ] 场景通过 `enterModule` 进入，不直接 `this.load`
- [ ] 如果需要新场景：同步登记 `scene-keys.ts`、`main.ts`、`stage-catalog.ts`
- [ ] 预算未超；可选资源标了 `required: false`
- [ ] 在 `ASSET-CREDITS.md` 登记来源
- [ ] 验收：`__AVM__.assets.bundles()` 在进入/离开场景后符合预期
