#!/usr/bin/env python3
"""把实机截图拼成 t28 的「尺寸对照图」。

输入（Playwright 在 390×844 下截的图，`?stage=scene.ch01.dorm&hud=0`）：
    <src>/sit-explore2.png    探索模式 + 手动 setSitting(true)，站在房间中心的坐姿
    <src>/stand-at-spot.png   同一格、切回站立帧（PLAYER_SCALE 0.6138）
    <src>/animp-0..7.png      把起身 sheet 逐帧打到实机画布上（scene.pause() 后截图）
输出：
    .evidence/docs/screenshots/sitting/ingame-390.png          坐姿 / 站立 两个 390 宽实机面板
    .evidence/docs/screenshots/sitting/ingame-standup-frames.png  起身 8 帧的实机 1:1 像素裁切

重新截图的做法见 tools/README 与本次报告；脚本本身只吃图，不启动浏览器。
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / ".evidence" / "docs" / "screenshots" / "sitting"

# 运行时实测（浏览器 evaluate 读到的值，别手推）：脚底 (360, 782) 设计坐标。
FOOT_DESIGN = (360, 782)
CSS_PER_DESIGN = 390 / 720  # 渲染倍率固定 1，画布按 CSS 宽 390 缩放


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for candidate in (
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
    ):
        if Path(candidate).exists():
            try:
                return ImageFont.truetype(candidate, size)
            except OSError:
                continue
    return ImageFont.load_default()


CAPTION_H = 76


def caption(box: Image.Image, y: int, title: str, meta: list[str], width: int) -> None:
    draw = ImageDraw.Draw(box)
    draw.rectangle((0, y, width, y + CAPTION_H), fill=(18, 20, 26, 255))
    draw.text((12, y + 7), title, font=font(16), fill=(246, 246, 250, 255))
    for line, text in enumerate(meta):
        draw.text((12, y + 31 + line * 18), text, font=font(12), fill=(150, 205, 255, 255))


def build_size_board(src: Path) -> Path:
    sit = Image.open(src / "sit-explore2.png").convert("RGBA")
    stand = Image.open(src / "stand-at-spot.png").convert("RGBA")
    width = sit.width
    gap = 10
    board = Image.new(
        "RGBA", (width, (sit.height + CAPTION_H) * 2 + gap), (12, 13, 17, 255)
    )
    board.alpha_composite(sit, (0, 0))
    caption(
        board,
        sit.height,
        "① 坐地朝右（静止）· 实机 390×844",
        [
            f"canvas 160×400 · 人物高 160 · 屏显 {round(160 * CSS_PER_DESIGN)}px",
            "displayScale 1.0 · 底边 394 · 无椅子 / 无投影",
        ],
        width,
    )
    top = sit.height + CAPTION_H + gap
    board.alpha_composite(stand, (0, top))
    caption(
        board,
        top + stand.height,
        "② 同一格的站立帧（对照）",
        [
            f"canvas 371 · 屏显 {round(371 * 0.6138 * CSS_PER_DESIGN)}px · scale 0.6138",
            "起身最后一帧（228）与它等高，切换不跳大小",
        ],
        width,
    )
    path = OUT_DIR / "ingame-390.png"
    board.convert("RGB").save(path, optimize=True)
    return path


def build_frame_board(src: Path) -> Path:
    foot_css = (FOOT_DESIGN[0] * CSS_PER_DESIGN, FOOT_DESIGN[1] * CSS_PER_DESIGN)
    half_w, up, down = 132, 300, 40
    crop = (
        round(foot_css[0] - half_w),
        round(foot_css[1] - up),
        round(foot_css[0] + half_w),
        round(foot_css[1] + down),
    )
    cell_w, cell_h = crop[2] - crop[0], crop[3] - crop[1]
    cols, pad, label_h = 4, 10, 24
    rows = 2
    width = pad + cols * (cell_w + pad)
    height = pad + rows * (cell_h + label_h + pad)
    board = Image.new("RGBA", (width, height), (16, 18, 24, 255))
    for index in range(8):
        shot = Image.open(src / f"animp-{index}.png").convert("RGBA").crop(crop)
        col, row = index % cols, index // cols
        x = pad + col * (cell_w + pad)
        y = pad + row * (cell_h + label_h + pad)
        draw = ImageDraw.Draw(board)
        draw.text((x, y), f"f{index}", font=font(15), fill=(246, 246, 250, 255))
        board.alpha_composite(shot, (x, y + label_h))
    path = OUT_DIR / "ingame-standup-frames.png"
    board.convert("RGB").save(path, optimize=True)
    return path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--src", type=Path, required=True, help="实机截图目录")
    args = parser.parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(build_size_board(args.src))
    print(build_frame_board(args.src))


if __name__ == "__main__":
    main()
