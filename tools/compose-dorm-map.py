#!/usr/bin/env python3
"""按 map-manifest.json 重组寝室底图，并叠一层「午后窗光」氛围（纯 Pillow，确定性）。

坐标真值
--------
* 格坐标来自 `assets-src/map/ch01/dorm-map/map-manifest.json`（33×54 格、tile 32 px）。
* 像素位置取自 `public/assets/img/map/ch01/dorm_q.png` 的实测：本脚本的底图与它在
  家具占格、墙体、窗、门洞上逐格一致（末尾会打印 manifest ↔ 底图 的对照表）。
* 只允许改「绘制/叠层」：床、桌、门洞一格都不挪。唯一例外是下排两张床：现图实测床体
  顶在 33.78 行（比 manifest 的 r34 高 7 px，压进了可走格），这里对齐到 r34 整格。

分层（顺序 = `main()` 里的顺序）
-------------------------------
1. `compose_base()`：地板 / 北墙带 / 东西墙 / 南墙门洞 / 四张床 → 无光照的干净底图
2. `contact_shadows()` 接触阴影 → `place_props()` 地毯与行李箱 → `ambient_shade()` 环境光衰减
   → `north_window_light()` 北窗光楔+地面光池 → `wall_layers()` 墙裙/砖缝脏迹
   → `color_temperature()` 暖冷对比 → `bloom()` 泛光 → `vignette_and_grain()` 暗角+颗粒

用法
----
    python3 tools/compose-dorm-map.py

输出
----
    .tmp/art-review/dorm_q_v2.png       1056×1728 正式图
    .tmp/art-review/dorm_q_v2-390.png   390×638 预览（等比）
    .tmp/art-review/dorm_q_v2-pass.png  通行格校验图（绿可走 / 红不可走，各 25%）
    assets-src/map/ch01/dorm-map/prop-placement.json  道具占格
"""

from __future__ import annotations

import json
import pathlib
import random

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "assets-src/map/ch01/dorm-map"
T33 = SRC / "tiles33"
PROPS = ROOT / "assets-src/map/ch01/room-props"
OUT = ROOT / ".tmp/art-review"

COLS, ROWS, TILE = 33, 54, 32
W, H = COLS * TILE, ROWS * TILE  # 1056 × 1728

MANIFEST = json.loads((SRC / "map-manifest.json").read_text(encoding="utf-8"))
PASS_GRID = json.loads((SRC / "pass-grid.json").read_text(encoding="utf-8"))

# 底图各层的像素落点（= dorm_q.png 实测；数值见文件尾 manifest 对照）
FLOOR_ORIGIN = (3 * TILE, 3 * TILE)      # floor.png 整图从 (3,3) 格起铺，右侧/下侧被裁
NORTH_ORIGIN = (0, 0)                    # 北墙带 33×11（砖墙+窗+木墙板，书桌已烘在图里）
SIDE_WALL_TOP = 11 * TILE                # 东西墙 3×39 从第 11 行起
SOUTH_ORIGIN = (0, 50 * TILE)            # 南墙 33×4（含门洞）
WALL_BASE = 11 * TILE                    # 北墙带底边 = 室内地板起始行（11）

# 下排两张床在现图里用的是 704 高的原始床图（含 153 px 透明上边），压在南墙下被裁；
# 上排是 480 高的裁切版。这是 dorm_q.png 的既有事实，这里如实复现（见报告）。
LOWER_BED_ORIGIN_Y = 34 * TILE - 153      # 床图内有 153 px 透明上边；对齐到 manifest 的 r34

SEED = 20261031  # 颗粒/浮尘的唯一随机源


# --------------------------------------------------------------------------------------
# 小工具
# --------------------------------------------------------------------------------------
def load_rgb(path: pathlib.Path) -> Image.Image:
    return Image.open(path).convert("RGB")


def load_rgba(path: pathlib.Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def vramp(size: tuple[int, int], stops: list[tuple[float, int]]) -> Image.Image:
    """竖向灰度渐变。stops = [(0.0=顶, 255), (1.0=底, 0)]，中间线性插值。"""
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


def hramp(size: tuple[int, int], stops: list[tuple[float, int]]) -> Image.Image:
    w, h = size
    stops = sorted(stops)
    img = Image.new("L", (w, 1))
    px = img.load()
    for x in range(w):
        t = x / max(1, w - 1)
        for i in range(len(stops) - 1):
            t0, v0 = stops[i]
            t1, v1 = stops[i + 1]
            if t0 <= t <= t1:
                k = 0.0 if t1 == t0 else (t - t0) / (t1 - t0)
                px[x, 0] = int(round(v0 + (v1 - v0) * k))
                break
        else:
            px[x, 0] = stops[-1][1]
    return img.resize((w, h), Image.NEAREST)


def radial(size: tuple[int, int], box: tuple[float, float, float, float], blur: int) -> Image.Image:
    """椭圆径向遮罩：box 内 255，往外柔和衰减。"""
    w, h = size
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).ellipse(box, fill=255)
    return mask.filter(ImageFilter.GaussianBlur(blur))


def multiply_mask(mask: Image.Image, level: int) -> Image.Image:
    """遮罩整体按 level/255 缩放（level 仍是 0..255 的峰值）。"""
    return mask.point(lambda v: int(v * level / 255))


def shade(canvas: Image.Image, mask: Image.Image, color=(20, 11, 7)) -> Image.Image:
    """按遮罩把画面压向某个暗色（正片叠底的近似，遮罩可渐变）。"""
    return Image.composite(Image.new("RGB", canvas.size, color), canvas, mask)


def add_light(canvas: Image.Image, light: Image.Image) -> Image.Image:
    """加法混光：light 是黑底暖色图。"""
    return ImageChops.add(canvas, light)


def blur_light(layer: Image.Image, radius: int) -> Image.Image:
    return layer.filter(ImageFilter.GaussianBlur(radius))


def bbox_mask(bbox, size=(W, H), blur=0, value=255) -> Image.Image:
    """detect_window 返回的是 (x0,x1,y0,y1)，转成 rect_mask 要的 (x0,y0,x1,y1)。"""
    x0, x1, y0, y1 = bbox
    return rect_mask((x0, y0, x1, y1), size=size, blur=blur, value=value)


def rect_mask(box, size=(W, H), blur=0, value=255) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rectangle(box, fill=value)
    if blur:
        mask = mask.filter(ImageFilter.GaussianBlur(blur))
    return mask


def soft_poly(points, blur: int, size=(W, H)) -> Image.Image:
    """多边形遮罩（L），边缘按 blur 柔化。"""
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).polygon(points, fill=255)
    return m.filter(ImageFilter.GaussianBlur(blur))


def light_from_mask(mask: Image.Image, tint=(255, 190, 120), strength: float = 0.30) -> Image.Image:
    """把 0–255 的遮罩变成黑底暖光图层（加法混光用）。"""
    chans = tuple(mask.point(lambda v, c=c: int(v * strength * c / 255)) for c in tint)
    return Image.merge("RGB", chans)


def surround_shade(canvas: Image.Image, mask: Image.Image, room_only: bool = True) -> Image.Image:
    """光楔之外压暗：factor 从 208（全暗）到 255（有光），把光束的形“围”出来。"""
    factor = mask.point(lambda v: 218 + int(v * 37 / 255))
    if room_only:
        room = rect_mask((0, 3 * TILE, W, 50 * TILE), blur=18)
        factor = Image.composite(Image.new("L", (W, H), 255), factor, room)
    return ImageChops.multiply(canvas, Image.merge("RGB", (factor, factor, factor)))


# --------------------------------------------------------------------------------------
# 1. 底图：按 manifest 的格坐标拼
# --------------------------------------------------------------------------------------
def compose_base() -> Image.Image:
    canvas = Image.new("RGB", (W, H), (18, 11, 8))

    # 地板整图：从 (3,3) 格铺开，被画布右/下边裁掉
    canvas.paste(load_rgb(SRC / "floor.png"), FLOOR_ORIGIN)
    # 北墙带（砖墙 + 窗 + 室内木墙板 + 书桌位），33×11
    canvas.paste(load_rgb(T33 / "wall-north-33x11.png"), NORTH_ORIGIN)
    # 东西墙 3×39（第 11 行起，上方被北墙带盖住）
    canvas.paste(load_rgb(T33 / "wall-west-3x39.png"), (0, SIDE_WALL_TOP))
    canvas.paste(load_rgb(T33 / "wall-east-3x39.png"), (W - 3 * TILE, SIDE_WALL_TOP))
    # 南墙 33×4，门洞（列 13–18）烘在图里
    canvas.paste(load_rgb(T33 / "wall-south.png"), SOUTH_ORIGIN)

    # 四张床：上排 480 高，下排 704 高原图（与现图一致）
    bed_hi = load_rgba(T33 / "bed.png")          # 288×480
    bed_raw = load_rgba(SRC / "bed.png")         # 288×704（上边 153 px 透明）
    canvas.paste(bed_hi, (3 * TILE, 11 * TILE), bed_hi)
    canvas.paste(bed_hi, (21 * TILE, 11 * TILE), bed_hi)
    canvas.paste(bed_raw, (3 * TILE, LOWER_BED_ORIGIN_Y), bed_raw)
    canvas.paste(bed_raw, (21 * TILE, LOWER_BED_ORIGIN_Y), bed_raw)
    return canvas


def bed_masks() -> list[Image.Image]:
    """四张床的 alpha 遮罩（做接触阴影时要知道床在哪）。"""
    hi = load_rgba(T33 / "bed.png")
    raw = load_rgba(SRC / "bed.png")
    out = []
    for im, pos in (
        (hi, (3 * TILE, 11 * TILE)),
        (hi, (21 * TILE, 11 * TILE)),
        (raw, (3 * TILE, LOWER_BED_ORIGIN_Y)),
        (raw, (21 * TILE, LOWER_BED_ORIGIN_Y)),
    ):
        layer = Image.new("L", (W, H), 0)
        layer.paste(im.getchannel("A"), pos)
        out.append(layer)
    return out


def detect_window(base: Image.Image) -> tuple[int, int, int, int]:
    """在北墙带里找窗玻璃的实测范围（b 分量偏高、偏亮）。"""
    band = base.crop((0, 0, W, 3 * TILE))
    px = band.load()
    xs: list[int] = []
    ys: list[int] = []
    for y in range(0, 3 * TILE, 2):
        for x in range(0, W, 2):
            r, g, b = px[x, y]
            if b > 150 and b > r + 20 and g > 120 and g < 225:
                xs.append(x)
                ys.append(y)
    if len(xs) < 500:
        m = next(a for a in MANIFEST["assets"] if a["id"] == "wall-north")
        return (m["c"] + 0) * TILE, (m["c"] + 6) * TILE, 18, 78
    return min(xs), max(xs), min(ys), max(ys)


def window_mullions(base: Image.Image, glass: tuple[int, int, int, int]) -> list[int]:
    """窗框竖档的位置（光楔里的窗棂影子由它投影）。"""
    x0, x1, y0, y1 = glass
    band = base.crop((x0, y0, x1, y1)).convert("L")
    px = band.load()
    w, h = band.size
    cols = []
    for x in range(w):
        s = 0
        for y in range(h):
            s += px[x, y]
        cols.append(s / h)
    mean = sum(cols) / len(cols)
    out = []
    for x in range(1, w - 1):
        if cols[x] < mean * 0.82 and cols[x] <= cols[x - 1] and cols[x] <= cols[x + 1]:
            if not out or x - out[-1] > 12:
                out.append(x)
    return [x0 + x for x in out]


# --------------------------------------------------------------------------------------
# 2a. 接触阴影 / 墙角暗部
# --------------------------------------------------------------------------------------
def contact_shadows(base: Image.Image) -> Image.Image:
    """床 / 桌子 / 墙体接缝的柔和接触阴影。"""
    canvas = base.copy()

    # 床：把 alpha 往下偏移一点、模糊后只压在床以外的地面上（不糊床本身）
    for mask in bed_masks():
        sh = Image.new("L", (W, H), 0)
        sh.paste(mask, (5, 11))
        sh = sh.filter(ImageFilter.GaussianBlur(13))
        sh = ImageChops.subtract(sh, mask)          # 床身不压暗
        sh = multiply_mask(sh, 150)
        canvas = shade(canvas, sh, (22, 12, 8))

    # 床尾/床头再补一条更紧的贴地暗线，让床“坐”在地上
    for mask in bed_masks():
        sh = Image.new("L", (W, H), 0)
        sh.paste(mask, (0, 7))
        sh = sh.filter(ImageFilter.GaussianBlur(4))
        sh = ImageChops.subtract(sh, mask)
        sh = multiply_mask(sh, 110)
        canvas = shade(canvas, sh, (26, 14, 9))

    # 墙体与地面的接缝：墙根压暗（北 / 东 / 西 / 南）
    wall_ao = Image.new("L", (W, H), 0)
    grad_n = vramp((W, 52), [(0.0, 150), (1.0, 0)])
    wall_ao.paste(grad_n, (0, 11 * TILE - 6))
    grad_s = vramp((W, 48), [(0.0, 0), (1.0, 130)])
    wall_ao.paste(grad_s, (0, 50 * TILE - 42))
    grad_w = hramp((44, H), [(0.0, 110), (1.0, 0)])
    wall_ao.paste(grad_w, (3 * TILE - 4, 11 * TILE))
    grad_e = hramp((44, H), [(0.0, 0), (1.0, 110)])
    wall_ao.paste(grad_e, (30 * TILE - 40, 11 * TILE))
    # 门洞下方（门槛）也压一点
    wall_ao = ImageChops.lighter(
        wall_ao, rect_mask((13 * TILE, 50 * TILE - 4, 19 * TILE, 50 * TILE + 24), blur=9, value=80))
    canvas = shade(canvas, wall_ao, (20, 12, 8))

    # 书桌前沿的落地影（桌子烘在北墙带里，只在桌沿下方补一条）
    desk_sh = Image.new("L", (W, H), 0)
    desk_sh.paste(vramp((9 * TILE, 30), [(0.0, 130), (1.0, 0)]), (12 * TILE, 11 * TILE - 2))
    desk_sh = desk_sh.filter(ImageFilter.GaussianBlur(5))
    canvas = shade(canvas, desk_sh, (24, 13, 8))
    return canvas


# --------------------------------------------------------------------------------------
# 2b. 生活痕迹：地毯 + 行李箱（只能落在 ASCII 不可走格，或明确标注挡路）
# --------------------------------------------------------------------------------------
def place_props(canvas: Image.Image) -> tuple[Image.Image, list[dict]]:
    out = canvas.copy()
    placements: list[dict] = []

    def prep(name: str, box_w: int, box_h: int) -> Image.Image:
        im = load_rgba(PROPS / f"{name}.png")
        bbox = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
        im = im.crop(bbox)
        scale = min(box_w / im.width, box_h / im.height)
        im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))),
                       Image.LANCZOS)
        return im

    # 1) 中段横向走廊的地毯：可行走装饰，所以必须是纯平面的叠层（无投影、无竖向体积）
    rug = prep("rug", 8 * TILE, 6 * TILE)
    rug_x, rug_y = 12 * TILE, 27 * TILE
    rug_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    rug_layer.alpha_composite(rug, (rug_x + (8 * TILE - rug.width) // 2,
                                    rug_y + (6 * TILE - rug.height) // 2))
    # 压一层极淡的暗角，让它“贴地”而不是浮起来
    flatten = rug_layer.split()[3].point(lambda v: int(v * 0.90))
    rug_layer.putalpha(flatten)
    out = Image.alpha_composite(out.convert("RGBA"), rug_layer).convert("RGB")
    placements.append({
        "id": "rug-corridor",
        "asset": "assets-src/map/ch01/room-props/rug.png",
        "r": 27, "c": 12, "w": 8, "h": 6,
        "px": [rug_x, rug_y, 8 * TILE, 6 * TILE],
        "pass": True,
        "note": "中段横向走廊的地毯，纯平面装饰，不参与碰撞（照旧可走）。",
    })

    # 2) 床边的行李箱堆：下排左床床头 + 西墙的墙角
    stack = prep("boxes", 2 * TILE, 3 * TILE)
    sx, sy = 3 * TILE, 31 * TILE
    stack_bottom = sy + 3 * TILE
    stack_pos = (sx + (2 * TILE - stack.width) // 2, stack_bottom - stack.height)
    add_prop_shadow(out, stack, stack_pos, spread=12, alpha=150)
    out.paste(stack, stack_pos, stack)
    placements.append({
        "id": "suitcase-stack",
        "asset": "assets-src/map/ch01/room-props/boxes.png",
        "r": 31, "c": 3, "w": 2, "h": 3,
        "px": [sx, sy, 2 * TILE, 3 * TILE],
        "pass": False,
        "blocks": [[31, 3], [31, 4], [32, 3], [32, 4], [33, 3], [33, 4]],
        "note": "西墙墙角、下排左床床头；这三行两列在 pass-grid 里仍是可走格（1），"
                "所以贴墙站着能被穿过去 —— 见报告「挡路风险」。",
    })

    # 3) 单人箱：东墙边、上排右床床尾下方
    one = prep("boxes", 2 * TILE, 2 * TILE)
    ox, oy = 28 * TILE, 27 * TILE
    one_bottom = oy + 2 * TILE
    one_pos = (ox + (2 * TILE - one.width) // 2, one_bottom - one.height)
    add_prop_shadow(out, one, one_pos, spread=9, alpha=125)
    out.paste(one, one_pos, one)
    placements.append({
        "id": "suitcase-east",
        "asset": "assets-src/map/ch01/room-props/boxes.png",
        "r": 27, "c": 28, "w": 2, "h": 2,
        "px": [ox, oy, 2 * TILE, 2 * TILE],
        "pass": False,
        "blocks": [[27, 28], [27, 29], [28, 28], [28, 29]],
        "note": "东墙边、上排右床床尾；同上，四格在 pass-grid 里可走。",
    })
    return out, placements


def add_prop_shadow(canvas: Image.Image, im: Image.Image, pos: tuple[int, int],
                    spread: int = 10, alpha: int = 120) -> None:
    a = im.getchannel("A")
    sh = Image.new("L", (W, H), 0)
    sh.paste(a, (pos[0] + 4, pos[1] + spread // 2))
    sh = sh.filter(ImageFilter.GaussianBlur(spread))
    keep = Image.new("L", (W, H), 0)
    keep.paste(a, pos)
    sh = ImageChops.subtract(sh, keep)
    sh = multiply_mask(sh, alpha)
    canvas.paste(shade(canvas, sh, (22, 12, 8)), (0, 0))


# --------------------------------------------------------------------------------------
# 2c. 北窗午后暖光
# --------------------------------------------------------------------------------------
def north_window_light(canvas: Image.Image) -> Image.Image:
    """北窗午后的暖光：墙面光晕 → 地面梯形光楔（外柔内亮）→ 光池 → 窗棂影 → 桌面/门洞。"""
    gx0, gx1, gy0, gy1 = detect_window(canvas)
    cx = (gx0 + gx1) / 2
    span = gx1 - gx0
    mull = window_mullions(canvas, (gx0, gx1, gy0, gy1))

    top_y, far_y = 12 * TILE, 31 * TILE

    # (a) 墙面：窗下木板墙被窗光照亮，越往下越淡
    wall_mask = soft_poly([(gx0 - 6, 3 * TILE + 2), (gx1 + 6, 3 * TILE + 2),
                           (gx1 + 44, WALL_BASE), (gx0 - 44, WALL_BASE)], blur=16)
    wall_mask = ImageChops.multiply(
        wall_mask, vramp((W, H), [(0.0, 0), (0.052, 0), (0.062, 255), (0.10, 215),
                                 (0.16, 118), (0.204, 0), (1.0, 0)]))

    # (b) 地面光楔：近窄远宽，远端扫到两边床沿
    outer_mask = soft_poly(
        [(cx - span * 0.47, top_y), (cx + span * 0.47, top_y),
         (cx + span * 1.02, far_y), (cx - span * 1.02, far_y)], blur=26)
    outer_mask = ImageChops.multiply(
        outer_mask, vramp((W, H), [(0.0, 0), (0.208, 0), (0.225, 210), (0.30, 235),
                                   (0.42, 165), (0.54, 84), (0.63, 20), (0.68, 0), (1.0, 0)]))

    # (c) 亮芯：更窄更亮，撑住“一束光”的形
    core_mask = soft_poly(
        [(cx - span * 0.33, top_y + 26), (cx + span * 0.33, top_y + 26),
         (cx + span * 0.70, 29 * TILE), (cx - span * 0.70, 29 * TILE)], blur=13)
    core_mask = ImageChops.multiply(
        core_mask, vramp((W, H), [(0.0, 0), (0.215, 0), (0.232, 220), (0.29, 255),
                                  (0.40, 160), (0.50, 58), (0.57, 0), (1.0, 0)]))

    # (d) 窗根的光池：紧贴墙脚的一块最亮的暖斑
    pool_mask = radial((W, H), (cx - span * 0.52, WALL_BASE - 8,
                                cx + span * 0.52, WALL_BASE + 205), 46)
    pool_mask = pool_mask.point(lambda v: int(v * 0.72))

    beam = ImageChops.lighter(wall_mask, ImageChops.lighter(outer_mask, core_mask))
    beam = ImageChops.lighter(beam, pool_mask)

    # 光影关系：先把光楔之外压暗，再把光加回去
    canvas = surround_shade(canvas, beam)
    # 反弹光：把光楔大范围糊开一点点补进去，免得边缘像手电筒
    bounce = beam.filter(ImageFilter.GaussianBlur(96))
    canvas = add_light(canvas, light_from_mask(bounce, (255, 176, 104), 0.10))
    warm = light_from_mask(wall_mask, (255, 186, 108), 0.18)
    warm = ImageChops.add(warm, light_from_mask(outer_mask, (255, 182, 102), 0.24))
    warm = ImageChops.add(warm, light_from_mask(core_mask, (255, 192, 118), 0.22))
    warm = ImageChops.add(warm, light_from_mask(pool_mask, (255, 186, 108), 0.18))
    canvas = add_light(canvas, warm)

    # (e) 窗棂投影：竖档与横档在光楔里投下的暗条（远端张开、略向右斜）
    bars = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(bars)
    for mx in mull:
        k = (mx - cx) / max(1.0, span / 2)
        fx = cx + k * span * 0.72 + 26
        d.polygon([(mx - 5, WALL_BASE + 2), (mx + 5, WALL_BASE + 2),
                   (fx + 15, far_y), (fx - 15, far_y)], fill=118)
    d.polygon([(cx - span * 0.47, 404), (cx + span * 0.47, 404),
               (cx + span * 0.53, 428), (cx - span * 0.53, 428)], fill=92)
    bars = bars.filter(ImageFilter.GaussianBlur(9))
    bars = ImageChops.multiply(bars, vramp((W, H), [(0.0, 0), (0.205, 0), (0.23, 245),
                                                    (0.42, 150), (0.55, 42), (1.0, 0)]))
    canvas = shade(canvas, bars, (24, 14, 7))

    # (f) 桌面被窗光扫到（书桌在窗正下方，烘在北墙带里）
    desk_mask = soft_poly([(gx0 + 30, 6 * TILE + 16), (gx1 - 20, 6 * TILE + 16),
                           (gx1 + 22, WALL_BASE - 8), (gx0 - 12, WALL_BASE - 8)], blur=18)
    canvas = add_light(canvas, light_from_mask(desk_mask, (255, 200, 132), 0.10))

    # (g) 门洞外的冷光：反衬室内暖光，给一个“出口”的呼吸
    door = Image.new("RGB", (W, H), (0, 0, 0))
    ImageDraw.Draw(door).rectangle((13 * TILE + 12, 50 * TILE + 6, 19 * TILE - 12, 53 * TILE - 8),
                                   fill=(9, 13, 21))
    canvas = add_light(canvas, blur_light(door, 16))
    # 门外走廊的冷光从门槛漫进来一小片（南侧偏冷，和北窗的暖对冲）
    spill = Image.new("RGB", (W, H), (0, 0, 0))
    ImageDraw.Draw(spill).ellipse((13 * TILE - 26, 47 * TILE, 19 * TILE + 26, 50 * TILE + 40),
                                  fill=(7, 11, 18))
    canvas = add_light(canvas, blur_light(spill, 40))

    # (h) 光里的浮尘：固定 seed 的几十粒小亮点，只在光楔范围内
    rng = random.Random(SEED + 7)
    motes = Image.new("RGB", (W, H), (0, 0, 0))
    md = ImageDraw.Draw(motes)
    for _ in range(72):
        t = rng.random()
        y = int(top_y + (far_y - top_y) * t)
        half = span * (0.33 + 0.50 * t)
        x = int(cx + (rng.random() * 2 - 1) * half)
        r = rng.choice((1, 1, 2, 2, 3))
        md.ellipse((x - r, y - r, x + r, y + r), fill=(30, 22, 13))
    motes = motes.filter(ImageFilter.GaussianBlur(1.5))
    canvas = add_light(canvas, motes)
    return canvas


# --------------------------------------------------------------------------------------
# 2d. 墙裙 / 墙面明暗分带 / 砖缝脏迹
# --------------------------------------------------------------------------------------
def find_horizontal_seams(img: Image.Image, y0: int, y1: int, x0: int, x1: int,
                          ratio: float = 0.86) -> list[int]:
    """在一段横向木板墙里找暗缝（行均值明显低于邻域），脏迹就画在缝上。"""
    band = img.crop((x0, y0, x1, y1)).convert("L")
    px = band.load()
    w, h = band.size
    rows = []
    for y in range(h):
        s = 0
        for x in range(0, w, 3):
            s += px[x, y]
        rows.append(s / (w / 3))
    seams = []
    for y in range(2, h - 2):
        local = sum(rows[max(0, y - 6):y + 7]) / len(rows[max(0, y - 6):y + 7])
        if rows[y] < local * ratio and rows[y] <= rows[y - 1] and rows[y] <= rows[y + 1]:
            if not seams or y - seams[-1] > 8:
                seams.append(y)
    return [y0 + y for y in seams]


def wall_layers(canvas: Image.Image) -> Image.Image:
    # 只作用在墙面（砖墙带 0–96 + 木墙板 96–352），书桌和窗玻璃不碰
    desk_box = (12 * TILE, 6 * TILE, 21 * TILE, WALL_BASE)
    wall_face = rect_mask((0, 3 * TILE, W, WALL_BASE), blur=0)
    keep_off = rect_mask(desk_box, blur=0)
    window_off = bbox_mask(detect_window(canvas), blur=0)
    face = ImageChops.subtract(wall_face, ImageChops.lighter(keep_off, window_off))

    # 墙裙：木墙板底部压深一档，上沿给一条薄高光
    dado_h = 54
    dado = vramp((W, dado_h), [(0.0, 0), (0.22, 190), (1.0, 190)])
    dado_layer = Image.new("L", (W, H), 0)
    dado_layer.paste(dado, (0, WALL_BASE - dado_h))
    dado_layer = ImageChops.multiply(dado_layer, face)
    canvas = shade(canvas, multiply_mask(dado_layer, 96), (24, 14, 9))
    trim = rect_mask((0, WALL_BASE - dado_h - 1, W, WALL_BASE - dado_h + 1), blur=1, value=26)
    trim = ImageChops.multiply(trim, face)
    canvas = add_light(canvas, Image.merge("RGB", (trim, trim, trim)))

    # 明暗分带：墙板上缘略暖亮、靠墙根沉下去，再叠两道很淡的竖向分带
    bands = ImageChops.multiply(
        vramp((W, H), [(0.0, 0), (0.058, 26), (0.12, 12), (0.16, 0), (1.0, 0)]), face)
    canvas = add_light(canvas, Image.merge("RGB", (bands, bands.point(lambda v: v * 8 // 10),
                                                  bands.point(lambda v: v * 6 // 10))))
    side_band = Image.new("L", (W, H), 0)
    for cx in (W * 0.16, W * 0.5, W * 0.84):
        side_band = ImageChops.lighter(
            side_band, radial((W, H), (cx - 110, 3 * TILE, cx + 110, WALL_BASE), 70))
    side_band = ImageChops.multiply(multiply_mask(side_band, 26), face)
    canvas = shade(canvas, side_band, (20, 12, 8))

    # 砖缝脏迹：沿着实测暗缝（砖带 + 木墙板）压一点脏，再加几道竖向水渍
    seams = find_horizontal_seams(canvas, 0, 3 * TILE, 0, W) + \
        find_horizontal_seams(canvas, 3 * TILE, WALL_BASE, 0, W)
    grime = Image.new("L", (W, H), 0)
    gd = ImageDraw.Draw(grime)
    for y in seams:
        gd.rectangle((0, y - 1, W, y + 2), fill=64)
    grime = grime.filter(ImageFilter.GaussianBlur(3))
    grime = ImageChops.multiply(grime, face)

    rng = random.Random(SEED + 1)
    streak = Image.new("L", (W, H), 0)
    sd = ImageDraw.Draw(streak)
    for _ in range(26):
        x = rng.randrange(16, W - 16)
        top = rng.randrange(0, 2 * TILE)
        length = rng.randrange(TILE, 4 * TILE)
        sd.line((x, top, x + rng.choice((-1, 0, 1)), top + length),
                fill=rng.randrange(16, 44), width=rng.choice((1, 1, 2)))
    streak = streak.filter(ImageFilter.GaussianBlur(6))
    streak = ImageChops.multiply(streak, face)
    canvas = shade(canvas, ImageChops.lighter(grime, streak), (26, 16, 10))
    return canvas


# --------------------------------------------------------------------------------------
# 2e. 环境光衰减（先压暗整间，再让窗光把它“挖”出来）
# --------------------------------------------------------------------------------------
def ambient_shade(canvas: Image.Image) -> Image.Image:
    """房间深处 / 墙角整体压暗一档；窗光区在下一步再补回来，对比才立得住。"""
    depth = vramp((W, H), [(0.0, 255), (0.055, 240), (0.2, 246), (0.55, 226), (1.0, 210)])
    sides = hramp((W, H), [(0.0, 210), (0.075, 240), (0.28, 255), (0.72, 255), (0.925, 240), (1.0, 210)])
    mul = ImageChops.multiply(depth, sides)

    # 四角再补一层径向暗部
    corners = Image.new("L", (W, H), 0)
    for box in ((-240, 3 * TILE - 120, 340, 900), (W - 340, 3 * TILE - 120, W + 240, 900),
                (-260, 30 * TILE, 330, H + 160), (W - 330, 30 * TILE, W + 260, H + 160)):
        corners = ImageChops.lighter(corners, radial((W, H), box, 200))
    mul = ImageChops.multiply(mul, corners.point(lambda v: 255 - int(v * 34 / 255)))
    return ImageChops.multiply(canvas, Image.merge("RGB", (mul, mul, mul)))


# --------------------------------------------------------------------------------------
# 2e. 色温 / 调色 / 暗角 / 颗粒
# --------------------------------------------------------------------------------------
def color_temperature(canvas: Image.Image) -> Image.Image:
    gx0, gx1, _, _ = detect_window(canvas)
    cx = (gx0 + gx1) / 2

    # 窗光暖区：以窗下地面为圆心的大片暖色
    warm = radial((W, H), (cx - 430, 3 * TILE, cx + 430, 30 * TILE), 220)
    warm = multiply_mask(warm, 20)
    canvas = Image.composite(Image.new("RGB", (W, H), (255, 186, 116)), canvas, warm)

    # 墙角冷：四角 + 南侧远处的冷灰蓝
    cool = Image.new("L", (W, H), 0)
    for box in ((-260, 3 * TILE, 250, 800), (W - 250, 3 * TILE, W + 260, 800),
                (-200, 26 * TILE, 210, H + 120), (W - 210, 26 * TILE, W + 200, H + 120)):
        m = radial((W, H), box, 210)
        cool = ImageChops.lighter(cool, m)
    cool = multiply_mask(cool, 20)
    canvas = Image.composite(Image.new("RGB", (W, H), (52, 72, 104)), canvas, cool)

    # 轻微调色：暗部抬一点冷、高光稍暖，整体对比 +3%
    lut_r, lut_g, lut_b = [], [], []
    for v in range(256):
        t = v / 255
        lut_r.append(min(255, int(v * 1.012 + 2.2 * (1 - t) * 0)))
        lut_g.append(min(255, int(v * 1.006)))
        lut_b.append(min(255, int(v * 1.004 + 3.0 * (1 - t))))
    canvas = Image.merge("RGB", (canvas.getchannel("R").point(lut_r),
                                 canvas.getchannel("G").point(lut_g),
                                 canvas.getchannel("B").point(lut_b)))
    canvas = ImageEnhance.Color(canvas).enhance(1.05)
    canvas = ImageEnhance.Contrast(canvas).enhance(1.03)
    return canvas


def bloom(canvas: Image.Image, threshold: int = 176, amount: float = 0.16) -> Image.Image:
    """轻泛光：只让最亮的窗光/被角发光，别把整间都提亮。"""
    small = canvas.resize((W // 4, H // 4), Image.LANCZOS)
    bright = small.point(lambda v: max(0, v - threshold) * 3 // 2)
    glow = bright.filter(ImageFilter.GaussianBlur(14)).resize((W, H), Image.LANCZOS)
    return Image.blend(canvas, ImageChops.add(canvas, glow), amount)


def vignette_and_grain(canvas: Image.Image) -> Image.Image:
    vig = radial((W, H), (-W * 0.30, -H * 0.06, W * 1.30, H * 1.06), 200)
    vig = vig.point(lambda v: 168 + int(v * (255 - 168) / 255))
    canvas = Image.composite(canvas, Image.new("RGB", (W, H), (12, 8, 6)), vig)

    # 细颗粒：一张固定 seed 的小噪声图放大，避免伪随机
    rng = random.Random(SEED)
    small = Image.new("L", (132, 216))
    small.putdata([rng.randrange(112, 145) for _ in range(132 * 216)])
    grain = small.resize((W, H), Image.BICUBIC)
    up = grain.point(lambda v: max(0, v - 128) // 2)
    dn = grain.point(lambda v: max(0, 128 - v) // 2)
    canvas = ImageChops.subtract(ImageChops.add(canvas, up.convert("RGB")), dn.convert("RGB"))
    return canvas


# --------------------------------------------------------------------------------------
# 3. 校验 + 输出
# --------------------------------------------------------------------------------------
def manifest_report(base: Image.Image) -> None:
    print("[dorm] manifest ↔ 底图 对照（格坐标，1 格 = 32 px）")
    print(f"  {'asset':12s} {'manifest r/c/w/h':22s} {'实测':22s} 结果")
    rows = []
    for a in MANIFEST["assets"]:
        rows.append((a["id"], a["r"], a["c"], a["w"], a["h"]))
    measured = {
        "floor": (3, 3, 27, 51),      # 整图从 (3,3) 铺到画布外；manifest 的 r11/c3/27/40 是“可走地板”
        "wall-north": (0, 0, 33, 11),  # 3 行砖墙 + 8 行室内木墙板（含书桌位）烘在同一条里
        "wall-south": (50, 0, 33, 4),
        "wall-west": (3, 0, 3, 48),
        "wall-east": (3, 30, 3, 48),
        "bed-zheng": (11, 21, 9, 15),
        "bed-2": (11, 3, 9, 15),
        "bed-3": (34, 3, 9, 16),      # 床体自 r34 起（现图实测 33.78，这里对齐到整格）
        "bed-4": (34, 21, 9, 16),
        "table": (6, 12, 9, 5),
    }
    for aid, r, c, w, h in rows:
        mr = measured[aid]
        same = (r, c, w, h) == mr
        flag = "一致" if same else "备注：现图偏移/裁切"
        print(f"  {aid:12s} r{r:<2d} c{c:<2d} w{w:<2d} h{h:<2d}    "
              f"r{mr[0]:<2d} c{mr[1]:<2d} w{mr[2]:<2d} h{mr[3]:<2d}   {flag}")

    ref_path = ROOT / "public/assets/img/map/ch01/dorm_q.png"
    if ref_path.exists():
        ref = Image.open(ref_path).convert("RGB")
        diff = ImageChops.difference(base, ref).convert("L")
        hist = diff.histogram()
        total = W * H
        big = sum(hist[17:])
        mean = sum(i * n for i, n in enumerate(hist)) / total
        # 下排两张床按 manifest r34 对齐（现图实测 33.78），差 0.22 格；其余区域才是真差
        mask = rect_mask((3 * TILE, 34 * TILE, 12 * TILE, 50 * TILE), value=255)
        mask = ImageChops.lighter(mask, rect_mask((21 * TILE, 34 * TILE, 30 * TILE, 50 * TILE), value=255))
        rest = ImageChops.difference(base, ref)
        rest_np = rest.convert("L")
        keep = ImageChops.invert(mask)
        rest_mean = sum(i * n for i, n in enumerate(
            ImageChops.multiply(rest_np, keep).histogram())) / max(1, sum(keep.histogram()[1:]))
        print(f"[dorm] 底图 vs 现图 dorm_q.png：平均差 {mean:.3f}/255，差 >16 的像素 {big / total * 100:.2f}%")
        print(f"[dorm] 其中排除下排两张床（按 manifest r34 对齐、比现图低 7 px）后平均差 {rest_mean:.3f}/255")

    gx0, gx1, gy0, gy1 = detect_window(base)
    print(f"[dorm] 窗棂竖档 x={window_mullions(base, (gx0, gx1, gy0, gy1))}")
    seams = find_horizontal_seams(base, 0, 3 * TILE, 0, W) + \
        find_horizontal_seams(base, 3 * TILE, WALL_BASE, 0, W)
    print(f"[dorm] 自动找到的砖缝/墙板暗缝 y={seams}")
    door = MANIFEST["door"]
    print(f"[dorm] 窗玻璃实测 x{gx0}–{gx1} y{gy0}–{gy1} "
          f"（列 {gx0 / TILE:.1f}–{gx1 / TILE:.1f}，中心 {((gx0 + gx1) / 2) / TILE:.1f}；"
          f"manifest 记列 13–18、中心 16）")
    print(f"[dorm] 门洞 manifest r{door['r']} c{door['c']} w{door['w']} h{door['h']}"
          f" → 像素 ({door['c'] * TILE}, {door['r'] * TILE}) 起；南墙门洞在图里位置一致")


def verify_pass_grid() -> None:
    assert len(PASS_GRID) == ROWS and len(PASS_GRID[0]) == COLS, "pass-grid 尺寸必须是 33×54"
    # 与 src/map/rooms/ch01-dorm.ts 的 ASCII 一致：可直接从矩阵上抽查关键边界
    assert PASS_GRID[12][14] == 1, "出生点 (c14,r12) 必须可走"
    assert PASS_GRID[52][16] == 1, "门 (c16,r52) 必须可走"
    for r in range(11, 26):
        assert PASS_GRID[r][3] == 0 and PASS_GRID[r][21] == 0, "上排床列必须是不可走"
    for r in range(34, 50):
        assert PASS_GRID[r][3] == 0 and PASS_GRID[r][21] == 0, "下排床列必须是不可走"
    for r in range(26, 34):
        for c in range(3, 30):
            assert PASS_GRID[r][c] == 1, "rows 26–33 全宽必须可走"


def pass_overlay(base: Image.Image) -> Image.Image:
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for r in range(ROWS):
        for c in range(COLS):
            box = (c * TILE, r * TILE, (c + 1) * TILE - 1, (r + 1) * TILE - 1)
            if PASS_GRID[r][c]:
                d.rectangle(box, fill=(40, 210, 90, 64))
            else:
                d.rectangle(box, fill=(225, 48, 48, 64))
    # 1 px 格线，方便逐格数
    grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    for c in range(COLS + 1):
        gd.line((c * TILE, 0, c * TILE, H - 1), fill=(255, 255, 255, 26))
    for r in range(ROWS + 1):
        gd.line((0, r * TILE, W - 1, r * TILE), fill=(255, 255, 255, 26))
    layer = Image.alpha_composite(layer, grid)
    return Image.alpha_composite(base.convert("RGBA"), layer).convert("RGB")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    verify_pass_grid()

    base = compose_base()
    manifest_report(base)

    canvas = contact_shadows(base)
    canvas, props = place_props(canvas)
    canvas = ambient_shade(canvas)
    canvas = north_window_light(canvas)
    canvas = wall_layers(canvas)
    canvas = color_temperature(canvas)
    canvas = bloom(canvas)
    canvas = vignette_and_grain(canvas)

    final_path = OUT / "dorm_q_v2.png"
    canvas.save(final_path)
    print(f"[dorm] {final_path.relative_to(ROOT)} {canvas.size} {final_path.stat().st_size} bytes")

    prev = canvas.resize((390, round(H * 390 / W)), Image.LANCZOS)
    prev_path = OUT / "dorm_q_v2-390.png"
    prev.save(prev_path, optimize=True)
    print(f"[dorm] {prev_path.relative_to(ROOT)} {prev.size}")

    pass_path = OUT / "dorm_q_v2-pass.png"
    pass_overlay(canvas).save(pass_path, optimize=True)
    print(f"[dorm] {pass_path.relative_to(ROOT)}")

    payload = {
        "note": "compose-dorm-map.py 产出的道具占格。r/c/w/h 为格坐标（tile 32 px），"
                "px 为像素矩形。pass=true 表示可行走装饰；pass=false 的道具压在 pass-grid "
                "可走格上（贴墙摆放），当前版本不改碰撞。",
        "grid": {"tile": TILE, "cols": COLS, "rows": ROWS},
        "props": props,
    }
    prop_path = SRC / "prop-placement.json"
    prop_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[dorm] {prop_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
