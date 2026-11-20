# 私人小说（AppleNovelApp）

一款面向 iPhone 的个人小说阅读器，使用 React Native + Expo 开发。

## 当前进度

- [x] 初始化 Expo + TypeScript 项目
- [x] 书架、发现、书源、我的基础界面
- [x] 本地书架数据持久化（AsyncStorage）
- [x] 系统中文语音朗读（前台）
- [x] 演示章节目录与上一章/下一章
- [x] 阅读位置按章节保存
- [x] 阅读字体大小与日间/夜间背景切换
- [ ] 小说详情与真实在线章节目录
- [ ] 精确阅读位置、字体与主题设置
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

## 数据与听书

书架和阅读进度保存在设备本地，不会自动上传到服务器。当前听书使用系统语音能力，适合前台朗读；锁屏后台持续播放和耳机控制仍需后续单独实现与测试。

## 项目原则

本项目只实现阅读器与合法书源规则管理，不托管未经授权的小说正文。接入书源前应确认目标站点的使用条款及内容授权情况。
