# 私人小说（AppleNovelApp）

一款面向 iPhone 的个人小说阅读器，使用 React Native + Expo 开发。

## 当前进度

### 已实现并有自动化测试覆盖

- [x] Expo + TypeScript 项目与四个主页面（书架、发现、书源、我的）
- [x] 本地书架、阅读记录、阅读进度持久化（AsyncStorage）
- [x] 导入 TXT/TEXT/Markdown 本地小说，复制到 App 私有目录并识别中文章节
- [x] 长按移出书架、同步清理阅读记录、单独清空阅读历史
- [x] 阅读器字号、主题、行距、段间距、左右留白、滚动/点击阅读设置
- [x] 章节目录、上一章/下一章、阅读位置恢复
- [x] Kokoro 103 音色目录、选择和偏好持久化
- [x] HTTPS 云端 Kokoro TTS 客户端、分段请求、WAV 音频播放队列
- [x] 后台音频播放、锁屏播放信息、暂停/继续/停止
- [x] 自托管 Kokoro TTS 服务端与 Docker 部署文件
- [x] 设备绑定授权、Keychain 凭据存储、服务端撤销授权
- [x] AI 朗读不依赖 iPhone 系统语音或辅助功能朗读
- [x] JSON 书源导入、启用/停用/删除、订阅清单导入
- [x] 多书源并行搜索、结果合并去重、章节数量排序
- [x] JSON 搜索、详情、目录、正文解析
- [x] 声明式 CSS HTML 解析（搜索、详情、目录、正文；支持标签、ID、class、属性、后代/子代与常见子项伪类）
- [x] HTTPS 请求限制、域名白名单、GET、禁用凭据和重定向、超时与响应大小限制
- [x] 内置离线模拟书源《星海来信》，可无网络测试搜索、详情、3 章目录和正文
- [x] 书源四接口端到端模拟测试
- [x] Expo Updates 客户端入口、EAS 通道配置与 OTA 发布工作流
- [x] App.tsx/src 普通代码变更自动发布 production OTA；客户端启动/回前台检查并后台下载，确认重启即可应用
- [x] iOS EAS 云构建工作流（需要账号凭据后手动启动）

### 尚未完成或必须在设备/账号环境中验证

- [x] CSS HTML 书源解析已接入搜索、详情、目录、正文四阶段（不执行上游 JavaScript）
- [ ] XPath/正则规则兼容层；复杂 XPath、正则脚本和 JavaScript 规则暂不执行
- [ ] 部署自托管 Kokoro TTS 服务并在 App 中填写 HTTPS 服务地址（服务端代码已提交）
- [x] 在线生成的章节 WAV 语音可由用户逐章手动保存到 App 本地目录、离线播放和单独删除；不会自动下载
- [ ] 免费自签 IPA 首次构建成功并完成 iPhone 安装
- [ ] TestFlight/EAS 正式签名分发（可选，需要付费 Apple Developer 会员）
- [ ] iPhone 真机验收

## 书源支持范围

当前 App 可导入普通/成人独立订阅清单中的 JSON API 书源，也可通过 `htmlRules` 配置声明式 CSS 选择器解析 HTML 搜索、详情、目录和正文。HTML 规则支持常用标签、ID、class、属性、后代/子代和常见子项伪类；不执行第三方 JavaScript，不允许凭据、跨域跳转或访问局域网。XPath、正则替换和复杂 Legado 脚本尚未兼容，不能直接导入运行。

App 内置的《星海来信》模拟源只用于本地联调，不访问网络、不进入正式订阅，也不计入可用书源数量。书源仓库中的模拟配置同样只用于开发测试。只有通过许可审核、质量门禁和目标 App 验证的来源才能正式启用。

## 在线更新

普通界面、功能逻辑和 JS 资源变更会通过 Expo Updates 在线下发，不需要重新下载 IPA、自签或安装。GitHub 主分支的 `App.tsx`、`src/**` 变更会自动执行检查和测试，通过后发布 production OTA。App 启动及回到前台时自动检查（最多每 6 小时一次），发现更新后自动后台下载，用户确认重启即可应用。

首次使用需要有效的 Expo Token（GitHub Actions secret `EXPO_TOKEN`），并确认 EAS 项目 ID（`EAS_PROJECT_ID` 或仓库默认值）正确；随后安装一份已嵌入 production 更新通道和 fingerprint runtime 的 IPA。原生模块、权限、底层依赖或 iOS 原生配置变更仍必须重新构建、自签和安装新 IPA；普通 JS 代码改动不需要。

- 更新检查：正式安装包启动并完成本地数据加载后自动检查，也可在「我的」页面手动检查。开发预览模式不执行 OTA 检查。
- 更新策略：新版本默认可稍后更新，不会因下载失败锁死当前版本；下载完成后用户确认重启应用。
- 下载状态：显示真实的下载中/完成/失败状态。Expo Updates 当前客户端接口不提供可用的百分比回调，因此不会伪造下载百分比。
- 兼容保护：使用 fingerprint runtime version；只有 runtime 兼容的 JS、界面和静态资源更新才通过 OTA 下发。
- 原生边界：原生模块、权限、Bundle Identifier 或底层依赖变更必须重新构建并安装新 iOS 包。
- 发布入口：GitHub Actions → Publish OTA update，选择 preview/production 通道并填写更新说明。需要仓库 Secret `EXPO_TOKEN` 和变量 `EAS_PROJECT_ID`。

## 听书现状

AI 朗读完全使用 Kokoro 云端合成，不调用 iPhone 系统语音或辅助功能朗读：App 可将章节分段发送到你自己部署的 HTTPS 服务，接收 WAV 后通过原生音频播放器播放，并支持后台/锁屏、暂停、继续和停止。服务端代码位于 `server/`，需要先部署 Docker 服务，再把地址填入「声音」设置。当前不自动回退到 iPhone 系统语音。在线生成的章节 WAV 可由用户在阅读器声音设置中逐章手动保存到本地，离线时直接播放已保存音频；不会在后台、播放时或断网时自动下载，也不需要下载整套 Kokoro 模型。

## 开发环境

- Node.js LTS
- npm
- Expo SDK 54
- React Native 0.81
- TypeScript

```bash
npm install
npm run typecheck
npm test
npx expo start
```

## 真机测试前准备

- 免费自签：GitHub Actions → **Build unsigned iOS IPA**，构建完成后从 Artifacts 下载未签名 IPA，再用你已有的自签工具签名安装。详细步骤见 [免费自签 IPA 构建指南](docs/unsigned-ipa-build.md)。
- EAS 正式分发：如以后需要 TestFlight 或 Ad Hoc 分发，再按 [Windows iPhone 真机测试包指南](docs/ios-device-testing.md) 配置付费开发者账号。


详见 [发布前准备与真机测试清单](docs/release-readiness.md)。
