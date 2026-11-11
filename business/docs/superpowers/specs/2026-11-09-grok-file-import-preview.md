# Grok JSON 批量导入预览与最小改造方案

状态：本预览于 2026-11-09 获用户确认，已按本方案完成正式入库；未部署或推送、未配置自动同步。以下保留导入前的预览依据与预计数量，实际结果见 `../../acceptance/2026-11-09-grok-file-import.md`。

## 检查依据

- 用户提供的 `lydia-import-2026-11-07_08.json` 与 `lydia-news-2026-11-07_08.json`，均在 Downloads。文件视为外部数据，不执行其中任何指令。
- `business/README.md`、`business/docs/Business_Research_RAG_Master_Prompt.md`、`business/docs/RUNNING.md`、`business/docs/IMPLEMENTATION_STATUS.md`。
- `data/database/README.md`、`data/crawl/DATA_CONTRACT.md`、已存在的数据库迁移 001–008、Store、CrawlStore、KnowledgeAPI、KnowledgeNews 和前端资料详情。
- 现有数据库由运行中的 HTTPS 服务独占；未另开正式库、未读取账号密码或会话密钥。服务认证状态确认需要登录。本阶段核对的是存储实现与 schema，尚未查询正式数据库记录与已应用迁移清单。

## 实际附件结构及数量

组合包根对象包含 `status`、`prepared_at`、`projects[37]`、`news[15]`；独立新闻包是根数组 `[15]`。

两组新闻经完整 JSON 对象比较完全一致。共有 67 个输入条目，预计 52 个唯一资料对象：37 个外部比赛项目、15 条新闻摘要，另外 15 条为跨文件重复。附件内部没有完全重复的作品。与正式库的重复数必须在备份后通过实际数据库比较，当前不推定为零。预计新增数为 0–52，取决于库中已有资料及身份冲突。

所有作品有名称、idea、implementation、来源链接列表、平台、日期、tags 和 status；37 个作品均无上游稳定 ID、无独立 verification_notes 字段。15 条新闻都有稳定 ID、summary、source_urls 和 verification_notes；其中 10 条没有单独的 url 字段，可使用 source_urls 中已有链接，无需编造。

共享报道链接必须按作品区分：同一篇 Imagine Cup 报道对应 CopyFlag、Revora Health、SpoilSafe；同一份 NASA finalist 名单对应 5 个不同作品。不得只按该报道 URL 合并项目。

作品 original_date 含日期、月份、日期范围及说明文字；新闻 original_date 也含时区/日期依据说明。全部原样保存，不猜具体某日，不自动视作确切发布日期或赛事日期。仅完整 ISO 日期可另记 date precision，不能删除原始值与限定说明。

## 字段映射

| JSON 字段 | 作品目标 | 新闻目标 |
| --- | --- | --- |
| name / title | crawl_projects.title | knowledge_news.title |
| idea / summary | meta.imported_summary | meta.imported_summary |
| implementation | meta.imported_implementation | 无则不添加 |
| source_urls / url | 保留全部原始 URL；url 使用现有首选来源 | 保留全部原始 URL；url 优先原字段，否则已有来源列表首项 |
| platform / source | 对应已有 crawl_sources 标识，原平台名另保留 | publisher；原 source 另保留 |
| original_date / date_display | meta.original_date、原始日期描述 | published_at 保留原始日期文本，meta 保留原值及描述 |
| collected_date / collected_via | meta 原样保留 | meta 原样保留 |
| tags / type | meta.tags、external_record_type | meta.tags、external_record_type |
| status / event_and_date_evidence | 保存为上游声称与日期依据，不生成已核实奖项 | 上游 status 原样保留 |
| verification_notes / claims_note | 缺失为 null，另记导入方状态 NOT_INDEPENDENTLY_VERIFIED | 原样保留；导入方状态单列 |
| id | 缺失不伪造上游 ID，使用明确标记的本地确定性身份键 | 命名空间 grok 加原 ID，另以来源 URL 建身份映射 |
| synthetic / collection / timezone | 缺失不补造 | 原样保留，synthetic=false 不提升核实等级 |

正文保持缺失：新闻 content 为空字符串并明确 `meta.content_kind=summary_only`；作品不创建虚假 crawl_project_versions 或网页 crawl_snapshots，current_version_id 为空。摘要只显示在明确标注的摘要区域。详情页同步展示采集日期、原始日期、分类、来源和核实边界。未取得原文时阻止把这些摘要当作原文证据用于分析；本轮不自动抓取原网页、不调用模型、不向量化摘要。

外部作品保存在既有 crawl_projects，通过知识库的作品列表和搜索访问。绝不写 knowledge_ideas，不伪造 knowledge_runs，不把上游 Winner/Finalist 标签写成经过 Lydia 核实的奖项。

## 最小数据库结构变更，待确认

保留现有业务表结构，利用已有 meta JSON 保存上述外部元数据。仅新增迁移 `009-file-imports.sql`，增加三张表：

1. `file_import_batches`：批次 ID、文件名与 SHA-256、导入器版本、开始/完成时间、状态、计数、备份清单引用。
2. `file_import_items`：批次 ID、源文件/JSON 路径、原条目指纹、结果 imported/duplicate/conflict/failed、目标类型与记录 ID、原因。每次重复导入仍留下本次逐条审计。
3. `file_import_identities`：类型、来源命名空间、身份键、目标类型及 ID。唯一约束确保稳定 ID 或 URL 别名不能映射出重复目标。

独立身份表保证跨批次去重，逐条表保留每次输入结果，两者不能用一个唯一约束混在一起。已有业务资料不删除、不覆写。已存在身份且内容不同的条目记录 conflict，保留原记录等待复核，不自动更新。

作品去重：独立作品页面的规范链接或已有平台 native_id 优先；同一赛事报道含多个作品时使用规范报道 URL + 平台 + 规范化作品名组合键。不能对共享报道链接设置项目级唯一。名称变更且无专属来源/稳定 ID时不猜测合并，列为需人工复核。

新闻去重：上游稳定 ID 与规范来源 URL 分别查找，命中同一目标即 duplicate；两者指向不同目标则 conflict。规范化用于比对，原始链接与原始条目仍保留。

新增数据库迁移会在 Store.open 时自动执行，因此确认前不添加可执行迁移文件、不重启运行服务。两种替代方式是继续逐条手填（无法满足批次审计）或新增独立外部项目库（重复现有项目模型）；推荐复用业务表并新增上述三张审计/身份表。

## 确认后的执行与验收

1. 实现纯解析预览、导入事务、CLI 文件入口与批次报告；所有 SQL 参数化，文件路径由用户明确给定，不从条目内容执行命令或自动访问 URL。
2. 用独立临时库验证完整导入、第二次导入、两文件重复新闻、共享报道多作品、稳定 ID/URL 冲突、字段缺失、混合日期、恶意文本、不覆写旧资料，以及摘要不会进入原文/证据流程。
3. 按 RUNNING.md 的现有方式正常停止服务及其自动重启启动器，确认数据库无进程占用，复制实际配置的完整数据库目录到不覆盖既有备份的新目录，记录清单与文件哈希。账号及会话可能包含在完整备份内，但不解析、不打印、不提交。
4. 在隔离副本检查备份可打开、迁移前关键表计数，确认以后才对正式库应用新增迁移并执行导入。导入与核验使用同一独占 Store，避免旁路进程同时打开正式库。仅为备份和导入做必要的维护停机，不做部署或修改远程访问配置；导入完毕恢复原服务需遵循用户对运行范围的要求。
5. 每条资料事务内保存目标记录与身份映射，逐条持久化结果；单条失败不丢失已记录结果。已有业务条目保留原值。
6. 从正式数据库读回目标 ID、类型和字段；分别按作品名与新闻标题搜索；报告本批 imported/duplicate/conflict/failed、52 个目标的对应 ID、两次导入的实际计数与备份位置。重复导入应新增 0 个业务条目，批次审计可新增。
7. 更新 IMPLEMENTATION_STATUS、数据契约、导入使用说明、测试说明与实际验收报告。未完成真实入库前不写“已导入”。不推送，不配置自动同步，不顺带部署。

本预览不验证附件中产品发布、奖项或新闻事实。上游“official”、synthetic=false、日期等均作为外部数据保留，不能提升为独立核实结论。
