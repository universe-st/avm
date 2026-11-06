# BGM 绑定与续播

> 目的：**每个内容场景的音乐都由显式声明决定**（曲子 / 静音 / 明确沿用），不允许「没登记就悄悄继承上一首」；
> 同一首跨场景不重播；运行时能改绑。

## 1. 三层职责

| 文件 | 职责 | 依赖 |
| --- | --- | --- |
| `src/audio/bgm-tracks.ts` | 曲目表、场景绑定表、三态解析（`resolveSceneTrack`）、改绑表合成（`withSceneBinding`） | 无（纯数据，可 Node 单测） |
| `src/audio/bgm-plan.ts` | 绑定 → 播放器动作（`start` / `continue` / `resume` / `silence` / `hold`）的纯判定 | 无（可 Node 单测） |
| `src/audio/bgm-manager.ts` | 执行：建实例、交叉淡化、续播、音量记账、运行时改绑、解锁补播 | Phaser |

场景只做两件事：`create()` 里 `bgmManager.enterScene(this)`；剧情/阶段切曲用 `bgmManager.play(id)`（cue）或 `bgmManager.applySceneBinding()`（回到场景绑定）。

## 2. 绑定三态

```ts
type SceneBinding =
  | { kind: 'track'; id: BgmId }  // 这个场景有自己的曲子，切过去
  | { kind: 'silence' }           // 明确静音：当前曲目淡出
  | { kind: 'hold' };             // 明确沿用当前曲目，不打断
```

写绑定表用 `sceneTrack('ch01Dorm')` / `SCENE_SILENT` / `SCENE_HOLD`。

- 绑定表类型是 `Record<ContentSceneKey, SceneBinding>`：往 `CONTENT_SCENE_KEYS` 加场景却忘了登记，`pnpm typecheck` 直接报错。
- `test/bgm.test.ts` 再兜一层：`missingSceneBindings()` 必须为空、表里不能有内容场景之外的多余 key、每个 `track` 的音频 key 必须真的在 **该场景 requires 闭包** 里（防止「表里登记了、场景没加载」的静音 bug）。

## 3. 当前绑定表

| 场景 key | 绑定 | 理由 |
| --- | --- | --- |
| `title` | 《潜入》`title` | 标题曲 |
| `prologue` | 《星夜梦境》`prologue` | 开幕剧情曲 |
| `placeholder` | 静音 | 资源门禁占位页，明确收尾 |
| `ch01-opening` | 沿用（hold） | 开场 CG 自带同轨环境声，且可能在标题页单点预览；沿用当前曲目，正常流程里是开幕曲的尾巴 |
| `ch01-dorm` | 《午后小憩》`ch01Dorm` | 寝室日常 |
| `ch01-kitchen` | 《危机来临》`ch01Crisis` | 潜入戏的冷脉冲底子（`P2-KITCHEN-ASSETS.md`：复用现有曲目，不新增整首 BGM） |
| `ch01-palace` | 《清除协议》`ch01Dream` | 金殿过场就是梦域本体；随后进战斗是同一首，实例/进度连续 |
| `battle-ch01` | 《清除协议》`ch01Dream` | 剧情战 |
| `cg-stage` | 沿用（hold） | 调试用 CG 查看器，不要打断当前曲目 |
| `battle-sandbox` | 沿用（hold） | 调试用战斗沙盒 |

### 3.1 寝室开场的特例

寝室「睡觉戏」要求**只有呼噜声、不播 BGM**（`CH01-ACCEPTANCE.md` 的截图口径），但 `dorm.explore / dorm.after / ch01.complete` 三个检查点又要求进场景立刻有寝室曲。
所以寝室 `create()` 传入口 cue：

```ts
bgmManager.enterScene(this, this.isOpening() ? SCENE_SILENT : undefined);
```

入口 cue 只覆盖**这一次**进入，不写改绑表；进探索时 `startExploreAudio()` 调 `applySceneBinding()` 回到表里的曲子。
**常规跨场景的音乐差异一律改 `SCENE_BGM`，不要滥用入口 cue。**

## 4. 同曲续播规则

判据只有一条：**当前曲目 id 与目标绑定相同、且声音实例还在** → 复用同一实例。

| 当前状态 | 绑定 | 动作 | 实例 |
| --- | --- | --- | --- |
| 正在播 X | X | `continue`（只补一次音量收敛） | 不变，进度连续 |
| 被暂停的 X（切后台 `pauseAll`） | X | `resume()` | 不变，从暂停点继续 |
| 实例已丢的 X | X | `start` | 新建（进度本来就没了） |
| 正在播 X | Y | `start` | 新建 Y，X 淡出销毁 |
| 任意 | 静音 / 沿用 | `silence` / `hold` | — |

这覆盖了「A 场景淡入/切场景 → B 场景同曲」：`enterScene` 先 `attach` 新场景，把随旧场景 shutdown 一起失效的 tween 记账删掉，再把当前音量收敛到目标值；
淡出中的旧曲目如果宿主场景没了，会立刻 stop + destroy，不会卡在半音量继续循环。

## 5. 运行时改绑

```ts
import { bgmManager } from '../audio/bgm-manager';
import { sceneTrack } from '../audio/bgm-tracks';

// 某检查点之后寝室换曲：改的是「绑定」，不只是当前这一首
bgmManager.bindScene(SCENE_KEYS.ch01Dorm, sceneTrack('ch01Crisis'));

// 显式改回表里的默认值
bgmManager.clearSceneBinding(SCENE_KEYS.ch01Dorm);
```

- 改绑**立刻生效**（改的就是当前场景时直接切曲），并一直保留到 `clearSceneBinding()`；后续每次进入该场景都按改绑后的值解析。
- 只影响被改的场景；别的场景仍走 `SCENE_BGM`。
- 解析是纯函数：`resolveSceneTrack(sceneKey, overrides)` / `withSceneBinding(overrides, key, binding | null)`，可在 Node 单测。
- **剧情 cue 不要用改绑**：对话 `bgm` 字段、场景内的阶段切曲仍然用 `bgmManager.play(id)`；它只切当前曲目，不写表，所以不会把剧情切曲「打回默认值」。
- 场景内换阶段、需要回到绑定曲（例如寝室睡觉戏结束进探索）用 `bgmManager.applySceneBinding()`，不要在场景里写死曲目 id，否则会把运行时改绑盖掉。

## 6. 资源：BGM 必须在场景的 requires 闭包里

音频 key 只是登记在 bundle 里还不够——切换场景后 `AssetService.releaseExcept()` 会释放不属于目标场景的资源，
`BgmManager.play()` 发现 `cache.audio` 不存在时只会 `console.warn` 并静音（不阻断流程），表现出来就是「场景没音乐」。

第一章三首曲子在共享包 **`ch01.bgm`**（`audio.bgm.ch01_dorm` / `ch01_crisis` / `ch01_dream`，约 3.3 MB）：

- `ch.01`、`battle.ch01` 通过 `dependsOn` 依赖它；
- `ch01Kitchen` / `ch01Palace` 的 `MODULES.requires` 和舞台目录的 `requires` 都显式带上它；
- 单测会遍历所有模块/舞台，断言「绑定的曲子在 requires 闭包里」。

新增一首 BGM：

1. `public/assets/audio/bgm/*.mp3` 放文件；
2. `bundles.ts` 的某个 bundle 加 `AssetDef`（`kind:'audio'`，建议 `required:false`）；
3. `bgm-tracks.ts` 的 `BGM_TRACKS` 加曲目；
4. `SCENE_BGM` 给场景写绑定；
5. 确认该场景的 `requires` 闭包含这首曲子；
6. `pnpm assets:scan && pnpm check`。

## 7. 新增内容场景的登记清单

- [ ] `src/app/scene-keys.ts` 的 `SCENE_KEYS` + `CONTENT_SCENE_KEYS`
- [ ] `SCENE_BGM` 写显式绑定（曲子 / `SCENE_SILENT` / `SCENE_HOLD`），漏了 typecheck 就红
- [ ] 场景 `create()` 里 `bgmManager.enterScene(this)`
- [ ] `modules.ts` / `stage-catalog.ts` 的 `requires` 带上绑定曲所在的 bundle
- [ ] `pnpm check`（含 `test/bgm.test.ts` 的完整性/requires 闭包断言）
- [ ] 实机看 `window.__avmBgm.snapshot()`

## 8. 调试与验收

DEV 构建暴露只读后门（`src/main.ts`）：

```js
__avmBgm.snapshot()
// { sceneKey, currentId, instanceId, isPlaying, isPaused, volume,
//   positionMs, durationMs, binding }

__avmBgm.instanceId()   // 同一首跨场景续播时不变（区分「续播」与「重播」）
__avmBgm.positionMs()   // 播放进度；同曲跨场景后应继续增长，而不是回到 0
__avmBgm.bindingOf('ch01-dorm')  // 某场景当前生效的绑定（含改绑）
```

验收口径：标题 →「继续游戏」进任一检查点后，`currentId` 必须是该场景的曲目、`audio.bgm.title` 不能再响；
同曲跨场景（如金殿 → 剧情战）`instanceId` 不变且 `positionMs` 连续。
