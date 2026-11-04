# 数据库

`schema.sql` 定义 PostgreSQL/pgvector 表、索引与约束；`store.ts` 提供参数化 SQL、案件、证据、任务、决策与导出的持久化操作。

本目录为 `C:/maven/business_agent/data/database`。使用已安装的 PGlite 嵌入式 PostgreSQL，实际数据库继续位于 `C:/maven/business_agent/business/.runtime/data`。数据库仅由一个服务进程打开；测试使用独立临时数据库，不复制真实资料。此目录存代码与 schema，不存真实数据库文件。

`migrations.ts` 顺序执行 `migrations/` 的增量 SQL，登记 `schema_migrations` 版本与校验和；已应用的迁移不得原地修改。新增 crawl_ 表使用同一 Store 与后端，CLI 不打开数据库。后续迁移增加新文件。
