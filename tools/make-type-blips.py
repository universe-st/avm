#!/usr/bin/env python3
"""生成开幕剧情「逐字提示音」（三段短促 blip）。

用法：
    python3 tools/make-type-blips.py

输出：
    public/assets/audio/sfx/type_blip_1.wav
    public/assets/audio/sfx/type_blip_2.wav
    public/assets/audio/sfx/type_blip_3.wav

设计：三角波 + 少量正弦，音高在 30ms 内下滑 ~25%，指数衰减，
听感接近逆转裁判那类「哒」的逐字音，连续出现时不刺耳。
只依赖标准库；22.05kHz / 16bit / 单声道，单文件约 1KB。
刻意不用 MP3：编码器的前导静音会给每 55ms 一次的逐字音加上可感知的延迟。
"""

from __future__ import annotations

import math
import struct
import wave
from pathlib import Path

SAMPLE_RATE = 22050
OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "assets" / "audio" / "sfx"

# 三个音高轮流出现，避免同一频率连续敲击的机械感。
VARIANTS = (
    ("type_blip_1.wav", 784.0),   # G5
    ("type_blip_2.wav", 880.0),   # A5
    ("type_blip_3.wav", 988.0),   # B5
)

DURATION = 0.03      # 30ms
DECAY = 0.007        # 包络时间常数
ATTACK = 0.0015      # 1.5ms 起音，避免咔哒声
PEAK = 0.70          # 归一化峰值：混音后约 -10 dBFS，能压住 BGM 但不会刺耳
PITCH_DROP = 0.25    # 音高下滑比例


def triangle(phase: float) -> float:
    """归一化三角波，相位以「周期数」为单位。"""
    frac = phase % 1.0
    return 4.0 * abs(frac - 0.5) - 1.0


def render(start_freq: float) -> bytes:
    frames = int(SAMPLE_RATE * DURATION)
    phase = 0.0
    samples = bytearray()
    for index in range(frames):
        t = index / SAMPLE_RATE
        progress = t / DURATION
        freq = start_freq * (1.0 - PITCH_DROP * progress)
        phase += freq / SAMPLE_RATE

        env = math.exp(-t / DECAY)
        if t < ATTACK:
            env *= t / ATTACK
        # 尾部 2ms 收到 0，防止波形截断产生爆音。
        remaining = DURATION - t
        if remaining < 0.002:
            env *= remaining / 0.002

        tone = 0.72 * triangle(phase) + 0.28 * math.sin(2.0 * math.pi * phase)
        value = max(-1.0, min(1.0, PEAK * env * tone))
        samples += struct.pack("<h", int(round(value * 32767)))
    return bytes(samples)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, freq in VARIANTS:
        path = OUT_DIR / name
        with wave.open(str(path), "wb") as handle:
            handle.setnchannels(1)
            handle.setsampwidth(2)
            handle.setframerate(SAMPLE_RATE)
            handle.writeframes(render(freq))
        print(f"[blips] {path.relative_to(OUT_DIR.parent.parent.parent.parent)} "
              f"{path.stat().st_size} bytes  {freq:.0f} Hz")


if __name__ == "__main__":
    main()
