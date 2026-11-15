# 对话 cue 契约：状态型 / 表现型，以及「跳过」契约

> 状态：v1.0（2026-11-15，修完「叫醒郑卿」跳过丢 BGM 后落笔）
> 唯一分类真值：`src/story/dialogue.ts` 的 `DIALOGUE_CUE_KINDS`
> 回归护栏：`test/dorm-stateful-cues.test.ts`
> 对应硬规则：`AGENTS.md` §2 第 17 条

## 0. 一句话

**「跳过」只跳过玩家没看见的东西，不跳过世界该发生的变化。**
判断标准只有一句：**这行没被看见，世界还该不该变？** 该变 → **状态型**，由节点/阶段收尾的幂等归约给出；
只有看见才有意义 → **表现型**，跳过时**不得**补播。

---

## 1. 事故复盘：跳过「叫醒郑卿」后 BGM 不切

**现象**：寝室探索走到床边按 `E` 打开「叫醒郑卿」，立刻点右上角「跳过」，BGM 仍是日常曲 `ch01Dorm`；
一句句点完则切到《危机来临》`ch01Crisis`（DEV 构建里 `window.__avmBgm.snapshot().currentId` 可直接看）。

**根因**：`bgm: 'ch01Crisis'` 写在新闻回忆那一行台词上（`src/story/ch01-dorm.ts`），
而切曲只发生在 `Ch01DormScene.applyLineCue()` 里——**它是「这一行被显示出来」的回调**。
`skipDialogue()` 的路径是：

```
skipDialogue() → finishDialogue() → flow.nodeCompleted() → handleEvents()
```

`DialoguePlayer` 的 line 事件根本没派发到那一行，`applyLineCue()` 自然没执行，于是「这行改的状态」跟着一起丢了。

**为什么不能「在 `skipDialogue()` 里补一首曲子」**：跳过点是任意的（第 0 行、第 3 行、倒数第二行），
写死某首曲子等于给每个节点复制一份剧本；同一段对话里若有多行改状态，还会跟自然过完的结果不一致。
状态型 cue 必须是**数据归约**出来的，不是手写的。

**修复后的对照**（同一条收尾路径）：

| 操作 | BGM 结果 |
| --- | --- |
| 打开对话立刻「跳过」 | `ch01Crisis`（新起实例） |
| 自然一句句过完 | `ch01Crisis`（与改动前一致） |
| 危机曲已经起来后再「跳过」 | 同一实例续播，不重播 |
| 「战后征召」跳过（该节点没有 `bgm`） | 不额外切曲 |

---

## 2. 分类表：谁是状态型，谁是表现型

`src/story/dialogue.ts` 的分类表（**唯一真值**，文档不另维护第二份）：

```ts
export const DIALOGUE_CUE_KINDS = {
  bgm: 'stateful',
  cg: 'expressive',
  fx: 'expressive',
  emotion: 'expressive',
} as const satisfies Readonly<Record<DialogueCueKey, 'stateful' | 'expressive'>>;
```

| cue 字段 | 类别 | 生效时机 | 跳过时 | 典型用法 |
| --- | --- | --- | --- | --- |
| `bgm` | **状态型** | 行显示时立即生效；**收尾时补算被跨过的行** | **补**（必须生效） | 新闻回忆开场切《危机来临》 |
| 未来的目标/检查点（`objective` / `checkpoint`） | **状态型** | 同上，进 `DialogueStateCues` 字段 | **补** | 对话结束时目标从「叫醒郑卿」变「找到手机」 |
| `cg` | 表现型 | 行显示时切全屏 CG | **不补**（否则跳过会闪一张图） | `cg.ch01.news` 黑白新闻画面 |
| `fx` | 表现型 | 行显示时镜头闪白/抖动/故障 | 不补 | 摇醒时的镜头震动 |
| `emotion` / `emotionBy` | 表现型 | 行显示时冒表情气泡 | 不补 | 郑卿「笑」的头顶气泡 |
| 镜头推拉（不是行字段，属过场表演） | 表现型 | 表演时间线自己驱动 | 不补 | `worldRoot` 缩放（见 `AGENTS.md` §2 第 15 条） |

**怎么自检**：把该 cue 删掉后问「玩家跳过这段，游戏状态会不会卡住/错乱？」会 → 状态型；只是少看一眼 → 表现型。
落地到代码：新增字段后在 `DIALOGUE_CUE_KINDS` 里表态，`satisfies` 会逼你二选一。

**边界例子**：新闻回忆那一行**同时**带 `cg: 'cg.ch01.news'` 和 `bgm: 'ch01Crisis'`。
归约只取 `bgm`，`stateCuesOfLine()` 返回 `{ bgm: 'ch01Crisis' }`——所以跳过时会切曲，但不会补播那张新闻 CG
（这正是 `test/dorm-stateful-cues.test.ts` 里「新闻回忆那一行同时带 cg 和 bgm」那条反向断言守的东西）。

---

## 3. 机制：分类是编译期约束，不是注释

| 符号 | 作用 |
| --- | --- |
| `DialogueCueKey` | 行 cue key 的联合类型：`cg` / `fx` / `bgm` / `emotion` |
| `DIALOGUE_CUE_KINDS` | 分类表；`satisfies` 强制每个 key 都表态，**漏分类编译失败** |
| `DialogueCueKind` / `StatefulCueKey` / `ExpressiveCueKey` | 从分类表推出来的类型，不手写第二份 |
| `cueKeysOfKind(kind)` | 按类别取 key 列表，供测试/工具使用 |
| `DialogueStateCues` | 状态型 cue 的归约结果；以后加 `objective`/`checkpoint` 往这里加字段 |
| `EMPTY_STATE_CUES` | 空状态常量（冻结对象，避免每行新建） |
| `stateCuesOfLine(line)` | 单行的状态型 cue；只有 `bgm` 时返回 `{ bgm }`，否则 `EMPTY_STATE_CUES` |
| `mergeStateCues(base, next)` | 后者覆盖前者（同一状态多行设置，以更靠后的为准） |
| `reduceStateCues(lines, fromIndex = 0)` | 从 `fromIndex`（含）归约到末尾；越界/`NaN` 安全，纯函数、**幂等** |

**怎么自检**：`grep -n "DIALOGUE_CUE_KINDS" src/story/dialogue.ts` 看新字段是否在表里；
`pnpm typecheck` 不报错就说明分类表是完整的（漏一个 key 会直接编译失败）。

---

## 4. 跳过契约：场景该怎么接线

任何「带台词的节点」都按下面四步接线，`src/scenes/ch01-dorm-scene.ts` 是参考实现：

### 4.1 记下完整台词 + 游标

```ts
private dialogueLines: readonly DialogueLine[] = [];
private stateCueCursor = 0;   // 第一条「状态型 cue 还没生效」的行索引
```

`startDialogue()` 里 `this.dialogueLines = lines; this.stateCueCursor = 0;`。
理由：跳过时玩家从没看过后面的行，但必须知道它们改了什么，所以要留着数据，而不是只留当前行。

### 4.2 显示一行：先状态型，后表现型

`handleDialogueEvents()` 的 line 分支：

```ts
this.applyStateCueAt(event.index, event.line);  // 状态型：应用本行 cue 并推进游标
this.applyLineCue(event.line);                  // 表现型：cg / fx / emotion
```

`applyStateCueAt(index, line)` = `applyStateCues(stateCuesOfLine(line))` + `stateCueCursor = max(cursor, index + 1)`。

### 4.3 收尾：`finishDialogue()` 首行补状态型 cue

```ts
private finishDialogue(): void {
  this.cancelAutoAdvance();
  this.flushStateCues();          // ① 先补状态型 cue
  ...
  const next = this.flow.nodeCompleted();  // ② 再推进节点
  this.handleEvents(next);                 // ③ 节点完成事件可以再切曲，以后者为准
}
```

`flushStateCues()` = `reduceStateCues(this.dialogueLines, this.stateCueCursor)` → 应用 → 游标推到末尾、清空 `dialogueLines`。
所以：

- **跳过与自然过完走同一条收尾**（`skipDialogue()` 只做 `cancelAutoAdvance()` + `finishDialogue()`，别的什么都不做）；
- **幂等**：自然过完时游标已在末尾，归约结果为空，`flushStateCues()` 是空操作；重复调用 `finishDialogue()` 也不会补第二遍；
- **不重复播**：`applyStateCues()` 遇到 `bgmManager.currentBgmId === cues.bgm && bgmManager.currentSound?.isPlaying` 直接返回。

### 4.4 表现型 cue 留在 `applyLineCue()`

`applyLineCue()` 现在只处理 `cg` / `fx` / `emotion`，**不含 `bgm`、不含 `bgmManager.play()`**。
跳过时它根本不会被调用，于是 CG/气泡/镜头不会补播——这正是想要的。

**怎么自检**：
`test/dorm-stateful-cues.test.ts` 里「寝室场景接线护栏（源码）」那组用例会读 `src/scenes/ch01-dorm-scene.ts` 原文断言：
`applyLineCue()` 不含 `bgmManager.play(` / `line.bgm`；`flushStateCues()` 用的是 `reduceStateCues(...)` 而不是写死曲目；
`finishDialogue()` 里 `flushStateCues()` 出现在 `flow.nodeCompleted()` **之前**；`skipDialogue()` 只调 `finishDialogue()`。
换场景/重构方法名时，这组护栏会第一时间失败——**别删护栏，改断言**。

---

## 5. 新 cue 接入检查清单

新增一个行 cue 字段（或给状态型加一类），按顺序过这四项：

1. **它是哪一类？** 在 `src/story/dialogue.ts` 的 `DialogueCueKey` 加 key，并在 `DIALOGUE_CUE_KINDS` 里表态。
   *自检*：`pnpm typecheck`——漏表态编译失败。
2. **状态型的话，进 `DialogueStateCues` 了吗？** `stateCuesOfLine()` 要能取出来，`mergeStateCues()` 里写明覆盖语义；
   场景 `applyStateCues()` 要真的执行它。
   *自检*：`reduceStateCues([{...新字段}], 0)` 单测返回期望对象。
3. **跳过路径生效吗？** 该 cue 的生效**不能**依赖行显示回调。
   *自检*：写「每个 lineIndex 都当跳过点」的一致性测试（见 §6 模板），断言与自然过完一致。
4. **表现型的话，反向断言它不会补播**。
   *自检*：`reduceStateCues()` 对只有该 cue 的台词必须返回 `EMPTY_STATE_CUES`。

再补一条**源码护栏**（属于第 4 节接线的一部分）：状态型 cue 的执行只能在归约入口，
表现型方法里不许出现它——护栏示例见 `test/dorm-stateful-cues.test.ts` 的 `bodyOf()` + `expect(...).not.toContain(...)`。

---

## 6. 「每个跳过点」测试模板

不要只测「跳过第 0 行」一个点。跳过可能发生在任意位置——从第 0 行到「最后一行之后」都算，
正确写法是**遍历所有 `lineIndex`**，与自然过完的结果比对：

```ts
/** 模拟「演到第 skipAt 行之前就点跳过」时，最终生效的状态。 */
function stateAfterSkipping(lines: readonly DialogueLine[], skipAt: number): DialogueStateCues {
  let state = EMPTY_STATE_CUES;
  for (let index = 0; index < Math.min(skipAt, lines.length); index += 1) {
    state = mergeStateCues(state, stateCuesOfLine(lines[index] as DialogueLine));
  }
  return mergeStateCues(state, reduceStateCues(lines, skipAt));
}

for (let skipAt = 0; skipAt <= lines.length; skipAt += 1) {
  expect(stateAfterSkipping(lines, skipAt), `第 ${skipAt} 行跳过`).toEqual(reduceStateCues(lines, 0));
}
```

寝室现在这段测试的真实断言（`CH01_NODES` 里所有带台词的节点都过一遍）：

- 逐行跳过 → 最终状态恒等于自然过完；
- 「叫醒郑卿」`skipAt = 0`（刚打开就跳过）→ 必得 `ch01Crisis`；
- 「战后征召」没有 `bgm` → 跳过不额外切曲；
- 只有 `cg`/`emotion`/`fx` 的台词 → 归约为空。

---

## 7. 反例警示

| 反例 | 为什么错 | 改法 |
| --- | --- | --- |
| 在 `skipDialogue()` 里 `bgmManager.play('ch01Crisis')` | 跳过点任意，硬写只覆盖一种情况；换节点复用就错；还会绕开节点完成事件的覆盖顺序 | 归约（`reduceStateCues` + `flushStateCues`），场景不出现曲目字面量 |
| 把 `bgm` 写回 `applyLineCue()` | 这就是本次 bug：只在「行被看见」时生效 | 状态型走 `applyStateCueAt()` / `flushStateCues()` |
| 「反正节点完成事件会切曲，对话里不用管」 | 自然过完时 BGM 必须在**行显示时**就切（玩家要听见气氛变化），只有跳过才靠收尾补 | 行显示时生效 + 收尾补算，两条路都要有 |
| 跳过时把 CG/气泡也补一遍 | 跳过会闪一张 CG、冒一个没人说话的表情气泡 | 表现型只挂在行显示上，跳过不补 |
| 给 `flushStateCues()` 里加 `this.stateCueCursor = 0` 重置 | 会让「收尾补算」变成死循环式重播 | 归约后把游标推到 `lines.length`，再清空 `dialogueLines` |

**未接线的场景**：目前只有 `Ch01DormScene` 接了这套机制（也只有它的台词带 `bgm`）。
`src/scenes/ch01-kitchen-scene.ts` 用 `DialoguePlayer` 但没有任何行 cue；**哪天要给御膳房加 `line.bgm` / `line.cg`，
必须照第 4 节把 `dialogueLines` / `stateCueCursor` / `applyStateCueAt()` / `flushStateCues()` 一起接上**，
否则同一个 bug 会在御膳房重演（`AGENTS.md` §2 第 17 条）。

---

## 8. 相关文件与命令

| 文件 | 内容 |
| --- | --- |
| `src/story/dialogue.ts` | `DIALOGUE_CUE_KINDS` 分类表、`DialogueStateCues`、`reduceStateCues` / `stateCuesOfLine` / `mergeStateCues` / `cueKeysOfKind` |
| `src/scenes/ch01-dorm-scene.ts` | `dialogueLines` / `stateCueCursor`、`applyStateCueAt()`、`flushStateCues()`、`applyStateCues()`、`finishDialogue()`、`skipDialogue()` |
| `src/story/ch01-dorm.ts` | 台词与 cue 的数据真值（`bgm` 只出现在新闻回忆那一行） |
| `test/dorm-stateful-cues.test.ts` | 归约单测 + 每个跳过点一致性 + 表现型反向断言 + 场景源码护栏（20 用例） |
| `docs/AUDIO-BGM.md` §5 | BGM cue 与场景绑定/改绑的分工 |
| `AGENTS.md` §2 第 17 条 | 硬规则：状态型 cue 不得挂在单行台词显示上 |

```bash
pnpm test dorm-stateful-cues.test.ts   # 只跑这组护栏
pnpm check                             # typecheck + vitest + assets:check + assets:pass
```
