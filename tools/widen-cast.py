#!/usr/bin/env python3
"""把某个角色**只加宽身体**（头部保持原样）。

为什么不是整张横向拉伸：Q 版角色的头占全身约 1/3，整张 ×1.22 会把脸和帽子也撑宽，
那个方向看起来就"变胖变宽"了（2026-11-02 用户反馈：太监停顿张望时变宽）。

做法：**逐行**横向缩放，缩放系数随 y 变化——
  - 头部区域（内容顶部 `--head-ratio` 的那一段）系数 = 1，一点不动；
  - 再往下 `--ramp` 的高度内线性过渡到目标系数；
  - 躯干与下摆恒定目标系数。
纵向完全不动，所以高度、脚底位置、行走帧的上下起伏都不受影响。

静态 PNG 与行走 sheet 用同一套参数处理，站立 ↔ 行走不会跳。
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image

DIRS = ["down", "up", "left", "right", "down_left", "down_right", "up_left", "up_right"]
FIGURE_BOTTOM = 394
ALPHA = 128
MARGIN = 4


def bbox(arr: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.nonzero(arr > ALPHA)
    if len(xs) == 0:
        return (0, 0, 0, 0)
    return (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)


def widen_body(im: Image.Image, factor: float, cell_w: int, head_ratio: float, ramp: float) -> Image.Image:
    w, h = im.size
    cells = max(1, w // cell_w)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    clamped: list[float] = []

    for c in range(cells):
        cell = im.crop((c * cell_w, 0, (c + 1) * cell_w, h))
        arr = np.array(cell)
        alpha = arr[:, :, 3]
        box = bbox(alpha)
        if box[2] - box[0] <= 0:
            continue
        top, bottom = box[1], box[3]
        height = bottom - top

        # 先按"最宽的那一行"算安全系数：放大后不能超出单帧宽度，否则会裁掉手。
        widest = 0
        for y in range(top, bottom):
            xs_row = np.nonzero(alpha[y] > ALPHA)[0]
            if len(xs_row):
                widest = max(widest, int(xs_row.max() - xs_row.min() + 1))
        safe = min(factor, (cell_w - MARGIN * 2) / widest) if widest else factor
        if safe < 1.0:
            safe = 1.0
        clamped.append(round(safe, 3))

        head_end = top + height * head_ratio
        ramp_end = head_end + height * ramp

        src = Image.fromarray(arr)
        rows = []
        for y in range(h):
            row = src.crop((0, y, cell_w, y + 1))
            if y <= head_end:
                s = 1.0
            elif y >= ramp_end:
                s = safe
            else:
                t = (y - head_end) / max(1e-6, ramp_end - head_end)
                s = 1.0 + (safe - 1.0) * t
            if abs(s - 1.0) < 1e-3:
                rows.append(row)
                continue
            # 这一行的内容水平范围，围绕它的中心放大
            line = np.array(row)[0, :, 3]
            xs = np.nonzero(line > ALPHA)[0]
            if len(xs) == 0:
                rows.append(row)
                continue
            x0, x1 = int(xs.min()), int(xs.max()) + 1
            content = row.crop((x0, 0, x1, 1))
            nw = min(cell_w - MARGIN * 2, max(1, round(content.width * s)))
            content = content.resize((nw, 1), Image.Resampling.BICUBIC)
            cx = c * cell_w + (x0 + x1) // 2
            x = min(max(c * cell_w, cx - nw // 2), (c + 1) * cell_w - nw)
            row = Image.new("RGBA", (cell_w, 1), (0, 0, 0, 0))
            row.paste(content, (x - c * cell_w, 0))
            rows.append(row)

        for y, row in enumerate(rows):
            out.alpha_composite(row, (c * cell_w, y))
    return out, clamped


def main() -> None:
    p = argparse.ArgumentParser(description="角色只加宽身体（头不动）")
    p.add_argument("--dir", type=Path, required=True)
    p.add_argument("--slug", required=True)
    p.add_argument("--factor", type=float, required=True, help="躯干横向放大倍数，例如 1.22")
    p.add_argument("--head-ratio", type=float, default=0.30, help="顶部不动的高度占比（默认 0.30）")
    p.add_argument("--ramp", type=float, default=0.14, help="过渡段高度占比（默认 0.14）")
    p.add_argument("--static-frame", default="224x400")
    p.add_argument("--walk-frame", default="192x400")
    args = p.parse_args()

    static_w = int(args.static_frame.lower().split("x")[0])
    walk_w = int(args.walk_frame.lower().split("x")[0])

    for d in DIRS:
        static = args.dir / f"{args.slug}_{d}.png"
        if static.exists():
            im = Image.open(static).convert("RGBA")
            img_out, cl = widen_body(im, args.factor, static_w, args.head_ratio, args.ramp)
            img_out.save(static, "PNG")
            print(f"[body-widen] {d:11s} 安全系数={min(cl) if cl else 1.0}")
        sheet = args.dir / f"{args.slug}_walk_{d}.webp"
        if sheet.exists():
            im = Image.open(sheet).convert("RGBA")
            img_out, cl = widen_body(im, args.factor, walk_w, args.head_ratio, args.ramp)
            img_out.save(sheet, "WEBP", quality=78, method=6)
            print(f"[body-widen] {d:11s} sheet 安全系数={min(cl) if cl else 1.0}")


if __name__ == "__main__":
    main()
