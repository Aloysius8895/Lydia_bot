# Crawl 数据与 RAG 契约 v1（设计）

## 2026-11-09 文件导入补充（已实现）

经用户确认，Grok 文件批量导入复用 `crawl_projects` 保存外部案例，以 `meta.content_kind=summary_only`、`meta.imported_summary` 与完整 `meta.imported_record` 保留来源、日期、分类和核实边界。没有原文时不创建 crawl_project_versions/snapshots/evidence/awards，不能冒充抓取证据或已核实奖项；分析拒绝仅摘要记录。新闻使用 knowledge_news，同样不把摘要写入 content。新增 `file_import_batches`、`file_import_items`、`file_import_identities` 持久化批次、逐条结果与唯一身份映射，冲突不覆盖。导入通过独占维护 Store 执行，必须先暂停运行服务并完整备份、隔离恢复核验；不是另一个常驻数据库写入进程。自动同步不属于本次范围。真实入库结果见 [验收报告](../../../business/docs/acceptance/2026-11-09-grok-file-import.md)。

本文件定义拟实现接口，不是可执行 schema 或现有 API 文档。数据库所有者为 `business/backend/server.ts` 的单一 Store；所有 crawler 模块接受注入实例，CLI/外部获取进程只走 API。

更新：已按该方向实现可运行核心。具体表名有合并，API 有分阶段差异；完整字段状态、跨站合并/撤销等尚未实现。以 [实施状态](../../../crawl/docs/IMPLEMENTATION_STATUS.md) 与实际代码为准，不将本目标契约当作全部已上线能力。

## 1. 主记录

新增表使用 `crawl_` 前缀；避免覆盖现有 `tasks`、`cases`、`documents` 和 `chunks`。

| 表 | 稳定键、约束及重要字段 |
| --- | --- |
| crawl_sources | source_id；入口、状态、审核时间、访问规则、adapter_version；十站各一条 |
| crawl_events | event_id；UNIQUE(source_id, native_event_id)；届次年份、日期精度、范围及依据 |
| crawl_projects | project_id；规范项目身份、人工状态；名字不唯一 |
| crawl_source_projects | source_project_id；UNIQUE(source_id, native_project_id)；FK project_id，原始/最终/规范 URL |
| crawl_project_versions | project_version_id；FK project_id；源修订/commit/赛事时依据、版本未知标记 |
| crawl_submissions | submission_id；FK source_project_id、event_id、project_version_id；同一次平台参赛唯一 |
| crawl_awards | award_id；FK submission_id；原始名称、规范类别、official_verified 状态、证据 |
| crawl_resources | resource_id；FK project_version_id；类型、原始 URL、规范 URL、commit 与检查状态 |
| crawl_snapshots | snapshot_id；source/resource、请求与最终 URL、HTTP 状态、脱敏响应头、时间、字节哈希、文件相对路径、获取后端、页面分类 |
| crawl_content_versions | content_version_id；FK snapshot/resource；原文、清理版哈希、parser/cleaner 版本、章节与偏移映射 |
| crawl_field_evidence | evidence_id；entity_type/id、field、原始值、规范值、值状态、FK snapshot/content_version；quote、locator、offset、性质与核验状态 |
| crawl_runs | run_id；配置快照、规则版本、开始/结束、预算、状态、窗口与完整性结论 |
| crawl_tasks | task_id；UNIQUE(idempotency_key)；FK run、目标、阶段、刷新代次、状态、attempt、retry_at、lease_token/expires_at、checkpoint、错误分类 |
| crawl_selection_decisions | decision_id；规则版本、候选快照、winner/finalist-only、主选赛事、seed、配额、选中与原因、历史版本 |
| crawl_quality_issues | issue_id；实体/快照、规则版本、严重程度、处理状态与修订审计 |
| crawl_match_candidates / crawl_merge_history | 候选两端、依据、人工决定、别名、原关联备份与撤销记录 |
| crawl_relations | relation_id；两端 typed ID、关系类型、project_version、性质、审核状态、有效期 |
| crawl_relation_evidence | FK relation_id、evidence_id；支持多证据，不用相似度伪装事实 |
| crawl_projection_outbox | event_id；实体、entity_revision、动作、目标、payload hash、attempt、next_retry、ack/version |
| crawl_rag_bindings | binding_id；FK case_id、project_version、resource、content_version；origin_key、外部稳定 doc key、现有 document UUID、投影指纹、状态 |
| crawl_chunk_bindings | 外部 chunk key、FK binding/document/chunk；原文 start/end、chunker_version；多个 origin 可映射去重文档但不得丢来源 |

表的具体拆分可在实现时减少，但上述实体约束不可删除。多态 evidence/relations 的实体引用不能假称为数据库 FK；实现 repository 级存在性校验，并在导出/重建时检查悬空引用，或改为 typed association tables 建立真实 FK。

稳定平台 ID 缺失时用保留大小写路径及必要参数的规范 URL 作为暂时键并标记 identity_basis=url；后来获得平台 ID 时保留 alias。文档身份不能用列表位置或可变项目名称。

## 2. 字段与证据

字段状态：present、not_provided、not_fetched、fetch_failed、parse_failed、access_restricted、conflicting、not_applicable。值为空必须附状态，不把 unknown 解释成 false、0 或未获奖。

时间保存 value、precision(year/month/day/instant)、basis、evidence_id；运行时间不能充当赛事年份。奖项绑定参赛记录，技术观察绑定项目版本。证据性质枚举 official_fact、author_claim、code_observation、ai_inference、computed_similarity；核验状态单独保存，作者说“使用 RAG”不自动成为代码观察事实。

获取契约 FetchResult 必须提供 requested_url、final_url、status_code、captured_at、headers（脱敏）、raw_bytes 或 blob_ref、raw_sha256、content_type、backend、classification；浏览器另附 rendered_dom、等待条件与执行步骤。非成功响应仍可保存诊断快照。解析器输出实体、字段状态、证据定位、资源链接、next_cursor、termination_evidence 及 parser_version。

分页 checkpoint 保存 cursor、查询条件、页面 hash、已见 ID 数、新增数与明确终止信号。预算/重复游标产生 incomplete/stalled，不产生 complete。

## 3. 持久化和迁移

建立 `schema_migrations(version, checksum, applied_at)`。增量 SQL 文件需在事务中执行并登记版本；检测 checksum 变化时停止启动并报错。先在空临时库与含已有 case/doc 的临时库验证升级，不能对真实业务数据库直接试错。

原始文件先写完并校验，再事务插入 snapshot、解析事实、证据、outbox 及任务完成状态。更新必须带 entity_revision 和有效 lease_token，失败后可重试。快照不可原地覆盖。日志和 response headers 剔除 Cookie、Authorization、Set-Cookie、带令牌 URL 参数。

## 4. RAG 接入与身份

### 接入规则

全局项目库不直接调用现有 ingest 写全局 PROJECT。调用方必须给有效 caseId；默认 collection=PROJECT。不同 collection 的当前语义保持：METHOD 是方法库，MARKET 是 case 市场证据。Hackathon 获奖和项目功能不代表用户需求已验证。

同一 case 再次附加同一投影应返回既有 binding。不同 case 附加同一项目各有独立文档权限与引用。支持选择多个项目进入一个研究 case，避免为每个被爬项目自动创建业务 case。

### 拟扩展 ingest 契约

保留现有参数和默认行为，爬虫调用显式提供 `originKey`、`projectionFingerprint` 和 `metadataOnly` 等可选参数。实现前最终签名应按现有类型收敛并写测试。

- originKey = `crawl:<project_version_id>:<resource_id>:part:<part_index>`，在 case/collection 内唯一；版本内容变化不改变此 key。
- 外部 document key = SHA256(originKey + content_version_id + chunker_version)。
- 外部 chunk key = SHA256(document key + 原文 start/end + 片段 hash + chunker_version)。
- projectionFingerprint = SHA256(正文 + 完整可索引 metadata 的规范 JSON + schema/parser/chunker 版本)。metadata-only 奖项或年份变化也触发同步。
- UUID doc/chunk ID 继续由既有 RAG 管理；binding 建立稳定 key 到 UUID 的映射，幂等重试返回原 ID。

不能沿用“相同正文直接返回 old”来跳过爬虫 metadata。对带 originKey 的输入只在同一 origin 范围内判断重复，并按 origin 做 previous 查找；两个项目同 URL 或同正文不能串身份。相应唯一约束需要兼容新 origin 模式与既有上传模式，迁移后保留旧文档。

投影 metadata 至少有 project_id、project_version_id、source_project_id、submission_ids、event_ids、evidence_ids、snapshot_id、resource_id、content_version_id、source_url、parser/cleaner/chunker 版本、语言、内容状态、适用年份及核验依据、奖项/阶段及核验依据、source_nature=HACKATHON_PROJECT、synthetic=false、projection_revision。

正文按章节装配。每个 evidence_span 保存正文范围与原文范围映射；未知映射不生成精确原文偏移。超过 150000 字符分成多个有界文档，保留 part_index/part_count 和原文绝对范围。chunk.position 的 start/end 目前是分块后文档内偏移，需与该映射合成后才能声称定位原文。

### 同步与失效

主数据事务写 outbox。目标分别为 sql_graph 和 case_rag，Neo4j 只有明确启用才新增。消费者按实体 revision 顺序处理；旧 revision 的延迟重试不得覆盖新版本。

删除、撤回、合并或证据变更后，同一主数据事务先将相关 binding 标 stale，查询应排除 stale 投影；不能等 embedding 成功才停止返回已撤回事实。准备新投影后事务激活新文档并使旧文档 active=false；失败保留重试任务与失败原因。引用历史仍可从旧 snapshot 恢复，但不能作为当前检索事实。

撤销合并时恢复旧身份和参赛/奖项关联，再生成 outbox，旧图边和 RAG 文档同步失效。可从主记录与不可变快照重建投影，核验数量、版本、哈希和引用。

## 5. 拟新增 API

均挂载在现有认证后；POST 需要 Cookie + Origin + CSRF。以下路由当前不存在。

| 方法与路径 | 输入/返回 |
| --- | --- |
| GET /api/crawl/sources | 十站能力状态、核查时间、访问限制与缺口 |
| POST /api/crawl/runs | sources、years、stages、budgets、selection_config；返回 202 run_id 和有效配置 |
| GET /api/crawl/runs/:id | 阶段统计、未完成原因、分页覆盖、预算与同步积压 |
| POST /api/crawl/runs/:id/pause 或 resume | 仅改变可领取状态，返回当前持久状态 |
| POST /api/crawl/runs/:id/cancel | 取消未执行任务并停止后续领取，保留已采证据 |
| POST /api/crawl/tasks/:id/retry | 只允许失败/受阻原因已解决的任务，记录操作者与原因 |
| GET /api/crawl/projects | source/year/event/award/quality/depth、cursor、limit（最大 100）；参数化过滤 |
| GET /api/crawl/projects/:id | 身份、版本、参赛、奖项、字段状态与资源 |
| GET /api/crawl/evidence/:id | 证据片段、来源与快照位置；不任意读取磁盘路径 |
| GET /api/crawl/projects/:id/relations | types、depth≤2、nodes≤100、edges≤200；返回版本和 truncated |
| POST /api/crawl/reviews/:id/resolve | 决定、依据、expected_revision；冲突返回 409，生成审计/outbox |
| POST /api/crawl/exports | filters、format(csv/json/markdown)、run_id；返回 202 导出任务 |
| POST /api/cases/:caseId/crawl-imports | project_version_ids、expected_revisions；返回 202 投影任务 |
| GET /api/crawl/projections | 目标、版本、stale/failed/pending 数与重试原因 |

读取结果分页，错误使用现有 `{error:{code,message}}` 结构。限制单次导入项目数和正文大小，长任务不在请求中同步执行。快照默认下载为附件或转义文本，不以原站 HTML 在本应用域执行。

## 6. 导出

每包 manifest 包含 schema_version、run_id、配置指纹、时间窗口、统计单位、文件数量/哈希、覆盖状态。CSV 分实体/关系表；JSON 是完整合法 JSON，JSONL 可附加。CSV 层对公式前缀作转义，在 JSON 中保留原值。导出前校验所有外键/逻辑引用。

Markdown 每项目包含身份、赛事/奖项证据、问题与功能声明、技术实现依据、资源版本、未知/受阻项、设计缺口的推断标记与来源列表。公开分享时不自动附原始整页或长篇转载。

## 7. 必须通过的接入验证

1. 既有 case/doc/检索在迁移后仍可用；爬虫 CLI 不打开生产 PGlite。
2. 同一 origin 重跑不增文档；同正文的不同项目不串身份；metadata-only 更新能反映在检索过滤中。
3. 同项目附加到两个 case 后互不越权；不产生 MARKET 市场需求证据。
4. 来源更新/撤回/合并/撤销后旧 chunk 与边不能继续作为当前事实；索引失败保留积压并显示 stale。
5. 大正文分部、片段偏移、stable key/UUID 映射与原始快照引用可核对。
6. worker 崩溃恢复、旧 lease 提交拒绝、重复 outbox 消费与乱序 revision 均不会破坏最新状态。
