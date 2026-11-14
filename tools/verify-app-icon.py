#!/usr/bin/env python3
"""校验 APK 里的 App 显示名与图标不是 Cordova 默认图。

用法：python3 tools/verify-app-icon.py dist/android/assassins-vs-miners-0.1.9.apk

检查项：
  1. aapt2 dump badging → application-label 必须是「刺客vs矿工」；
  2. APK 内 mipmap/ic_launcher（六个密度）逐个与 cordova/res/icon/android/ 源图逐像素一致；
  3. 同一批图标与 cordova-android 模板默认图对比：字节 hash 必须不同、像素必须有差异；
  4. mipmap/ic_launcher_foreground / _background 与源图逐像素一致；
  5. mipmap-*-v26 的 ic_launcher.xml 必须是 adaptive-icon（foreground/background 两个引用）。
"""
from __future__ import annotations

import hashlib
import io
import re
import subprocess
import sys
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "cordova" / "res" / "icon" / "android"
TEMPLATE = ROOT / "cordova" / "node_modules" / "cordova-android" / "templates" / "project" / "res"
DENSITIES = ["ldpi", "mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]
EXPECTED_LABEL = "刺客vs矿工"


def find_aapt2() -> str:
    import os

    home = Path(os.environ.get("ANDROID_HOME", Path.home() / "Library/Android/sdk"))
    for d in sorted((home / "build-tools").iterdir(), reverse=True):
        cand = d / "aapt2"
        if cand.exists():
            return str(cand)
    raise SystemExit("找不到 aapt2（ANDROID_HOME/build-tools/*/aapt2）")


def px(img: Image.Image) -> np.ndarray:
    return np.asarray(img.convert("RGBA"))


def pixel_match(a: Image.Image, b: Image.Image, tol: int = 2) -> tuple[bool, str]:
    """逐像素比较。AGP 会重新编码 PNG，81px 这种极小图偶发 ±1 的量化差，容差按 2 算。"""
    pa, pb = px(a), px(b)
    if pa.shape != pb.shape:
        return False, f"尺寸不同 {pa.shape} / {pb.shape}"
    diff = int(np.abs(pa.astype(int) - pb.astype(int)).max())
    if diff == 0:
        return True, "像素一致"
    if diff <= tol:
        return True, f"像素一致(±{diff})"
    return False, f"像素不一致(±{diff})"


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    apk = Path(sys.argv[1])
    if not apk.exists():
        print(f"APK 不存在：{apk}")
        return 2
    aapt2 = find_aapt2()
    problems: list[str] = []

    # 1. badging
    badging = subprocess.run([aapt2, "dump", "badging", str(apk)],
                             capture_output=True, text=True, check=True).stdout
    labels = sorted({m for m in re.findall(r"application-label(?:-[a-zA-Z-]+)?:'([^']*)'", badging)})
    print("== aapt2 dump badging ==")
    for line in badging.splitlines():
        if re.match(r"(package:|application-label:|application-icon-\d+:|launchable-activity:)", line):
            if line.startswith("application-label:"):
                print(line)
    print(f"  application-label 出现的取值：{labels}")
    if labels != [EXPECTED_LABEL]:
        problems.append(f"application-label 不是唯一的「{EXPECTED_LABEL}」：{labels}")

    # 2. resource table → 文件映射
    dump = subprocess.run([aapt2, "dump", "resources", str(apk)],
                          capture_output=True, text=True, check=True).stdout
    entries: dict[str, dict[str, str]] = {}
    current = None
    for line in dump.splitlines():
        m = re.match(r"\s+resource 0x[0-9a-f]+ mipmap/(ic_launcher\w*)", line)
        if m:
            current = m.group(1)
            entries[current] = {}
            continue
        m = re.match(r"\s+\(([\w-]+)\) \(file\) (res/\S+)", line)
        if m and current:
            entries[current][m.group(1)] = m.group(2)
        elif line.strip() and not line.startswith("    resource") and not re.match(r"\s+\(([\w-]+)\)", line):
            current = None

    print("\n== APK 内 mipmap 映射 ==")
    for name, cfg in entries.items():
        print(f"  mipmap/{name}: " + ", ".join(f"{k}→{v}" for k, v in cfg.items()))

    zf = zipfile.ZipFile(apk)
    template_files = {d: TEMPLATE / f"mipmap-{d}" / "ic_launcher.png" for d in DENSITIES}

    def apk_img(path: str) -> Image.Image:
        return Image.open(io.BytesIO(zf.read(path)))

    # 3. 传统图标：与源图逐像素一致 & 与模板不同
    print("\n== 传统 mipmap（APK vs 源图 vs Cordova 默认图）==")
    print("  字节 sha256 取文件原始字节；AGP 会重新编码 PNG，所以「是否同一张图」以像素比较为准。")
    print(f"  {'密度':<8}{'尺寸':<10}{'APK 字节':<18}{'源图字节':<18}{'默认图字节':<18}{'像素 vs 源图':<14}{'像素 vs 默认'}")
    for d in DENSITIES:
        apk_path = entries.get("ic_launcher", {}).get(d)
        if not apk_path:
            problems.append(f"APK 里没有 mipmap-{d}/ic_launcher")
            continue
        raw = zf.read(apk_path)
        a = Image.open(io.BytesIO(raw))
        s = Image.open(SRC / f"ic_launcher_{d}.png")
        t = Image.open(template_files[d])
        ha = hashlib.sha256(raw).hexdigest()[:16]
        hs = hashlib.sha256((SRC / f"ic_launcher_{d}.png").read_bytes()).hexdigest()[:16]
        ht = hashlib.sha256(template_files[d].read_bytes()).hexdigest()[:16]
        same_src, same_src_note = pixel_match(a, s)
        diff_tpl_px = int((px(a)[..., :3] != px(t.resize(a.size))[..., :3]).sum())
        same_tpl = "像素一致(=默认图)" if diff_tpl_px == 0 else f"不同({diff_tpl_px}px)"
        print(f"  {d:<8}{f'{a.width}×{a.height}':<10}{ha:<18}{hs:<18}{ht:<18}{same_src_note:<14}{same_tpl}")
        if not same_src:
            problems.append(f"mipmap-{d}/ic_launcher 与源图不一致（{same_src_note}）")
        if diff_tpl_px == 0:
            problems.append(f"mipmap-{d}/ic_launcher 仍是 Cordova 默认图")

    # 4. 自适应层
    print("\n== 自适应图标层（APK vs 源图）==")
    for kind, prefix in (("foreground", "ic_launcher_foreground"), ("background", "ic_launcher_background")):
        for d in DENSITIES:
            apk_path = entries.get(prefix, {}).get(f"{d}-v26")
            if not apk_path:
                problems.append(f"APK 里没有 mipmap-{d}-v26/{prefix}")
                continue
            a = apk_img(apk_path)
            s = Image.open(SRC / f"{prefix}_{d}.png")
            ok, note = pixel_match(a, s)
            print(f"  {prefix:<24}{d:<8}{f'{a.width}×{a.height}':<10}{note}")
            if not ok:
                problems.append(f"{prefix} {d} 与源图不一致（{note}）")

    # 5. adaptive-icon xml（APK 里是二进制 AXML，用 aapt2 xmltree 读，按资源 id 校验引用）
    ids = {
        m.group(2): m.group(1)
        for m in re.finditer(r"resource 0x([0-9a-f]+) mipmap/(\w+)", dump)
    }
    print("\n== mipmap-*-v26/ic_launcher.xml（二进制 AXML）==")
    print(f"  资源 id：background=0x{ids.get('ic_launcher_background', '?')}  foreground=0x{ids.get('ic_launcher_foreground', '?')}")
    for d in DENSITIES:
        apk_path = entries.get("ic_launcher", {}).get(f"{d}-v26")
        if not apk_path:
            problems.append(f"APK 里没有 mipmap-{d}-v26/ic_launcher.xml")
            continue
        tree = subprocess.run([aapt2, "dump", "xmltree", str(apk), "--file", apk_path],
                              capture_output=True, text=True, check=True).stdout
        bg_ref = re.search(r"E: background[^\n]*\n\s*A: [^\n]*=@0x([0-9a-f]+)", tree)
        fg_ref = re.search(r"E: foreground[^\n]*\n\s*A: [^\n]*=@0x([0-9a-f]+)", tree)
        ok = (
            "E: adaptive-icon" in tree
            and bg_ref is not None and bg_ref.group(1) == ids.get("ic_launcher_background")
            and fg_ref is not None and fg_ref.group(1) == ids.get("ic_launcher_foreground")
        )
        print(f"  {d:<8} adaptive-icon={'adaptive-icon' in tree} background=@0x{bg_ref.group(1) if bg_ref else '?'}"
              f" foreground=@0x{fg_ref.group(1) if fg_ref else '?'} {'✓' if ok else '✗'}")
        if not ok:
            problems.append(f"mipmap-{d}-v26/ic_launcher.xml 不是完整的自适应图标定义")

    print("\n== 结论 ==")
    if problems:
        for p in problems:
            print(f"  ✗ {p}")
        return 1
    print("  ✓ 显示名、传统六密度、自适应前景/背景、adaptive-icon.xml 全部符合预期，且都不是 Cordova 默认图")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
