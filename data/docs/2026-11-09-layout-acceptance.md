# 数据分层与分类目录验收

日期：2026-11-09，Asia/Kuala_Lumpur。按用户要求完成实际迁移及细分；无部署、推送或自动同步，正式服务继续暂停。

## 当前职责布局

- `data_preprocessing/RAG`：来源读取、正文处理、分块、检索、查询扩展、重排，providers 仅放 embedding 提供器。
- `data_preprocessing/database`：schema、存储接口、通话存储；migrations 仅放增量 SQL。
- `data_preprocessing/crawl`：采集任务数据、证据、关系、快照保存、投影和导出处理。
- `data_preprocessing/imports`：外部 JSON 解析、去重、审计、正式读回和分类导出。
- `data_preprocessing/cli`：显式执行的导入、备份、分类导出和核验工具。
- `data_storage/database`：唯一正式 PGlite 数据库。
- `data_storage/library`：按主题和状态细分的可阅读数据库快照；每条 record.json 和 README.md 保留 ID、摘要、日期和出处。
- `data_storage/raw_imports/grok/2026-11-07_08`：两份原始 JSON 存档，Downloads 原文件未移动或覆盖。
- `data_storage/crawl`：快照、正文、采集导出等实际文件，保持原有内部对象布局。
- `data_storage/research/exports`：项目 ID → 导出时间/版本 → 研究报告，已有版本不改写。
- `data_storage/backups/database`：两份完整数据库备份及其隔离恢复副本，历史字节不变。
- `data_storage/reports/imports/previews`：导入预览；batches：真实批次/复导；reports/relocations：迁移与核验。
- 历史 server 日志和进程描述从 DB 目录移到 `business/deployment/.runtime/logs/legacy`，不混入业务数据。

## 分类结果

37 个外部作品：19 个 finalist_claimed、8 个 winner_claimed、10 个 participant_claimed。这里只表达上游声称，不是 Lydia 核实结论。

主题：Web3 13、AI 11、硬件/IoT 8、太空 5。按状态 → 主题 → 子主题 → 平台 → 条目保存；例如 Web3 下再分 DeFi、RWA、Solana、wallets、privacy/zk、oracles，AI 下再分 agents、healthcare、finance、devtools 等。原始 tags 与 source status 不改写。

15 条新闻：安全 4、商业融资 3、政策 2、模型 2、产品 2、研究 1、基础设施 1。按主题 → 子主题 → 采集日期 → 条目保存。

67 类标签索引及发布者索引用引用定位到同一份条目，不创建多份可修改的业务记录。SDG 候选索引分 goal_03_health、goal_04_education、goal_13_climate，保留匹配标签和 ORGANIZATION_SUGGESTION_NOT_SOURCE_CLAIM 状态。没有来源依据时不把资料标成正式 SDG 项目。

## 数据完整性

- 移动存储文件 6,763 个，移动后逐文件 SHA-256 一致；处理代码 36 个文件和 4 个维护入口在修正相对引用前逐字节保留。
- 从新正式数据库位置读回 37 个作品、15 条新闻，逐条通过现有知识库搜索实现检出。
- 52 份分类 JSON 与正式数据库完整字段逐一比对一致。251 个分类引用全部解析到有效记录。
- 3 个研究项目、19 份文档、187 个文本块及全部核验范围内的既有业务行指纹不变；9 个迁移的版本和校验和不变。
- 原始导入/备份 JSON 报告没有覆写，里面的旧绝对路径保留为历史值，当前位置通过迁移报告中的 mappings 解析。
- 默认 DB、备份、报告、case exports 和 crawl 路径均指向 data_storage；生产启动会拒绝遗留旧 DB 或指向 business 的旧环境配置，防止创建一份空的新库。

机器可读证据位于 `../data_storage/reports/relocations/`：

- `source-relocation.json`：源码迁移和引用更新。
- `2026-11-09-data-relocation.json`：完整存储文件哈希与读回。
- `2026-11-09-storage-subdivision.json`：报告、备份、研究导出的进一步细分及原始包存档。
- `2026-11-09-cli-relocation.json`：维护入口位置。
- `2026-11-09-catalog-verification.json`：分类数量与引用验证。
- `2026-11-09-final-layout-verification.json`：最终正式库行指纹及完整分类快照比对。

## 检查结果与边界

TypeScript 检查通过；目录、分类及迁移相关 7 项回归通过。调整引用后的全量首次运行 121 项中 120 项通过，唯一失败是旧测试仍断言只有 8 个迁移；已修正为核对实际迁移文件，相关 3 项重新运行通过。并未通过删除测试或修改已应用 SQL 处理。

分类导出和核验使用单一只读 PGlite 连接，不解析密码/会话，不抓取网页、不调用模型、不改变来源核实状态。没有替换 frontend/dist、启动正式服务或创建自动同步任务。
