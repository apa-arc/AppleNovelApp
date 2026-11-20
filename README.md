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
- [x] HTTPS 请求限制、域名白名单、GET、禁用凭据和重定向、超时与响应大小限制
- [x] 书源四接口端到端模拟测试
- [x] Expo Updates 客户端入口、EAS 通道配置与 OTA 发布工作流
- [x] iOS EAS 云构建工作流（需要账号凭据后手动启动）

### 尚未完成或必须在设备/账号环境中验证

- [ ] 通用 HTML/CSS/XPath/正则书源解析；当前只支持 JSON API，且不执行上游 JavaScript
- [ ] 部署自托管 Kokoro TTS 服务并在 App 中填写 HTTPS 服务地址（服务端代码已提交）
- [ ] 本地 Kokoro 原生推理和真实模型下载/解压；候选 RN 原生模块在 Expo 54 / RN 0.81.5 新架构下有未解决的模块注册问题，暂不冒险接入
- [ ] EAS 项目绑定、Apple 签名凭据和首次 iOS 云构建
- [ ] TestFlight 上传、iPhone 安装与真机验收

## 书源支持范围

当前 App 可导入普通/成人独立订阅清单中的 JSON API 书源，需提供 HTTPS 的搜索、详情、目录、正文四个接口。App 不执行第三方书源脚本，不允许凭据、跨域跳转或访问局域网。Legado 的 CSS/XPath/JS 规则尚不能直接导入运行。

书源仓库中的模拟源仅用于开发测试，不属于正式订阅，也不计入可用书源数量。只有通过许可审核、质量门禁和目标 App 验证的来源才能正式启用。

## 在线更新

项目接入 Expo Updates。正式启用 OTA 需要先绑定 EAS 项目、完成首次原生构建并配置发布凭据。此后兼容的 JavaScript、界面和静态资源更新可通过 EAS Update 发布；原生模块、权限或底层依赖变更仍需重新构建安装。

- 更新检查：正式构建中启动后自动检查，也可在「我的」页面手动检查。
- 更新应用：下载完成后重启进入新版本。
- 兼容保护：使用 fingerprint runtime version。
- GitHub Actions 提供手动 OTA 发布与 iOS 云构建入口，均需要仓库 Secret `EXPO_TOKEN`。

## 听书现状

AI 朗读完全使用 Kokoro 云端合成，不调用 iPhone 系统语音或辅助功能朗读：App 可将章节分段发送到你自己部署的 HTTPS 服务，接收 WAV 后通过原生音频播放器播放，并支持后台/锁屏、暂停、继续和停止。服务端代码位于 `server/`，需要先部署 Docker 服务，再把地址填入「声音」设置。当前不自动回退到 iPhone 系统语音。离线 Kokoro 原生推理和模型真实下载仍待解决原生模块兼容问题；模型不会在后台或播放时自动下载。

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

详见 [发布前准备与真机测试清单](docs/release-readiness.md)。
