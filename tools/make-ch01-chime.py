#!/usr/bin/env python3
"""生成章节卡钟声（程序化，零计费）。

用法：python3 tools/make-ch01-chime.py
输出：public/assets/audio/sfx/ch01_chapter_chime.mp3

设计：G5 / C6 / G6 三个正弦钟音，指数衰减 + 轻微拍频；
起音加一撮高频噪声当"槌子"，尾巴压到静音，避免循环播放时的爆音。
"""

from __future__ import annotations

import math
import random
import struct
import subprocess
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public" / "assets" / "audio" / "sfx"
SAMPLE_RATE = 44100
DURATION = 2.2


def main() -> None:
    rng = random.Random(20261031)
    total = int(SAMPLE_RATE * DURATION)
    samples = [0.0] * total
    notes = [
        (784.0, 0.00, 0.55, 1.10),
        (1046.5, 0.06, 0.42, 1.30),
        (1568.0, 0.12, 0.26, 0.85),
    ]
    for freq, start_s, gain, decay in notes:
        start = int(start_s * SAMPLE_RATE)
        for index in range(start, total):
            t = (index - start) / SAMPLE_RATE
            env = math.exp(-t / decay)
            if env < 1e-5:
                break
            # 基频 + 一点二次谐波，钟的金属感来自非整数倍泛音
            value = (
                math.sin(2 * math.pi * freq * t)
                + 0.32 * math.sin(2 * math.pi * freq * 2.01 * t)
                + 0.12 * math.sin(2 * math.pi * freq * 3.03 * t)
            )
            samples[index] += gain * env * value

    # 槌子：前 18ms 的高频噪声
    attack = int(0.018 * SAMPLE_RATE)
    for index in range(attack):
        samples[index] += 0.10 * (1 - index / attack) * rng.uniform(-1, 1)

    # 归一化 + 首尾淡入淡出
    peak = max(1e-6, max(abs(value) for value in samples))
    scale = 0.82 / peak
    fade_in = int(0.005 * SAMPLE_RATE)
    fade_out = int(0.35 * SAMPLE_RATE)
    for index, value in enumerate(samples):
        gain = 1.0
        if index < fade_in:
            gain = index / fade_in
        if index >= total - fade_out:
            gain = min(gain, (total - 1 - index) / fade_out)
        samples[index] = value * scale * gain

    wav_path = PUBLIC / "ch01_chapter_chime.wav"
    wav_path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(wav_path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(SAMPLE_RATE)
        handle.writeframes(
            b"".join(struct.pack("<h", int(max(-1.0, min(1.0, sample)) * 32767)) for sample in samples)
        )

    mp3_path = PUBLIC / "ch01_chapter_chime.mp3"
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav_path), "-codec:a", "libmp3lame", "-b:a", "96k", str(mp3_path)],
        check=True,
    )
    wav_path.unlink()
    print(f"[chime] {mp3_path.relative_to(ROOT)} ({mp3_path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
