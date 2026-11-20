# iOS 云构建与安装准备

仓库提供 GitHub Actions 的手动 iOS EAS Build 入口：Actions → Build iOS app → Run workflow。

## 必需条件

1. Expo 账号及其 Access Token。
2. 在 GitHub 仓库 Settings → Secrets and variables → Actions 中添加 `EXPO_TOKEN`。
3. 使用 Expo/EAS 初始化项目并将真实的 `projectId` 绑定到 `app.json` 的 `extra.eas.projectId`；不能使用占位 ID。
4. Apple Developer Program 账号与 Bundle ID `com.apaarc.applenovelapp` 的签名/分发授权。
5. 选择 `production` 可生成 App Store Connect/TestFlight 所需构建；选择 `preview` 则需要适合内部安装的签名配置。

## 安全说明

不要把 Apple ID 密码、证书私钥、Provisioning Profile 或 Expo Token 写入仓库文件。EAS 可管理签名凭据，但首次创建/确认凭据仍需账号持有人授权。

## 当前限制

本工作流只负责触发云构建，不会绕过 Apple 签名或 EAS 项目绑定要求。项目未绑定 projectId 或缺少 token/Apple 凭据时，工作流应明确失败，而不是声称已生成安装包。
