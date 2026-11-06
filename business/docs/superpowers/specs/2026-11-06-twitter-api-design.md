# X 官方 API 接入修订

用户在浏览器方案实际受阻后选择 API Key 接入，随后开始申请开发者凭据。此次改为官方 OAuth 2 app-only Bearer Token 读取；保留既有浏览器选项以兼容旧批次。

后续用户改为优先本机自动浏览：界面默认是 interactive，API 保留为可选路径。默认及访问方式的最新决定见 `2026-11-06-twitter-interactive-design.md`；本文的 API 客户端、分页和密钥约束继续适用。

账号模式先通过 username 查询用户 ID，再读取 `/2/users/{id}/tweets`；关键词模式读取 `/2/tweets/search/recent`，仅覆盖官方近期窗口（当前文档为最近七天）。单贴 seed 使用 `/2/tweets/{id}`。每个任务读取一页，将服务端 next_token 持久化到下一任务，在现有队列中支持暂停、预算与恢复。X 网页 robots 决策仅用于网页获取，官方 API 模式走服务提供的授权 API，不请求网页或登录浏览器。

密钥仅从 `X_BEARER_TOKEN` 环境变量读取；示例文件仅包含空值，状态接口只报告是否配置，不验证或返回密钥。无自动付费测试、充值或订阅操作。界面默认选择 API，旧配置未声明 transport 时保持 browser。缺失 token、401、402/403、429、5xx、部分错误、格式错误均返回明确状态；429 使用官方 reset / retry-after 退避。

API 页保留原始 JSON 证据和安全的响应头，不保存 Authorization，不把错误正文直接回显。使用 API 的 author/media expansions，保存实际字段、缺失状态和 SOCIAL_POST 语义。按页预算限制请求数、字节、时间与最多返回条数；为避免服务端最小页大小导致超额读取，账号/关键词 API 采集条数至少 10，剩余小于最小页大小时停止并报告 incomplete。

验证采用注入 fetch 的构造响应，覆盖认证脱敏、账号/搜索 URL、next_token、缺少作者、精确指标、空页、重复 cursor、限流与无 token。界面测试 API 选择与未配置提示。真实在线验证等待用户配置有效 Bearer Token 和接口权限后进行，不将本地模拟测试报告成真实成功。

参考：
- https://docs.x.com/fundamentals/authentication/oauth-2-0/bearer-tokens
- https://docs.x.com/x-api/posts/search/quickstart/recent-search
- https://docs.x.com/x-api/posts/search-recent-posts
- https://docs.x.com/x-api/users/get-posts
- https://docs.x.com/x-api/getting-started/pricing
