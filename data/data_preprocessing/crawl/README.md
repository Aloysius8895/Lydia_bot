# 爬虫数据处理

已实现的爬虫数据模块，与 [crawl 执行层](../../../crawl/README.md) 相连。

| 文件 | 职责 |
| --- | --- |
| store.ts | 共用 Store 注入，run/task/lease、版本、证据、资源、关系、outbox 与查询 |
| discovery.ts | 独立赛事、官方结果候选、精确身份关联、分页证据与旧投影失效 |
| html.ts / graphql.ts | 公共 HTML 结构提取与浏览器只读 GraphQL 校验 |
| snapshots.ts | 内容寻址、原子文件落盘、存储边界与读取 |
| operations.ts | 持久导出/导入/选择/资源升级任务、恢复与结果 |
| export.ts | 一致性读取、JSON、分表 CSV、Markdown、manifest 和哈希 |
| relations.ts | 一至两跳证据关系查询、上限与截断 |
| validation.ts | 从 data 包解析锁定的 Zod |
| DATA_CONTRACT.md | 完整目标契约；实际覆盖差异见实施状态 |

迁移在 `../database/migrations/`，由 `../database/migrations.ts` 记录版本与校验和。RAG 桥接在 `../RAG/crawl-bridge.ts`，通过 origin、版本、分部与映射接入 PROJECT。

后端仍是唯一数据库所有者；CLI 和外部进程不得再打开同一 PGlite 目录。当前数据库位于 `../../data_storage/database`，已完成迁移。

新文件默认在 `../../data_storage/crawl/`，可用 `LYDIA_CRAWL_STORAGE_DIR` 指定绝对路径。该目录已加入 data/.gitignore，不随源码分享。

真实 pilot 使用临时数据库，报告及导出入口见 [LATEST_LIVE_REPORT.md](../../../crawl/reports/LATEST_LIVE_REPORT.md)。来源覆盖、身份合并/撤销和字段状态模型仍有限，详见 [实施状态](../../../crawl/docs/IMPLEMENTATION_STATUS.md)。

第 005 号迁移扩展赛事观察、别名、结果候选/观察和分页覆盖。导出保留上述表。最新验证见 [扩展记录](../../../crawl/reports/EXPANSION_REPORT.md)。
