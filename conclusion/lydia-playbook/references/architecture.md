# 项目地图

写于 2026-11-11。改代码前用 `ls`/`grep` 核对一下，文件可能已经变了。

## 目录

1. 产品是什么
2. 目录结构
3. 技术栈
4. 后端模块
5. 前端模块
6. 数据层
7. 端口、进程和运行目录
8. 权威文档

## 1. 产品是什么

- **Lydia**（原名 Crew，2026-11-03 改名）：面向 Hackathon idea 和早期商业研究的个人 PWA。
- 用户只和一位固定顾问聊：**Steve Blank 方法顾问**。需要时调动四位专家：Teresa Torres（机会/需求）、April Dunford（替代方案与定位）、Bob Moesta（购买触发与角色）、Ash Maurya（一页商业模式，选定 Gap 后才出场）。另有流程主控 `hackathon-gap-research`。他们都是"基于公开方法的 AI"，不是本人，回答里要保留这个声明。
- 主研究状态：SCOPED → RESEARCHING → AWAITING_SELECTION → MODELING。任务状态另算：QUEUED/RUNNING/PAUSED/FAILED/COMPLETED/CANCELLED。
- **知识库（项目库）**：用户点"项目库"进入的工作区。中间是一个等距仓库，把 Grok 采集的 Hackathon 作品、新闻和赛事画成书。功能有：项目简介、"深入了解"、关键字搜索（书飞进搜索区）、追踪 Hackathon（黄卡 = 追踪中，绿卡 = 已有 finalist/获奖）、分析托盘，以及工作台（Idea 实验台 / 我的 Idea / Lydia 研究）。顶栏"商业逻辑"回到 Steve 聊天页。
- **语音通话**：按轮对话，浏览器自带的语音识别加朗读；ElevenLabs 朗读可选。

## 2. 目录结构

```text
C:\maven\business_agent\
├─ business\                 应用本体（npm 根，从这里启动）
│  ├─ agents\                专家编排：worker、research、converse、small-talk、dialogue、idea-lab、citations、skills、prompts
│  │  └─ providers\claude.ts Claude CLI 适配器（参数、模型分档、串行队列、超时）
│  ├─ backend\               HTTP API：server.ts 入口，auth、phone、knowledge、calls、crawl、export、obsidian……
│  ├─ frontend\              React 18 + Vite 5（JSX，原生 CSS 变量）；src 是源码，dist 是线上实际服务的构建结果
│  ├─ shared\                config.ts、data-paths.ts（所有数据路径都从这里解析）
│  ├─ skills\                六份权威专家/主控技能（只读加载，不修改）
│  ├─ expert-team\           蒸馏过程、来源和测试记录（TEAM_GUIDE.md）
│  ├─ scripts\               浏览器测试、设计渲染、启动器（start-remote.ts、start-phone.ts）、setup-remote.ps1
│  ├─ tests\                 node:test 单元/API 测试
│  ├─ deployment\            .env（被忽略，存在）、.env.example、certs\
│  ├─ docs\                  RUNNING、REMOTE_ACCESS、IMPLEMENTATION_STATUS、FILE_IMPORT、主提示词、superpowers 规格和计划
│  └─ .runtime\              日志、Claude 工作目录、remote\address.txt（被忽略）
├─ data\                     数据模块（单独的 npm 根）
│  ├─ data_preprocessing\    RAG、database（schema、migrations、store、retention）、crawl、imports、sync（Drive）、cli
│  └─ data_storage\          唯一正式库和全部资料（被忽略）：database、backups、raw_imports、reports、library、design-copies
├─ pic\                      设计稿（每个主题一个文件夹，README.md 是总索引）
├─ audio\                    语音通话设计、验收报告、lydia-voice-validation 开发 skill
├─ crawl\                    Hackathon 爬虫（Settings → Crawl）
├─ bot_rea\                  对 Grok Bot 应用的研究（部分第三方内容不进 git）
├─ diagram\                  架构图
└─ conclusion\               本 skill
```

## 3. 技术栈

| 部分 | 用什么 | 备注 |
| --- | --- | --- |
| 运行时 | Node 24+，`node --experimental-strip-types` 直接跑 TS | 后端不编译；`npm.cmd run check` 是 `tsc --noEmit` |
| 后端 | 原生 `http` 加自写路由；Zod 4 校验 | 参数化 SQL，`AppError` 带错误码 |
| 前端 | React 18、Vite 5、原生 CSS | 设计变量写在 `:root` 和 `:root[data-theme=dark]` 上；手机断点 ≤760px |
| 数据库 | PGlite 0.3.16（嵌入式 PostgreSQL WASM）+ pgvector | **单进程**。启动时自动跑迁移 |
| 推理 | 用户已登录的 Claude Code CLI（`claude -p`） | 订阅额度；详见 ai-evidence.md |
| embedding | Ollama `nomic-embed-text:latest` | 只做 embedding，不做聊天 |
| 搜索 | Tavily 免费额度（有门槛） | 没配置或余额不明时不搜，不收费回退 |
| 浏览器测试 | playwright-core + 本机 Chrome | `C:/Program Files/Google/Chrome/Application/chrome.exe` |
| 远程访问 | Tailscale MagicDNS + HTTPS 证书 | 计划任务 `Lydia Remote` |

## 4. 后端模块（business/）

| 文件 | 负责 |
| --- | --- |
| `backend/server.ts` | `createApp(options)` 组装全部 worker 和 API；`options.startWorker:false`、`localAutoLogin:true`、`dataDir` 供测试和设计渲染用 |
| `backend/auth.ts`、`backend/phone.ts` | 单用户密码会话、CSRF/Origin/Host 检查；本机和 Tailscale 免密码（`LYDIA_TAILNET_AUTO_LOGIN`） |
| `backend/knowledge.ts` | 知识库 API：项目、新闻、追踪赛事、简介、深入解读、搜索 |
| `backend/project-brief.ts` | 项目简介（format 2：每段附原文并核对）；新项目没生成完简介不显示（最多等 24 小时） |
| `backend/project-deep-dive.ts`、`project-sources.ts` | "深入了解"：读项目页、GitHub README/目录/配置文件；附原文核对；Haiku 复核支持度 |
| `backend/project-match.ts` | 「相似与搭档」（2026-11-11）：一次 Sonnet 调用比完全库；新闻先读原文（`news_sources`）；程序核对引用、算分区；`MatchWorker` 串行执行，只有 POST 才调用 |
| `backend/library-search.ts` | 按 Enter 的关键字搜索（Haiku 挑相关作品，失败退回关键词） |
| `backend/hackathon-tracker.ts`、`drive-sync-status.ts` | 追踪 Hackathon 卡片；每日导入状态 |
| `backend/calls.ts`、`voice-tts.ts` | 语音通话、ElevenLabs |
| `backend/obsidian.ts`、`export.ts` | 导出到 Obsidian 和报告；不会删除 vault 里旧的笔记 |
| `agents/worker.ts` | 任务队列、checkpoint、暂停/取消/恢复；`TASK_LIMIT_MS` = 30 分钟 |
| `agents/research.ts` | `plan()` 决定专家顺序；`runStep()` 每步做扩展查询、检索、重排、专家输出、引用复核 |
| `agents/converse.ts` | 聊天框默认的直接回答（带项目背景和最近 6 轮对话） |
| `agents/providers/claude.ts` | CLI 参数、`CLI_TIERS`、`USER_MODELS`、串行槽位、超时 |
| `shared/config.ts` | `cliTimeout` 最大 300000 ms 等配置 |

## 5. 前端模块（business/frontend/src）

- `App.jsx`：hash 路由（`#/bot/steve?case=…`、`#/knowledge`、`#/projects`、`#/new`）。`returnFromKnowledge()` 固定回到 Steve 聊天页。
- `components/GrokComposer.jsx`：输入框，带"完整研究"开关（发送后保持开着，刷新也不变）和模型菜单（Opus/Sonnet/Haiku × 低/中/高，存在浏览器里）。
- `components/KnowledgeWorkspace.jsx`、`KnowledgeScene.jsx`、`knowledge-warehouse.js`：知识库和等距仓库引擎。全部画在同一个 SVG 里，从后往前绘制；相机只做 CSS transform，平移缩放时不重新渲染。
- `material-drag.js`：长按 320 ms 拖动（触屏不用浏览器原生拖拽）。
- `panel-resize.jsx`：左右侧栏拖动调宽，宽度存在 localStorage。
- `components/WorkbenchModal.jsx`、`HackathonTracker.jsx`、`ProjectDeepDive.jsx`、`SettingsModal.jsx`、`AvatarStudio.jsx`、`CallCard.jsx`。
- **CSS 加载顺序**（`main.jsx`，后加载的覆盖前面的）：styles → research → settings → grok-design → grok-pages → sidebar-reference → projects → call → soft-workspace → mobile-workspace → chat-text → warm-theme → composer-mode → knowledge → deep-dive → panel-resize。改样式没生效时，先查有没有更早或更具体的规则压着。踩过的例子：`.composer{height:60px}` 写死了高度；`.knowledge-workspace button` 选择器优先级太高；手机端按钮有 44px 最小宽度。
- 字体：Grok 字体在 `src/assets/grok/`，不进 git，缺失时退回系统字体。

## 6. 数据层（data/）

- 唯一正式库：`data/data_storage/database`。只能一个进程打开。不要手工改文件。
- 迁移：`data/data_preprocessing/database/migrations/NNN-*.sql`，目前到 013。**已应用的迁移不能改**（有校验值），改结构就加新编号的文件。启动时自动执行。有一条测试写死了迁移数量，加迁移时一起改。
- 主要表：
  - 研究：cases、documents、chunks、evidence、claims、gaps、requirements、expert_runs、tasks、artifacts
  - 知识库：crawl_projects（作品）、knowledge_news、hackathon_events、knowledge_ideas（收藏的 idea）、project_briefs、project_deep_dives、project_matches（相似与搭档的结果）、news_sources（新闻原文）。新表只要外键指向会被清理的表，就要在 `retention.ts` 的 `FK_POLICY` 里登记，否则 retention 测试会失败
  - 导入审计：file_import_batches/items/identities
- 编号：方法用 S-*，市场证据用 E***，另有 claim C###、requirement R###、gap G###。
- 路径都从 `business/shared/data-paths.ts` 取，不要写死。
- 365 天清理：`data/data_preprocessing/database/retention.ts`，见 data-pipeline.md。

## 7. 端口、进程和运行目录

| 端口/名字 | 是什么 |
| --- | --- |
| 4318 | Lydia 应用。远程模式只绑定在 Tailscale IP 上，所以 `127.0.0.1:4318` 打不开 |
| 4317 | 只在 loopback 上的保护端口，启动器和维护工具用它互斥 |
| 4319 | 局域网手机模式的 iPhone 证书安装引导页 |
| 5173 | `npm run dev` 的 Vite 开发服务器（frontend 目录） |
| 5309-5312 | 设计稿渲染脚本用过的端口（`--serve` 模式） |
| 计划任务 `Lydia Remote` | Windows 登录时启动 `scripts/start-remote.ts`；启动器每 30 秒重试，后端崩溃会自动拉起 |
| 计划任务 `Lydia Drive Daily` | 每天 10:00 导入 Drive 新批次；电脑没开就开机后补跑 |
| `business/.runtime/remote/` | `address.txt`（线上地址）、`supervisor.log`、`server.log`、证书 |

## 8. 权威文档

| 文档 | 内容 |
| --- | --- |
| `business/docs/Business_Research_RAG_Master_Prompt.md` | 最初的完整需求（CLI 接入契约、证据分类、验收清单）。很多规矩出自这里 |
| `business/docs/IMPLEMENTATION_STATUS.md` | 每轮实际完成、验证和没验证的内容 |
| `business/docs/RUNNING.md`、`REMOTE_ACCESS.md`、`IPHONE_INSTALL.md` | 启动、远程访问和手机安装 |
| `business/docs/FILE_IMPORT.md`、`data/docs/DRIVE_MANUAL_SETUP.md`、`data/docs/GROK_HACKATHON_EVENTS.md` | 导入规则和交给 Grok 的数据格式 |
| `business/docs/superpowers/specs/`、`plans/` | 每个大功能的设计和实施计划（大功能沿用这种"规格 → 计划 → 验收"的写法） |
| `business/expert-team/TEAM_GUIDE.md` | 五位专家的方法边界和研究顺序 |
| `pic/README.md` | 设计稿总索引，最新的在最上面 |
