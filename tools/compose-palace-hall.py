#!/usr/bin/env python3
"""合成梦域金殿的俯视 45° 地图（33×54 格、tile 32 美术像素 → 1056×1728）。

和寝室同一套口径：一张整图贴地，碰撞与站位走格坐标，场景只负责显示。

做法（顺序有讲究）：
  1. 地砖平铺 → 远处压暗、窗下加光池
  2. 北墙整张贴上，底部与地面之间加一层过渡阴影
  3. 高台：台面 + 正立面（梯形收口）+ 边缘高光
  4. 三级台阶：每级「踏面亮、立面暗」，并投一道软接触阴影
  5. 地毯：梯形透视，织纹用细横线压出来，边缘有软阴影
  6. 龙椅：贴图 + 投影 + 台面反光
  7. 红柱：两对（近大远小），带接触阴影
  8. 调色：暖高光 / 冷暗部 + 轻微泛光 + 暗角

用法：
  python3 tools/compose-palace-hall.py            # 出 assets-src/palace/hall-final.png
  python3 tools/compose-palace-hall.py --preview  # 另出 540 宽的预览图到 .tmp/
"""

from __future__ import annotations

import argparse
import pathlib

from PIL import Image, ImageDraw, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / 'assets-src/palace/raw'
OUT = ROOT / 'assets-src/palace'

COLS, ROWS, TILE = 33, 54, 32
W, H = COLS * TILE, ROWS * TILE

# 版面（美术像素）
WALL_BOTTOM = 372
DAIS_TOP, DAIS_BOTTOM = 392, 620
DAIS_TOP_HALF, DAIS_BOTTOM_HALF = 214, 306
STEP_H = 38


def green_key(im: Image.Image, low: int = 70, high: int = 190) -> Image.Image:
    """绿幕软键：绿度越高越透明，顺带去溢色。"""
    im = im.convert('RGBA')
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            gn = g - max(r, b)
            if gn > low:
                alpha = int(max(0, min(255, (high - gn) / (high - low) * 255)))
                px[x, y] = (r, g - int(0.9 * max(0, gn)), b, min(a, alpha))
    return im


def soften_shadow(size: tuple[int, int], radius: int, alpha: int) -> Image.Image:
    shadow = Image.new('RGBA', size, (0, 0, 0, 0))
    return shadow


def contact_shadow(width: int, height: int, alpha: int = 130, blur: int = 9) -> Image.Image:
    """贴地椭圆接触阴影。"""
    shadow = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse([0, 0, width - 1, height - 1], fill=(20, 8, 8, alpha))
    return shadow.filter(ImageFilter.GaussianBlur(blur))


def warm_light_mask() -> Image.Image:
    """窗棂斜光的叠加层：几道倾斜光柱。"""
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for i in range(0, W, 136):
        draw.polygon(
            [
                (i + 26, WALL_BOTTOM),
                (i + 110, WALL_BOTTOM),
                (i + 330, H * 0.66),
                (i + 196, H * 0.66),
            ],
            fill=(255, 208, 140, 22),
        )
    return layer.filter(ImageFilter.GaussianBlur(28))


def floor_layer() -> Image.Image:
    src = Image.open(RAW / 'floor-tile.png').convert('RGB')
    tile = src.resize((8 * TILE, 8 * TILE), Image.LANCZOS)
    canvas = Image.new('RGB', (W, H))
    for y in range(0, H, 8 * TILE):
        for x in range(0, W, 8 * TILE):
            canvas.paste(tile, (x, y))

    # 远处压暗：越靠上越暗，做出纵深
    depth = Image.new('L', (W, H))
    dd = ImageDraw.Draw(depth)
    for y in range(H):
        dd.line([(0, y), (W, y)], fill=int(255 - 96 * (y / H) ** 1.4))
    canvas = Image.composite(canvas, Image.new('RGB', (W, H), (26, 16, 14)), depth)

    # 高台前的光池：龙椅正下方最亮
    pool = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(pool).ellipse(
        [W // 2 - 430, DAIS_TOP - 60, W // 2 + 430, DAIS_TOP + 520],
        fill=(255, 216, 150, 26),
    )
    pool = pool.filter(ImageFilter.GaussianBlur(120))
    return Image.alpha_composite(canvas.convert('RGBA'), pool).convert('RGB')


def draw_wall(canvas: Image.Image) -> None:
    wall = Image.open(RAW / 'wall-north.png').convert('RGB')
    wh = int(wall.height * W / wall.width)
    wall = wall.resize((W, wh), Image.LANCZOS).crop((0, 0, W, 520))
    canvas.paste(wall, (0, -110))

    draw = ImageDraw.Draw(canvas, 'RGBA')
    # 墙面与地面的过渡：一条软阴影带
    draw.rectangle([0, WALL_BOTTOM - 26, W, WALL_BOTTOM + 14], fill=(16, 8, 8, 120))
    draw.rectangle([0, WALL_BOTTOM + 14, W, WALL_BOTTOM + 22], fill=(16, 8, 8, 60))


def draw_dais(canvas: Image.Image) -> None:
    draw = ImageDraw.Draw(canvas, 'RGBA')
    top, bottom = DAIS_TOP, DAIS_BOTTOM
    tx0, tx1 = W // 2 - DAIS_TOP_HALF, W // 2 + DAIS_TOP_HALF
    bx0, bx1 = W // 2 - DAIS_BOTTOM_HALF, W // 2 + DAIS_BOTTOM_HALF

    # 台面
    draw.polygon([(tx0, top), (tx1, top), (bx1, bottom), (bx0, bottom)], fill=(232, 222, 202, 255))
    # 正立面（台沿），比台面暗一档
    draw.polygon([(bx0, bottom), (bx1, bottom), (bx1, bottom + 26), (bx0, bottom + 26)], fill=(198, 186, 160, 255))
    # 台沿高光 + 台面后缘阴影
    draw.line([(bx0, bottom), (bx1, bottom)], fill=(150, 130, 92, 255), width=5)
    draw.line([(tx0, top + 3), (tx1, top + 3)], fill=(255, 250, 236, 120), width=5)
    draw.polygon([(tx0, top), (tx1, top), (tx1, top + 26), (tx0, top + 26)], fill=(150, 136, 108, 70))


def draw_steps(canvas: Image.Image) -> int:
    draw = ImageDraw.Draw(canvas, 'RGBA')
    bx0, bx1 = W // 2 - DAIS_BOTTOM_HALF, W // 2 + DAIS_BOTTOM_HALF
    y = DAIS_BOTTOM + 26
    for i in range(3):
        spread = 26 * (i + 1)
        x0, x1 = bx0 - spread, bx1 + spread
        tread = (230, 220, 200, 255)
        riser = (170, 154, 120, 255)
        # 踏面
        draw.polygon([(x0, y), (x1, y), (x1 + 16, y + STEP_H - 12), (x0 - 16, y + STEP_H - 12)], fill=tread)
        # 立面
        draw.rectangle([x0 - 16, y + STEP_H - 12, x1 + 16, y + STEP_H], fill=riser)
        # 踏面高光 + 台阶角上的接触阴影
        draw.line([(x0, y + 1), (x1, y + 1)], fill=(252, 246, 232, 235), width=3)
        y += STEP_H
    return y


def draw_carpet(canvas: Image.Image, top: int) -> None:
    draw = ImageDraw.Draw(canvas, 'RGBA')
    half_top, half_bottom = 118, 250
    pts = [
        (W // 2 - half_top, top),
        (W // 2 + half_top, top),
        (W // 2 + half_bottom, H),
        (W // 2 - half_bottom, H),
    ]

    # 地毯边缘的软阴影（先画到单独层再叠）
    shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).polygon(
        [(x + (10 if x > W // 2 else -10), y) for x, y in pts], fill=(30, 10, 10, 90)
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(14))
    canvas.alpha_composite(shadow) if canvas.mode == 'RGBA' else None

    draw.polygon(pts, fill=(122, 26, 30, 255))
    # 织纹：横向细线，越往下越疏
    for i in range(1, 46):
        t = i / 46
        yy = top + (H - top) * t
        half = half_top + (half_bottom - half_top) * t
        draw.line([(W // 2 - half + 10, yy), (W // 2 + half - 10, yy)], fill=(112, 22, 26, 150), width=2)
    # 金色包边 + 中心菱形纹
    draw.line([pts[0], pts[3]], fill=(196, 148, 64, 255), width=6)
    draw.line([pts[1], pts[2]], fill=(196, 148, 64, 255), width=6)
    for i in range(1, 14):
        t = i / 14
        yy = top + (H - top) * t
        half = half_top + (half_bottom - half_top) * t
        size = 8 + 6 * t
        draw.polygon(
            [(W // 2, yy - size), (W // 2 + size, yy), (W // 2, yy + size), (W // 2 - size, yy)],
            outline=(200, 154, 70, 130),
        )


def draw_throne(canvas: Image.Image) -> None:
    throne = green_key(Image.open(RAW / 'throne-green.png'))
    tw = 372
    th = int(throne.height * tw / throne.width)
    throne = throne.resize((tw, th), Image.LANCZOS).crop((0, 0, tw, int(th * 0.90)))
    ty = DAIS_BOTTOM - throne.height - 96

    shadow = contact_shadow(tw + 60, 54, alpha=145, blur=11)
    canvas.paste(shadow, (W // 2 - tw // 2 - 30, ty + throne.height - 40), shadow)
    canvas.paste(throne, (W // 2 - tw // 2, ty), throne)

    # 椅背后的一圈暖反光：只做很淡的一层，避免变成一块白斑
    glow = Image.new('RGBA', (tw + 120, throne.height + 120), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([20, 20, tw + 100, throne.height + 100], fill=(255, 198, 110, 16))
    glow = glow.filter(ImageFilter.GaussianBlur(46))
    canvas.paste(glow, (W // 2 - tw // 2 - 60, ty - 50), glow)

    # 龙椅在台面上的落地阴影（横条，比椭圆更贴台面）
    seat_shadow = Image.new('RGBA', (tw + 40, 26), (0, 0, 0, 0))
    ImageDraw.Draw(seat_shadow).rectangle([0, 6, tw + 38, 20], fill=(28, 12, 12, 110))
    seat_shadow = seat_shadow.filter(ImageFilter.GaussianBlur(8))
    canvas.paste(seat_shadow, (W // 2 - tw // 2 - 20, ty + throne.height - 18), seat_shadow)


def draw_pillars(canvas: Image.Image) -> None:
    pillar = green_key(Image.open(RAW / 'pillar-green.png'))
    # (x, y, 高度)：近的一对更高更靠下
    for px_, py_, ph in ((-60, 420, 940), (W - 60 - 156, 420, 940)):
        pw = int(pillar.width * ph / pillar.height)
        p = pillar.resize((pw, ph), Image.LANCZOS)
        shadow = contact_shadow(pw + 50, 46, alpha=120, blur=10)
        canvas.paste(shadow, (px_ - 25, py_ + ph - 34), shadow)
        canvas.paste(p, (px_, py_), p)


def grade(canvas: Image.Image) -> Image.Image:
    """暖高光 / 冷暗部 + 泛光 + 暗角。"""
    rgba = canvas.convert('RGBA')
    rgba = Image.alpha_composite(rgba, Image.new('RGBA', (W, H), (255, 176, 96, 14)))

    # 泛光：缩小 → 提亮 → 模糊 → 叠加
    small = rgba.resize((W // 4, H // 4), Image.LANCZOS)
    bright = small.point(lambda v: min(255, int(v * 1.25)))
    bloom = bright.filter(ImageFilter.GaussianBlur(18)).resize((W, H), Image.LANCZOS)
    rgba = Image.blend(rgba, Image.alpha_composite(rgba, bloom), 0.28)

    # 暗角
    vignette = Image.new('L', (W, H), 240)
    ImageDraw.Draw(vignette).ellipse([-W * 0.36, -H * 0.06, W * 1.36, H * 1.04], fill=255)
    vignette = vignette.filter(ImageFilter.GaussianBlur(180))
    return Image.composite(rgba.convert('RGB'), Image.new('RGB', (W, H), (14, 8, 8)), vignette)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--preview', action='store_true', help='另存 540 宽预览图')
    args = parser.parse_args()

    canvas = floor_layer().convert('RGBA')
    draw_wall(canvas)
    canvas = Image.alpha_composite(canvas, warm_light_mask())
    draw_dais(canvas)
    steps_bottom = draw_steps(canvas)
    draw_carpet(canvas, steps_bottom)
    draw_throne(canvas)
    draw_pillars(canvas)

    final = grade(canvas)
    OUT.mkdir(parents=True, exist_ok=True)
    final.save(OUT / 'hall-final.png')
    print(f'[map] {OUT / "hall-final.png"} {final.size}')

    if args.preview:
        tmp = ROOT / '.tmp'
        tmp.mkdir(exist_ok=True)
        final.resize((540, 884), Image.LANCZOS).save(tmp / 'hall-preview.png')
        print(f'[map] preview → {tmp / "hall-preview.png"}')


if __name__ == '__main__':
    main()
