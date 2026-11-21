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
- [ ] 在 GitHub Actions 配置 `EXPO_TOKEN` secret 与 `EAS_PROJECT_ID` repository variable
- [ ] 使用 production 通道完成首次 EAS iOS 云构建并安装到 iPhone
- [ ] 使用相同通道发布一条 OTA 更新，验证启动检查、手动检查、下载、稍后更新、重启应用和失败重试
- [ ] 再发布第二条 OTA 更新，验证后续版本可重复覆盖更新
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
- OTA 更新需要 EAS projectId、首次原生构建和发布凭据；仅有工作流文件不代表更新服务已上线。

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
