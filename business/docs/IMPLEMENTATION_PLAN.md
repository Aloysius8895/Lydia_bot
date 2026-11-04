# Business Research RAG Implementation Plan

当前目录已按用户要求拆分，见 [目录整理设计](superpowers/specs/2026-11-03-responsibility-layout-design.md)、[已执行计划](superpowers/plans/2026-11-03-responsibility-layout.md) 和 [验证记录](verification/responsibility-layout.json)。以下早期里程碑记录保留当时情况；当前入口为 business 根目录的 package.json → backend/server.ts，测试报告在根 test-results，实际状态以 IMPLEMENTATION_STATUS.md 为准。

> 执行方式：按用户已批准的主提示词在当前会话逐步实施。无 git 仓库，不提交/推送；不另行派发开发代理。每个里程碑独立验证。

**Goal:** 本人手机/电脑 PWA，受控调用 Claude CLI 订阅，证据可追溯的专家研究。

**Architecture:** TypeScript HTTP 后端共享持久化 worker；PGlite 嵌入式 PostgreSQL + pgvector 保存状态/证据；Ollama 本地 embedding；原生 PWA 前端。缺失技能或认证时应用可用但研究明确暂停，不生成假专家回答。

**Tech Stack:** Node 24、TypeScript、PGlite、pgvector、Zod、Node crypto scrypt、原生 HTTP/TLS、Playwright Core。

## Global Constraints

- LLM_PROVIDER=claude_cli；额外付费预算 USD 0；CLI 并发 1。
- 不读取 OAuth/密钥值、不修改用户 CLI 登录，不使用 bare 或权限绕过。
- 本地技能只读；用户选定具体 Gap 前不得进入 MODELING。
- 不下载大模型、全局安装、启动 Docker 或公开部署。

## Milestone 1 — 存储与检索

- [ ] 创建 app/package.json、tsconfig.json、src/config.ts、schema.sql、store.ts、retrieval.ts、providers/embedding.ts。
- [ ] 测试参数化查询、事务、跨案件隔离、去重、Gap 选择、要求依据和重启恢复。
- [ ] 运行 `npm.cmd run check` 与 `npm.cmd test`，使用实际 PGlite pgvector，不用 mock 代替数据库。

Store 提供 createCase/getCase/listCases/saveDocument/listEvidence/selectGap/enqueueTask/getTask/exportCase；输入在 API 和业务层分别校验，ID 由后端生成。retrieval 返回 chunk/source/case/score/positions，以当前案件或全局方法过滤。

## Milestone 2 — CLI 与专家工作流

- [ ] 创建 providers/claude.ts、skills.ts、research.ts、worker.ts、prompts.ts。
- [ ] 用 `node:test` 注入受控假进程验证 shell=false/stdin、认证拒绝、输出错误、超时、取消及零计费回退。
- [ ] 官方 auth status 只保存脱敏字段；登录与技能实际可用后才能执行已授权的最小真实回答。

Claude provider 接收 prompt/schema/AbortSignal，返回结构化结果及脱敏使用指标；加载器返回精确路径/hash/方法片段。Worker 每步持久化，恢复不重复已完成的专家运行，失败/取消不自动再入队。

## Milestone 3 — 采集与边界

- [ ] 创建 sources.ts、budget.ts、export.ts。仅公开 HTTP(S) 来源、DNS/IP 校验、重定向/大小/时限约束。
- [ ] 免费搜索仅明确配置且额度可信时运行，持久化预留；未知额度默认不调用。
- [ ] 验证失败抓取、同源去重、提示注入数据边界、引用对应原文和要求优先级。

## Milestone 4 — PWA 与个人登录

- [ ] 创建 auth.ts、server.ts、public/index.html、app.js、style.css、manifest.webmanifest、sw.js、icons。
- [ ] 首次仅本机设置账号；密码 scrypt 哈希、安全 cookie、同源/CSRF 防护、登录限流；不在 URL/localStorage 放凭据。
- [ ] API 覆盖案件、文本资料上传、URL 摄取、检索、任务/取消、显式选 Gap 和快照导出；状态可轮询且页面关闭不取消 worker。
- [ ] 本地 Edge/Chrome Playwright 检查登录、手机尺寸、案件、证据、受阻任务、取消、manifest/缓存；用真实浏览器，不声称真手机安装。

## Milestone 5 — 验收和交付

- [ ] 保存 audit.json、test-results、retrieval-evaluation.json、浏览器截图和 README/本地 HTTPS 手机指南。
- [ ] 真 embedding、CLI、专家方法、基线对照分别报告；技能缺失时对照 NOT_RUN，不制造市场结果。
- [ ] 状态写回 IMPLEMENTATION_STATUS.md；交付实际启动地址、命令、限制和用户剩余操作。

所有阶段使用 `npm.cmd run check`、`npm.cmd test`；浏览器验收 `npm.cmd run test:browser`。测试输出必须保留失败历史与最终运行结果。更改只在新 app 与文档范围内进行。

## 执行结果（2026-11-03）

里程碑 1–4 的可执行代码已完成，27 项功能测试、9 项真实浏览器检查和最小真实 Claude CLI 订阅连接通过。里程碑 5 的检索评估已运行但多语言 Recall@3 未达标；真实专家/基线因原有技能缺失阻塞；免费搜索和手机安装未运行。详细状态以 IMPLEMENTATION_STATUS.md 和 app/test-results 为准，以上任务描述不是整体通过声明。

## 继续执行 — 多语言查询扩展

设计沿用主提示词已要求的多语言查询扩展，不下载新模型。使用已授权的 Claude CLI，仅翻译检索查询为 zh/en/ms；原文证据和引用保持不变。扩展按案件与查询 hash 缓存，身份/额度不可用时明确降级。市场检索对原始查询和扩展查询分别做关键词/向量检索，再融合；专家规则仍按角色过滤。

- [x] 创建 src/query-expansion.ts，接口 expandQueries(store,cli,caseId,query,signal) 返回 variants/status，缓存不跨案件。
- [x] retrieval.ts 支持有界 query variants；server.ts 与 research.ts 复用，保留未扩展的检索路径和原始评估。
- [x] 增加扩展缓存、认证失败降级、跨案件与 prompt 注入数据边界测试。
- [x] 固定原六条查询作回归；增加新的合成保留集，报告原始与扩展后指标、CLI 消耗和局限，不覆盖旧失败。

第一次真实扩展测试因 CLI 输出格式降级；修正后在同一 12 文档集上 Recall@3 从约 0.33 提升到 0.61，仍未达标。接入主提示词已允许的可替换重排接口，使用同一受控 CLI 判断相关性，绝不改写原文或计作事实验证。原 held-out 集已用于诊断，后续标为 development；新增预约提醒三语查询作为最终小型 hold-out，冻结后运行。样本量小，不作生产质量保证。

继续执行结果：32项功能测试与9项浏览器检查通过；扩展+重排的15查询评估通过原门槛，最终hold-out仅3条。HTTPS证书/配置已生成，本机显式CA连接、HTTPS登录和Secure cookie通过；手机信任/安装仍未运行。真实专家方法与基线仍因原文件缺失而阻塞。

## 项目根目录修正

用户指定当前根目录为 C:\maven\business_agent\business。已将 app/docs 迁入，3,107 文件迁移前后 hash 一致；原有 skills/expert-team/frontend/RAG 未覆盖。六技能原文件已实际加载，原“缺失”仅是旧路径审计结果，当前阻塞解除。真实五专家行为和基线评估尚需另行运行，不把目录迁移/LOADED 当作通过。
