# 私人小说（AppleNovelApp）

一款面向 iPhone 的个人小说阅读器，使用 React Native + Expo 开发。

## 当前进度

- [x] 初始化 Expo + TypeScript 项目
- [x] 阅读器首页、书架、发现、设置的基础界面
- [ ] 小说详情与章节目录
- [ ] 本地阅读进度和书架持久化
- [ ] 系统语音听书
- [ ] GitHub JSON 书源导入与搜索
- [ ] iOS 云端构建与 TestFlight 测试

## 开发环境

- Node.js LTS
- npm
- Expo SDK 54
- React Native 0.81
- TypeScript

## 本地运行

```bash
npm install
npx expo start
```

iPhone 安装 Expo Go 后，扫描终端中的二维码进行开发预览。

## 项目原则

本项目只实现阅读器与合法书源规则管理，不托管未经授权的小说正文。接入书源前应确认目标站点的使用条款及内容授权情况。
