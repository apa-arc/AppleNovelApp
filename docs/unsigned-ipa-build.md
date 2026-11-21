# 免费自签 IPA 构建

本流程只负责在 GitHub 的 macOS 云端构建机上编译 iOS App，并生成**未签名 IPA**。不需要在 Windows 电脑安装 Xcode，也不需要把 Apple ID、证书或私钥交给 GitHub。

## 构建步骤

1. 打开仓库 GitHub → **Actions**。
2. 选择 **Build unsigned iOS IPA**。
3. 点击 **Run workflow**，使用默认分支启动。
4. 等待所有步骤完成。成功后在该次运行页面底部的 **Artifacts** 下载 `AppleNovelApp-unsigned-IPA`。
5. 解压后得到 `AppleNovelApp-unsigned.ipa`，再使用你已有的自签工具（例如 Sideloadly）选择 IPA、用自己的签名方式安装到 iPhone。

## 重要说明

- 该 IPA 是**未签名包**，不能直接点开安装；必须由你的自签工具重新签名。
- 免费 Apple ID 自签的有效期、设备数量、安装方式由你使用的签名工具和 Apple 当前规则决定。
- 这个 workflow 不需要 `EXPO_TOKEN`、`EAS_PROJECT_ID` 或 Apple 开发者证书。
- 该构建会先执行 TypeScript 检查和 App 功能测试，再运行 Expo iOS prebuild、CocoaPods 和 Xcode Release 编译。
- 这是一个新的 macOS 云端构建流程，不会更改原有 EAS 正式构建与 OTA 发布流程。
- 每次运行的 IPA 作为 GitHub Actions Artifact 保存 14 天。构建失败时请打开失败步骤查看具体 Xcode/CocoaPods 错误；不能把“工作流已创建”当作“IPA 已构建成功”。
