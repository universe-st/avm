# ADR-0004：Cordova、签名与 minSdk 21

- 状态：Accepted（minSdk 21 带风险）
- 日期：2026-10-24

## 决策

- Android 用 **Cordova 13 + cordova-android 15.1.0**，独立工程 `cordova/`。
- 包名 `com.universest.avm`，英文名 `Assassins vs Miners`。
- 竖屏、target/compile SDK 36。
- **minSdk 21**（显式覆盖 cordova-android 默认 24）。
- 发布签名：PKCS#12，alias `avm`，RSA 4096，有效期至 2054-03-11；密码只在 `cordova/keys/keystore.properties`，不入库。
- `build.json` 由 `tools/make-build-json.mjs` 生成，不手写进仓库。

## 风险

- API 21 的系统 WebView 可能过旧，WebGL/ES2017 不达标；构建与安装成功不代表能跑。
- 对策：Vite `target: 'es2017'`、启动检测、API 21 模拟器/真机实测；不通过则抬到 24 并汇报。

## 后果

- 每次发布递增 `android-versionCode`。
- keystore 必须离线双备份；丢失无法覆盖升级。
- `BackgroundColor` 必须 `#RRGGBB`（AAPT 不接受 `0xff...`）。
- WebView 首次加载慢，`LoadUrlTimeoutValue` 设 120000；系统全屏提示需用户点一次 Got it。
