# Lydia Hackathon 爬虫

已实现本地可运行的采集核心，接入现有 Lydia 后端和 data 模块。**十站已接入解析入口，逐站验证程度不同；十站全量采集尚未完成。** 最新进度见 [扩展交付记录](reports/EXPANSION_REPORT.md)。

## 启动

在 `C:\maven\business_agent\business` 运行：

```powershell
npm.cmd start
```

随后打开 Lydia App，在 **Settings → Crawl** 管理采集，或直达 <http://127.0.0.1:4318/?settings=crawl>。旧 `/crawl/` 地址会跳转到 App。使用原有 Lydia 密码，首次使用可在本机页面设置。已运行旧服务时先正常退出再重启，加载新增路由和迁移；无需另起数据库服务。也可双击本目录 `Start-Crawler.cmd` 启动同一后端。

新增代码使用锁定依赖（含 data 中 parse5 与 graphql），不需要安装 Python 候选框架。新电脑仍按 business/data/frontend 原 README 分别 `npm.cmd ci`。启动时应用五份带校验和的增量迁移，旧 cases/documents 保留。

## 当前功能

- 持久任务、幂等请求、领取 token/过期恢复/续租、暂停继续、取消、失败补抓与分批预算。
- 原始响应字节、脱敏头、时间/哈希、不可变快照、版本与字段证据。
- ETHGlobal 与 HackQuest 当前公开模板：列表基础索引、详情、资源链接；已验证两种结构的真实项目样本。未知模板转受阻，不猜测字段。
- 已核验获奖者不受 finalist-only 配额限制；分层确定性选择及历史记录。**官方结果全量发现与各站 finalist 映射尚未完成，不能证明获奖全量覆盖。**
- 直接关联 GitHub 的有界 README 检查，保存 blob SHA；Demo/视频页面状态与不支持资源分开记录。最多每项目五个资源；未取字幕、解析 PDF 或审计完整仓库。
- case 内 PROJECT 导入、原有关键词/向量检索、origin 去重、metadata 更新、分部、稳定引用映射、outbox、旧投影失效与整体激活。没有 Ollama 时保留关键词能力。
- App Settings 内原生 Crawl 管理、最近后台操作与下载、CLI、SQL 证据关系一至两跳查询、JSON/CSV/Markdown 导出与 manifest。

关闭网页不停止后台任务；关闭电脑或后端时不会继续运行，重启后可恢复未完成任务。

## CLI

以下命令在工作区根 `C:\maven\business_agent` 运行。CLI 仅调用已认证 API，不打开 PGlite。

```powershell
node --experimental-strip-types crawl/cli.ts --help
node --experimental-strip-types crawl/cli.ts sources
node --experimental-strip-types crawl/cli.ts run --source ethglobal --max-pages 5
node --experimental-strip-types crawl/cli.ts run --config crawl/configs/pilot.json
node --experimental-strip-types crawl/cli.ts projects --year 2026
node --experimental-strip-types crawl/cli.ts coverage
node --experimental-strip-types crawl/cli.ts results --status pending
node --experimental-strip-types crawl/cli.ts export --format json
```

终端隐藏输入密码。每次进程只在内存保留 Cookie 与 CSRF。无人值守可在私有环境设置现有 `LYDIA_CRAWL_SESSION`、`LYDIA_CRAWL_CSRF`，不把密码放在命令参数或配置文件中。

`status <run-id>` 看任务；`pause`/`resume`/`cancel` 控制批次。预算用尽后用 `resume <run-id> --extend-budget` 明确允许下一批，并保留预算变更。网页“继续”在预算用尽时同样扩展一批。

`project <project-id>` 看详情；`enrich <project-id>` 安排有界资源检查；`import --case <case-id> --project <project-id>` 导入该案件 PROJECT。导出、导入、选择和资源检查返回持久操作 ID，用 `operation <operation-id>` 查询状态与导出目录。

## 数据位置

| 内容 | 位置 |
| --- | --- |
| 爬虫源码、配置、文档与界面 | 本目录 |
| 数据层代码与接口 | [../data/crawl](../data/crawl/README.md) |
| 原有业务数据库，包括新增 crawl_ 表 | `../business/.runtime/data`，由原 `LYDIA_DATA_DIR` 控制 |
| 原始快照和导出 | `../data/.runtime/crawl`，可用绝对路径环境变量 `LYDIA_CRAWL_STORAGE_DIR` 覆盖 |
| 本次真实样本、审核与导出索引 | [reports/LATEST_LIVE_REPORT.md](reports/LATEST_LIVE_REPORT.md) |

数据库仍只由后端打开，没有搬移旧数据库。Hackathon 资料进入 PROJECT，不默认成为 MARKET 用户需求证据。

`configs/pilot.json` 为两站小批配置；`configs/full.json` 表达十站目标，**不意味着各站动态列表和结果已全量验证**。重复运行会保留身份，内容或元数据变化产生版本；列表重扫不会用摘要覆盖已有全文。

## 验证与限制

在 business 运行：

```powershell
npm.cmd run check
npm.cmd test
node --experimental-strip-types scripts/crawl-browser-test.ts
```

联网 pilot 在工作区根运行 `node --experimental-strip-types crawl/scripts/pilot.ts`，使用独立临时数据库，报告写入 data 运行目录，不填充生产案件库。`crawl/scripts/audit.ts` 执行十站有界入口与 robots 核查并保存原始响应。TEST_ONLY 与真实联网数据分开报告。

已保存分页结束证据与重复游标停止状态，但各站历史动态列表尚未全部验证；批次 completed 表示当前队列结束，`completeness=incomplete` 保留覆盖边界。HackQuest 有参赛关联但无赛事年份时保持未知，不借项目创建时间补值。

受限浏览器已启用并通过隔离测试；依赖被阻止或渲染未完成时保留 partial。新增官方结果候选、精确身份匹配及复核。获奖全量、完整缺失状态模型、跨站合并/撤销、周期调度、完整 L3、Neo4j、全局向量检索和图检索效果评测仍待完成。SQL 图展示有证据的赛事/技术声明，不推断合作或抄袭。

Dockerfile 与运维说明见 [deployment](deployment/README.md)。本机 Docker Engine 未运行，镜像尚未构建验证；没有云部署或付费调用。

## 设计与状态

- [架构](docs/ARCHITECTURE.md)、[数据契约](../data/crawl/DATA_CONTRACT.md)
- [实施状态](docs/IMPLEMENTATION_STATUS.md)、[实现计划](docs/IMPLEMENTATION_PLAN.md)
- [修订 Prompt](docs/IMPLEMENTATION_PROMPT.md)、[原始备份](docs/PROMPT_ORIGINAL.md)
- [工具评估](docs/CAPABILITY_ASSESSMENT.md)

`scrap/` 和 `rea/` 保留原有第三方源码，未安装或调用。Downloads 中原 prompt 未改。工作区根不是 Git 仓库，没有创建提交。

原 `crawl/web` 为历史界面源码，后端不再提供这套页面或样式。当前界面在 `business/frontend/src/components/CrawlSettings.jsx`，沿用原 App 的深浅主题。


[Twitter (X) extension usage and limitations](docs/TWITTER_USAGE.md)
