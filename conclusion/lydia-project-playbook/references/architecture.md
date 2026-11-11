# 项目架构与责任边界

## 目录地图

所有下列路径相对工作区根 `C:/maven/business_agent`。

| 目录 | 职责与关键入口 |
| --- | --- |
| `business/agents` | worker、research、dialogue、idea-lab、skills、citations、providers/claude |
| `business/backend` | 唯一 HTTP 服务 `server.ts`，auth、knowledge、crawl、calls、phone、export、obsidian、project-brief、project-deep-dive、library-search |
| `business/frontend/src` | React 正式界面；App、components、主题与知识库样式 |
| `business/frontend/public` / `dist` | PWA／字体源资源 / Vite 实际服务产物 |
| `business/frontend/research-pwa` | 历史前端，不是当前默认入口 |
| `business/shared` | `config.ts` 和 `data-paths.ts`，按模块位置解析路径 |
| `business/skills` | 五位专家方法 + hackathon-gap-research 主控，应用显式读取 |
| `business/expert-team` | 蒸馏来源、案件模板、原始构建脚本、行为评估与基线 |
| `business/deployment` | 环境示例、私有本机配置和证书；私钥不分发 |
| `business/.runtime` | 日志、CLI 工作区、验证临时产物，不是正式库 |
| `data/data_preprocessing/{RAG,database,crawl,imports,sync,cli}` | 所有数据处理代码，依赖由 `data/package.json` 管理 |
| `data/data_storage` | 唯一正式资料根，见下表 |
| `crawl` | 采集 adapter、调度、CLI、配置、报告；Settings → Crawl 使用同一后端 |
| `audio` / `audio_rea` | 语音设计、验收、ElevenLabs 调查；运行代码仍在 business/data |
| `bot_rea` | 本机 Grok Bot 只读分析、token、引用资源和移植证据 |
| `pic` | 日期化设计方向、proposed 补丁、截图、视频、实际实现证据 |
| `diagram` | 架构／用例等项目图示 |
| `conclusion/lydia-project-playbook` | 本 skill，不替代应用专家 skills |

## 数据位置

`business/shared/data-paths.ts` 是路径真值。默认数据库为 `data/data_storage/database`；配置允许覆盖时必须查当前启动环境并满足路径断言。`assertNoLegacyDatabase` 会拒绝仍存在的 `business/.runtime/data`，防止悄悄创建两份库。

| 子目录（相对 data/data_storage） | 内容 |
| --- | --- |
| `database` | PGlite 持久库 |
| `raw_imports` | Grok 等原始交付 |
| `library` | 分类只读导出，按状态声称、主题、平台等组织 |
| `crawl` | 原始快照、正文、导出、私有采集状态 |
| `research/exports` | 按项目与时间／版本保存研究成果 |
| `backups/database` | 完整备份、恢复检查；daily 为自动备份 |
| `reports` | imports、relocations、retention 等审计报告 |

分类目录不是另一份权威库，修改 Markdown 不反写数据库。SDG 目录依据标签生成候选索引，不生成正式认证。旧 README 中的 `data/RAG`、`data/.runtime/crawl`、根 `cases` 等路径存在历史残留；执行前核对代码。

## 技术与调用链

当前 package 声明 Node >=24，TypeScript 通过 `--experimental-strip-types` 运行；React 18 + Vite 5，嵌入式 PGlite PostgreSQL + pgvector，Zod schema，Playwright 验证。锁定版本见各 package-lock，不依据本手册升级。

浏览器 → 同源 API → 唯一 Store／worker → RAG／采集／订阅 CLI；持久化由应用负责，模型不能自由操作 shell、文件或网络。Ollama 提供本地 embedding。无需单独启动 RAG、PostgreSQL 或 Docker。

后端按 Vite manifest 服务 dist 白名单；不能把源码、环境、manifest 私有内容或整个工作区暴露为静态目录。新增迁移检查现有最大序号与校验和，不重写已应用 SQL。外键影响到过期资料时同步更新 retention 的 FK_POLICY。

新机器依次在 data、business、business/frontend 执行 `npm.cmd ci`。日常启动从 business 运行 `npm.cmd start`，prestart 会构建正式前端。前端单独 dev 不能代表应用 API 已启动。

## 历史迁移的复用方法

项目从 Hackathon_map 迁至 business_agent，再按职责拆分，最终数据代码与资料分离。迁移方法：先列文件映射与哈希，停写备份，移动，再修 import／依赖解析／tsconfig 与启动脚本，核对记录与业务行指纹，最后构建和必要浏览器回归。保留旧报告原路径；不要为了使历史看起来一致而改写证据。历史 relocate/build 脚本不能当日常启动器重跑。

原始依据：`business/README.md`、`business/shared/{config,data-paths}.ts`、`data/README.md`、`business/docs/verification`、`data/docs/2026-11-09-layout-acceptance.md`。
