# 爬虫实施状态

更新日期：2026-11-04，Asia/Kuala_Lumpur。用户已确认架构并授权实施。当前为可运行核心版本，**不是原 prompt 的全部终态验收完成**。

本轮更新详见 [扩展交付记录](../reports/EXPANSION_REPORT.md)，其中逐站矩阵和验证结果为最新状态。

## 已实现并验证

- 共用后端、PGlite 单一所有者、五份校验和迁移；未写生产案件库。
- crawl_ 持久表、幂等 run/task、token fencing、过期恢复/续租、暂停/取消/有限重试、预算暂停和显式扩展。
- DNS/IP/每跳重定向校验、请求大小/超时上限、分类、快照、robots 产品 token 与路径规则。robots 405/403、TLS 错误采用保守停止。
- ETHGlobal HTML 和 HackQuest 公开 Flight JSON 列表/详情；L1 先存、详情升级保持身份、列表不覆盖全文。
- 项目/版本/赛事/参赛/奖项/证据/资源；未知年份/奖项保留未知；项目创建日期不冒充赛事年份。
- Winner 优先与受限 finalist-only 确定性选择、种子/原因/历史版本，已选公开资源排队。
- 有界 README/资源检查，保存 GitHub blob SHA，不执行代码；无字幕、受阻、不支持与预算延后分开。
- PROJECT case 导入、origin/metadata 去重、分部、外部 key/UUID 和历史 chunk 映射；多部分准备后整体激活，源更新立即使旧投影失效。
- outbox 重试与间隔、case 隔离；无 Ollama 时关键词回退。
- 认证 API、网页、CLI、有限 SVG/SQL 证据关系、三种导出和 manifest。
- Windows 临时库离线测试、真实两站详情、真实 GitHub README 与关键词检索；桌面/390px 交互验证。

测试结果见 [验证记录](../reports/VALIDATION.md)，联网样本见 [真实报告](../reports/LATEST_LIVE_REPORT.md)。截图为 TEST_ONLY 合成样本。

## 尚未完成的终态要求

| 原设计部分 | 当前缺口 |
| --- | --- |
| 十站适配 | 八站已接入公共结构/文章解析；完整动态流程未全量验证。DoraHacks robots 405、Imagine Cup robots 403、NASA 证书链错误有实测记录 |
| 全年/全站 L1 | 未验证历史入口和动态分页结束信号，无官方全量分母 |
| 获奖全量 | 已验证 NASA 10 项官方奖项及 Imagine Cup 3 个全球 finalist；其他站结果发现与逐站口径仍需验证 |
| 字段契约 | evidence 有状态，unknown 有依据；未对每字段完整实现八种缺失原因 |
| 跨站身份 | 同站 ID/精确 URL 升级已实现；跨站合并、人工决定和撤销尚无流程 |
| L3 | 有界 README 与访问检查；无完整代码/依赖/架构审计、PDF 文本或字幕提取 |
| 浏览器获取 | 受限 HTTP 回放已启用并通过隔离检查；复杂站点依赖/超时仍导致 partial |
| 质量监控 | 有未知模板隔离、年份复核；基线、改版阈值、完整统计未校准 |
| 增量 | 可重扫版本化与恢复；无长期周期调度/条件请求完整流程 |
| 图与检索 | SQL 图与 case RAG 已接入；无 Neo4j、全局向量搜索、图增强回答或人工答案效果对照 |
| 云端 | Dockerfile/迁移说明已给；Docker Engine 未运行，未构建验证，无云 provider/资源/部署 |
| 大规模 | 单 worker；未验收多进程、全局磁盘配额、文件回收或大体量流式导出 |

`full.json` 是目标配置，不代表全量覆盖。本轮交付不将上述缺口包装为已支持。

## 技能与候选工具

brainstorming 用于设计，用户已确认；writing-plans 用于任务计划。executing-plans 未安装，按检查点在当前会话执行，未调用子代理。

Agent-Reach、browser-use、Crawl4AI、REA 只检查本地文档/包声明，未安装启动。当前使用 Node/HTTP、PGlite 和既有 Playwright 测试工具。详见 [能力评估](CAPABILITY_ASSESSMENT.md)。
