# 采集工作流

## 集成方式

沿用 `crawl` 和 data_preprocessing/crawl，不另建与 Lydia 分离的采集 App。入口在 Settings → Crawl，旧 `/crawl/` 跳回同一 App，图标采用已确认的蜘蛛。CLI 调已认证 API，不直接打开 PGlite。

从工作区根运行（仅在当前任务授权实际采集时）：

```powershell
node --experimental-strip-types crawl/cli.ts --help
node --experimental-strip-types crawl/cli.ts sources
node --experimental-strip-types crawl/cli.ts run --config crawl/configs/pilot.json
node --experimental-strip-types crawl/cli.ts coverage
node --experimental-strip-types crawl/cli.ts results --status pending
```

不要因旧 README 说 CLI 需密码就强加登录页面；以当前会话 API 和脚本为准。无人值守 cookie/CSRF 只在私有环境，不进参数／配置／skill。

## 持久化、预算和证据

任务持久化：幂等 request key、领取 token、租约与续租、过期恢复、暂停／继续／取消、失败补抓。预算耗尽要通过 `resume --extend-budget` 等明确追加，不无限重试。关网页不停止后端；关机／关服务停止，重启恢复。

保留原始响应字节、脱敏头、时间／哈希、不可变快照、内容版本、字段证据和来源关系。重复扫描不以列表摘要覆盖已有全文；未知模板标受阻，不猜字段。分页保存结束证据，重复游标停止，达到预算仅说明当前批次结束。

十站配置／解析入口不代表十站完整抓取。ETHGlobal/HackQuest 的真实样本与其他平台逐站报告分开。full.json 是目标，不是完成证据；completed 可以同时 completeness=incomplete。

## 奖项、资源与关系

官方结果候选需精确身份匹配及复核，winner/finalist 上游声称与独立核实分开。已核实获奖不被 finalist-only 配额挤掉，但没有全量结果发现证据就不能保证所有获奖项目已抓完。无赛事年份保持未知，不借创建年份补值。

资源增强有边界：现有采集通常每项目最多五项，直接链接 GitHub README 保存 blob SHA；Demo／视频页面可访问不等于视频字幕已读，PDF 链接存在不等于正文解析。当前深入解读的 GitHub 文件阅读是另一条有界链路，不能据此宣称采集器已审计完整仓库。

SQL 一至两跳图只显示有字段证据的赛事／技术关系，不推断合作或抄袭；Neo4j、完整 L3、跨站合并撤销、全局向量／图效果等以现有实现与报告为准。PROJECT 进入案件需走 crawl-bridge 的 origin、版本、chunk 引用、outbox、旧投影失效和整体激活，不手写另一套导入。

导出 JSON/CSV/Markdown 需 operation ID、manifest、文件数／哈希与覆盖范围，不能把示例样本说成整体数据。确认来源数据与表格身份后再整理 top ideas，排名解释不能伪造成获奖事实。

## Twitter / X

附加到现有爬虫；指定账号和关键词两种模式。interactive、旧网页 robots、官方 api 是不同 transport，不能在旧批次缺配置时静默改策略。

- interactive 使用后端电脑独立持久 profile，用户在 X 页面自行登录；不复用日常 Chrome 凭据，不让登录和采集同时占 profile。
- 先分析实际 DOM／状态：推文字符串 ID、正文、发布时间、回复／转推／引用、可见指标、链接。媒体无正文、折叠和未知指标保留限制。
- 验证码、登录失效、限流时停止，不修改安全设置或绕过挑战。Google 自动化登录可能被拒，可由用户采用 X 自身登录。
- 达到条数／滚动／时间上限不代表全量。标 `SOCIAL_POST`，不创建获奖／赛事关系，不把社交帖子当已完成作品送入 IdeaLab。
- 官方接口使用 Bearer Token，不能只填 API Key；按当前接口权限／费用由用户配置，不自动充值或切收费读取。分页 next_token 可恢复，最小页大小不足时提前停。
- 当前真实结果看 `crawl/docs/TWITTER_VALIDATION.md` 与 live report；合成 DOM 测试不等于真实账号采集成功。

关键来源：`crawl/README.md`、`crawl/docs/{ARCHITECTURE,IMPLEMENTATION_STATUS,TWITTER_USAGE,TWITTER_STRUCTURE_ANALYSIS}.md`、`crawl/reports`、`data/data_preprocessing/crawl/DATA_CONTRACT.md`。旧文档中数据路径先对照 data-paths.ts。
