# Android 构建与签名

## 1. 前置

| 项 | 版本 / 路径 |
| --- | --- |
| Node | ≥ 20（本机 22.23） |
| Cordova CLI | 13.0.0（`npm i -g cordova@13`） |
| JDK | 21（`/opt/homebrew/opt/openjdk@21`；`/usr/bin/java` 未链接） |
| Android SDK | `~/Library/Android/sdk`，platform 36 / build-tools 36.0.0 |
| cordova-android | 15.1.0（默认 minSdk 24、target 36） |

环境变量：

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21
export ANDROID_HOME=$HOME/Library/Android/sdk
export ANDROID_SDK_ROOT=$ANDROID_HOME
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/build-tools/36.0.0:$JAVA_HOME/bin:$HOME/.local/bin:$PATH"
```

自检：`cordova requirements`（在 `cordova/` 下）。

## 2. 工程结构

```
cordova/
  config.xml          # 包名、竖屏、minSdk21、target36、状态栏
  build.json          # 由 tools/make-build-json.mjs 生成（gitignore，含密码）
  keys/               # 签名密钥与密码（gitignore，绝不入库）
  www/                # 由 dist 同步（gitignore）
  platforms/android/  # 生成物（gitignore）
```

`config.xml` 关键项：

```xml
<preference name="Orientation" value="portrait" />
<preference name="Fullscreen" value="true" />
<preference name="BackgroundColor" value="#05060a" />   <!-- 不能写 0xff05060a，AAPT 会报 raw string -->
<preference name="android-minSdkVersion" value="21" />
<preference name="android-targetSdkVersion" value="36" />
<preference name="android-compileSdkVersion" value="36" />
```

## 3. 构建

```bash
pnpm android:debug    # 调试包
pnpm android:release  # 签名包 + apksigner 校验
```

脚本做的事：

1. `vite build`（sourcemap 默认关闭）
2. `dist/` → `cordova/www/`
3. release 时 `tools/make-build-json.mjs` 从 `keystore.properties` 生成 `build.json`
4. `cordova build android [--release --buildConfig build.json]`；release 的 `build.json` 里带 `packageType: 'apk'`（Cordova 15 默认出 AAB）
5. APK 复制到 `dist/android/assassins-vs-miners-<version>[-debug].apk`
6. release 时 `apksigner verify --print-certs`

产物（原始）：

- `cordova/platforms/android/app/build/outputs/apk/debug/app-debug.apk`
- `cordova/platforms/android/app/build/outputs/apk/release/app-release.apk`

## 4. 签名

- keystore：`cordova/keys/avm-release.keystore`（PKCS#12，alias `avm`，RSA 4096，至 2054-03-11）
- 密码：`cordova/keys/keystore.properties`（权限 600）
- SHA-256：`8E:96:56:42:E1:F0:D7:87:94:02:4D:22:5C:7A:5A:FD:6B:86:B9:81:82:E4:30:8A:A4:67:3A:61:0F:B7:F6:C5`
- `cordova/build.json` 由脚本生成，**不要手写进仓库**；release 必须带 `packageType: 'apk'`，否则只会产出 `.aab`。
- `index.html` 里的 `cordova.js` 必须**同步**加载（`document.write`，仅在 `window._cordovaNative` 存在时）。异步加载会让 Cordova 的 `backbutton` 订阅包装晚于应用监听，返回键就不会被接管。
- 备份：keystore 与密码分开两处离线保存；丢失后无法覆盖升级。
- 上架前把 `android-versionCode` 递增（`cordova/config.xml` 的 widget 属性）。

## 5. 模拟器 / 真机

```bash
$ANDROID_HOME/emulator/emulator -avd pmvvm_api36 &
adb install -r dist/android/assassins-vs-miners-0.1.0-debug.apk
adb shell am start -n com.universest.avm/.MainActivity
```

调试：Chrome 打开 `chrome://inspect`，选中 WebView；或 `adb logcat | grep -i chromium`。

## 6. minSdk 21 风险

cordova-android 15 官方默认 **minSdk 24**；本项目显式降到 21（Android 5.0）。风险：

- API 21 系统 WebView 可能过旧，WebGL/ES2017 不达标。
- 构建可过、安装可过，不代表能跑。

对策：

- 启动时检测 WebGL 与 ES2017，不达标显示「设备浏览器版本过低」。
- Vite `build.target: 'es2017'`；必要时加 `@vitejs/plugin-legacy`。
- 在 API 21 模拟器/真机实测；不通过则抬到 24（会先汇报）。

## 7. 常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| `expected color but got (raw string) 0xff...` | `BackgroundColor` 改成 `#RRGGBB` |
| `cordova: command not found` | PATH 加 `$HOME/.local/bin` |
| Gradle 下载慢 | 首次构建需要下载 Gradle 8.14.2 与依赖，耐心等；可配镜像 |
| `SDK location not found` | `ANDROID_HOME` / `ANDROID_SDK_ROOT` 没设 |
| APK 装不上旧设备 | 先确认 `minSdkVersion 21` 写进 AndroidManifest；再看 WebView 版本 |
| 白屏 | `chrome://inspect` 看控制台；优先查 `base: './'` 与资源路径 |
| 返回键直接退出 | `cordova.js` 是否同步加载；`backbutton` 监听是否在 deviceready 后注册 |
| 状态栏挡画面 | `deviceready` 后调用 `cordova.exec(..., 'SystemBarPlugin', 'setStatusBarVisible', [false])` |
| 首次启动停在下图启动屏 | 模拟器冷启动慢；等 `UIScene: content mounted` 日志再操作 |
