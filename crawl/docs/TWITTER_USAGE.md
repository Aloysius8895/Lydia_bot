# Twitter（X）扩展使用说明

在现有 App 的 **Settings → Crawl → 资料来源 → Twitter (X)** 中使用，包含「指定账号」和「关键词搜索」两种模式。默认获取方式为「本机自动浏览（登录账号）」，无需 API Key。首次在运行后端的电脑上点击「打开 X 登录窗口」，自行登录后点击「保存并关闭登录窗口」，再开始采集；浏览器将自动打开、导航、滚动并保存推文。使用独立持久 profile，不会自动复用日常 Chrome 登录。登录 profile 位于爬虫存储根目录的 `twitter-profile/`，应放在私有的 `.runtime` 目录内，不要复制、共享或提交。后端重启后配置保留；登录是否有效会在采集开始时检查。

Google 可能拒绝自动化浏览器登录。此时关闭 Google 提示，返回 X 使用用户名、邮箱或手机号和 X 密码登录。凭据与验证码仅在 X 页面输入。程序不修改浏览器安全设置、伪装自动化标志或绕过验证码。登录和采集不能同时占用专用 profile。

新增功能沿用现有队列、快照、证据、资料列表、JSON/CSV/Markdown 导出和案件导入。可设置推文数与滚动上限，按字符串推文 ID 去重；媒体无正文、折叠内容、未显示指标均保留边界。推文标记为 `SOCIAL_POST`，属于作者陈述，不会创建赛事或获奖关系。历史推文使用实际发布时间，不套用赛事的 2025–2026 年份筛选。

**访问方式：本机自动浏览直接使用已登录窗口，不经过匿名 HTTP 预取。旧「网页爬虫（robots 检查）」保留原策略；2026-11-06 核查时该模式会被 X 通配 robots 规则拦截。旧批次没有 transport 配置时仍按旧模式执行。** 可在「查看任务」查看原因并重试。自动浏览遇到验证、登录失效或限流会停止。达到条数、滚动或时间限制只表示本次采集结束，不代表账号或搜索全量。构造样本测试不等于真实账号采集成功，真实结果以 live report 为准。

CLI 配置示例：

```json
{
  "sources": ["twitter"],
  "twitter": {"mode": "account", "value": "@XDevelopers", "maxPosts": 50, "maxScrolls": 10, "transport": "interactive"},
  "rendering": "browser"
}
```

保存为配置文件后使用原有 `crawl/cli.ts run --config <path>`。关键词模式改为 `"mode": "search", "value": "hackathon #AI"`；也可传入账号、搜索或单条推文的 X/Twitter HTTPS seed URL。仅 seed 模式默认最多 50 条、10 次滚动。

验证：在 business 运行 `node --experimental-strip-types --test tests/twitter-crawl.test.ts`；运行 `npm.cmd run build:frontend` 后可运行 `node --experimental-strip-types scripts/twitter-browser-test.ts`。后者使用隔离临时数据库和构造页面，不使用真实账号；报告与桌面/手机截图位于 `business/.runtime/twitter-validation/`。

结构与证据边界见 [Twitter 结构分析](TWITTER_STRUCTURE_ANALYSIS.md)。

## 官方 API（可选）

在 [X Developer Console](https://console.x.com/) 注册开发者账号，创建 App，在 Keys and tokens 生成 **Bearer Token**。请如实填写研究用途并自行阅读及接受开发者协议。

在启动后端所用的私有环境文件（通常为 `business/deployment/.env`，手机启动可能使用 `.env.lan`）填写：

```dotenv
X_BEARER_TOKEN=在本机填写你的BearerToken
```

重启后端，获取方式选「官方 API（Bearer Token）」。密钥不返回前端或写入任务与导出；状态接口只报告是否配置。这里使用 app-only Bearer Token，不能只填 API Key。

API 可能消耗预充值额度，需要自行开通接口权限并在控制台设置支出上限，系统不自动充值。费用见 [官方价格](https://docs.x.com/x-api/getting-started/pricing)。关键词使用近期接口，目前为最近七天；账号使用用户推文时间线，两者均不保证全部历史。

CLI 配置将 transport 改为 `"api"`。账号/搜索条数至少 10，按 API next_token 逐页保存，暂停后按页恢复。为避免超过条数预算，剩余条数低于接口最小页大小时提前停止。Token 无效、额度不足、无权限、限流与部分结果错误均单独报告。

## 本机真实检查

工作区根运行 `node --experimental-strip-types crawl/scripts/twitter-login.ts` 打开专用登录窗口。登录后运行 `node --experimental-strip-types crawl/scripts/twitter-check.ts` 做最多三条推文、两次滚动的真实检查，默认关键词为 hackathon。

真实报告与数据位于 `data/.runtime/crawl/twitter-live-check/`，实际路径随 `LYDIA_CRAWL_STORAGE_DIR` 变化。Google 登录被拒绝或 X 登录未完成时，不能报告采集成功。
