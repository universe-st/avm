#!/usr/bin/env python3
"""Compose the 32x64 kitchen map from the B1/B2 raw stamps.

The ASCII in src/map/rooms/ch01-kitchen.ts stays the single collision source.
The output is visual only: 1536x3072 (48 px/tile, displayed at 2x = tileSize 96)
plus a pass check image.

Walls since 2026-10-31 have real thickness: every wall tile whose **south**
neighbour is walkable gets a vertical stone FACE (this is what the camera sees),
the rest get the CAP. Wall bands are >=2 tiles thick in the ASCII so the face
always has a row of its own and never paints over walkable floor.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ROOM = ROOT / "src" / "map" / "rooms" / "ch01-kitchen.ts"
RAW = ROOT / "assets-src" / "map" / "ch01" / "kitchen-map" / "raw"
OUT = ROOT / "assets-src" / "map" / "ch01" / "kitchen-map"
PUBLIC = ROOT / "public" / "assets" / "img" / "map" / "ch01"
TILE = 48

rows = re.findall(r"^\s*'([.#~Po=]{32})',", ROOM.read_text(), re.M)
assert len(rows) == 64, f"ASCII rows: {len(rows)}"
cols = 32
W, H = cols * TILE, len(rows) * TILE

floor = Image.open(RAW / "floor-stone.png").convert("RGBA").resize((W, H), Image.LANCZOS)
canvas = floor.copy()

# A wall top tile from the B1 wall cap: crop the stone top, not the gold rim.
wall_src = Image.open(RAW / "wall-cap.png").convert("RGBA")
wall_tile = wall_src.crop((240, 260, 700, 720)).resize((TILE, TILE), Image.LANCZOS)
# 墙面：同一块石头压暗 + 两道砖缝 + 底部接缝阴影，读起来是"立起来的墙"而不是"贴在地上的石板"。
face_src = wall_src.crop((300, 320, 700, 700)).resize((TILE, TILE), Image.LANCZOS)
face_rgb = Image.blend(face_src.convert("RGB"), Image.new("RGB", (TILE, TILE), (8, 12, 16)), 0.46)
face_tile = face_rgb.convert("RGBA")
fd = ImageDraw.Draw(face_tile)
for ratio in (0.34, 0.68):
    y = int(TILE * ratio)
    fd.line([(0, y), (TILE - 1, y)], fill=(0, 0, 0, 110), width=max(1, TILE // 22))
    fd.line([(0, y + 1), (TILE - 1, y + 1)], fill=(120, 140, 150, 40), width=1)
fd.line([(0, TILE - 1), (TILE - 1, TILE - 1)], fill=(0, 0, 0, 160), width=max(2, TILE // 14))


def is_wall(c: int, r: int) -> bool:
    if c < 0 or c >= cols or r < 0 or r >= len(rows):
        return True
    return rows[r][c] == "#"


wall_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
for r, line in enumerate(rows):
    for c, ch in enumerate(line):
        if ch != "#":
            continue
        # 南邻可走 => 这一格是墙的可见立面；否则是墙顶。
        tile_img = face_tile if not is_wall(c, r + 1) else wall_tile
        wall_layer.alpha_composite(tile_img, (c * TILE, r * TILE))

# A 1px cold-gold edge where a wall meets walkable floor.
draw = ImageDraw.Draw(wall_layer)
gold = (216, 183, 106, 90)
for r, line in enumerate(rows):
    for c, ch in enumerate(line):
        if ch != "#":
            continue
        if r + 1 < len(rows) and rows[r + 1][c] not in "#o":
            draw.line([(c * TILE, (r + 1) * TILE - 1), ((c + 1) * TILE - 1, (r + 1) * TILE - 1)], fill=gold)
            # 墙脚再压一条更深的接缝，让墙"落地"
            draw.line([(c * TILE, (r + 1) * TILE - 2), ((c + 1) * TILE - 1, (r + 1) * TILE - 2)], fill=(0, 0, 0, 120))
        if c + 1 < cols and line[c + 1] not in "#o":
            draw.line([((c + 1) * TILE - 1, r * TILE), ((c + 1) * TILE - 1, (r + 1) * TILE - 1)], fill=gold)
canvas.alpha_composite(wall_layer)

# name -> (x tiles, y tiles, w tiles, h tiles, anchor)
placements = [
    ("gate.png", 14, 0, 4, 4, "bottom"),
    ("screen-1x2.png", 17, 5, 1, 2, "bottom"),
    ("stove.png", 4, 29, 4, 2, "bottom"),
    ("stove.png", 4, 35, 4, 2, "bottom"),
    ("stove.png", 4, 40, 4, 2, "bottom"),
    ("stove.png", 24, 29, 4, 2, "bottom"),
    ("stove.png", 24, 35, 4, 2, "bottom"),
    ("long-counter.png", 8, 26, 4, 2, "bottom"),
    ("meat-rack.png", 18, 26, 2, 2, "bottom"),
    ("shelf.png", 5, 5, 2, 2, "bottom"),
    ("cabinet.png", 27, 44, 2, 3, "bottom"),
    ("backdoor.png", 10, 62, 1, 2, "bottom"),
    ("haystack.png", 4, 44, 3, 3, "center"),
    ("crate.png", 19, 55, 1, 1, "center"),
    ("basket.png", 20, 55, 1, 1, "center"),
    ("basket.png", 9, 58, 1, 1, "center"),
    ("jar.png", 10, 58, 1, 1, "center"),
    ("water-vat.png", 11, 58, 1, 1, "center"),
]
# Both 4x10 stone islands are tiled from the 4x2 long-island stamp.
for y in (32, 34, 36, 38, 40):
    placements.append(("long-island.png", 8, y, 4, 2, "center"))
    placements.append(("long-island.png", 20, y, 4, 2, "center"))

manifest: list[dict[str, object]] = []
for name, c, r, w, h, anchor in placements:
    src = Image.open(RAW / name).convert("RGBA")
    alpha = src.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        continue
    obj = src.crop(bbox)
    target_w, target_h = w * TILE, h * TILE
    scale = min(target_w / obj.width, target_h / obj.height)
    new_w, new_h = max(1, round(obj.width * scale)), max(1, round(obj.height * scale))
    obj = obj.resize((new_w, new_h), Image.LANCZOS)
    x = c * TILE + (target_w - new_w) // 2
    y = r * TILE + (target_h - new_h) if anchor == "bottom" else r * TILE + (target_h - new_h) // 2
    canvas.alpha_composite(obj, (x, y))
    manifest.append({
        "file": name, "col": c, "row": r, "w": w, "h": h,
        "anchor": anchor, "x": x, "y": y, "renderW": new_w, "renderH": new_h,
    })

OUT.mkdir(parents=True, exist_ok=True)
PUBLIC.mkdir(parents=True, exist_ok=True)
canvas.convert("RGB").save(OUT / "map-final.png")
# 游戏里用的是 WebP：1536x3072 的 PNG 要 5-6 MB，WebP q88 大约 1.2 MB。
canvas.convert("RGB").save(PUBLIC / "kitchen.webp", "WEBP", quality=88, method=6)
(OUT / "map-manifest.json").write_text(json.dumps({
    "cols": cols, "rows": len(rows), "tile": TILE,
    "collision": "src/map/rooms/ch01-kitchen.ts",
    "placements": manifest,
}, ensure_ascii=False, indent=2))

# pass check: green walkable, red blocked; o is blocked.
check = Image.new("RGB", (W, H), (20, 20, 20))
d = ImageDraw.Draw(check)
for r, line in enumerate(rows):
    for c, ch in enumerate(line):
        color = (45, 160, 90) if ch in ".~P=" else (190, 55, 55)
        d.rectangle([c * TILE, r * TILE, (c + 1) * TILE - 1, (r + 1) * TILE - 1], fill=color)
check.save(OUT / "map-pass.png")
print(f"map-final {W}x{H} (webp -> public/assets/img/map/ch01/kitchen.webp); placements {len(manifest)}; tile {TILE}")
