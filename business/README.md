# Lydia 商业研究助手

Hackathon 爬虫管理入口为 `/crawl/`，与本应用共用账号、后端和数据层。安装/CLI 与当前来源支持见 [爬虫 README](../crawl/README.md)。

项目已从 Crew 更名为 Lydia。推荐双击 `Start-Lydia.cmd`；旧 `Start-Crew.cmd` 保留为兼容入口。现有案件、登录数据和主题偏好继续使用。

项目根：`C:\maven\business_agent\business`。代码按职责分目录，原 `app` 已拆分迁出。

| 目录 | 内容与入口 |
| --- | --- |
| [../data](../data/README.md) | 与 business 同级的数据处理模块与[数据问题/解决方案](../data/DATA_AUDIT_AND_SOLUTIONS.md) |
| [../data/RAG](../data/RAG/README.md) | 资料抓取、分块入库、混合检索、多语查询扩展、重排、搜索与本地 embedding |
| [agents](agents/README.md) | 专家任务编排、Claude CLI、方法加载和引用复核 |
| [backend](backend/README.md) | HTTP API、登录会话和导出；入口 backend/server.ts |
| [../data/database](../data/database/README.md) | PGlite PostgreSQL/pgvector schema 与存储接口 |
| [shared](shared/README.md) | 公用路径、配置与错误类型 |
| [frontend](frontend/README.md) | 用户原有 Crew React 设计；src 为源码，public 为 PWA/字体资源，dist 为实际服务的构建结果 |
| skills | 六份权威专家/主控技能，供 agents 加载 |
| expert-team | 原有蒸馏、来源与验证材料 |
| [scripts](scripts/README.md)、[tests](tests/README.md)、test-results | 运行工具、自动化测试及实际报告 |
| [deployment](deployment/README.md) | 环境配置示例、本机 HTTPS 证书 |
| .runtime | 本机数据库/日志和 Claude 工作目录；不提交、不分享 |
| docs、cases | 设计/进度/运行说明；研究导出在首次导出时创建 cases |

在本目录运行：

数据模块位于 `C:\maven\business_agent\data`。首次在新环境安装时，先在该目录运行 `npm.cmd ci`，再安装 business 与 frontend 的依赖；现有环境已从本机 npm 缓存安装数据模块依赖。

```powershell
npm.cmd start
```

也可双击根目录 `Start-Lydia.cmd`。启动会先构建原前端，再启动统一 RAG 后端。电脑访问 <http://127.0.0.1:4318>，首次设置个人密码。Settings → 设置 → 外观可切换白天/黑夜：太阳代表白天，月亮代表黑夜，选择会记住。完整操作与手机 HTTPS 步骤见 [运行指南](docs/RUNNING.md)，实际完成情况见 [实施进度](docs/IMPLEMENTATION_STATUS.md)。

Claude 推理使用本人已登录的 CLI；本机 Ollama 提供 embedding。当前真实五专家联调、实际市场验证和手机安装尚未验收，已生成的代码与技能读取不代表这些项目已通过。
