#!/usr/bin/env python3
"""立绘绿边去除（despill）：把「绿幕抠像残留」从头发/边缘里拉回来。

背景：半身立绘是「纯绿 #00FF00 背景 → keyImageJob 抠像 → make-palace-portrait 裁切」。
抠像参数 `despill 0.65` 对白色/金色主体够用，但**深色头发**是半透明边缘 + 抗锯齿，
残留的绿不会被完全消掉；贴到深色底上就是「头发里泛绿」。2026-11-25 用户实机指出。

这不是重新生成，也不是重新抠像：只对已经抠好的 PNG 做一次确定性的去绿边，
所有像素的 alpha 完全不动。

做法（经典的 green-limit）：
    m = max(r, b)
    if g > m: g = m
半透明边缘（alpha < 250）再按 alpha 往回收一档，避免描边内侧还有一圈绿。
这些立绘里没有「本来应该是绿色」的主体（小白白袍、郑卿金袍、老麦红袍），
所以按像素判定、不按区域，是安全的。

用法：
  python3 tools/despill-portrait.py public/assets/img/character/ch01/portrait_*.png
  python3 tools/despill-portrait.py --stats public/.../portrait_zhou_neutral.png
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image

ALPHA_SOFT = 250


def despill_pixel(r: int, g: int, b: int, a: int) -> tuple[int, int, int]:
    """去掉绿色偏移；alpha 不参与输出。"""
    limit = max(r, b)
    if g <= limit:
        return r, g, b
    # 半透明边缘多收一点：抠像在边缘会把绿色混进颜色，视觉上比内部更明显。
    if a < ALPHA_SOFT:
        limit = max(0, limit - (ALPHA_SOFT - a) // 24)
    return r, limit, b


def process(path: Path, stats_only: bool = False) -> int:
    image = Image.open(path).convert('RGBA')
    pixels = list(image.getdata())
    changed = 0
    max_excess = 0
    out = []
    for r, g, b, a in pixels:
        if a == 0:
            out.append((r, g, b, a))
            continue
        excess = g - max(r, b)
        if excess > 0:
            max_excess = max(max_excess, excess)
        nr, ng, nb = despill_pixel(r, g, b, a)
        if (nr, ng, nb) != (r, g, b):
            changed += 1
        out.append((nr, ng, nb, a))
    if not stats_only and changed > 0:
        result = Image.new('RGBA', image.size)
        result.putdata(out)
        result.save(path, optimize=True)
    print(
        f"{path.name}: {changed} px despilled, max green excess {max_excess}"
        + ('  (stats only)' if stats_only else ''),
    )
    return changed


def main() -> int:
    parser = argparse.ArgumentParser(description='去立绘绿边')
    parser.add_argument('files', nargs='+', type=Path)
    parser.add_argument('--stats', action='store_true', help='只统计，不写回')
    args = parser.parse_args()
    total = 0
    for path in args.files:
        if not path.exists():
            print(f'缺少文件：{path}', file=sys.stderr)
            return 1
        total += process(path, args.stats)
    print(f'[despill] 共处理 {total} 个像素')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
