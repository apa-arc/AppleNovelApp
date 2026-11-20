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
- [x] GitHub JSON 书源粘贴导入、格式校验、启用/停用与删除（本地管理）
- [ ] 书源联网测试、搜索与章节解析
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

## JSON 书源格式（当前版本）

在 App 的“书源”页粘贴 JSON 对象导入。字段均为必填项，网址必须使用 HTTPS 公网地址，不能包含账号密码，也不能指向 localhost 或局域网。示例：

```json
{
  "name": "我的书源",
  "baseUrl": "https://example.com",
  "searchUrl": "https://example.com/search",
  "bookUrl": "https://example.com/book",
  "chapterListUrl": "https://example.com/chapters",
  "chapterUrl": "https://example.com/chapter"
}
```

当前只完成配置导入、校验和本机保存；示例域名不可直接用于搜索。尚未实现网站请求、HTML 选择器或正文解析，也不会执行书源脚本。请只配置你有权访问且允许自动化访问的站点。

## 项目原则

本项目只实现阅读器与合法书源规则管理，不托管未经授权的小说正文。接入书源前应确认目标站点的使用条款及内容授权情况。
