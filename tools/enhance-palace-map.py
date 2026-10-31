#!/usr/bin/env python3
"""在金殿整图 hall.png 上只做叠加：窗棂斜光柱、香炉烟/浮尘、地面反光、暗角、金红色温。

不改几何、不重画、不换素材 —— 所有几何信息都从 hall.png 实测（见下方常量）。
同一输入重复运行像素一致（随机只来自固定 seed）。

用法
----
    python3 tools/enhance-palace-map.py

输出
----
    .tmp/art-review/hall_v2.png   1056×1728（与 hall.png 同尺寸）
"""

from __future__ import annotations

import math
import pathlib
import random

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "public/assets/img/map/palace/hall.png"
OUT = ROOT / ".tmp/art-review"

W, H = 1056, 1728

# hall.png 实测（像素）
LATTICE_TOP, LATTICE_BOTTOM = 96, 384        # 雕花窗棂那一排
DAIS_TOP, DAIS_BOTTOM = 400, 700             # 白台 + 三级台阶
CARPET_TOP = 700                             # 红毯起点
CARPET_HALF_TOP, CARPET_HALF_BOTTOM = 168, 249   # 红毯上下半宽（实测 348–709 / 280–777）
PILLARS = ((0, 132), (924, 1056))            # 左右两根红柱的横向范围

SEED = 20261031


# --------------------------------------------------------------------------------------
# 小工具
# --------------------------------------------------------------------------------------
def vramp(size, stops) -> Image.Image:
    w, h = size
    stops = sorted(stops)
    img = Image.new("L", (1, h))
    px = img.load()
    for y in range(h):
        t = y / max(1, h - 1)
        for i in range(len(stops) - 1):
            t0, v0 = stops[i]
            t1, v1 = stops[i + 1]
            if t0 <= t <= t1:
                k = 0.0 if t1 == t0 else (t - t0) / (t1 - t0)
                px[0, y] = int(round(v0 + (v1 - v0) * k))
                break
        else:
            px[0, y] = stops[-1][1]
    return img.resize((w, h), Image.NEAREST)


def radial(size, box, blur) -> Image.Image:
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).ellipse(box, fill=255)
    return m.filter(ImageFilter.GaussianBlur(blur))


def soft_poly(points, blur, size=(W, H)) -> Image.Image:
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).polygon(points, fill=255)
    return m.filter(ImageFilter.GaussianBlur(blur))


def light_from_mask(mask, tint=(255, 198, 130), strength=0.3) -> Image.Image:
    chans = tuple(mask.point(lambda v, c=c: int(v * strength * c / 255)) for c in tint)
    return Image.merge("RGB", chans)


def add_light(canvas, light) -> Image.Image:
    return ImageChops.add(canvas, light)


def shade(canvas, mask, color=(24, 12, 8)) -> Image.Image:
    return Image.composite(Image.new("RGB", canvas.size, color), canvas, mask)


def bloom(canvas, threshold=190, amount=0.16) -> Image.Image:
    small = canvas.resize((W // 4, H // 4), Image.LANCZOS)
    bright = small.point(lambda v: max(0, v - threshold) * 3 // 2)
    glow = bright.filter(ImageFilter.GaussianBlur(13)).resize((W, H), Image.LANCZOS)
    return Image.blend(canvas, ImageChops.add(canvas, glow), amount)


# --------------------------------------------------------------------------------------
# 1. 窗棂斜光柱（对应文案「光从雕花窗棂里斜进来」）
# --------------------------------------------------------------------------------------
def lattice_shafts(canvas: Image.Image) -> Image.Image:
    beams = []
    # (起点 x, 起点宽, 落点 x, 落点宽)；整体往右下斜，像午后的斜阳
    for x0, w0, dx, w1, strength in (
        (104, 44, 230, 128, 0.55),
        (262, 50, 262, 150, 0.85),
        (432, 56, 284, 168, 1.00),
        (626, 50, 262, 150, 0.85),
        (800, 44, 240, 128, 0.55),
    ):
        top_y, bot_y = LATTICE_TOP + 24, 1180
        pts = [(x0, top_y), (x0 + w0, top_y), (x0 + dx + w1, bot_y), (x0 + dx, bot_y)]
        beams.append((pts, strength))

    shafts = Image.new("L", (W, H), 0)
    cores = Image.new("L", (W, H), 0)
    for pts, strength in beams:
        m = soft_poly(pts, 22)
        shafts = ImageChops.lighter(shafts, m.point(lambda v, s=strength: int(v * s)))
        inner = soft_poly([(pts[0][0] + 14, pts[0][1]), (pts[1][0] - 12, pts[1][1]),
                           (pts[2][0] - 40, pts[2][1]), (pts[3][0] + 44, pts[3][1])], 20)
        cores = ImageChops.lighter(cores, inner.point(lambda v, s=strength: int(v * s)))

    fade = vramp((W, H), [(0.0, 0), (0.06, 0), (0.10, 165), (0.30, 235), (0.52, 175),
                          (0.70, 90), (0.82, 26), (1.0, 0)])
    shafts = ImageChops.multiply(shafts, fade)
    cores = ImageChops.multiply(cores, fade)

    # 窗棂格影：光柱里压几道很淡的斜暗条（窗框投下来的）
    grate = Image.new("L", (W, H), 0)
    gd = ImageDraw.Draw(grate)
    for pts, _ in beams:
        for k in (0.24, 0.5, 0.76):
            x0 = pts[0][0] + (pts[1][0] - pts[0][0]) * k
            x1 = pts[3][0] + (pts[2][0] - pts[3][0]) * k
            gd.line([(x0, pts[0][1]), (x1, pts[3][1])], fill=84, width=9)
    grate = grate.filter(ImageFilter.GaussianBlur(5))

    # 光柱之间压一点暗，缝才看得出来（只压上半段）
    union = shafts.filter(ImageFilter.GaussianBlur(46))
    gaps = ImageChops.invert(union).point(lambda v: int(v * 18 / 255))
    gaps = ImageChops.multiply(gaps, vramp((W, H), [(0.0, 0), (0.08, 200), (0.5, 235), (0.75, 0), (1.0, 0)]))
    canvas = shade(canvas, gaps, (22, 12, 7))

    canvas = add_light(canvas, light_from_mask(shafts, (255, 196, 128), 0.13))
    canvas = add_light(canvas, light_from_mask(cores, (255, 206, 148), 0.085))
    canvas = shade(canvas, grate, (26, 16, 10))
    return canvas


# --------------------------------------------------------------------------------------
# 2. 香炉烟 + 浮尘
# --------------------------------------------------------------------------------------
def incense_smoke(canvas: Image.Image) -> Image.Image:
    smoke = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(smoke)
    rng = random.Random(SEED + 11)
    for base_x, top_y, height, amp in ((300, 260, 700, 40), (760, 300, 620, 32), (520, 240, 460, 24)):
        prev = None
        for i in range(0, 61):
            t = i / 60
            y = top_y + height * (1 - t)
            x = base_x + math.sin(t * 3.1 + base_x * 0.01) * amp * t + (t ** 2) * 26
            w = int(6 + 26 * t)
            d.ellipse((x - w, y - w // 2, x + w, y + w // 2), fill=int(96 + 90 * (1 - t)))
            if prev:
                d.line([prev, (x, y)], fill=int(110 + 80 * (1 - t)), width=max(2, int(3 + 6 * t)))
            prev = (x, y)
    smoke = smoke.filter(ImageFilter.GaussianBlur(34))
    smoke = ImageChops.multiply(smoke, vramp((W, H), [(0.0, 0), (0.10, 200), (0.35, 255),
                                                      (0.62, 120), (0.80, 0), (1.0, 0)]))
    canvas = add_light(canvas, light_from_mask(smoke, (236, 228, 212), 0.42))

    # 浮尘：只落在光柱经过的中段
    motes = Image.new("RGB", (W, H), (0, 0, 0))
    md = ImageDraw.Draw(motes)
    for _ in range(140):
        t = rng.random()
        y = int(LATTICE_TOP + (1180 - LATTICE_TOP) * t)
        x0 = 96 + 700 * rng.random()
        x = int(x0 + 300 * (y - LATTICE_TOP) / 1000)
        r = rng.choice((1, 1, 2, 2, 3))
        v = rng.randrange(14, 34)
        md.ellipse((x - r, y - r, x + r, y + r), fill=(v, int(v * 0.78), int(v * 0.5)))
    motes = motes.filter(ImageFilter.GaussianBlur(1.6))
    return add_light(canvas, motes)


# --------------------------------------------------------------------------------------
# 3. 地面反光
# --------------------------------------------------------------------------------------
def floor_reflection(canvas: Image.Image) -> Image.Image:
    # (a) 白台/台阶的暖光倒映在磨石上：把台阶亮面压扁、模糊、贴到台脚下方
    refl = canvas.crop((0, DAIS_TOP, W, DAIS_BOTTOM))
    refl = refl.resize((W, int((DAIS_BOTTOM - DAIS_TOP) * 0.5)), Image.LANCZOS)
    refl = refl.filter(ImageFilter.GaussianBlur(11))
    refl = ImageEnhance.Brightness(refl).enhance(0.20)
    mask = Image.new("L", (W, H), 0)
    mask.paste(vramp((W, refl.height), [(0.0, 70), (0.4, 36), (1.0, 0)]), (0, DAIS_BOTTOM - 20))
    # 红毯不铺镜面（织物）
    carpet = Image.new("L", (W, H), 255)
    ImageDraw.Draw(carpet).polygon(
        [(W // 2 - CARPET_HALF_TOP, CARPET_TOP), (W // 2 + CARPET_HALF_TOP, CARPET_TOP),
         (W // 2 + CARPET_HALF_BOTTOM, H), (W // 2 - CARPET_HALF_BOTTOM, H)], fill=0)
    mask = ImageChops.multiply(mask, carpet)
    layer = Image.new("RGB", (W, H), (0, 0, 0))
    layer.paste(refl, (0, DAIS_BOTTOM - 20))
    canvas = Image.composite(ImageChops.add(canvas, layer), canvas, mask)

    # (b) 两根红柱与窗光的竖向倒影
    streaks = Image.new("RGB", (W, H), (0, 0, 0))
    sd = ImageDraw.Draw(streaks)
    for x, w, k in ((36, 46, 34), (112, 22, 26), (912, 22, 26), (952, 46, 34),
                    (380, 14, 12), (640, 14, 12)):
        sd.rectangle((x, 900, x + w, 1500), fill=(k, int(k * 0.62), int(k * 0.34)))
    streaks = streaks.filter(ImageFilter.GaussianBlur(26))
    s_fade = vramp((W, H), [(0.0, 0), (0.50, 0), (0.56, 255), (0.82, 90), (1.0, 0)])
    streaks = ImageChops.multiply(streaks, Image.merge("RGB", (s_fade, s_fade, s_fade)))
    canvas = add_light(canvas, streaks)

    # (c) 红毯：金色包边的一道反光 + 毯面很淡的高光带
    trim = Image.new("RGB", (W, H), (0, 0, 0))
    td = ImageDraw.Draw(trim)
    for sign in (-1, 1):
        td.line([(W // 2 + sign * CARPET_HALF_TOP, CARPET_TOP),
                 (W // 2 + sign * CARPET_HALF_BOTTOM, H)], fill=(30, 20, 6), width=5)
    canvas = add_light(canvas, trim.filter(ImageFilter.GaussianBlur(6)))

    sheen = Image.new("RGB", (W, H), (0, 0, 0))
    ImageDraw.Draw(sheen).polygon(
        [(W // 2 - 60, CARPET_TOP + 40), (W // 2 + 60, CARPET_TOP + 40),
         (W // 2 + 120, H), (W // 2 - 120, H)], fill=(14, 5, 3))
    canvas = add_light(canvas, sheen.filter(ImageFilter.GaussianBlur(46)))
    return canvas


# --------------------------------------------------------------------------------------
# 4. 金红色温统一 + 暗角 + 颗粒
# --------------------------------------------------------------------------------------
def grade(canvas: Image.Image) -> Image.Image:
    # 金红统一：整体偏金，暗部带一点朱，别把白台染脏
    canvas = ImageChops.multiply(canvas, Image.merge(
        "RGB", (Image.new("L", (W, H), 255),
                Image.new("L", (W, H), 243),
                Image.new("L", (W, H), 222))))
    warm = Image.new("RGB", (W, H), (255, 186, 118))
    canvas = Image.composite(warm, canvas, Image.new("L", (W, H), 12))

    # 暗部加一点朱红：越暗越红
    lum = canvas.convert("L")
    dark = ImageChops.invert(lum).point(lambda v: int(v * 34 / 255))
    canvas = Image.composite(Image.new("RGB", (W, H), (108, 24, 18)), canvas, dark)

    # 窗棂一排本身就是光源，稍微提亮并泛光
    window = rect_soft((40, LATTICE_TOP - 30, W - 40, LATTICE_BOTTOM), 40)
    canvas = add_light(canvas, light_from_mask(window, (255, 190, 120), 0.035))
    return canvas


def rect_soft(box, blur) -> Image.Image:
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).rectangle(box, fill=255)
    return m.filter(ImageFilter.GaussianBlur(blur))


def vignette_and_grain(canvas: Image.Image) -> Image.Image:
    vig = radial((W, H), (-W * 0.30, -H * 0.05, W * 1.30, H * 1.05), 190)
    vig = vig.point(lambda v: 150 + int(v * (255 - 150) / 255))
    canvas = Image.composite(canvas, Image.new("RGB", (W, H), (14, 8, 7)), vig)

    rng = random.Random(SEED + 13)
    small = Image.new("L", (132, 216))
    small.putdata([rng.randrange(116, 142) for _ in range(132 * 216)])
    g = small.resize((W, H), Image.BICUBIC)
    up = g.point(lambda v: max(0, v - 128) // 2)
    dn = g.point(lambda v: max(0, 128 - v) // 2)
    return ImageChops.subtract(ImageChops.add(canvas, up.convert("RGB")), dn.convert("RGB"))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    canvas = Image.open(SRC).convert("RGB")
    src_mean = [int(canvas.getchannel(i).resize((1, 1), Image.BOX).getpixel((0, 0))) for i in (0, 1, 2)]

    canvas = lattice_shafts(canvas)
    canvas = incense_smoke(canvas)
    canvas = floor_reflection(canvas)
    canvas = grade(canvas)
    canvas = bloom(canvas, threshold=200, amount=0.10)
    canvas = vignette_and_grain(canvas)
    canvas = ImageEnhance.Contrast(canvas).enhance(1.05)
    canvas = ImageChops.multiply(canvas, Image.new("RGB", (W, H), (238, 236, 234)))

    out = OUT / "hall_v2.png"
    canvas.save(out)
    out_mean = [int(canvas.getchannel(i).resize((1, 1), Image.BOX).getpixel((0, 0))) for i in (0, 1, 2)]
    print(f"[hall] {out.relative_to(ROOT)} {canvas.size} {out.stat().st_size} bytes")
    print(f"[hall] 平均色 原图 {src_mean} → v2 {out_mean}")


if __name__ == "__main__":
    main()
