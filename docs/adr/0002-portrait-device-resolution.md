# ADR-0002：竖屏 + 设备分辨率渲染

- 状态：Accepted
- 日期：2026-10-24

## 背景

目标平台是竖屏手机（Web + Android）。Phaser 的画布后备缓冲等于 `gameSize`；若 `gameSize` 用 CSS 像素，高 DPR 屏上整幅画面会被浏览器放大，文字与矢量发糊。

## 决策

- 设计宽固定 **720**，设计高 `clamp(round(720 * vh / vw), 1280, 1600)`。
- `scale = clamp(vw * dpr / 720, 1, 2.5)`；`gameSize = 设计 × scale`。
- `Scale.FIT` + `CENTER_BOTH`；相机 `setZoom(scale)` **且** `centerOn(360, designH/2)`。
- `MVVMPlugin.configure({ designResolution: {720, designH}, textResolution: scale })`。
- 20:9/19.5:9/16:9 手机无黑边；4:3 平板留边。

## 为什么不用 RESIZE

RESIZE 让 UI 在 CSS 像素里排版，画布缓冲仍是 CSS 尺寸；高 DPR 屏上文字发糊。若再手动把 gameSize 乘 dpr，就要在每次 resize 重建 UIRoot 的设计尺寸，M0 不值得。

## 为什么不用固定 1280×720 横屏

已确认竖屏；横屏在手机上会大幅留边，且与单手操作不符。

## 后果

- 所有坐标按设计空间写，不读 `window.innerWidth`。
- 相机必须 `centerOn`，否则只看到设计框右下四分之一、点击全部落空。
- 像素纹理 NEAREST、文本/光效 LINEAR。
- 窗口比例变化只重算 FIT 显示尺寸，不重排 UI；竖屏锁定。
