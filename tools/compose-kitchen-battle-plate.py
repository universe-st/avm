#!/usr/bin/env python3
"""用御膳房整图 kitchen.webp 做一张 720×1280 的战斗舞台图（纯 Pillow，确定性）。

不生成新场景、不改 kitchen.webp：只做 9:16 裁切 / 调色 / 光效 / 压边。
参照 `tools/compose-battle-plate.py`（金殿版）的做法，锚点换成御膳房的传膳门洞。

源图实测
--------
`public/assets/img/map/ch01/kitchen.webp` = **1536×3072**，32×64 tile，**48 px/tile**
（`tools/compose-kitchen-map.py` 的 TILE=48；不是 64）。
传膳门洞（地图顶部那扇双开门）在 tile ≈ (15, 0..3) → 像素 y 0..165，
人物站到门前的空地是 tile (15,5) → 像素 (720, 240)。

构图留位（设计像素，720 宽基准）
--------------------------------
* 中央留给怪物：`ENEMY = (360, 690)`（脚底）—— 门洞正下方的空地
* 玩家在左前方：`PLAYER = (186, 1092)`（脚底）
* 顶部 0..~150 是门洞与墙帽（HUD 会压在上面，所以只放背景不放主体）
* 底部 ~110 px 是虚化的近景地面压边

用法
----
    python3 tools/compose-kitchen-battle-plate.py

输出
----
    public/assets/img/battle/ch01/kitchen_hall.webp   720×1280, WebP q90
"""

from __future__ import annotations

import pathlib
import random

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "public/assets/img/map/ch01/kitchen.webp"
OUT = ROOT / "public/assets/img/battle/ch01"
OUT_NAME = "kitchen_hall.webp"

PW, PH = 720, 1280

# kitchen.webp：32 列 × 64 行，48 px / tile
TILE = 48
# 传膳门洞实测：暖色门板 x 679..856（中心 767.5 = 地图中轴），y 0..169（≈3.5 tile）
GATE_PX = (768, 5 * TILE)                                # (768, 240) —— tile (16,5) 门前空地
DOOR_BOX = (679, 0, 856, 169)

# 9:16 裁切窗：水平对准门洞中心（768），从地图顶部开始（门洞贴地图上沿，上面没有空间）
CROP_W, CROP_H = 1080, 1700
CROP_X = 228                      # 228..1308，中轴 768 ✓
CROP_Y = 0                        # 0..1700（rows 0..35.4）
CROP = (CROP_X, CROP_Y, CROP_X + CROP_W, CROP_Y + CROP_H)

# 底部近景压边：从裁切窗**下方**再取一条备餐台（rows ≈33..42）做失焦前景
FG_SRC = (CROP_X, CROP_Y + CROP_H, CROP_X + CROP_W, CROP_Y + CROP_H + 440)

SCALE = PW / CROP_W               # 0.6667
CONTENT_H = 1120                  # 720×1120 的内容区（下面 160px 是近景压边）
VS = CONTENT_H / CROP_H           # 0.6588


def src_xy(x: float, y: float) -> tuple[int, int]:
    """源图像素 → 输出画布坐标（水平 SCALE、垂直 VS）。"""
    return int(round((x - CROP_X) * SCALE)), int(round((y - CROP_Y) * VS))


ENEMY = (360, 700)
PLAYER = (152, 1000)

# 门洞在输出画布上的位置（给聚光锥用）
GATE_X, GATE_Y = int(round((GATE_PX[0] - CROP_X) * SCALE)), int(round(GATE_PX[1] * VS))
DOOR_BOTTOM = int(round(DOOR_BOX[3] * VS))   # 门洞下沿 = 输出 y≈111

FOREGROUND_H = PH - CONTENT_H                # 160

SEED = 20261121


# --------------------------------------------------------------------------------------
# 小工具（与 compose-battle-plate.py 同一套，便于两版观感一致）
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


def light_from_mask(mask, tint=(255, 214, 158), strength=0.3) -> Image.Image:
    chans = tuple(mask.point(lambda v, c=c: int(v * strength * c / 255)) for c in tint)
    return Image.merge("RGB", chans)


def shade(canvas, mask, color=(14, 12, 10)) -> Image.Image:
    return Image.composite(Image.new("RGB", canvas.size, color), canvas, mask)


def add_light(canvas, light) -> Image.Image:
    return ImageChops.add(canvas, light)


def bloom(canvas, threshold=176, amount=0.18):
    small = canvas.resize((PW // 4, PH // 4), Image.LANCZOS)
    bright = small.point(lambda v: max(0, v - threshold) * 3 // 2)
    glow = bright.filter(ImageFilter.GaussianBlur(12)).resize((PW, PH), Image.LANCZOS)
    return Image.blend(canvas, ImageChops.add(canvas, glow), amount)


# --------------------------------------------------------------------------------------
# 1. 底：9:16 裁切 → 720×1280，底部接一条虚化的近景地面
# --------------------------------------------------------------------------------------
def build_base() -> Image.Image:
    kitchen = Image.open(SRC).convert("RGB")
    # 源地图本身是暗调（石砖 ≈ RGB 48），先提亮再压光，否则整张图会黑成一团
    content = kitchen.crop(CROP).resize((PW, CONTENT_H), Image.LANCZOS)
    content = ImageEnhance.Brightness(content).enhance(1.75)
    content = ImageEnhance.Contrast(content).enhance(1.06)

    # 近景：取裁切窗下方那条备餐台（rows ≈33..42）横向铺开、失焦、压暗——读起来是"镜头脚边的台子"。
    near = kitchen.crop(FG_SRC).resize((PW, FOREGROUND_H), Image.LANCZOS)
    near = near.filter(ImageFilter.GaussianBlur(10))
    near = ImageEnhance.Brightness(near).enhance(0.80)
    near = shade(near, vramp((PW, FOREGROUND_H), [(0.0, 150), (0.18, 20), (0.8, 54), (1.0, 150)]),
                 (9, 8, 7))

    canvas = Image.new("RGB", (PW, PH), (8, 8, 7))
    canvas.paste(content, (0, 0))
    canvas.paste(near, (0, CONTENT_H))

    # 接缝：46px 渐变把近景带压回画面里，不留硬线
    seam = vramp((PW, 46), [(0.0, 0), (1.0, 240)])
    band = Image.new("L", (PW, 46), 255)
    blend = ImageChops.multiply(band, seam)
    full = Image.new("L", (PW, PH), 0)
    full.paste(blend, (0, CONTENT_H - 46))
    canvas = Image.composite(Image.new("RGB", (PW, PH), (11, 10, 9)), canvas, full)
    return canvas


# --------------------------------------------------------------------------------------
# 2. 调色：御膳房 = 冷绿石砖 + 暖灶火，整体压到夜里的一间厨房
# --------------------------------------------------------------------------------------
def grade_base(canvas: Image.Image) -> Image.Image:
    # 曝光：门洞一线要读得出来（HUD 压在上面，但门必须看得见），中段留给角色，底部近景再压
    exposure = vramp((PW, PH), [(0.0, 168), (0.09, 192), (0.22, 214), (0.46, 220),
                                (0.70, 202), (0.86, 168), (1.0, 138)])
    canvas = ImageChops.multiply(canvas, Image.merge("RGB", (exposure, exposure, exposure)))

    # 石砖偏冷绿、地砖偏暖褐：整体往青绿里带一点，别把灶火味洗掉
    canvas = ImageChops.multiply(canvas, Image.merge(
        "RGB", (Image.new("L", (PW, PH), 226),
                Image.new("L", (PW, PH), 241),
                Image.new("L", (PW, PH), 234))))
    canvas = Image.blend(canvas, ImageChops.multiply(canvas, Image.new("RGB", (PW, PH), (152, 190, 172))), 0.14)

    # 两侧冷压
    cool = Image.new("L", (PW, PH), 0)
    for box in ((-240, 0, 130, PH), (PW - 130, 0, PW + 240, PH)):
        cool = ImageChops.lighter(cool, radial((PW, PH), box, 170))
    canvas = Image.composite(Image.new("RGB", (PW, PH), (26, 44, 50)), canvas,
                             cool.point(lambda v: int(v * 50 / 255)))
    return canvas


# --------------------------------------------------------------------------------------
# 3. 舞台光：门洞下漏一束光，中央地面一片光池
# --------------------------------------------------------------------------------------
def stage_light(canvas: Image.Image) -> Image.Image:
    ex, ey = ENEMY

    # 门洞本身就是光源：锥体从门洞下沿往中央地面铺开
    cone_shape = soft_poly([(GATE_X - 74, DOOR_BOTTOM - 8), (GATE_X + 74, DOOR_BOTTOM - 8),
                            (ex + 232, 1216), (ex - 232, 1216)], 20)
    cone_shape = ImageChops.multiply(cone_shape, vramp((PW, PH), [
        (0.0, 0), (0.05, 120), (0.13, 236), (0.22, 255), (1.0, 255)]))
    core_shape = soft_poly([(GATE_X - 40, DOOR_BOTTOM), (GATE_X + 40, DOOR_BOTTOM),
                            (ex + 136, 1190), (ex - 136, 1190)], 16)
    pool_shape = radial((PW, PH), (ex - 280, ey - 130, ex + 280, ey + 176), 52)
    # 门槛：门洞正下方一条被光扫亮的横带（把"从这里进来"钉住）
    sill_shape = radial((PW, PH), (GATE_X - 150, DOOR_BOTTOM - 12, GATE_X + 150, DOOR_BOTTOM + 54), 24)

    # 锥体外压一档：舞台只剩中间一束
    lit = ImageChops.lighter(cone_shape, ImageChops.lighter(core_shape, pool_shape))
    lit = ImageChops.lighter(lit, sill_shape)
    shade_map = lit.point(lambda v: 126 + int(v * 129 / 255))
    canvas = ImageChops.multiply(canvas, Image.merge("RGB", (shade_map, shade_map, shade_map)))

    # 加法混光
    cone = ImageChops.multiply(cone_shape, vramp((PW, PH), [
        (0.0, 0), (0.06, 34), (0.22, 66), (0.46, 112), (0.62, 150), (0.72, 136),
        (0.84, 64), (0.93, 18), (1.0, 0)]))
    core = ImageChops.multiply(core_shape, vramp((PW, PH), [
        (0.0, 0), (0.09, 22), (0.30, 62), (0.52, 122), (0.63, 184), (0.76, 82),
        (0.90, 10), (1.0, 0)]))
    pool = ImageChops.multiply(pool_shape, vramp((PW, PH), [
        (0.0, 0), (0.55, 0), (0.63, 255), (0.80, 255), (1.0, 0)]))
    sill = ImageChops.multiply(sill_shape, Image.new("L", (PW, PH), 210))

    halo = lit.filter(ImageFilter.GaussianBlur(74))
    canvas = add_light(canvas, light_from_mask(halo, (186, 224, 196), 0.030))
    canvas = add_light(canvas, light_from_mask(cone, (240, 238, 202), 0.21))
    canvas = add_light(canvas, light_from_mask(core, (250, 246, 214), 0.14))
    canvas = add_light(canvas, light_from_mask(pool, (246, 234, 190), 0.24))
    canvas = add_light(canvas, light_from_mask(sill, (214, 240, 210), 0.16))

    # 门板自己亮一点：给"传膳口"一个可读的锚点（暖木色）
    gate = radial((PW, PH), (GATE_X - 100, -40, GATE_X + 100, DOOR_BOTTOM + 10), 46)
    canvas = add_light(canvas, light_from_mask(gate, (212, 180, 132), 0.13))

    # 左前玩家位补冷调环境光（站位区读得出来，且不与中央暖光打架）
    px_, py_ = PLAYER
    key = radial((PW, PH), (px_ - 186, py_ - 300, px_ + 186, py_ + 24), 78)
    canvas = add_light(canvas, light_from_mask(key, (108, 148, 172), 0.075))
    return canvas


# --------------------------------------------------------------------------------------
# 4. 地面反光：石砖上一道竖向湿光 + 光池边缘的一圈反照
# --------------------------------------------------------------------------------------
def floor_reflection(canvas: Image.Image) -> Image.Image:
    ex, _ = ENEMY

    # 门洞正下方：把门洞附近那一小条竖着压扁、贴在石砖上（湿地面的湿光）
    top = DOOR_BOTTOM
    bottom = ENEMY[1] + 40
    band_src = canvas.crop((ex - 150, top, ex + 150, bottom))
    refl = band_src.resize((300, int((bottom - top) * 0.30)), Image.LANCZOS)
    refl = refl.filter(ImageFilter.GaussianBlur(10))
    refl = ImageEnhance.Brightness(refl).enhance(0.34)
    mask = vramp((300, refl.height), [(0.0, 118), (0.45, 56), (1.0, 0)])
    layer = Image.new("RGB", (PW, PH), (0, 0, 0))
    layer.paste(refl, (ex - 150, bottom))
    full = Image.new("L", (PW, PH), 0)
    full.paste(mask, (ex - 150, bottom))
    canvas = Image.composite(ImageChops.add(canvas, layer), canvas, full)

    # 石砖缝隙的竖向高光条：两侧货架 / 灶台的倒影
    streaks = Image.new("RGB", (PW, PH), (0, 0, 0))
    sd = ImageDraw.Draw(streaks)
    for x, w, k in ((64, 24, 26), (128, 14, 18), (588, 14, 18), (650, 24, 26),
                    (304, 10, 10), (416, 10, 10)):
        sd.rectangle((x, DOOR_BOTTOM + 6, x + w, PH - FOREGROUND_H), fill=(k, k, int(k * 0.74)))
    streaks = streaks.filter(ImageFilter.GaussianBlur(24))
    fade = vramp((PW, PH), [(0.0, 0), (0.10, 70), (0.40, 40), (0.72, 26), (1.0, 0)])
    streaks = ImageChops.multiply(streaks, Image.merge("RGB", (fade, fade, fade)))
    canvas = add_light(canvas, streaks)
    return canvas


# --------------------------------------------------------------------------------------
# 5. 蒸汽 / 暗角 / 颗粒
# --------------------------------------------------------------------------------------
def steam(canvas: Image.Image) -> Image.Image:
    """灶上蒸气的余韵：只在光锥里飘，别盖住中央站位。"""
    rng = random.Random(SEED + 3)
    ex, ey = ENEMY
    layer = Image.new("RGB", (PW, PH), (0, 0, 0))
    d = ImageDraw.Draw(layer)
    for _ in range(70):
        t = rng.random()
        y = int(120 + (ey + 140 - 120) * t)
        half = 46 + 176 * t
        x = int(ex + (rng.random() * 2 - 1) * half)
        r = rng.choice((2, 3, 4, 5, 6))
        v = rng.randrange(8, 20)
        d.ellipse((x - r, y - r, x + r, y + r), fill=(v, int(v * 1.06), v))
    return add_light(canvas, layer.filter(ImageFilter.GaussianBlur(3.2)))


def cool_rim(canvas: Image.Image) -> Image.Image:
    cool = Image.new("L", (PW, PH), 0)
    for box in ((-240, 300, 130, PH), (PW - 130, 300, PW + 240, PH)):
        cool = ImageChops.lighter(cool, radial((PW, PH), box, 150))
    cool = ImageChops.lighter(cool, vramp((PW, PH), [(0.0, 0), (0.82, 0), (1.0, 118)]))
    canvas = Image.composite(Image.new("RGB", (PW, PH), (24, 40, 44)), canvas,
                             cool.point(lambda v: int(v * 22 / 255)))
    return canvas


def vignette(canvas: Image.Image) -> Image.Image:
    vig = radial((PW, PH), (-PW * 0.10, PH * 0.02, PW * 1.10, PH * 1.02), 150)
    vig = vig.point(lambda v: 136 + int(v * (255 - 136) / 255))
    canvas = Image.composite(canvas, Image.new("RGB", (PW, PH), (6, 7, 7)), vig)
    bottom = vramp((PW, PH), [(0.0, 250), (0.12, 255), (0.84, 246), (0.92, 206), (1.0, 176)])
    return ImageChops.multiply(canvas, Image.merge("RGB", (bottom, bottom, bottom)))


def grain(canvas: Image.Image) -> Image.Image:
    rng = random.Random(SEED + 5)
    small = Image.new("L", (90, 160))
    small.putdata([rng.randrange(116, 141) for _ in range(90 * 160)])
    g = small.resize((PW, PH), Image.BICUBIC)
    up = g.point(lambda v: max(0, v - 128) // 2)
    dn = g.point(lambda v: max(0, 128 - v) // 2)
    return ImageChops.subtract(ImageChops.add(canvas, up.convert("RGB")), dn.convert("RGB"))


def save_webp(canvas: Image.Image, path: pathlib.Path) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    for quality in (90, 86, 82, 78):
        canvas.save(path, "WEBP", quality=quality, method=6)
        size = path.stat().st_size
        if size <= 400 * 1024:
            return size
    raise SystemExit(f"{path.name} 压到 q78 仍有 {size // 1024} KB，超过 400 KB")


def main() -> None:
    canvas = build_base()
    canvas = grade_base(canvas)
    canvas = stage_light(canvas)
    canvas = floor_reflection(canvas)
    canvas = steam(canvas)
    canvas = cool_rim(canvas)
    canvas = bloom(canvas, threshold=210, amount=0.06)
    canvas = vignette(canvas)
    canvas = grain(canvas)
    canvas = ImageEnhance.Contrast(canvas).enhance(1.06)

    out = OUT / OUT_NAME
    size = save_webp(canvas, out)
    print(f"[kitchen] {out.relative_to(ROOT)} {canvas.size} {size} bytes ({size / 1024:.1f} KB)")
    print(f"[kitchen] 裁切 {CROP}（{CROP_W}×{CROP_H}）→ 内容 720×{CONTENT_H} + 近景 {FOREGROUND_H} ← kitchen.webp 1536×3072 / 48px tile")
    print(f"[kitchen] 门洞 {DOOR_BOX} → 画布 x={GATE_X}，下沿 y={DOOR_BOTTOM}")
    print(f"[kitchen] 敌人位 {ENEMY} / 玩家位 {PLAYER}（脚底），底部近景 {FOREGROUND_H}px")


if __name__ == "__main__":
    main()
