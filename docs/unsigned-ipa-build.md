# 免费自签 IPA 构建

本流程只负责在 GitHub 的 macOS 云端构建机上编译 iOS App，并生成**未签名 IPA**。不需要在 Windows 电脑安装 Xcode，也不需要把 Apple ID、证书或私钥交给 GitHub。

## 构建步骤

首次构建前，在 GitHub 仓库 **Settings → Secrets and variables → Actions** 配置：
- Repository secret：`EXPO_TOKEN`（Expo 访问令牌；只在 GitHub 设置中填写，不要发到聊天或提交到仓库）
- Repository variable：`EAS_PROJECT_ID`（可选；省略时工作流使用仓库中已绑定的项目 ID）

`EXPO_TOKEN` 用于生成并核验 iOS fingerprint runtime；项目 ID 用于核验 Expo Updates URL。缺少有效令牌或项目配置不匹配时，构建会主动失败，避免生成无法接收在线更新的包。

1. 打开仓库 GitHub → **Actions**。
2. 选择 **Build unsigned iOS IPA**。
3. 点击 **Run workflow**，使用默认分支启动。
4. 等待所有步骤完成。成功后在该次运行页面底部的 **Artifacts** 下载 `AppleNovelApp-unsigned-IPA`。
5. 解压后得到 `AppleNovelApp-unsigned.ipa`，再使用你已有的自签工具（例如 Sideloadly）选择 IPA、用自己的签名方式安装到 iPhone。

## 重要说明

- 该 IPA 是**未签名包**，不能直接点开安装；必须由你的自签工具重新签名。
- 免费 Apple ID 自签的有效期、设备数量、安装方式由你使用的签名工具和 Apple 当前规则决定。
- 这个 workflow 需要有效的 `EXPO_TOKEN` 来生成 fingerprint；不需要 Apple 开发者证书、签名证书或 Provisioning Profile，因为产物是未签名 IPA。
- 该构建使用 `npm ci` 按锁文件安装依赖，先执行 TypeScript 检查和 App 功能测试，再生成 iOS fingerprint、运行 Expo prebuild、CocoaPods 和 Xcode Release 编译；最后核对 IPA 内的 runtime 与 production channel。
- 这是一个新的 macOS 云端构建流程，不会更改原有 EAS 正式构建与 OTA 发布流程。
- 每次运行的 IPA 作为 GitHub Actions Artifact 保存 14 天。构建失败时请打开失败步骤查看具体 Xcode/CocoaPods 错误；不能把“工作流已创建”当作“IPA 已构建成功”。


## 后续代码更新

- 修改 `App.tsx` 或 `src/` 中的普通业务代码并推送到 main 后，GitHub 会自动运行 OTA 检查与测试，通过后发布到 production 通道。
- 已安装 App 在启动/回到前台时自动检查并后台下载更新；用户只需确认重启应用，不需要重新下载 IPA、自签或安装。
- 修改 `app.json`、`app.config.js`、`package.json` 或 `eas.json` 时会触发新的 IPA 构建，因为这些改动可能影响原生运行时。
- OTA 不支持更换原生模块或原生权限；这类改动仍需安装新的 IPA。
