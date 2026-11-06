# Twitter (X) 结构分析

日期：2026-11-06。目标是在现有 Lydia 爬虫追加 X 来源，支持账号与关键词，两种入口均使用本机登录浏览器。

## 证据与验证边界

- 已阅读现有 source registry、parser dispatcher、worker、任务仓库、CrawlSettings、RAG bridge 和爬虫测试。
- 本次通过外部网页读取访问 `https://x.com/XDevelopers` 和 `https://x.com/search?q=hackathon&f=live`，均返回 403。不能据此断言用户本机浏览器也不可访问。
- 浏览器工具报告 browser access host unavailable，未读取用户登录会话的 DOM，也未复制 Cookie 或关闭其浏览器。
- X 官方帮助确认关键词、账号与日期筛选，以及 Top / Latest 等搜索分类；搜索结果受账户可见范围和搜索过滤影响，不代表全量数据。
- DOM 候选依据 Browserless 自己发布的 2026-09-20 采集记录。它是其作者的直接观察，但不是 X 的稳定接口承诺，也不是本项目的真实登录验证。
- 当前读取到 X robots.txt 的通配组为 `User-agent: *` / `Disallow: /`。现有 worker 会在此处停止；仅新增 parser 不能使采集运行。

来源：

1. https://help.x.com/en/using-x/x-search
2. https://help.x.com/en/using-x/x-advanced-search
3. https://help.x.com/en/using-x/x-search-not-working
4. https://cloud.browserless.io/skills/x.com/fetch-x-post
5. https://x.com/robots.txt

## 页面与数据边界

| 页面 | 入口 | 处理原则 |
| --- | --- | --- |
| 账号 | `https://x.com/{handle}` | 收集页面可见卡片，记录原作者；转发不能把原作者改为时间线账号 |
| 搜索 | `https://x.com/search?q={encodedQuery}&f=live` | 使用 Latest 作为候选入口；实际查询与 URL 均保存；本项目尚未验证此 URL 参数 |
| 详情 | `https://x.com/{handle}/status/{id}` | 用请求 ID 精确匹配主贴，其他卡片可能是回复或推荐 |
| 登录 | X 登录流程 | 用户自行完成登录；不把登录墙判成空结果 |
| 限制页 | 登录失效、验证、限流、不可见或删除 | 返回明确状态，保留脱敏诊断，禁止冒充成功或全量结束 |

候选 DOM：以 `article` 为卡片边界；`[data-testid="tweetText"]` 为正文；`time[datetime]` 为发布时间；指向 `/status/{id}` 的链接为身份来源。互动控件可能使用 `reply`、`retweet`、`like`、`unretweet`、`unlike` 等 test id。选择器需要在本机真实登录样本上确认。

不能收集整个页面文本充当正文：导航、推荐、按钮和引用贴会混入。应定位正文所属卡片，并将引用、媒体和互动数据分开。状态 ID 使用字符串；不能转成 JavaScript number。身份以 ID 去重，用户名不是唯一身份。

互动数据保存页面原始显示及采集时间；`1.2K` 等是显示近似值，未显示或解析失败用 null，不能补零。没有正文的媒体贴可保留媒体说明并标记正文缺失。长文折叠只记已展示内容，注明截断；需要展开或详情检查时单独处理。

## 滚动与完整性

实现时按可能存在 DOM 回收的动态列表处理：每次滚动前采集当前卡片，按 ID 累积去重。仅在最终 DOM 解析一次可能遗漏前面已移除的卡片。

停止条件包括条数、滚动次数、时间和字节预算，以及连续没有新增 ID。没有新增只说明本次没有继续观察到内容，不能证明账号历史或搜索已全量。采集记录应保存 last observed ID、查询和已见 ID；重启后允许重扫去重，不能声称支持网站未提供的稳定分页游标。

## 对现有代码的影响

- `crawl/sources/registry.ts`：增加来源及 X/Twitter 规范化与路径校验；不允许登录管理页、任意站点或非 HTTPS 种子。
- `crawl/sources/index.ts`：增加 parser 分发，保留原站点行为。
- `crawl/fetch/browser.ts`：现有实现是临时匿名 context 加受限 HTTP 回放，不支持持久登录，不能直接重用它模拟登录。
- 新的 X 会话模块：专用持久 profile 放在已忽略的 `.runtime`，并发互斥；用户首次登录，后续复用；不读取个人 Chrome profile 或导出会话。
- `crawl/core/config.ts` / `crawl/types.ts`：增加账号、关键词、条数及滚动预算；现有固定 2025–2026 年份语义不可默默套用所有推文。
- `crawl/core/worker.ts`：增加浏览器采集路径和错误映射，复用领取、续租、快照及提交；robots 拒绝不能静默绕过。
- `data/crawl/store.ts`：按来源内推文 ID 保留身份、版本与证据；推文不创建虚假的赛事和获奖关联。
- `data/RAG/crawl-bridge.ts`：当前硬编码 HACKATHON_PROJECT；X 导入需使用 SOCIAL_POST，并保留作者陈述属性，不能自动当成已验证市场需求。
- `business/frontend/src/components/CrawlSettings.jsx`：来源选 X 后显示账号/关键词、登录入口和采集限制；沿用任务列表及导出。
- 现有 source 数量上限和若干测试写死为 10，需要针对性调整。

## 当前结论

结构研究已形成可实现边界，真实登录 DOM 尚未验证。最大接入差异是持久会话、滚动时累积、推文数据语义，以及现有 robots 阻断。任何后续验证报告必须明确区分构造样本、真实登录样本和受阻状态。
