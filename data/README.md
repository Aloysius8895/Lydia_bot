# 数据处理模块

本目录为 `C:\maven\business_agent\data`，与 `business` 同级，集中管理 Lydia 的资料处理与存储代码。

| 目录/文件 | 职责 |
| --- | --- |
| [RAG](RAG/README.md) | 网页采集、规范化/去重、文本分块、embedding、混合检索、查询扩展、重排与可选搜索 |
| [database](database/README.md) | PGlite + pgvector schema、参数化 SQL、案件/证据/任务/决策持久化 |
| [crawl](crawl/README.md) | Hackathon 爬虫的持久任务、快照、证据、导出和 case RAG 接入（两站小样本已验证，完整覆盖仍待实现） |
| [DATA_AUDIT_AND_SOLUTIONS.md](DATA_AUDIT_AND_SOLUTIONS.md) | 现有数据问题、sample/population 边界、解决方案与验收条件 |

实际运行数据库继续位于 `../business/.runtime/data/`（可由环境配置覆盖）；研究导出在 `../business/cases/`。两者不因源码迁移而改变。权威技能在 `../business/skills/`，制作与来源记录在 `../business/expert-team/`。

HTTP API 和导出入口由 `../business/backend/` 提供；角色调度与引用复核由 `../business/agents/` 负责。在 business 根运行 `npm.cmd run check`、`npm.cmd test`、`npm.cmd run test:browser`。

本目录是独立的私有 ESM 包，`package.json` 与 `package-lock.json` 锁定 PGlite 和 Zod 版本。首次安装或迁移到新电脑时，在本目录运行 `npm.cmd ci`（已有完整 npm 缓存时可加 `--offline`）。Node.js 从本目录自己的 `node_modules` 解析依赖，不依赖跨目录链接。

目录已整理不代表统计代表性、真实市场结论或真实五专家流程已验收。详见数据审计和 `../business/docs/IMPLEMENTATION_STATUS.md`。
