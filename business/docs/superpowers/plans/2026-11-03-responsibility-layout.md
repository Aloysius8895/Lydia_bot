# Responsibility Layout Implementation Plan

> 执行方式：按用户已明确授权的目录整理要求在当前会话逐项执行，不委派子代理。

**Goal:** 将现有 app 中的完整实现分配到 business 根下对应职责目录，保持既有行为及数据。

**Architecture:** 一个根 Node 包；RAG、agents、backend、database、shared 分目录，前端静态资源独立存放。各模块通过显式相对 TypeScript import 通信，保留单一后端运行进程。

**Tech Stack:** Node >=24、TypeScript、PGlite/pgvector、Ollama、Claude Code CLI、Playwright。

## Global Constraints

- 项目根 `C:\maven\business_agent\business`；禁止回写旧 Hackathon_map 项目。
- 保留原有 skills、expert-team 和 frontend 项目原文件；拒绝覆盖目标文件。
- 数据库/证书只迁移，不重建，不修改全局证书信任、网络或账号设置。
- 不调用真实推理；既有真实调用报告保持原日期与实际状态。

### Task 1: 按职责移动现有文件

- [x] 保存旧 src 到新目录映射、迁移前 SHA-256；确认现有服务进程身份后停止。
- [x] 使用原生 PowerShell Move-Item 移动：检索/来源/query/rerank/search/embedding → RAG；worker/research/prompts/skills/citations/claude → agents；server/auth/export → backend；store/schema → database；config → shared。
- [x] public → frontend/research-pwa；scripts/tests/test-results → 根目录同名文件夹；node_modules/package/lock/tsconfig/launcher/gitignore → 根目录；.data/.cli-workspace → .runtime/data 与 .runtime/claude；certs/环境示例 → deployment；README → docs/RUNNING.md。
- [x] 按映射比对所有移动文件哈希，若不一致停止并记录；仅移除已空旧目录。

### Task 2: 修正可执行路径及文档

- [x] 根据模块的旧位置解析全部相对 import，再根据新位置重写，避免简单字符串替换造成跨模块引用错误。
- [x] shared/config.ts 导出 businessRoot、frontendRoot、certsRoot；数据库与 CLI 工作目录从 .runtime 解析；TLS 相对路径以 businessRoot 为基准。
- [x] server 静态资源使用 frontendRoot；HTTPS/icon 脚本使用独立资源路径；根 package 启动 backend/server.ts，tsconfig 仅包含当前项目 TS 目录。
- [x] 更新根 Start-Crew.cmd、环境示例、根 README、各职责目录 README、主控 prompt、运行指南、当前进度与 FINAL_REPORT 路径。历史测试报告不篡改旧路径。

### Task 3: 在整理后验证

- [x] `npm.cmd run check`，预期无类型错误。
- [x] `npm.cmd test`，预期 32 tests、0 fail；保存独立当前报告。
- [x] `npm.cmd run test:browser`，预期 9 checks、0 page errors。
- [x] `node --experimental-strip-types scripts/https-test.ts`，预期隔离数据库 HTTPS/登录/Secure cookie 通过。
- [x] 读取 Skills.status，预期六个权威技能 LOADED；此项不计作专家行为测试。
- [x] 从根目录启动服务并记录 PID、新路径；GET 首页与 /api/auth/status 成功。
- [x] 更新目录整理验证 JSON 和实施状态；记录未运行的真实专家、手机安装与市场测试。

自查：每项均对应设计约束；不引入服务或依赖；使用现有功能/浏览器测试覆盖路径变动，不新增镜像实现的测试。当前非 Git 仓库，不执行提交。

Execution note: all checks passed; an existing backend/server.ts process was retained after EADDRINUSE, and its HTTP assets were hash-verified. No second database owner was started. See ../../verification/responsibility-layout.json.
