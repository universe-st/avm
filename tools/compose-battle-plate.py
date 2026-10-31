#!/usr/bin/env python3
"""用金殿整图 hall.png 做一张 720×1280 的剧情战舞台图（纯 Pillow，确定性）。

构图留位（设计像素，720 宽基准）
--------------------------------
* 敌人在红毯中段：`ENEMY = (360, 820)`
* 玩家在左前方：`PLAYER = (190, 1128)`（脚底）——左下是空地砖，不摆任何遮挡
* 画面上方保留龙椅/窗棂做背景，下方留一条虚化的近景台阶做“镜头压边”

不生成新场景、不改 hall.png；只做裁切 / 调色 / 叠加光效。

用法
----
    python3 tools/compose-battle-plate.py

输出
----
    .tmp/art-review/battle_plate.png   720×1280
"""

from __future__ import annotations

import pathlib
import random

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "public/assets/img/map/palace/hall.png"
OUT = ROOT / ".tmp/art-review"

PW, PH = 720, 1280
CONTENT_H = round(1728 * PW / 1056)      # 1178：整张 hall 等比缩到 720 宽
FOREGROUND_H = PH - CONTENT_H            # 102：底部的近景台阶虚化带

ENEMY = (360, 820)
PLAYER = (190, 1128)

# hall.png 里的实测锚点（等比缩放到 720 宽后换算）
HALL_SCALE = PW / 1056
def hall_xy(x: float, y: float) -> tuple[int, int]:
    return int(x * HALL_SCALE), int(y * HALL_SCALE)

LATTICE_TOP = hall_xy(528, 110)[1]
LATTICE_BOTTOM = hall_xy(528, 380)[1]
STEP_TOP = hall_xy(528, 400)[1]
STEP_BOTTOM = hall_xy(528, 700)[1]
CARPET_TOP = hall_xy(528, 700)[1]

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


def soft_poly(points, blur, size=(PW, PH)) -> Image.Image:
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).polygon(points, fill=255)
    return m.filter(ImageFilter.GaussianBlur(blur))


def light_from_mask(mask, tint=(255, 198, 130), strength=0.3) -> Image.Image:
    chans = tuple(mask.point(lambda v, c=c: int(v * strength * c / 255)) for c in tint)
    return Image.merge("RGB", chans)


def shade(canvas, mask, color=(16, 10, 8)) -> Image.Image:
    return Image.composite(Image.new("RGB", canvas.size, color), canvas, mask)


def add_light(canvas, light) -> Image.Image:
    return ImageChops.add(canvas, light)


def bloom(canvas, threshold=176, amount=0.18):
    small = canvas.resize((PW // 4, PH // 4), Image.LANCZOS)
    bright = small.point(lambda v: max(0, v - threshold) * 3 // 2)
    glow = bright.filter(ImageFilter.GaussianBlur(12)).resize((PW, PH), Image.LANCZOS)
    return Image.blend(canvas, ImageChops.add(canvas, glow), amount)


# --------------------------------------------------------------------------------------
# 1. 底：整张 hall 等比铺满 720 宽 + 近景台阶压边
# --------------------------------------------------------------------------------------
def build_base() -> Image.Image:
    hall = Image.open(SRC).convert("RGB")
    content = hall.resize((PW, CONTENT_H), Image.LANCZOS)

    # 近景台阶：取原图台阶立面的石材质感，横向铺开、失焦、压暗一档，
    # 上沿留一条被聚光扫到的棱线高光 —— 读起来是"镜头站在台阶上"。
    riser = hall.crop((200, 596, 860, 668)).resize((PW, FOREGROUND_H), Image.LANCZOS)
    riser = riser.filter(ImageFilter.GaussianBlur(9))
    riser = ImageEnhance.Brightness(riser).enhance(0.85)
    riser = shade(riser, vramp((PW, FOREGROUND_H), [(0.0, 90), (0.18, 0), (0.75, 40), (1.0, 130)]),
                  (12, 8, 7))
    edge = Image.new("L", (PW, FOREGROUND_H), 0)
    ImageDraw.Draw(edge).line((0, 20, PW, 20), fill=120, width=3)
    edge = edge.filter(ImageFilter.GaussianBlur(4))
    riser = add_light(riser, Image.merge("RGB", (edge, edge.point(lambda v: int(v * 0.82)),
                                                edge.point(lambda v: int(v * 0.55)))))

    canvas = Image.new("RGB", (PW, PH), (10, 7, 6))
    canvas.paste(content, (0, 0))
    canvas.paste(riser, (0, CONTENT_H))
    # 接缝：用 46 px 渐变把近景带压回画面里，别留一条硬线
    seam = vramp((PW, 46), [(0.0, 0), (1.0, 235)])
    band = Image.new("L", (PW, 46), 0)
    band.paste(Image.new("L", (PW, 46), 255), (0, 0))
    blend = ImageChops.multiply(band, seam)
    full = Image.new("L", (PW, PH), 0)
    full.paste(blend, (0, CONTENT_H - 46))
    canvas = Image.composite(Image.new("RGB", (PW, PH), (14, 9, 8)), canvas, full)
    return canvas


# --------------------------------------------------------------------------------------
# 2. 调色：整体压低 + 金红统一 + 边缘冷
# --------------------------------------------------------------------------------------
def grade_base(canvas: Image.Image) -> Image.Image:
    """整体降到“黄昏殿内”的曝光：先统一压暗，再把金红留住，最后让边缘偏冷。"""
    # 曝光：顶（殿顶）最暗，中段留给角色，底部近景再压
    exposure = vramp((PW, PH), [(0.0, 96), (0.09, 128), (0.26, 168), (0.50, 176),
                                (0.74, 156), (0.92, 116), (1.0, 96)])
    canvas = ImageChops.multiply(canvas, Image.merge("RGB", (exposure, exposure, exposure)))

    # 金红：高光偏金、暗部偏朱——用两层很淡的色相叠，不抬黑
    warm = Image.new("RGB", (PW, PH), (196, 122, 54))
    canvas = ImageChops.multiply(canvas, Image.merge(
        "RGB", (Image.new("L", (PW, PH), 255),
                Image.new("L", (PW, PH), 236),
                Image.new("L", (PW, PH), 206))))
    canvas = Image.blend(canvas, ImageChops.multiply(canvas, warm.point(lambda v: min(255, v + 60))), 0.20)

    # 两侧/底边的冷压，把暖金的中心衬出来
    cool = Image.new("L", (PW, PH), 0)
    for box in ((-220, 0, 150, PH), (PW - 150, 0, PW + 220, PH)):
        cool = ImageChops.lighter(cool, radial((PW, PH), box, 170))
    canvas = Image.composite(Image.new("RGB", (PW, PH), (34, 48, 72)), canvas,
                             cool.point(lambda v: int(v * 46 / 255)))
    return canvas


# --------------------------------------------------------------------------------------
# 3. 聚光锥 + 毯上光池
# --------------------------------------------------------------------------------------
def stage_light(canvas: Image.Image) -> Image.Image:
    ex, ey = ENEMY

    # 形状（决定“哪里亮”）：锥体外柔、亮芯更窄、脚下光池
    cone_shape = soft_poly([(ex - 62, 96), (ex + 62, 96), (ex + 250, 1120), (ex - 250, 1120)], 30)
    # 顶端收进殿顶阴影里，别在龙椅后面留一个硬光框
    cone_shape = ImageChops.multiply(cone_shape, vramp((PW, PH), [
        (0.0, 0), (0.06, 60), (0.14, 210), (0.22, 255), (1.0, 255)]))
    core_shape = soft_poly([(ex - 30, 130), (ex + 30, 130), (ex + 132, 1080), (ex - 132, 1080)], 18)
    pool_shape = radial((PW, PH), (ex - 246, ey - 104, ex + 246, ey + 126), 48)

    # 锥体外的磨石再压一档（舞台只剩中间一束）
    lit = ImageChops.lighter(cone_shape, ImageChops.lighter(core_shape, pool_shape))
    shade_map = lit.point(lambda v: 150 + int(v * 105 / 255))
    canvas = ImageChops.multiply(canvas, Image.merge("RGB", (shade_map, shade_map, shade_map)))

    # 加法混光：锥体是很淡的雾，亮芯稍强，脚下光池最亮
    cone = ImageChops.multiply(cone_shape, vramp((PW, PH), [
        (0.0, 0), (0.08, 30), (0.28, 62), (0.52, 110), (0.64, 150), (0.72, 160),
        (0.82, 80), (0.92, 20), (1.0, 0)]))
    core = ImageChops.multiply(core_shape, vramp((PW, PH), [
        (0.0, 0), (0.12, 20), (0.34, 60), (0.56, 120), (0.65, 190), (0.75, 90),
        (0.9, 10), (1.0, 0)]))
    pool = ImageChops.multiply(pool_shape, vramp((PW, PH), [
        (0.0, 0), (0.55, 0), (0.63, 255), (0.80, 255), (1.0, 0)]))

    halo = lit.filter(ImageFilter.GaussianBlur(80))
    canvas = add_light(canvas, light_from_mask(halo, (255, 170, 100), 0.03))
    canvas = add_light(canvas, light_from_mask(cone, (255, 196, 134), 0.11))
    canvas = add_light(canvas, light_from_mask(core, (255, 204, 148), 0.11))
    canvas = add_light(canvas, light_from_mask(pool, (255, 186, 116), 0.16))

    # 龙椅一圈很淡的金光：背景的锚点，不抢人
    throne = radial((PW, PH), (ex - 150, 170, ex + 150, 400), 90)
    canvas = add_light(canvas, light_from_mask(throne, (255, 186, 96), 0.06))

    # 左下（玩家位）补一点冷调环境光：既让站位区读得出来，也和中间的金光对冲
    px_, py_ = PLAYER
    key = radial((PW, PH), (px_ - 190, py_ - 300, px_ + 190, py_ + 30), 80)
    canvas = add_light(canvas, light_from_mask(key, (120, 148, 188), 0.075))
    return canvas


# --------------------------------------------------------------------------------------
# 4. 地面反光（磨石地砖的镜面感 + 红毯金边反光）
# --------------------------------------------------------------------------------------
def floor_reflection(canvas: Image.Image) -> Image.Image:
    # 台阶正下方：把台阶/白台的亮面竖着“压扁”一份贴在磨石上
    refl_src = canvas.crop((0, STEP_TOP, PW, STEP_BOTTOM))
    refl = refl_src.resize((PW, int((STEP_BOTTOM - STEP_TOP) * 0.55)), Image.LANCZOS)
    refl = refl.filter(ImageFilter.GaussianBlur(9))
    refl = ImageEnhance.Brightness(refl).enhance(0.40)
    refl_mask = vramp((PW, refl.height), [(0.0, 105), (0.35, 60), (1.0, 0)])
    # 只落在磨石上，红毯面不铺镜面
    carpet = Image.new("L", (PW, PH), 255)
    half_top, half_bottom = 96, 260
    top = CARPET_TOP
    ImageDraw.Draw(carpet).polygon(
        [(PW // 2 - half_top, top), (PW // 2 + half_top, top),
         (PW // 2 + half_bottom, PH), (PW // 2 - half_bottom, PH)], fill=0)
    mask = Image.new("L", (PW, PH), 0)
    mask.paste(refl_mask, (0, STEP_BOTTOM - 10))
    mask = ImageChops.multiply(mask, carpet)
    layer = Image.new("RGB", (PW, PH), (0, 0, 0))
    layer.paste(refl, (0, STEP_BOTTOM - 10))
    canvas = Image.composite(ImageChops.add(canvas, layer), canvas, mask)

    # 红毯：中央一条很淡的高光 + 金色包边的反光点
    sheen = Image.new("RGB", (PW, PH), (0, 0, 0))
    ImageDraw.Draw(sheen).polygon(
        [(PW // 2 - 40, CARPET_TOP + 10), (PW // 2 + 40, CARPET_TOP + 10),
         (PW // 2 + 80, PH), (PW // 2 - 80, PH)], fill=(16, 6, 4))
    canvas = add_light(canvas, sheen.filter(ImageFilter.GaussianBlur(40)))

    trim = Image.new("RGB", (PW, PH), (0, 0, 0))
    for sign in (-1, 1):
        ImageDraw.Draw(trim).line(
            [(PW // 2 + sign * half_top, CARPET_TOP), (PW // 2 + sign * half_bottom, PH)],
            fill=(44, 28, 8), width=5)
    canvas = add_light(canvas, trim.filter(ImageFilter.GaussianBlur(7)))

    # 磨石上的竖向反光条：柱子与窗光的倒影
    streaks = Image.new("RGB", (PW, PH), (0, 0, 0))
    sd = ImageDraw.Draw(streaks)
    for x, w, k in ((60, 26, 30), (126, 16, 22), (596, 16, 22), (660, 26, 30),
                    (300, 12, 12), (420, 12, 12)):
        sd.rectangle((x, STEP_BOTTOM + 8, x + w, STEP_BOTTOM + 300), fill=(k, int(k * 0.66), int(k * 0.38)))
    streaks = streaks.filter(ImageFilter.GaussianBlur(22))
    fade = vramp((PW, PH), [(0.0, 0), (0.42, 0), (0.5, 255), (0.78, 60), (1.0, 0)])
    streaks = ImageChops.multiply(streaks, Image.merge("RGB", (fade, fade, fade)))
    canvas = add_light(canvas, streaks)
    return canvas


# --------------------------------------------------------------------------------------
# 5. 轻尘 / 暗角 / 颗粒
# --------------------------------------------------------------------------------------
def cool_rim(canvas: Image.Image) -> Image.Image:
    """舞台两侧/底边的冷压：把暖金的中心衬出来。"""
    cool = Image.new("L", (PW, PH), 0)
    for box in ((-220, 260, 150, PH), (PW - 150, 260, PW + 220, PH)):
        cool = ImageChops.lighter(cool, radial((PW, PH), box, 150))
    cool = ImageChops.lighter(cool, vramp((PW, PH), [(0.0, 0), (0.82, 0), (1.0, 120)]))
    canvas = Image.composite(Image.new("RGB", (PW, PH), (32, 46, 68)), canvas,
                             cool.point(lambda v: int(v * 20 / 255)))
    return canvas


def dust(canvas: Image.Image) -> Image.Image:
    rng = random.Random(SEED + 3)
    ex, ey = ENEMY
    layer = Image.new("RGB", (PW, PH), (0, 0, 0))
    d = ImageDraw.Draw(layer)
    for _ in range(88):
        t = rng.random()
        y = int(90 + (ey + 120 - 90) * t)
        half = 60 + 190 * t
        x = int(ex + (rng.random() * 2 - 1) * half)
        r = rng.choice((1, 1, 1, 2, 2, 3))
        v = rng.randrange(14, 32)
        d.ellipse((x - r, y - r, x + r, y + r), fill=(v, int(v * 0.76), int(v * 0.5)))
    return add_light(canvas, layer.filter(ImageFilter.GaussianBlur(1.4)))


def vignette(canvas: Image.Image) -> Image.Image:
    vig = radial((PW, PH), (-PW * 0.28, -PH * 0.05, PW * 1.28, PH * 1.05), 170)
    vig = vig.point(lambda v: 146 + int(v * (255 - 146) / 255))
    canvas = Image.composite(canvas, Image.new("RGB", (PW, PH), (8, 5, 5)), vig)
    # 底部近景再压一层
    bottom = vramp((PW, PH), [(0.0, 255), (0.90, 246), (0.94, 200), (1.0, 165)])
    return ImageChops.multiply(canvas, Image.merge("RGB", (bottom, bottom, bottom)))


def grain(canvas: Image.Image) -> Image.Image:
    rng = random.Random(SEED + 5)
    small = Image.new("L", (90, 160))
    small.putdata([rng.randrange(115, 142) for _ in range(90 * 160)])
    g = small.resize((PW, PH), Image.BICUBIC)
    up = g.point(lambda v: max(0, v - 128) // 2)
    dn = g.point(lambda v: max(0, 128 - v) // 2)
    return ImageChops.subtract(ImageChops.add(canvas, up.convert("RGB")), dn.convert("RGB"))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    canvas = build_base()
    canvas = grade_base(canvas)
    canvas = stage_light(canvas)
    canvas = floor_reflection(canvas)
    canvas = dust(canvas)
    canvas = cool_rim(canvas)
    canvas = bloom(canvas, threshold=212, amount=0.06)
    canvas = vignette(canvas)
    canvas = grain(canvas)
    canvas = ImageEnhance.Contrast(canvas).enhance(1.07)

    out = OUT / "battle_plate.png"
    canvas.save(out)
    print(f"[battle] {out.relative_to(ROOT)} {canvas.size} {out.stat().st_size} bytes")
    print(f"[battle] 内容 {PW}×{CONTENT_H}（hall 等比 0.682）+ 近景台阶 {FOREGROUND_H}px")
    print(f"[battle] 敌人位 {ENEMY} / 玩家位 {PLAYER}（脚底）")


if __name__ == "__main__":
    main()
