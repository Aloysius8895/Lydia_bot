# Lydia 项目图集

生成日期：2026-11-04（Asia/Kuala_Lumpur）。依据 `../business` 当前代码与实施记录整理。

当前工作区为 `C:/maven/business_agent`。数据模块位于工作区根的 `data/`，与 `business/` 同级；下表代码路径相对于工作区根。实际数据库仍在 `business/.runtime/data`。

双击 **index.html** 可离线浏览全部图。默认中英双语，SVG 支持放大，PNG 可插入报告，PDF 可打印，DOT 可继续编辑。

| 文件前缀 | 内容 | 主要代码依据 |
| --- | --- | --- |
| 01-use-case | UML 用例图：个人用户、系统边界、外部服务及使用场景 | business/backend/server.ts、business/frontend/src/components、business/agents/research.ts |
| 02-technical-stack | 技术栈分层及依赖 | business/package.json、data/package.json、business/frontend/package.json、business/shared/config.ts、business/backend/auth.ts |
| 03-system-architecture | 浏览器、本地应用、存储、AI 与外部服务的组件关系 | business/backend/server.ts、business/agents/*、data/RAG/*、data/database/* |
| 04-research-workflow | 研究、机会选择、商业模式、暂停恢复及导出流程 | business/agents/worker.ts、business/agents/research.ts、data/database/store.ts、business/backend/export.ts |
| 05-database-erd | 全部 16 张表与外键，核心字段摘要 | data/database/schema.sql |

## 阅读说明

- 专家角色运行在系统内部，通过同一 Claude CLI 适配器调用云端推理，不是五个独立部署的服务，也不是外部用户。
- 完整 research 链为 Steve → Teresa → April → Bob → Steve review；Ash 在 model 链参与，不能把研究任务画成五位专家同时执行。
- 使用本地 PGlite（嵌入式 PostgreSQL WASM）与 pgvector，没有独立 PostgreSQL 服务器或 Docker 依赖。
- Claude 推理在云端；Ollama embedding 在本机。应用不是完全离线的 AI 系统。
- Tavily 为可选接入，需配置并确认免费额度；真实搜索待验收。网页正文采集与搜索发现分开处理。
- 手机布局与 PWA 代码已实现，真手机访问、证书信任和安装待验收。默认仅绑定本机地址。
- 工作流图描述代码能力；自动化测试包含模拟模型，不能视作真实五专家端到端质量验证。
- 用例图采用 UML 的 `«actor»` 矩形演员表示法。约束写入注释，不用功能调用箭头代替用户关联。
- ERD 实线为真实 FK，虚线为逻辑关联。`cases.selected_gap_id` 无 SQL FK；`search_requests` 与 `search_budgets` 的账号/月份关联也无 SQL FK。可空 FK 的子记录可以不关联父记录。
- 技术栈图采用包声明中的主要版本；Vite 锁定安装版本可与 package.json 的最低范围不同。

## 重新生成

需要 Python 3 与 Graphviz（`dot` 在 PATH 中）：

```powershell
python C:\maven\business_agent\diagram\generate_diagrams.py
```

生成器只更新本目录中同名前缀的图与索引，不调用模型、联网搜索或修改应用代码。
