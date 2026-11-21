# 发布前准备与真机测试清单

本文件区分已由仓库自动化验证的部分、尚未实现的功能，以及必须由账号持有人完成的签名/设备步骤。GitHub CI 通过不等于 iPhone 真机测试通过。

## 可在云端完成的检查

- [x] TypeScript 严格类型检查
- [x] 书架、阅读记录、阅读设置和数据模型单元测试
- [x] 书源安全 HTTP 边界测试
- [x] JSON 搜索、详情、目录、正文解析单元测试
- [x] CSS HTML 选择器解析和四阶段模拟联调测试
- [x] 模拟 JSON 书源四接口端到端测试
- [x] 普通/成人订阅独立构建和格式校验
- [x] 书源许可、质量报告和真实宿主验证门禁
- [x] 自托管 Kokoro TTS 服务端核心逻辑单元测试
- [x] 本地 TXT 解析、云端 TTS 请求校验自动化测试
- [ ] 在 GitHub Actions 配置 `EXPO_TOKEN` secret 与 `EAS_PROJECT_ID` repository variable（一次性）
- [ ] 生成并自签安装一份已嵌入 production OTA URL、channel 与 fingerprint runtime 的 IPA
- [ ] 发布第一条 OTA 更新，验证自动检查、后台下载、用户确认重启和失败重试
- [ ] 再发布第二条 OTA 更新，验证不重新签名安装也能连续更新
- [x] App.tsx/src 代码变更自动触发 OTA 发布工作流（需要上述凭据）
- [x] App 启动和回到前台时自动检查更新；发现更新后后台下载，用户可选择立即重启应用
- [ ] TestFlight 上传和邀请测试

## 真机测试前必须具备

Windows 用户的详细云构建和设备注册步骤见 [Windows iPhone 真机测试包指南](ios-device-testing.md)。

1. EAS 项目已创建并绑定，GitHub Actions repository variable `EAS_PROJECT_ID` 已配置。
2. GitHub Actions secret `EXPO_TOKEN` 已配置，可用于云构建和 OTA 发布。
3. iOS Bundle Identifier 与 Apple Developer 账号团队配置一致。
4. Apple 签名证书、Provisioning Profile 或 EAS 托管凭据可用。
5. iPhone 安装预览包或 TestFlight 包，逐项验证权限、网络、阅读、朗读、更新和持久化。

以上账号、证书和设备授权不能由仓库代码代替，也不应把密钥提交进 Git。

## 当前功能边界

- App 在线书源运行时支持受限 HTTPS JSON 接口和声明式 CSS HTML 规则；不执行上游 JavaScript。
- HTML 解析是受限的声明式 CSS 适配层；支持标签、ID、class、属性、后代/子代组合、逗号分组及 first/last/nth-child。未支持的选择器会明确报错，不会静默忽略。
- 这不是完整浏览器 DOM；XPath、正则替换、JavaScript 规则、动态加载内容及复杂 Legado 脚本不能直接运行。
- 云端 Kokoro TTS 服务端代码、App HTTPS 客户端和 WAV 播放队列已接入；设备授权凭据通过 iOS SecureStore 保存，服务端支持撤销。需在自己的服务器部署 Docker 服务，并在 App「声音」设置填写 HTTPS 地址、管理员绑定码后才可实际联网朗读。
- 后台/锁屏音频配置已加入 Expo 项目，但必须经 EAS 原生构建后才能验证。
- 当前采用在线 Kokoro 生成、章节音频手动下载到本机的方案；下载后的 WAV 分段文件可离线播放，并可在「我的」页面统一查看、删除。不会自动下载，也不要求用户下载整套 Kokoro 模型。离线模型原生推理不属于当前方案，不作为真机验收前置条件。
- OTA 更新通过 Expo Updates/EAS Update 下发：普通界面、业务逻辑和 JS 资源改动无需重新下载 IPA、自签或安装。App 在启动及回到前台时检查（最多每 6 小时一次），发现更新后自动后台下载，用户选择重启时应用更新。
- GitHub 主分支中 `App.tsx` 或 `src/**` 发生变化时，自动执行类型检查、App 测试并发布 production OTA；也保留手动发布入口。构建 IPA 的工作流仅在 `app.json`、`app.config.js`、`package.json` 或 `eas.json` 等原生配置/依赖变更时触发，普通代码改动不会要求重新安装。
- 首次自签 IPA 必须嵌入同一个 EAS projectId、production channel 和 fingerprint runtime。GitHub 需一次性配置 `EAS_PROJECT_ID` repository variable 与 `EXPO_TOKEN` secret；未配置时自动发布会失败，现有 App 不会因此损坏。
- OTA 不能替换原生二进制：新增/升级原生模块、权限、Info.plist、Bundle Identifier、原生配置或依赖变更时，仍需重新生成 IPA 并自签安装。Expo Updates 只会向 runtime 兼容的客户端提供更新。

## 建议真机验收顺序

1. 首次启动、切换四个主页面、重启后书架和阅读记录仍在。
2. 导入/停用/删除 JSON 书源，验证非法 HTTP、内网地址和跨域跳转被拦截。
3. 使用获授权的 JSON 测试源跑搜索、详情、目录和正文。
4. 加入书架、切换章节、退出重进，验证阅读位置。
5. 调整字号、主题、行距和翻页模式，验证重启后设置保留。
6. 部署自托管 Kokoro 服务，填写 HTTPS 地址，验证 AI 朗读、暂停/继续/停止和锁屏播放；手动下载单章语音后关闭网络，验证离线播放、在「我的」页面查看下载记录、删除文件及重启后记录持久化。
7. 在线更新仅在首次 EAS 原生构建并配置发布通道后验收。


## 离线语音文件恢复保护

App 启动时会将离线语音索引与本机实际 WAV 文件核对：缺失或损坏的章节记录会从列表中清理；下载中途被系统终止留下的孤立 WAV 文件会在专用语音目录内清理。清理范围仅限 App 自己的 `speech-audio/` 目录，不触碰用户导入的小说文件。
