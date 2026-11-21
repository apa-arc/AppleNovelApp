# Windows 环境下生成 iPhone 真机测试包

本项目不需要 Mac。EAS 会在云端执行 iOS 原生构建；Windows 电脑只负责登录、注册测试设备和触发构建。

## 必要条件

- 一个 Expo 账号。
- 一个加入 Apple Developer Program 的账号（iOS Ad Hoc 真机安装需要付费开发者会员）。
- 一台要安装测试包的 iPhone。
- Windows 已安装 Node.js LTS、Git。

## 第一次配置（在 Windows PowerShell 中）

1. 克隆仓库并安装依赖：

   `git clone https://github.com/apa-arc/AppleNovelApp.git`

   `cd AppleNovelApp`

   `npm install`

2. 登录 Expo 并初始化 EAS 项目：

   `npx eas-cli login`

   `npx eas-cli init`

   按提示创建或关联项目。记录 EAS Project ID；项目配置解析后应包含 `extra.eas.projectId` 和对应的 `updates.url`。

3. 注册 iPhone。执行：

   `npx eas-cli device:create`

   按提示生成设备注册网页/二维码，在目标 iPhone 的 Safari 打开并完成注册。注册后再生成新的 Ad Hoc 测试包；旧包不会自动包含新注册设备。

4. 配置 Apple 签名凭据：

   `npx eas-cli credentials --platform ios`

   选择 `preview` 配置，按提示登录有权限管理 Certificates、Identifiers 和 Provisioning Profiles 的 Apple Developer 账号，让 EAS 创建或托管所需证书与 Ad Hoc Provisioning Profile。

5. 先从 Windows 终端触发第一次交互式云构建：

   `npx eas-cli build --platform ios --profile preview`

   按提示确认签名和构建配置。构建在 Expo 云端执行，不在 Windows 本机编译 iOS。

## 将后续构建交给 GitHub Actions

在 GitHub 仓库 Settings → Secrets and variables → Actions 中添加：

- Repository variable：`EAS_PROJECT_ID`，值为上一步的 EAS Project ID。
- Repository secret：`EXPO_TOKEN`，值为 Expo 账户生成的 Access Token。

完成首次 EAS 项目绑定和签名凭据托管后，在 Actions → Build iOS app 中选择 `preview` 并运行。构建完成后打开 Actions 日志中的 EAS Build 链接，进入构建详情页下载/安装 IPA。

如果之后新注册了 iPhone，需要更新 Ad Hoc Provisioning Profile 并重新构建，确保新设备 UDID 被包含。

## iPhone 安装

1. 在 iPhone 上打开 EAS 构建详情页提供的安装链接。
2. 按页面提示安装测试包。
3. iOS 16 及以上设备首次运行内部签名包时，按系统提示在「设置 → 隐私与安全性 → 开发者模式」启用开发者模式并重启。
4. 安装后先验证启动、阅读、数据持久化和音频播放，再测试 OTA。

## 常见阻塞

- 没有 Apple Developer Program 会员：不能使用 Ad Hoc 方式直接安装到个人 iPhone；需先加入会员，或改走 TestFlight/App Store Connect 的正式分发流程（同样需要会员）。
- 设备未注册或 Provisioning Profile 不包含该设备：构建可能成功但 iPhone 无法安装。
- 新注册或刚续费的 Apple 开发者会员：Apple 处理设备注册可能需要 24–72 小时。
- EAS Project ID / Expo Token 未配置：GitHub 云构建工作流会在预检阶段停止，不会生成安装包。

## 官方说明

- [EAS 内部分发](https://docs.expo.dev/build/internal-distribution/)
- [EAS 首次构建](https://docs.expo.dev/build/setup/)
- [iOS 开发者模式](https://docs.expo.dev/guides/ios-developer-mode/)
