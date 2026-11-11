# RAG：资料与检索

这里是实际检索实现，不是占位目录。

| 文件 | 职责 |
| --- | --- |
| retrieval.ts | 文档规范化、去重/版本、分块、向量与词法混合检索、案件/资料类型隔离 |
| query-expansion.ts | 经 Claude CLI 扩展中文/英文/马来语查询，按案件缓存，失败保留原查询 |
| rerank.ts | 对已检索的候选 chunk 重排，校验 ID，不改写来源 |
| sources.ts | 公开网页获取、SSRF 防护、来源抓取状态与入库 |
| search.ts | 可选免费搜索接口、额度预留与用量边界 |
| providers/embedding.ts | 本机 Ollama embedding，维度与模型指纹校验 |
| crawl-bridge.ts | 爬虫资料导入 case 的 PROJECT 集合、origin/版本去重、分部、稳定引用映射、outbox 与失效同步 |

本目录为 `C:/maven/business_agent/data/RAG`。依赖相邻 `../database` 的持久化、`../../business/shared` 的配置，以及 `../../business/agents/providers/claude.ts` 的推理接口。由 business 内的 `backend` API 或 `agents` 工作流调用；无需单独启动一个 RAG 服务。

在 `../../business` 运行 `npm.cmd test`。检索质量报告位于 `../../business/test-results`；已有合成小样本测试不等于真实市场、完整专家行为或生产检索质量通过。
