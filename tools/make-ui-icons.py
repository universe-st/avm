#!/usr/bin/env python3
"""绘制开幕剧情右上角的控制图标（自动 / 跳过）。

用法：
    python3 tools/make-ui-icons.py

输出：
    public/assets/img/ui/icon_auto.png
    public/assets/img/ui/icon_skip.png

设计：纯白（#ffffff）实心图形 + 透明底，运行时用 `setTint` 按状态染色
（未开启=宣纸白，开启=墨黑压在鎏金按钮上）。96×96 的纹理在界面里按 26 设计 px
显示，向下采样所以边缘干净。图形本身留 8px 内边距，避免贴着按钮圆角。
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

SIZE = 96
SUPERSAMPLE = 4
OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "assets" / "img" / "ui"


def canvas() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGBA", (SIZE * SUPERSAMPLE, SIZE * SUPERSAMPLE), (255, 255, 255, 0))
    return image, ImageDraw.Draw(image)


def scale(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    return [(x * SUPERSAMPLE, y * SUPERSAMPLE) for x, y in points]


def draw_auto() -> Image.Image:
    """▶▶：连续自动推进。"""
    image, draw = canvas()
    white = (255, 255, 255, 255)
    draw.polygon(scale([(12, 26), (48, 48), (12, 70)]), fill=white)
    draw.polygon(scale([(50, 26), (86, 48), (50, 70)]), fill=white)
    return image


def draw_skip() -> Image.Image:
    """▶|：跳过整段。"""
    image, draw = canvas()
    white = (255, 255, 255, 255)
    draw.polygon(scale([(14, 24), (62, 48), (14, 72)]), fill=white)
    draw.rectangle(scale([(70, 26), (82, 70)]), fill=white)
    return image


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, painter in (("icon_auto.png", draw_auto), ("icon_skip.png", draw_skip)):
        image = painter().resize((SIZE, SIZE), Image.Resampling.LANCZOS)
        path = OUT_DIR / name
        image.save(path, optimize=True)
        print(f"[icons] {path.relative_to(OUT_DIR.parent.parent.parent.parent)} {path.stat().st_size} bytes")


if __name__ == "__main__":
    main()
