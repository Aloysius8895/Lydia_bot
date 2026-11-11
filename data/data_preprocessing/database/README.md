# 数据库

迁移 `009-file-imports.sql`（2026-11-09）经用户批准新增 3 张文件导入批次、逐条审计和身份映射表，不改变现有业务表。导入入口 `data/data_preprocessing/cli/import-files.ts` 仅用于已停写、已完整备份且恢复验证的离线维护，独占同一正式 Store；平时外部进程仍使用服务 API。使用说明见 `business/docs/FILE_IMPORT.md`。

`schema.sql` 定义 PostgreSQL/pgvector 表、索引与约束；`store.ts` 提供参数化 SQL、案件、证据、任务、决策与导出的持久化操作。

本目录为 `C:/maven/business_agent/data/data_preprocessing/database`，仅放 schema 与存储代码。唯一正式数据库位于 `C:/maven/business_agent/data/data_storage/database`。数据库仅由一个进程打开；测试使用独立临时数据库。

## 资料保存期限（`retention.ts`，2026-11-11 用户决定）

外部收集的资料在资料库里只保留 365 天，从进库那天算；重新爬取或收到更新版时，从更新那天重新算。服务启动 10 分钟后清理一次，之后每天一次，全部在一个事务里完成，出错就整体回滚。

- 会删：爬虫和 Grok 收集的作品集项目（连同项目简介、深入解读和爬虫记录）、Grok 导入的新闻、Grok 的黑客松活动、它们的导入记录，以及已经没有任何资料引用的爬虫历史（旧网页快照及其文件、已结束的爬取任务、操作记录、未匹配的获奖候选、爬虫活动）。
- 不删：研究项目、上传资料、研究成果、对话、通话、收藏的 idea、Idea 实验台记录，以及用户手动添加的新闻。
- 还在用就保留：被研究项目引用的项目；收藏的 idea、当前 Idea 草稿或正在运行的 Idea 分析用到的项目和新闻；正在生成简介或深入解读的项目；截止日期还没到的活动。
- 直接删除，不留存档（用户选择）。每日自动备份里最多还会保留 30 天。
- 报告：`data_storage/reports/retention/latest.json`（最近一次，含删除的标题，以及最近 30 次摘要）。有删除时，`runs/` 里另存一份明细，只保留最近 24 份。
- 新迁移若增加指向这些表的外键，必须在 `FK_POLICY` 里写明处理方式，否则 `tests/retention.test.ts` 不通过。

`migrations.ts` 顺序执行 `migrations/` 的增量 SQL，登记版本与校验和，已应用迁移不得原地修改。平时由后端持有唯一 Store；只有停写、已备份的显式维护命令可独占数据库，不能与服务并行。
