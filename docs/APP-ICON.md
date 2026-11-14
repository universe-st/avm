# App 图标与显示名

> 状态：Android 自适应图标已接入（2026-11-14）。显示名 `刺客vs矿工`。
> 生成工具：`python3 tools/make-app-icon.py`（源文件在 `assets-src/app-icon/`）。

## 1. 显示名

`cordova/config.xml`：

```xml
<name>刺客vs矿工</name>
```

- `vs` 小写英文、不加空格；`description` 未改动。
- `cordova/package.json` 的 `displayName` 同步改为 `刺客vs矿工`（同一份显示名，避免工程元数据与 config.xml 打架）。
- Cordova 把它写进 `platforms/android/app/src/main/res/values/cdv_strings.xml` 的 `app_name`，
  `AndroidManifest.xml` 的 `android:label="@string/app_name"` 引用它；APK 里的 `application-label` 因此是中文。

## 2. 设计

**主题**：刺客 vs 矿工的正面对撞，中间一道金色裂光。

| 元素 | 处理 |
| --- | --- |
| 左 · 刺客 | 深色兜帽斗篷 + 鎏金云纹镶边，兜帽阴影下只露一双金白发光眼；胸前举一把白金色短匕 |
| 右 · 矿工 | 琥珀黄安全帽（帽檐矿灯）+ 猩红发光电子眼横缝 + 铁灰工业装甲；肩后一把铁灰矿镐 |
| 中 · 裂光 | 从画面顶到底的金色闪电裂隙，细电弧 + 碎金点；构图左右对称 |
| 底色 | `#05060a` 墨黑，极轻金尘与四角暗角 |
| 配色 | 只有 墨黑 `#05060a` / 鎏金 `#d8b76a` / 铁灰 `#3a3f45` 三种主色，猩红 `#c0392b` 与骨刃白光只作点睛 |
| 画风 | 与游戏内角色同一套：Q 版三头身、赛璐璐单层硬阴影、粗而均匀的黑描边，无渐变/无照片纹理 |
| 文字 | **图内不写任何文字**（App 名显示在图标下方） |

**为什么小尺寸不糊**

1. 只有「左人 / 右人 / 中裂」三个大块面，细节层级 ≤ 4，48px 下仍是可辨的三段式剪影；
2. 三人高光（两张脸、一道裂光）都在画面中心带，缩到 48px 依然是最亮的三个点；
3. 描边是深色硬边，与暗底形成天然的分界线，缩放后不会糊成一团；
4. 传统 mipmap 走 Lanczos 降采样（整数倍降到目标像素），不做非整数倍放大；
   ≤72px（ldpi/mdpi/hdpi）额外提一档对比度（1.08）+ 亮度（1.05）并做 UnsharpMask（radius 0.55 / 85%），
   否则 48px 下两张脸会一起发灰；96px 只加 mild UnsharpMask（radius 0.6 / 55%）。

## 3. 生成记录

模型：游戏素材大师 · 图片生成（火山方舟 `doubao-seedream-5-0-flash-260915`，1024×1024，count 2，watermark off）。

参考图（均为项目内既有素材，`upload` 上传，非聊天图片）：

| 参考 | 用途 |
| --- | --- |
| `public/assets/img/title/logo_mark.png` | 鎏金 + 墨黑的徽记配色、金色线条语言 |
| `public/assets/img/character/ch01/q/zhou_q_right.png` | 三头身 Q 版比例、粗描边平涂 |
| `public/assets/img/character/ch01/miner.png` | 矿工的铁灰机甲 / 猩红电子眼 |
| `public/assets/img/character/ch01/kitchen/old_mai/old_mai_down.png` | 赛璐璐平涂厚度、金色云纹的画法 |

两轮生成（共 4 张，选 2 张）：

| 轮次 | job id | 产出 | 用途 |
| --- | --- | --- | --- |
| v1 满幅方形 | `imwgczzjt917f7d` | `raw/icon-legacy-v1-a.png`、`raw/icon-legacy-v1-b.png` | **选 b**（`assets-src/app-icon/icon-1024.png`）→ 传统 mipmap 母版 |
| v2 圆形安全区 | `imwgd2rwq6d4d93` | `raw/icon-safe-v1-a.png`、`raw/icon-safe-v1-b.png` | **选 b** → 自适应前景母版 |

原始 job 目录（本机）：`~/.dsh/game-material-master/image-jobs/<jobId>/`，`img-00.png` / `img-01.png`。

**为什么要两轮**

v1 是满幅方图，人物和武器一直画到四角：裁成 72dp 视口后，圆形遮罩会切掉安全帽顶、矿镐尖和刀尖
（实测按 0.667 缩放时镐头/头盔超出 66dp 安全圆）。所以第二轮以 v1 选中的那张为参考图，
让模型把同样的两个角色重新收进一个以画面中心为圆心的圆形构图里 —— 主体完整，四周留空黑。
两版最终是「同一套角色、同一套画风」，传统图标用满幅版（方形下更饱满），自适应图标用圆形版（圆角遮罩下不切边）。

提示词要点（全文存于上述 job 记录）：

- v1：Q 版三头身半身对峙、左兜帽刺客（金白发光眼 + 白色短匕）/ 右矿工（安全帽 + 矿灯 + 猩红电子眼 + 铁灰装甲 + 矿镐）、
  中缝金色闪电、`#05060a` 墨黑底、只三主色；**禁止文字/字母/数字/水印/Logo/UI/外边框/多人物**。
- v2：在 v1 基础上改成圆形安全区构图（人物收进直径约 620px 的圆，圆外纯黑无细节），同样禁止一切文字与装饰环。

## 4. 图层与几何（Android 自适应图标）

规范：前景/背景层各 **108×108dp**，系统把中间 **72×72dp** 当可见视口，圆形遮罩直径 72dp，
另有直径 **66dp** 的「保证可见」安全圆。因此主体必须落在 72dp 内、越靠中心越安全。

`tools/make-app-icon.py` 的实测数据（1024 画布）：

| 量 | 数值 |
| --- | --- |
| 圆形母版主体半径（亮度 > 60 的 99 分位） | 470.1 px |
| 缩放系数 | 0.7116 |
| 前景层主体半径 | **334.5 px** |
| 72dp 视口半径 | 341.3 px |
| 主体留边 | **2.0%**（人物/刀/镐整个在视口内；羽化带只吃母版自带的暗边与光尘） |

- 前景层：主体居中，铺满 72dp 视口（自适应图标的标准做法：背景层只负责底色，前景铺满、由系统遮罩裁形状），
  视口边缘做 1.5% 极短 alpha 羽化防锯齿，并把同一带里的颜色向 `#05060a` 拉，避免出现一圈可见的「圆盘边」；
- 安全区取舍：**72dp 视口**内主体完整（刀、镐、头盔都在，见 `02-mask-sim.png`）；
  66dp「保证可见」圆里是两张脸、刀身、矿灯与中缝裂光这个核心区，头盔/镐的外缘会刚好越过它。
  这是刻意的：把主体压进 66dp 会让图标在桌面上缩成一枚小徽章（实测 0.667 缩放的版本看起来只有现在的 90% 大小），
  AOSP 的圆形/超椭圆/圆角遮罩都是 72dp，主体完整可见。
- 背景层：纯色 `#05060a`（与游戏 `BackgroundColor` 一致，启动瞬间不闪色）。

## 5. 文件清单

源文件（入库）：

| 文件 | 说明 |
| --- | --- |
| `assets-src/app-icon/icon-1024.png` | 1024×1024 满幅主图（传统 mipmap 母版，sha256[:16]=`1cc89fc5611be4cd`） |
| `assets-src/app-icon/foreground-1024.png` | 108dp 前景层，1024×1024 RGBA（sha256[:16]=`239553efc64b9c65`） |
| `assets-src/app-icon/background-1024.png` | 108dp 背景层，1024×1024 `#05060a`（sha256[:16]=`04e1c73c407f300a`） |
| `assets-src/app-icon/raw/*.png` | 两轮生成的 4 张原始候选（未裁切，保底可重出） |
| `tools/make-app-icon.py` | 一键重出全部落地产物 + 3 张验收预览 |

产物（`cordova/res/icon/android/`，18 个 PNG）：

| 文件 | 尺寸 | 体积 | sha256[:16] |
| --- | --- | --- | --- |
| `ic_launcher_ldpi.png` | 36×36 | 3.2 KB | `7aa945e33d6a7739` |
| `ic_launcher_mdpi.png` | 48×48 | 5.4 KB | `dab412167b817b5f` |
| `ic_launcher_hdpi.png` | 72×72 | 11.3 KB | `50585f8249eb474b` |
| `ic_launcher_xhdpi.png` | 96×96 | 18.9 KB | `a2b5e8f2bf339e9e` |
| `ic_launcher_xxhdpi.png` | 144×144 | 39.0 KB | `470525f4a70992a2` |
| `ic_launcher_xxxhdpi.png` | 192×192 | 66.2 KB | `fec6d0af6d4705f8` |
| `ic_launcher_foreground_ldpi.png` | 81×81 | 7.1 KB | `387215ec038d1ae8` |
| `ic_launcher_foreground_mdpi.png` | 108×108 | 11.6 KB | `673c74c8e9ff5fb0` |
| `ic_launcher_foreground_hdpi.png` | 162×162 | 23.5 KB | `81abc507c2b2ad17` |
| `ic_launcher_foreground_xhdpi.png` | 216×216 | 39.0 KB | `b4396953381c15e8` |
| `ic_launcher_foreground_xxhdpi.png` | 324×324 | 81.9 KB | `3879733e1a713561` |
| `ic_launcher_foreground_xxxhdpi.png` | 432×432 | 141.0 KB | `dba4dbe6c9d8794f` |
| `ic_launcher_background_ldpi.png` | 81×81 | 0.2 KB | `a139148f47ae7546` |
| `ic_launcher_background_mdpi.png` | 108×108 | 0.3 KB | `a094eb65a7f1c1f6` |
| `ic_launcher_background_hdpi.png` | 162×162 | 0.4 KB | `92078d5052055636` |
| `ic_launcher_background_xhdpi.png` | 216×216 | 0.6 KB | `f044d3d2274c5f0c` |
| `ic_launcher_background_xxhdpi.png` | 324×324 | 1.0 KB | `31da4a458ac06a6d` |
| `ic_launcher_background_xxxhdpi.png` | 432×432 | 1.3 KB | `f9869117324be3d4` |

## 6. config.xml

cordova-android **15.1.0**（`cordova/package.json` 的 `devDependencies`，`platforms/android/cordova/version` 实测一致）
的自适应图标写法是同一个 `<icon>` 元素同时给 `src` / `foreground` / `background` 三个属性
（`node_modules/cordova-android/lib/prepare.js` 的 `updateIcons()` → `updateIconResourceForAdaptive()`；
`cordova-common` 的 `ImageResource` 解析 `density/background/foreground/monochrome`）。
没有 `<adaptive-icon>` 这种 config.xml 写法 —— 那是 Android 资源目录里的 XML，由 cordova 自己生成。

```xml
<platform name="android">
    <icon density="mdpi" src="res/icon/android/ic_launcher_mdpi.png"
          foreground="res/icon/android/ic_launcher_foreground_mdpi.png"
          background="res/icon/android/ic_launcher_background_mdpi.png" />
    <!-- ldpi / hdpi / xhdpi / xxhdpi / xxxhdpi 同构 -->
</platform>
```

`cordova prepare android` 之后：

- `src` → `app/src/main/res/mipmap-<density>/ic_launcher.png`（Android 7 及以下的传统图标）
- `foreground` / `background` → `app/src/main/res/mipmap-<density>-v26/ic_launcher_foreground.png` / `…_background.png`
- 并自动生成 `mipmap-<density>-v26/ic_launcher.xml`：

```xml
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
```

## 7. 密度尺寸对照

传统启动图标是 **48dp 基准**，各密度按 density scale 取整：

| density | scale | 传统图标 | 自适应层（108dp 画布） | 可见视口（72dp） |
| --- | --- | --- | --- | --- |
| ldpi | 0.75 | 36 px | 81 px | 54 px |
| mdpi | 1.0 | 48 px | 108 px | 72 px |
| hdpi | 1.5 | 72 px | 162 px | 108 px |
| xhdpi | 2.0 | 96 px | 216 px | 144 px |
| xxhdpi | 3.0 | 144 px | 324 px | 216 px |
| xxxhdpi | 4.0 | 192 px | 432 px | 288 px |

> 任务里给的「ldpi 48 / mdpi 72 / hdpi 96 / xhdpi 144 / xxhdpi 320 / xxxhdpi 192」这组数字整体错位了一档
> （48/72/96/144 其实是 mdpi/hdpi/xhdpi/xxhdpi 的尺寸，320 不对应任何密度桶）。
> 按那组数字出图会让 ldpi 桶塞进 mdpi 尺寸的图：同一台手机上不同位置出现的图标大小不一致，
> 且 Play 商店/Android Studio 的图标检查会当成错误。所以这里按 Android 官方的 48dp × scale 出图，
> 上面的表就是实际落盘尺寸。

## 8. 复现

```bash
python3 tools/make-app-icon.py     # 重出 18 个 PNG + 3 张验收预览
pnpm android:debug                 # 或 pnpm android:release
```

脚本会自检「前景层所有可见像素都在 72dp 视口内」且「主体不进入羽化带」，越界直接 assert 失败。

## 9. 验收

预览图（`docs/screenshots/verify-2026-11-14/appicon/`）：

| 文件 | 内容 |
| --- | --- |
| `01-densities.png` | 各密度真实像素并排 + 各自整数倍 NEAREST 放大（看 1× 是否可读） |
| `02-mask-sim.png` | 108dp 画布标线（青=72dp 视口、绿=66dp 安全圆、金=主体边界）+ 圆形/超椭圆/圆角遮罩模拟 + 镐头特写 |
| `03-home-screen-sim.png` | 模拟桌面：深色壁纸 + 图标 + 图标下方「刺客vs矿工」 |

APK 侧校验见本文末「验收记录」。

### 9.1 构建与检查（2026-11-14）

```
pnpm check                       → 40 test files / 367 tests passed（含新增 test/app-icon.test.ts 6 条）；assets:check、assets:pass 全绿
pnpm android:release             → BUILD SUCCESSFUL；apksigner verify OK（CN=Universest）
                                   APK → dist/android/assassins-vs-miners-0.1.9.apk (52.8 MB, v0.1.9 / versionCode 10)
```

### 9.2 aapt2 dump badging

```
package: name='com.universest.avm' versionCode='10' versionName='0.1.9' ...
application-label:'刺客vs矿工'
application-label-zh-CN:'刺客vs矿工'
application-icon-120:'res/rw.xml'
application-icon-160:'res/4D.xml'
application-icon-240:'res/JT.xml'
application-icon-320:'res/1D.xml'
application-icon-480:'res/iG.xml'
application-icon-640:'res/_s.xml'
launchable-activity: name='com.universest.avm.MainActivity' label='刺客vs矿工'
```

> badging 的 `application-icon-*` 显示的是 `-v26` **自适应 XML**（Android 8+ 优先命中它），
> 文件被 AGP 混淆成 `res/xx.xml`；传统 `ic_launcher.png` 仍在 APK 包里（下面的资源映射与像素比对为证）。

### 9.3 APK 内 mipmap 映射

```
mipmap/ic_launcher:            ldpi→res/N3.png  mdpi→res/9w.png  hdpi→res/yn.png
                               xhdpi→res/FS.png xxhdpi→res/RJ.png xxxhdpi→res/o-.png
                               (+ 同名 -v26 自适应 XML：rw / 4D / JT / 1D / iG / _s)
mipmap/ic_launcher_foreground: ldpi→zi.png mdpi→ds.png hdpi→5I.png xhdpi→ir.png xxhdpi→W2.png xxxhdpi→l2.png
mipmap/ic_launcher_background: ldpi→EG.png mdpi→wt.png hdpi→By.png xhdpi→U0.png xxhdpi→es.png xxxhdpi→_K.png
```

### 9.4 与 Cordova 默认图对比（`tools/verify-app-icon.py`）

```
密度      尺寸    APK 字节 sha      源图字节 sha      默认图字节 sha    像素 vs 源图   像素 vs 默认
ldpi     36×36   6d8476d08e9a88ba  7aa945e33d6a7739  2d77e81c9f91c267  像素一致       不同(3773px)
mdpi     48×48   48cd316fa822ac75  dab412167b817b5f  7d31cb9f0082ff61  像素一致       不同(6670px)
hdpi     72×72   40665540e5f3e3d5  50585f8249eb474b  8dd5af44eacc1ddb  像素一致       不同(14959px)
xhdpi    96×96   628f310a87aec2ec  a2b5e8f2bf339e9e  dcb27243ff880756  像素一致       不同(27410px)
xxhdpi   144×144 2e9146be511e9990  470525f4a70992a2  6b5d3348c3059930  像素一致       不同(62149px)
xxxhdpi  192×192 6f3d524aa94124ef  fec6d0af6d4705f8  6f7c8a3970831dfb  像素一致       不同(110488px)
```

- 「默认图」= `cordova/node_modules/cordova-android/templates/project/res/mipmap-<density>/ic_launcher.png`；
  六个密度全部与默认图不同（差异像素数随尺寸增长），证明 APK 里不是 Cordova 默认蓝图标。
- APK 内 PNG 字节 sha256 与源图不同（AGP 重新编码 PNG），但**解码后的像素逐元素相等**，所以两边是同一张图
  （81px 这种极小图偶发 ±1 的量化差，`verify-app-icon.py` 按容差 2 判定，输出会标成「像素一致(±1)」）。

自适应层（12 个文件）也逐个比对过：APK 内解码像素与 `cordova/res/icon/android/` 源文件完全一致。
`mipmap-<density>-v26/ic_launcher.xml`（二进制 AXML，用 `aapt2 dump xmltree` 读）：

```
E: adaptive-icon
  E: background  A: android:drawable = @0x7f0c0001   (= mipmap/ic_launcher_background)
  E: foreground  A: android:drawable = @0x7f0c0002   (= mipmap/ic_launcher_foreground)
```

六个密度全部命中同一组自适应资源。复跑：

```bash
python3 tools/verify-app-icon.py dist/android/assassins-vs-miners-0.1.9.apk
```

### 9.5 已知限制

- 未做 monochrome（Android 13 主题图标的单色层）：需要额外的纯 alpha 单色图，本任务未要求。
- 未设 `android:roundIcon`：自适应图标已覆盖圆形/超椭圆/圆角三种遮罩，不需要额外圆形图。
- 自适应前景用的是「圆形安全区」母版，传统 mipmap 用的是「满幅方形」母版，两者构图略有差别
  （人物相对大小不同），这是为了让圆形遮罩不切刀/镐而刻意分开的；同一台设备只会命中其中一套。
