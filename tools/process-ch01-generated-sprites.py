#!/usr/bin/env python3
"""把游戏素材大师生成的角色精灵图裁成游戏用 PNG。

输入（已从 image job 复制到 assets-src/）：
    assets-src/character/ch01/character-sprites-keyed.webp       # 2×2 绿幕抠像整图
    assets-src/character/ch01/zhou-four-directions-keyed.webp    # 2×2 四向抠像整图
输出：
    public/assets/img/character/ch01/xiaobai.png  96×96
    public/assets/img/character/ch01/miner.png    128×160
    public/assets/img/character/ch01/zheng.png    64×96
    public/assets/img/character/ch01/zhou_{down,up,left,right}.png 64×96
    assets-src/character/ch01/character-sprites-preview.png  # 深色底验收图

说明：精灵图由「游戏素材大师」image job `imvn30dkgd7657a` 生成，参考图为
`assets-src/character/ch01/character-sheet.png`（job `imvn2twfx8d7622`）。本脚本只做裁切/缩放，
不再改变角色设计；正式八方向行走图走 sprite 模块。
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets-src" / "character" / "ch01" / "character-sprites-keyed.webp"
ZHOU_SRC = ROOT / "assets-src" / "character" / "ch01" / "zhou-four-directions-keyed.webp"
ZHOU_DIR = ROOT / "assets-src" / "character" / "ch01" / "sprite"
OUT = ROOT / "public" / "assets" / "img" / "character" / "ch01"
PREVIEW = ROOT / "assets-src" / "character" / "ch01" / "character-sprites-preview.png"


def alpha_bbox(image: Image.Image, threshold: int = 8) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    mask = alpha.point(lambda value: 255 if value > threshold else 0)
    box = mask.getbbox()
    return box or (0, 0, image.width, image.height)


def fit_sprite(image: Image.Image, width: int, height: int, bottom_margin: int = 0) -> Image.Image:
    box = alpha_bbox(image)
    cropped = image.crop(box)
    scale = min(width / cropped.width, (height - bottom_margin) / cropped.height)
    resized = cropped.resize(
        (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    x = (width - resized.width) // 2
    y = height - bottom_margin - resized.height
    canvas.alpha_composite(resized, (x, y))
    return canvas


def chroma_key(image: Image.Image) -> Image.Image:
    """去掉 sprite 工具输出的纯绿背景，并做一点 despill。"""
    image = image.convert("RGBA")
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            green_dominance = g - max(r, b)
            if g > 90 and green_dominance > 22:
                alpha = max(0, min(255, int(255 * (1 - green_dominance / 110))))
                if green_dominance > 70:
                    alpha = 0
                despilled = min(g, max(r, b) + 12)
                pixels[x, y] = (r, despilled, b, min(a, alpha))
    return image


def sprite_tool_zhou() -> dict[str, Image.Image]:
    mapping = {
        "down": ZHOU_DIR / "front.png",
        "up": ZHOU_DIR / "back.png",
        "left": ZHOU_DIR / "left.png",
        "right": ZHOU_DIR / "right.png",
    }
    result: dict[str, Image.Image] = {}
    for facing, path in mapping.items():
        if not path.exists():
            continue
        keyed = chroma_key(Image.open(path))
        result[facing] = fit_sprite(keyed, 64, 96, bottom_margin=0)
    return result


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    sheet = Image.open(SRC).convert("RGBA")
    half_w, half_h = sheet.width // 2, sheet.height // 2
    quadrants = {
        "zhou": (0, 0, half_w, half_h),
        "zheng": (half_w, 0, sheet.width, half_h),
        "xiaobai": (0, half_h, half_w, sheet.height),
        "miner": (half_w, half_h, sheet.width, sheet.height),
    }
    crops = {
        key: sheet.crop(box)
        for key, box in quadrants.items()
    }

    xiaobai = fit_sprite(crops["xiaobai"], 96, 96, bottom_margin=2)
    miner = fit_sprite(crops["miner"], 128, 160, bottom_margin=2)
    zheng = fit_sprite(crops["zheng"], 64, 96, bottom_margin=0)

    xiaobai.save(OUT / "xiaobai.png", optimize=True)
    miner.save(OUT / "miner.png", optimize=True)
    zheng.save(OUT / "zheng.png", optimize=True)

    # 优先用 sprite 模块的八方向图（front/back/left/right）；没有时退回 image 四向图。
    zhou = sprite_tool_zhou()
    if not zhou and ZHOU_SRC.exists():
        zhou_sheet = Image.open(ZHOU_SRC).convert("RGBA")
        zhalf_w, zhalf_h = zhou_sheet.width // 2, zhou_sheet.height // 2
        zhou = {
            "down": fit_sprite(zhou_sheet.crop((0, 0, zhalf_w, zhalf_h)), 64, 96, bottom_margin=0),
            "up": fit_sprite(zhou_sheet.crop((zhalf_w, 0, zhou_sheet.width, zhalf_h)), 64, 96, bottom_margin=0),
            "left": fit_sprite(zhou_sheet.crop((0, zhalf_h, zhalf_w, zhou_sheet.height)), 64, 96, bottom_margin=0),
            "right": fit_sprite(zhou_sheet.crop((zhalf_w, zhalf_h, zhou_sheet.width, zhou_sheet.height)), 64, 96, bottom_margin=0),
        }
    for facing, image in zhou.items():
        image.save(OUT / f"zhou_{facing}.png", optimize=True)

    # 深色底验收图，方便看白边/阴影是否需要再处理。
    preview = Image.new("RGBA", (600, 260), (18, 20, 28, 255))
    preview.alpha_composite(xiaobai, (20, 260 - xiaobai.height - 10))
    preview.alpha_composite(miner, (160, 260 - miner.height - 10))
    preview.alpha_composite(zheng, (340, 260 - zheng.height - 10))
    if zhou:
        preview.alpha_composite(zhou["down"], (450, 260 - zhou["down"].height - 10))
    preview.save(PREVIEW, optimize=True)

    for name, image in (("xiaobai", xiaobai), ("miner", miner), ("zheng", zheng)):
        path = OUT / f"{name}.png"
        print(f"[ch01-gen] {path.relative_to(ROOT)} {image.size} {path.stat().st_size} bytes")
    for facing, image in zhou.items():
        path = OUT / f"zhou_{facing}.png"
        print(f"[ch01-gen] {path.relative_to(ROOT)} {image.size} {path.stat().st_size} bytes")
    print(f"[ch01-gen] {PREVIEW.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
