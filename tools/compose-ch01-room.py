#!/usr/bin/env python3
"""用「游戏素材大师」生成的寝室零部件拼出 11×15 地图背景。

输入：
    assets-src/map/ch01/room-parts-green.webp  # 3×3 绿幕零部件（job imvn3eto3c810f8）
输出：
    public/assets/img/map/ch01/dorm_room.png   # 704×960（352×480 美术像素 2×）
    assets-src/map/ch01/room-props/*.png       # 抠好的单个零件，便于复用/检查

原则：房间不再画整张细图；地板/墙用程序化 tile，床/桌/柜/箱/地毯/门/吊扇用零件拼。
碰撞网格仍是 `src/map/rooms/ch01-dorm.ts` 的 11×15 ASCII。
"""

from __future__ import annotations

import random
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets-src" / "map" / "ch01" / "room-parts-green.webp"
BED_ZHENG_SRC = ROOT / "assets-src" / "map" / "ch01" / "bed-zheng-green.webp"
PROPS = ROOT / "assets-src" / "map" / "ch01" / "room-props"
OUT = ROOT / "public" / "assets" / "img" / "map" / "ch01" / "dorm_room.png"

ART_W, ART_H = 352, 480
TILE = 32
SCALE = 2

INK = (18, 20, 26, 255)
WALL = (30, 28, 32, 255)
WALL_LIGHT = (48, 42, 44, 255)
FLOOR = (92, 60, 38, 255)
FLOOR_DARK = (66, 42, 28, 255)
FLOOR_LIGHT = (120, 82, 52, 255)
SHADOW = (30, 18, 12, 255)


def chroma_key(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            dominance = g - max(r, b)
            if g > 90 and dominance > 22:
                alpha = max(0, min(255, int(255 * (1 - dominance / 110))))
                if dominance > 70:
                    alpha = 0
                despilled = min(g, max(r, b) + 12)
                pixels[x, y] = (r, despilled, b, min(a, alpha))
    return image


def fit_prop(image: Image.Image, width: int, height: int) -> Image.Image:
    box = image.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if box is None:
        return Image.new("RGBA", (width, height), (0, 0, 0, 0))
    cropped = image.crop(box)
    scale = min(width / cropped.width, height / cropped.height)
    resized = cropped.resize(
        (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    canvas.alpha_composite(resized, ((width - resized.width) // 2, height - resized.height))
    return canvas


def load_parts() -> dict[str, Image.Image]:
    sheet = chroma_key(Image.open(SRC))
    w, h = sheet.width, sheet.height
    cw, ch = w // 3, h // 3
    cells = {
        "floor": (0, 0),
        "wall": (1, 0),
        "rug": (2, 0),
        "bed": (0, 1),
        "desk": (1, 1),
        "wardrobe": (2, 1),
        "boxes": (0, 2),
        "door": (1, 2),
        "fan": (2, 2),
    }
    PROPS.mkdir(parents=True, exist_ok=True)
    out: dict[str, Image.Image] = {}
    for name, (col, row) in cells.items():
        cell = sheet.crop((col * cw, row * ch, (col + 1) * cw, (row + 1) * ch))
        out[name] = cell
        cell.save(PROPS / f"{name}.png", optimize=True)
    if BED_ZHENG_SRC.exists():
        out["bed_zheng"] = chroma_key(Image.open(BED_ZHENG_SRC))
        out["bed_zheng"].save(PROPS / "bed_zheng.png", optimize=True)
    return out


def draw_floor(draw: ImageDraw.ImageDraw) -> None:
    draw.rectangle((0, 0, ART_W, ART_H), fill=FLOOR)
    rng = random.Random(12)
    for y in range(0, ART_H, 16):
        draw.line((0, y, ART_W, y), fill=FLOOR_DARK, width=1)
        offset = 16 if (y // 16) % 2 == 0 else 0
        for x in range(offset, ART_W, 48):
            draw.line((x, y, x, y + 16), fill=FLOOR_DARK, width=1)
        for _ in range(3):
            x = rng.randrange(4, ART_W - 4)
            draw.line((x, y + 6, x + rng.randrange(4, 10), y + 6), fill=FLOOR_LIGHT, width=1)


def draw_walls(draw: ImageDraw.ImageDraw) -> None:
    draw.rectangle((0, 0, ART_W, TILE), fill=WALL)
    draw.rectangle((0, 0, TILE, ART_H), fill=WALL)
    draw.rectangle((ART_W - TILE, 0, ART_W, ART_H), fill=WALL)
    draw.rectangle((0, ART_H - TILE, ART_W, ART_H), fill=WALL)
    draw.line((0, TILE - 1, ART_W, TILE - 1), fill=WALL_LIGHT, width=1)
    draw.line((TILE - 1, 0, TILE - 1, ART_H), fill=WALL_LIGHT, width=1)
    draw.line((ART_W - TILE, 0, ART_W - TILE, ART_H), fill=WALL_LIGHT, width=1)
    draw.line((0, ART_H - TILE, ART_W, ART_H - TILE), fill=WALL_LIGHT, width=1)


def draw_window(draw: ImageDraw.ImageDraw) -> None:
    # 顶部墙上的窗：与 room 的 window marker (8,0) 对齐。
    x0, y0, x1, y1 = 7 * TILE, 4, 10 * TILE, TILE - 4
    draw.rectangle((x0, y0, x1, y1), fill=(32, 52, 62, 255))
    draw.rectangle((x0 + 2, y0 + 2, x1 - 2, y1 - 2), fill=(84, 128, 136, 255))
    draw.line(((x0 + x1) // 2, y0 + 2, (x0 + x1) // 2, y1 - 2), fill=INK, width=2)
    draw.line((x0 + 2, (y0 + y1) // 2, x1 - 2, (y0 + y1) // 2), fill=INK, width=1)
    draw.rectangle((x0, y0, x1, y1), outline=(96, 70, 42, 255), width=2)


def add_shadow(canvas: Image.Image, box: tuple[int, int, int, int]) -> None:
    shadow = Image.new("RGBA", (ART_W, ART_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(shadow)
    x0, y0, x1, y1 = box
    draw.rectangle((x0 + 2, y1 - 5, x1 + 2, y1 + 2), fill=(20, 10, 6, 120))
    canvas.alpha_composite(shadow)


def main() -> None:
    parts = load_parts()
    canvas = Image.new("RGBA", (ART_W, ART_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    draw_floor(draw)
    draw_walls(draw)
    draw_window(draw)

    # 两张双层床：左侧下铺睡着郑卿，右侧空床镜像朝内；左下衣柜，右下书桌（镜像）。
    slots = {
        "bed_zheng": (2 * TILE, 2 * TILE, 2 * TILE, 3 * TILE),
        "bed": (7 * TILE, 2 * TILE, 2 * TILE, 3 * TILE),
        "wardrobe": (2 * TILE, 9 * TILE, 2 * TILE, 3 * TILE),
        "desk": (7 * TILE, 9 * TILE, 2 * TILE, 3 * TILE),
    }
    for name, (x, y, w, h) in slots.items():
        add_shadow(canvas, (x, y, x + w, y + h))
        prop = fit_prop(parts[name], w, h)
        if name == "bed":
            prop = prop.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        elif name == "desk":
            prop = prop.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        canvas.alpha_composite(prop, (x, y))

    # 吊扇：顶部中央，2×2 tile，压在墙上作为室内顶灯。
    fan = fit_prop(parts["fan"], 2 * TILE, 2 * TILE)
    canvas.alpha_composite(fan, (4 * TILE, 1 * TILE))

    # 门：底部中央，1 tile 宽，向上延伸 1.5 tile。
    door = fit_prop(parts["door"], TILE, int(TILE * 1.5))
    canvas.alpha_composite(door, (5 * TILE, ART_H - TILE - door.height + TILE))

    # 用不透明深色叠层做边缘压暗。
    tint = Image.new("RGBA", (ART_W, ART_H), (10, 8, 8, 0))
    tdraw = ImageDraw.Draw(tint)
    tdraw.rectangle((0, 0, ART_W, 8), fill=(10, 8, 8, 90))
    tdraw.rectangle((0, ART_H - 8, ART_W, ART_H), fill=(10, 8, 8, 90))
    canvas.alpha_composite(tint)

    final = canvas.resize((ART_W * SCALE, ART_H * SCALE), Image.Resampling.NEAREST)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    final.save(OUT, optimize=True)
    print(f"[ch01-room] {OUT.relative_to(ROOT)} {final.size} {OUT.stat().st_size} bytes")
    for name in ("bed_zheng", "bed", "wardrobe", "desk", "door", "fan"):
        print(f"[ch01-room] prop {name}: {parts[name].size}")


if __name__ == "__main__":
    main()
