# Twitter 扩展验证记录

日期：2026-11-06。

## 最新修订：本机自动浏览与可选 API

用户随后选择自动浏览自己登录的 X，现已新增 `transport: interactive` 并作为界面默认。该模式使用可见的本机登录浏览器，不进行匿名 robots 预取；旧 `browser` 模式仍执行原检查。官方 API 为可选路径，仅从环境变量读取 Bearer Token，未发起真实付费请求。

最新检查：TypeScript 通过；前端构建通过；新增 API/interactive 及全部爬虫相关回归 **32/32** 通过。浏览器界面检查确认默认 interactive、账号/搜索配置提交、API 无 Token 禁用、旧模式受阻/重试与手机无横向溢出。

已打开真实专用登录窗口，请用户自行登录。用户反馈的截图是 Google 登录拒绝当前浏览器；已提示返回 X 使用 X 用户名/邮箱/手机号登录。当前尚未观察到真实登录完成，因此真实采集仍待验证。以下原记录描述的是修订前的受限网页爬虫及构造测试，不代表 interactive 已经抓到真实推文。

## 已实现

- 在现有 source registry、parser dispatcher、worker、API 与 CrawlSettings 追加 Twitter (X)。
- 支持账号/关键词，以及配置中的单条推文 seed；输入与 URL 范围校验，浏览器模式强制生效。
- 本机专用持久登录 profile、互斥与关闭清理；登录窗口控制受本机请求、既有认证及 CSRF 约束。
- 按轮收集动态 DOM、字符串 ID 去重、引用隔离、原始可见互动、媒体贴和折叠正文边界。
- 原有任务暂停/继续/取消与令牌隔离，明确的登录、验证、限流、robots 与未知模板状态。
- SOCIAL_POST 入库、证据、案件导入和 JSON/CSV/Markdown 导出。
- 在原有任务列表展示受阻原因及手动重试，X 批次隐藏赛事选择操作。

## 检查结果

- `npm.cmd run check`：通过。
- `npm.cmd run build:frontend`：通过。
- 爬虫回归命令：`node --experimental-strip-types --test --test-concurrency=1 tests/twitter-crawl.test.ts tests/crawl.test.ts tests/crawl-worker.test.ts tests/crawl-api.test.ts tests/crawl-data.test.ts tests/crawl-discovery.test.ts`，26/26 通过。
- 补充暂停继续、取消提交隔离、Markdown 社交来源、登录失败清理和登录接口防护后，重新运行新增测试、API 与数据回归，14/14 通过。
- `node --experimental-strip-types scripts/twitter-browser-test.ts`：通过。实际 Chromium 中使用构造 DOM 与假会话 Cookie，验证卡片回收、累积、快照脱敏、采集清理及网页端账号/关键词提交；检查受阻提示、重试按钮和 390px 手机布局无横向溢出。
- 截图及机器报告：`business/.runtime/twitter-validation/desktop.png`、`mobile.png`、`report.json`。已查看手机截图。
- 对本次修改范围执行 `git diff --check`：通过。测试使用临时数据库，没有写入真实案件库。

## 真实访问边界

上述采集成功均为 TEST_ONLY 构造样本，不是真实 X 推文。未使用用户的真实登录 Cookie，也未验证真实登录后的最新 DOM。当前 X robots 通配规则会被原有检查拒绝；受阻任务不启动采集浏览器。登录不会解除该限制。没有部署或重启正在使用的后端；加载新增 API 和来源需要重启后端。
