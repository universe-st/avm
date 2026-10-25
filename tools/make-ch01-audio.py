#!/usr/bin/env python3
"""生成第一章第一节的程序化音频占位（标准库合成 + ffmpeg 转码，零计费）。

用法：
    python3 tools/make-ch01-audio.py

输出：
    # 注意：寝室日常 BGM 已由「游戏素材大师」生成，本脚本不再覆盖 ch01_dorm.mp3。
    public/assets/audio/bgm/ch01_dream.mp3
    public/assets/audio/sfx/ch01_punch.mp3
    public/assets/audio/sfx/ch01_metal.mp3
    public/assets/audio/sfx/ch01_phone.mp3

设计：
- 寝室日常 BGM 由「游戏素材大师」生成；本脚本只保留梦域/音效占位。
- 梦域：金殿低频 drone + 缓慢金属脉冲；40s 循环。
- 音效：拳头砸铁皮、金属撞击、手机故障电流。

这是首版占位，后续可用「游戏素材大师」重做正式音乐；替换时保持 key/时长不变。
"""

from __future__ import annotations

import math
import random
import struct
import subprocess
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public" / "assets" / "audio"
SOURCE = ROOT / "assets-src" / "audio" / "ch01"
SAMPLE_RATE = 22050


def write_wav(path: Path, samples: list[float]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    clipped = [max(-1.0, min(1.0, sample)) for sample in samples]
    data = b"".join(struct.pack("<h", int(sample * 32767)) for sample in clipped)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(SAMPLE_RATE)
        handle.writeframes(data)
    print(f"[ch01-audio] {path.relative_to(ROOT)} ({path.stat().st_size} bytes)")


def to_mp3(source: Path, target: Path, bitrate: str = "128k", loudnorm: bool = False) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    filters = []
    if loudnorm:
        filters = ["-af", "loudnorm=I=-16:TP=-1.5:LRA=11"]
    command = [
        "ffmpeg",
        "-y",
        "-loglevel",
        "error",
        "-i",
        str(source),
        *filters,
        "-codec:a",
        "libmp3lame",
        "-b:a",
        bitrate,
        str(target),
    ]
    subprocess.run(command, check=True)
    print(f"[ch01-audio] {target.relative_to(ROOT)} ({target.stat().st_size} bytes)")


def fade(samples: list[float], in_ms: int, out_ms: int) -> list[float]:
    total = len(samples)
    fade_in = min(total, int(SAMPLE_RATE * in_ms / 1000))
    fade_out = min(total, int(SAMPLE_RATE * out_ms / 1000))
    for index in range(fade_in):
        samples[index] *= index / max(1, fade_in)
    for index in range(fade_out):
        samples[total - 1 - index] *= index / max(1, fade_out)
    return samples


def dorm_ambience() -> list[float]:
    rng = random.Random(3)
    duration = 32.0
    total = int(SAMPLE_RATE * duration)
    samples: list[float] = []
    # 风扇：60Hz 基频 + 120/180Hz 谐波 + 低频噪声。
    for index in range(total):
        t = index / SAMPLE_RATE
        fan = math.sin(2 * math.pi * 60 * t) * 0.035
        fan += math.sin(2 * math.pi * 120 * t + 0.4) * 0.014
        fan += math.sin(2 * math.pi * 180 * t + 1.1) * 0.006
        noise = (rng.random() * 2 - 1) * 0.006
        # 蝉鸣：在固定时间窗内做高频段噪声，带节奏起伏。
        cicada = 0.0
        for start in (3.2, 8.7, 14.4, 20.1, 26.6):
            local = (t - start) % duration
            if 0.0 <= local <= 1.8:
                envelope = math.sin(math.pi * local / 1.8) ** 2
                carrier = math.sin(2 * math.pi * 4200 * t) * 0.5
                carrier += math.sin(2 * math.pi * 5600 * t + 0.7) * 0.3
                modulation = 0.55 + 0.45 * math.sin(2 * math.pi * 26 * t)
                cicada += carrier * envelope * modulation * 0.028
        samples.append(fan + noise + cicada)
    return fade(samples, 300, 500)


def dream_loop() -> list[float]:
    rng = random.Random(11)
    duration = 40.0
    total = int(SAMPLE_RATE * duration)
    samples: list[float] = []
    for index in range(total):
        t = index / SAMPLE_RATE
        drone = math.sin(2 * math.pi * 55 * t) * 0.06
        drone += math.sin(2 * math.pi * 82.5 * t + 0.3) * 0.035
        drone += math.sin(2 * math.pi * 110 * t + 1.2) * 0.018
        # 每 4 秒一次金属脉冲，制造压迫感。
        pulse_time = t % 4.0
        pulse = 0.0
        if pulse_time < 0.6:
            envelope = math.exp(-pulse_time * 5.5)
            pulse = (
                math.sin(2 * math.pi * 330 * t) * 0.05
                + math.sin(2 * math.pi * 660 * t + 0.2) * 0.03
                + (rng.random() * 2 - 1) * 0.015
            ) * envelope
        # 极慢的高频金属泛音
        shimmer = math.sin(2 * math.pi * 1760 * t) * 0.004 * (0.5 + 0.5 * math.sin(2 * math.pi * 0.15 * t))
        samples.append(drone + pulse + shimmer)
    return fade(samples, 800, 1200)


def punch() -> list[float]:
    rng = random.Random(5)
    duration = 0.2
    total = int(SAMPLE_RATE * duration)
    samples: list[float] = []
    for index in range(total):
        t = index / SAMPLE_RATE
        envelope = math.exp(-t * 26)
        thump = math.sin(2 * math.pi * 85 * t) * 0.55
        noise = (rng.random() * 2 - 1) * 0.45
        samples.append((thump + noise) * envelope)
    return fade(samples, 2, 30)


def metal() -> list[float]:
    rng = random.Random(8)
    duration = 0.45
    total = int(SAMPLE_RATE * duration)
    samples: list[float] = []
    for index in range(total):
        t = index / SAMPLE_RATE
        envelope = math.exp(-t * 7.5)
        clang = (
            math.sin(2 * math.pi * 1180 * t) * 0.28
            + math.sin(2 * math.pi * 1790 * t + 0.3) * 0.14
            + math.sin(2 * math.pi * 2650 * t + 1.1) * 0.07
        )
        noise = (rng.random() * 2 - 1) * 0.18
        samples.append((clang + noise) * envelope)
    return fade(samples, 2, 80)


def phone_glitch() -> list[float]:
    rng = random.Random(13)
    duration = 0.75
    total = int(SAMPLE_RATE * duration)
    samples: list[float] = []
    for index in range(total):
        t = index / SAMPLE_RATE
        # 三段跳频提示音 + 电流噪声
        step = int(t / 0.12)
        freq = (880, 1320, 660, 1760, 990, 1480)[min(step, 5)]
        tone = math.sin(2 * math.pi * freq * t) * 0.22
        noise = (rng.random() * 2 - 1) * 0.12
        envelope = 0.35 + 0.65 * (0.5 + 0.5 * math.sin(2 * math.pi * 9 * t))
        samples.append((tone + noise) * envelope)
    return fade(samples, 5, 120)


def main() -> None:
    SOURCE.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)

    sources = {
        "ch01_dream": dream_loop(),
        "ch01_punch": punch(),
        "ch01_metal": metal(),
        "ch01_phone": phone_glitch(),
    }
    for name, samples in sources.items():
        write_wav(SOURCE / f"{name}_source.wav", samples)

    to_mp3(SOURCE / "ch01_dream_source.wav", PUBLIC / "bgm" / "ch01_dream.mp3", "128k", True)
    to_mp3(SOURCE / "ch01_punch_source.wav", PUBLIC / "sfx" / "ch01_punch.mp3", "96k")
    to_mp3(SOURCE / "ch01_metal_source.wav", PUBLIC / "sfx" / "ch01_metal.mp3", "96k")
    to_mp3(SOURCE / "ch01_phone_source.wav", PUBLIC / "sfx" / "ch01_phone.mp3", "96k")


if __name__ == "__main__":
    main()
