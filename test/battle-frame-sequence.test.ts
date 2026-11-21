import { describe, expect, it } from 'vitest';
import { frameIndexAt, sequenceDuration } from '../src/battle/core/frame-sequence';

describe('frame sequence clock', () => {
  it('walks frames at a fixed step', () => {
    expect(frameIndexAt(0, 12, 55)).toBe(0);
    expect(frameIndexAt(54.9, 12, 55)).toBe(0);
    expect(frameIndexAt(55, 12, 55)).toBe(1);
    expect(frameIndexAt(329, 12, 55)).toBe(5);
  });

  it('clamps on the last frame when not looping', () => {
    expect(frameIndexAt(100000, 12, 55)).toBe(11);
    expect(frameIndexAt(-100, 12, 55)).toBe(0);
  });

  it('wraps when looping', () => {
    expect(frameIndexAt(660, 12, 55, true)).toBe(0);
    expect(frameIndexAt(715, 12, 55, true)).toBe(1);
    expect(frameIndexAt(-5, 12, 55, true)).toBe(11);
  });

  it('handles degenerate inputs', () => {
    expect(frameIndexAt(10, 0, 55)).toBe(0);
    expect(frameIndexAt(10, 1, 55)).toBe(0);
    expect(sequenceDuration(12, 55)).toBe(660);
    expect(sequenceDuration(0, 55)).toBe(0);
  });
});
