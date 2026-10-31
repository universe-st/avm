#!/usr/bin/env python3
"""从 `map-manifest.json` 生成碰撞矩阵（pass-grid.json）与 RoomDef 的 ASCII。

**单一真值**是 manifest 里每个整图素材的 `r/c/w/h/pass`——它描述「素材摆在 33×54 网格的哪一块、
这块能不能走」。以前 pass-grid 是手写的，图重排后忘了改，整张格子偏 6 行，
两排床之间的空地就被床的碰撞体盖住了（2026-10-29 的事故）。

用法：
  python3 tools/gen-pass-grid.py              # 写 pass-grid.json 并打印 ASCII
  python3 tools/gen-pass-grid.py --ascii      # 只打印，不落盘
  python3 tools/gen-pass-grid.py --check      # 与 src/map/rooms/ch01-dorm.ts 对比，不一致则退出码 1

规则：地板整图全 1；墙/床/桌全 0；门洞 1；出生点 'P'，门写 '='。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "assets-src/map/ch01/dorm-map/map-manifest.json"
PASS_GRID = ROOT / "assets-src/map/ch01/dorm-map/pass-grid.json"
ROOM_TS = ROOT / "src/map/rooms/ch01-dorm.ts"


def build_grid(manifest: dict) -> list[list[int]]:
    cols, rows = manifest["cols"], manifest["rows"]
    grid = [[0] * cols for _ in range(rows)]

    for asset in manifest["assets"]:
        if not asset.get("pass"):
            continue
        for r in range(asset["r"], asset["r"] + asset["h"]):
            for c in range(asset["c"], asset["c"] + asset["w"]):
                if 0 <= r < rows and 0 <= c < cols:
                    grid[r][c] = 1

    # 地板整图是"室内地面"，墙和家具会盖在它上面；先铺地板再扣掉家具，顺序无关。
    for asset in manifest["assets"]:
        if asset.get("pass"):
            continue
        for r in range(asset["r"], asset["r"] + asset["h"]):
            for c in range(asset["c"], asset["c"] + asset["w"]):
                if 0 <= r < rows and 0 <= c < cols:
                    grid[r][c] = 0

    door = manifest.get("door")
    if door:
        for r in range(door["r"], door["r"] + door["h"]):
            for c in range(door["c"], door["c"] + door["w"]):
                if 0 <= r < rows and 0 <= c < cols:
                    grid[r][c] = 1
    return grid


def to_ascii(grid: list[list[int]], manifest: dict) -> list[str]:
    spawn = next((m for m in manifest.get("markers", []) if m["kind"] == "spawn"), None)
    door = manifest.get("door")
    lines: list[str] = []
    for r, row in enumerate(grid):
        chars = []
        for c, value in enumerate(row):
            ch = "." if value else "#"
            if door and door["r"] <= r < door["r"] + door["h"] and door["c"] <= c < door["c"] + door["w"]:
                ch = "="
            if spawn and r == spawn["r"] and c == spawn["c"]:
                ch = "P"
            chars.append(ch)
        lines.append("".join(chars))
    return lines


def read_room_ascii() -> list[str] | None:
    if not ROOM_TS.exists():
        return None
    text = ROOM_TS.read_text()
    block = re.search(r"ascii:\s*\[(.*?)\]", text, re.S)
    if not block:
        return None
    return re.findall(r"'([^']*)'", block.group(1))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ascii", action="store_true", help="只打印，不写 pass-grid.json")
    parser.add_argument("--check", action="store_true", help="与 RoomDef 对比")
    args = parser.parse_args()

    manifest = json.loads(MANIFEST.read_text())
    grid = build_grid(manifest)
    lines = to_ascii(grid, manifest)

    if not args.ascii and not args.check:
        PASS_GRID.write_text(json.dumps(grid))
        print(f"[pass] {PASS_GRID.relative_to(ROOT)} 已写入（{len(grid)}×{len(grid[0])}）")

    for i, line in enumerate(lines):
        print(f"{i:2d} {line}")

    walkable = sum(sum(row) for row in grid)
    print(f"\n[pass] 可走格 {walkable} / {len(grid) * len(grid[0])}")

    if args.check or not args.ascii:
        room = read_room_ascii()
        if room is None:
            print("[pass] 读不到 RoomDef.ascii，跳过对比", file=sys.stderr)
            return
        diffs = [
            (i, room[i] if i < len(room) else "<缺行>", lines[i])
            for i in range(max(len(room), len(lines)))
            if (room[i] if i < len(room) else None) != lines[i]
        ]
        if diffs:
            print(f"\n[pass] 与 src/map/rooms/ch01-dorm.ts 不一致（{len(diffs)} 行）：")
            for i, a, b in diffs[:12]:
                print(f"  {i:2d} room: {a}")
                print(f"     gen : {b}")
            if args.check:
                sys.exit(1)
        else:
            print("[pass] 与 RoomDef.ascii 完全一致")


if __name__ == "__main__":
    main()
