# HTML 书源 CSS 规则

App 支持在书源 JSON 的 htmlRules 字段中声明 CSS 选择器。它只解析站点返回的 HTML，不执行来源脚本、JavaScript、动态代码或正则脚本。

## 示例

```json
{
  "name": "示例 HTML 书源",
  "baseUrl": "https://example.com",
  "searchUrl": "https://example.com/search?q={keyword}",
  "bookUrl": "https://example.com/book",
  "chapterListUrl": "https://example.com/chapters?bookUrl={bookUrl}",
  "chapterUrl": "https://example.com/chapter",
  "htmlRules": {
    "search": {
      "itemSelector": ".book-item",
      "titleSelector": ".book-title",
      "authorSelector": ".book-author",
      "descriptionSelector": ".book-intro",
      "urlSelector": "a.book-title",
      "urlAttribute": "href",
      "coverSelector": "img.cover",
      "coverAttribute": "src"
    },
    "detail": {
      "titleSelector": "h1.book-title",
      "authorSelector": ".book-author",
      "descriptionSelector": ".book-intro"
    },
    "chapters": {
      "itemSelector": ".chapter-list li",
      "titleSelector": "a",
      "urlSelector": "a",
      "urlAttribute": "href"
    },
    "content": {
      "contentSelector": "#chapter-content",
      "titleSelector": "h1.chapter-title"
    }
  }
}
```

所有接口仍须是 HTTPS 公网地址，且请求只能访问书源配置中声明的来源域名。{keyword}、{bookUrl} 等占位符用于构造查询地址；HTML 选择器只从当前响应文档内取值。

## 支持的 CSS 子集

- 标签、通配符、ID、class
- 属性存在与属性等值选择器
- 后代选择器、直接子代 >
- 逗号分组选择器
- :first-child、:last-child、:nth-child(n)
- 文本提取会忽略 script、style、noscript，并为常见块级元素保留段落换行
- 章节和封面链接只接受 HTTPS；不安全链接会被丢弃

## 当前不支持

XPath、正则替换、JavaScript、复杂伪类、CSS 伪元素、动态加载内容、登录态/Cookie、付费内容和验证码。规则不匹配时会返回明确错误，不会猜测并导入错误正文。

这是阅读器内置的轻量选择器实现，不等同于完整浏览器 DOM。每个真实来源仍需取得授权并经过四接口测试后才能进入正式订阅。
