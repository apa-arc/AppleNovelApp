# iOS 云构建与安装准备

仓库提供 GitHub Actions 的手动 iOS EAS Build 入口：Actions → Build iOS app → Run workflow。

## 必需条件

1. Expo 账号及其 Access Token。
2. 在 GitHub 仓库 Settings → Secrets and variables → Actions 中添加 `EXPO_TOKEN`。
3. 在 GitHub 仓库 Settings → Secrets and variables → Actions → Variables 中添加 `EAS_PROJECT_ID`（真实 Expo/EAS 项目 ID）；`app.config.js` 会在云构建和 OTA 发布时注入 `extra.eas.projectId` 与更新 URL。
4. Apple Developer Program 账号与 Bundle ID `com.apaarc.applenovelapp` 的签名/分发授权。
5. 选择 `production` 可生成 App Store Connect/TestFlight 所需构建；选择 `preview` 则需要适合内部安装的签名配置。

## 安全说明

不要把 Apple ID 密码、证书私钥、Provisioning Profile 或 Expo Token 写入仓库文件。EAS 可管理签名凭据，但首次创建/确认凭据仍需账号持有人授权。

## 当前限制

本工作流会检查 `EXPO_TOKEN` 与 `EAS_PROJECT_ID`，并将项目 ID 注入 Expo 配置；它不会绕过 Apple 签名或 EAS 项目绑定要求。缺少 Token、项目 ID 或 Apple 签名授权时，构建会明确失败，而不会声称已生成安装包。
