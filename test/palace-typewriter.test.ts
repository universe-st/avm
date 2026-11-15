import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 金殿过场「逐字 + 逐字音」的场景接线护栏（t62）。
 *
 * 打字机本身是纯逻辑（`src/story/typewriter.ts`，见 `test/typewriter.test.ts`）；
 * 这里守住「场景真的接上了」这件事：say 分支走遮罩、每帧最多一次 blip、
 * 打字中点击只补全不跳句、历史里存的是完整原文。
 */

const SCENE = 'src/scenes/ch01-palace-scene.ts';
const TYPEWRITER = 'src/story/typewriter.ts';

function source(file: string): string {
  return readFileSync(file, 'utf8');
}

/**
 * 取出某个方法体（从方法签名到下一个成员），避免跨方法误判。
 *
 * 方法体的 `{` 一定在行尾（下一字符是换行），所以跳过参数里
 * `options: { ... } = {}` 这类默认值花括号，不会被它们骗到。
 */
function methodBody(text: string, signature: string): string {
  const start = text.indexOf(signature);
  expect(start, `没找到 ${signature}`).toBeGreaterThanOrEqual(0);
  let open = -1;
  for (let cursor = text.indexOf('{', start); cursor >= 0; cursor = text.indexOf('{', cursor + 1)) {
    if (text[cursor + 1] === '\n' || text[cursor + 1] === '\r') {
      open = cursor;
      break;
    }
  }
  expect(open, `${signature} 没有找到方法体`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let cursor = open; cursor < text.length; cursor += 1) {
    const char = text[cursor];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, cursor + 1);
    }
  }
  throw new Error(`${signature} 的花括号没有闭合`);
}

describe('金殿过场逐字接线', () => {
  it('say 事件把整句交给 Typewriter，不再直接整句上屏', () => {
    const body = methodBody(source(SCENE), 'private handleEvents(');
    expect(body).toContain('this.typewriter.start(event.text, typewriterIntervalMs(settings.textSpeed))');
    expect(body).toContain('this.applyTypeStep(');
    // 历史记录必须是完整原文，不是遮罩后的串。
    expect(body).toMatch(/text:\s*event\.text/);
    // 旧实现：`this.sayText.value = event.text` 整句直接进文本框。
    expect(body).not.toContain('this.sayText.value = event.text');
  });

  it('遮罩由 Typewriter 统一做，纯逻辑不依赖 Phaser', () => {
    const writer = source(TYPEWRITER);
    expect(writer).toContain('maskDialogueText');
    expect(writer).not.toMatch(/from ['"]phaser['"]/);
  });

  it('面板写入遮罩文本，提示在「点击补全 / 点击继续」之间切换', () => {
    const body = methodBody(source(SCENE), 'private applyTypeStep(');
    expect(body).toContain('this.sayText.value = step.text');
    expect(body).toContain("this.sayHint.value = step.done ? '点击继续' : '点击补全'");
  });

  it('逐字音只在「本帧新增字数 > 0」时播，且全场景只有一处调用（一帧最多一次）', () => {
    const scene = source(SCENE);
    const calls = scene.match(/audioDirector\.playTypeBlip\(/g) ?? [];
    expect(calls).toHaveLength(1);
    const body = methodBody(scene, 'private applyTypeStep(');
    expect(body).toContain('const gained = step.revealed - this.lastTyped');
    expect(body).toContain('if (options.blip !== false && gained > 0)');
    expect(body).toContain(
      'audioDirector.playTypeBlip(typeVoiceForSpeaker(this.lineSpeaker, this.lineRole))',
    );
  });

  it('打字中点击先补全本句：不播点击音、不进入下一句', () => {
    const body = methodBody(source(SCENE), 'private advance(): void {');
    const typing = body.indexOf('if (this.typewriter.typing)');
    const complete = body.indexOf('this.typewriter.complete()');
    const click = body.indexOf('audioDirector.playClick()');
    const advance = body.indexOf('this.player.advance()');
    expect(typing).toBeGreaterThanOrEqual(0);
    expect(complete).toBeGreaterThan(typing);
    expect(click).toBeGreaterThan(complete);
    expect(advance).toBeGreaterThan(click);
    // 补全分支里没有点击音，也没有推进播放器。
    const branch = body.slice(typing, body.indexOf('return;', typing) + 1);
    expect(branch).not.toContain('playClick');
    expect(branch).not.toContain('player.advance');
  });

  it('每帧按 update 的 delta 推进逐字', () => {
    const body = methodBody(source(SCENE), 'override update(');
    expect(body).toContain('this.advanceTypewriter(dt)');
    const advanceTypewriter = methodBody(source(SCENE), 'private advanceTypewriter(');
    expect(advanceTypewriter).toContain('this.typewriter.tick(deltaMs)');
  });

  it('自动播放从「打完」才开始计时', () => {
    const body = methodBody(source(SCENE), 'private scheduleAutoAdvance(');
    expect(body).toContain('if (this.typewriter.typing) return;');
  });

  it('跳过 / 收尾 / shutdown / create 都把打字状态清干净', () => {
    const scene = source(SCENE);
    for (const signature of [
      'private skip(): void {',
      'private finish(): void {',
      'shutdown(): void {',
      'override create(): void {',
    ]) {
      expect(methodBody(scene, signature), signature).toContain('this.typewriter.reset()');
    }
  });

  it('历史弹窗打开期间不喂 delta，关闭时未打完就不排自动播放', () => {
    const scene = source(SCENE);
    expect(methodBody(scene, 'private advanceTypewriter(')).toContain(
      'if (this.historyModal?.open === true) return;',
    );
    const history = methodBody(scene, 'private openHistory(');
    expect(history).toContain('!this.typewriter.typing');
  });
});

describe('金殿旁白行为不变', () => {
  it('旁白仍是 narration 语义色且不显示说话人名', () => {
    const body = methodBody(source(SCENE), 'private handleEvents(');
    expect(body).toContain('const tone = speakerTone(event.speaker, event.role)');
    expect(body).toContain('this.saySpeaker.value = speakerLabel(event.speaker)');
    expect(body).toContain('narration: tone === ');
  });

  it('分页策略没被改动（金殿仍是单页）', () => {
    const body = methodBody(source(SCENE), 'private handleEvents(');
    expect(body).toContain('this.sayPageCount.value = 1');
  });
});
