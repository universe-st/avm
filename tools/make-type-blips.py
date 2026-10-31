#!/usr/bin/env python3
"""生成「逐字提示音」（blip）。

用法：
    python3 tools/make-type-blips.py

输出：
    public/assets/audio/sfx/type_blip_1.wav      普通角色轮换 A
    public/assets/audio/sfx/type_blip_2.wav      普通角色轮换 B
    public/assets/audio/sfx/type_blip_3.wav      旧版第三段（保留兼容）
    public/assets/audio/sfx/voice_blip_narrator.wav  旁白：轻、软、气声感
    public/assets/audio/sfx/voice_blip_zhou.wav      周全：中高、干脆
    public/assets/audio/sfx/voice_blip_zheng.wav     郑卿：低、闷、慢衰减
    public/assets/audio/sfx/voice_blip_xiaobai.wav   小白：高频、上扬、玻璃感

设计：三角波 + 少量正弦，音高在 30–45ms 内下滑（小白反向上扬），指数衰减，
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


# 角色声线：start/end 音高、时长、衰减、峰值、波形、起音。
# 音高拉开距离（郑卿 392Hz → 周全 740Hz → 小白 1046→1568Hz），
# 即使没有配音，玩家也能从逐字音听出「换人说话了」。
VOICE_VARIANTS = (
    ("voice_blip_narrator.wav", dict(start=520.0, end=470.0, duration=0.045,
                                     decay=0.014, peak=0.44, mix="sine", attack=0.003)),
    ("voice_blip_zhou.wav", dict(start=740.0, end=700.0, duration=0.032,
                                 decay=0.0075, peak=0.68, mix="tri", attack=0.0015)),
    ("voice_blip_zheng.wav", dict(start=392.0, end=356.0, duration=0.042,
                                  decay=0.012, peak=0.60, mix="tri_soft", attack=0.002)),
    ("voice_blip_xiaobai.wav", dict(start=1046.0, end=1568.0, duration=0.028,
                                    decay=0.007, peak=0.52, mix="glass", attack=0.001)),
)


def render_voice(
    start: float,
    end: float,
    duration: float,
    decay: float,
    peak: float,
    mix: str,
    attack: float,
) -> bytes:
    frames = int(SAMPLE_RATE * duration)
    phase = 0.0
    samples = bytearray()
    for index in range(frames):
        t = index / SAMPLE_RATE
        progress = t / duration
        freq = start + (end - start) * progress
        phase += freq / SAMPLE_RATE

        env = math.exp(-t / decay)
        if t < attack:
            env *= t / attack
        remaining = duration - t
        if remaining < 0.002:
            env *= remaining / 0.002

        sine = math.sin(2.0 * math.pi * phase)
        if mix == "sine":
            tone = sine
        elif mix == "tri":
            tone = 0.72 * triangle(phase) + 0.28 * sine
        elif mix == "tri_soft":
            tone = 0.55 * triangle(phase) + 0.45 * sine
        elif mix == "glass":
            # 二次谐波叠一点三角波，听感更亮、更像小白的「电子音」。
            tone = 0.80 * sine + 0.20 * triangle(phase * 2.0)
        else:
            raise ValueError(f"unknown mix: {mix}")
        value = max(-1.0, min(1.0, peak * env * tone))
        samples += struct.pack("<h", int(round(value * 32767)))
    return bytes(samples)


def write_wav(name: str, frames: bytes) -> None:
    path = OUT_DIR / name
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(SAMPLE_RATE)
        handle.writeframes(frames)
    print(f"[blips] {path.relative_to(OUT_DIR.parent.parent.parent.parent)} "
          f"{path.stat().st_size} bytes")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, freq in VARIANTS:
        write_wav(name, render(freq))
    for name, params in VOICE_VARIANTS:
        write_wav(name, render_voice(**params))


if __name__ == "__main__":
    main()
