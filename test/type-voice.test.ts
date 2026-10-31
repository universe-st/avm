import { describe, expect, it } from 'vitest';
import { TYPE_VOICE_GAIN, typeVoiceForSpeaker } from '../src/audio/type-voice';
import { TYPE_BLIP_KEYS } from '../src/assets/keys';

describe('typeVoiceForSpeaker', () => {
  it('gives the narrator and the three leads their own voices', () => {
    expect(typeVoiceForSpeaker(undefined)).toBe('narrator');
    expect(typeVoiceForSpeaker('')).toBe('narrator');
    expect(typeVoiceForSpeaker('旁白')).toBe('narrator');
    expect(typeVoiceForSpeaker('周全')).toBe('zhou');
    expect(typeVoiceForSpeaker('郑卿')).toBe('zheng');
    expect(typeVoiceForSpeaker('郑卿（梦中）')).toBe('zheng');
    expect(typeVoiceForSpeaker('小白')).toBe('xiaobai');
  });

  it('keeps the xiaobai voice while its display name is still unknown', () => {
    // 名字是剧情现给的：？？？ → 莫名其妙出现的白色小娃娃 → 小白，声线只认 role。
    expect(typeVoiceForSpeaker('？？？', 'xiaobai')).toBe('xiaobai');
    expect(typeVoiceForSpeaker('莫名其妙出现的白色小娃娃', 'xiaobai')).toBe('xiaobai');
    expect(typeVoiceForSpeaker('？？？')).toBe('generic');
  });

  it('falls back to the two generic blips for everyone else', () => {
    for (const speaker of ['男主持', '女主持', '楚公公', '矿工']) {
      expect(typeVoiceForSpeaker(speaker)).toBe('generic');
    }
  });

  it('keeps every voice audible but leaves the narration softest', () => {
    const gains = TYPE_VOICE_GAIN;
    for (const gain of Object.values(gains)) {
      expect(gain).toBeGreaterThanOrEqual(0.5);
      expect(gain).toBeLessThanOrEqual(1);
    }
    expect(gains.narrator).toBeLessThan(gains.zhou);
  });

  it('has a registered blip key for every distinct voice', () => {
    expect(TYPE_BLIP_KEYS.genericA).not.toBe(TYPE_BLIP_KEYS.genericB);
    for (const voice of ['narrator', 'zhou', 'zheng', 'xiaobai'] as const) {
      expect(TYPE_BLIP_KEYS[voice].startsWith('audio.sfx.')).toBe(true);
    }
    expect(new Set([
      TYPE_BLIP_KEYS.narrator,
      TYPE_BLIP_KEYS.zhou,
      TYPE_BLIP_KEYS.zheng,
      TYPE_BLIP_KEYS.xiaobai,
    ]).size).toBe(4);
  });
});
