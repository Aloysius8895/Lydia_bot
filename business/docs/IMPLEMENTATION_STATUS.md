# 实施进度

**2026-11-11 「相似与搭档」入口改成侦探 logo（已上线）：**

- **改了什么**：
  - 按用户确认的设计稿（方案 A），入口从简介下面挪到项目名字右边，改成一个 40px 的圆按钮，里面是侦探 logo（新增 `DetectiveIcon.jsx`）。
  - 鼠标停上去有说明，读屏软件读出"相似与搭档"。
  - 工作台分区列表里的图标也换成同一个 logo。
- **验证**：
  - 设计稿 29 项检查通过；正式代码在库副本上 7 项检查通过。
  - 只改了前端，重建 dist 后线上 bundle 一致。
- **详情**：见 `pic/match-entry-2026-11-11/`。

**2026-11-11 相似与搭档（已上线）：**

- **做了什么**：工作台新增「相似与搭档」分区，项目简介下方加了入口。
  - 选一个作品，Claude（Sonnet 5.5，中等思考强度）一次把它和库里其他作品或全部新闻比一遍。
  - 界面显示六边形相似度雷达和四象限搭档地图：撞车、★ 合体、搬运、关系不大；新闻是 ★ 时机。
- **怎么保证不乱讲**：
  - 只有 POST 才调用 Claude，结果存在 `project_matches`，再次打开不花额度。
  - 新闻先读原文链接，存在 `news_sources`，不改导入的行；读不到的 24 小时后重试。
  - Claude 引用的新闻句子必须出自原文，作品引用必须是简介里已核对过的原文编号，程序逐条核对。
  - 位置和分区由程序按分数算。
  - 新作品进来后只提示"新增了 N 个"，不自动重跑。
- **顺带改的**：Idea 实验台对只有摘要的新闻，改用读到的原文。
- **涉及的文件和数据**：迁移 013；`retention.ts` 登记了新外键，有比较还在排队或进行中的项目不会被清理。
- **验证**：
  - 新增 `tests/project-match.test.ts` 3 项，全部 169 项测试和类型检查通过。
  - 在已验证备份的副本上做了真实端到端验证，共 4 次 Claude 调用；42 条新闻读到 38–39 条原文。
  - 上线前备份 `grok-import-2026-11-11T14-12-47-409Z-4940138e`（验证和恢复检查都通过）。
  - 线上 HTTP 200，线上 bundle 和 `dist` 一致。
- **详情**：设计稿和实际截图见 `pic/project-match-2026-11-11/`。

**2026-11-09 Drive 首批真实预览：** 仅执行手动 pull，成功校验指定批次父目录、权限、字节/SHA256、大小及条数；projects/news 包装各解析 1 条。Takarabako 匹配历史 UUID，除新增 id 外全部原字段相同；新闻完整字段与指纹一致。当前严格导入器预计 0 新增、1 重复、1 冲突（新增 ID 导致指纹变化），未 execute、未写别名或业务库，每日同步关闭。身份依据此前正式库核验快照；运行中正式库未另开连接。见 [预览报告](../../data/docs/acceptance/2026-11-09-drive-first-batch-preview.md)。

**2026-11-09 Drive 手动单批准备：** 按用户批准方案实现专用服务账号的 drive.readonly JWT（无 sub/域级委派）、本机 DPAPI 凭据导入、根/批次/文件 ID 与权限检查、ready 最后交付及 SHA256/字节/条数校验、同名不同 ID 的逻辑去重、手动收据和显式备份后复用现有导入验收。无需新数据库迁移；批次 files JSON 可附加 Drive provenance，旧来源内容仍保留为冲突，不更新既有 52 条。已完成隔离模拟拉取→入库→搜索与负面边界测试，尚未连接真实 Google Drive、未读取实际服务账号密钥、Grok 上传也未连接，所以真实单批验收仍待双方准备。每日同步关闭，未创建任务、部署或推送。配置步骤见 [Drive 手动配置](../../data/docs/DRIVE_MANUAL_SETUP.md)。

**2026-11-09 按职责细分数据目录：** 处理代码移至 `data/data_preprocessing/{RAG,database,crawl,imports,cli}`，正式资料移至 `data/data_storage`；数据库、原始包、分类阅读目录、采集快照、研究导出、备份和报告分别存放。分类项目按状态声称/主题/子主题/平台整理，新闻按主题/子主题/采集日期整理；SDG 仅保留基于标签的候选索引。迁移读回确认 37 个作品、15 条新闻及旧研究资料保留；无新 schema、部署或推送。旧路径记录保留为历史，当前路径以 [data 目录说明](../../data/README.md)和迁移验收为准。

**2026-11-09 Grok JSON 文件批量导入：** 经用户确认新增 009 迁移的 3 张批次/逐条结果/身份映射表。已暂停正式服务与启动器、完整备份并隔离恢复检查；37 个外部作品进入 crawl_projects，15 条新闻摘要进入 knowledge_news。52 条均在正式库读回并通过既有搜索逻辑检出，最终复导新增 0、重复 67、冲突 0、失败 0。原有 3 个研究项目、19 份文档、187 个文本块及已有业务行指纹保留。摘要不冒充原文，未生成 Lydia Idea 或奖项证据。16 项针对性测试与类型检查通过，前端只构建到临时目录验证，未替换正式 dist。首轮 5 个辅助竞赛 URL 的误冲突已修复、补测试并通过后续批次完成，原审计保留。服务当前暂停；未部署、未推送、未配置自动同步。详见 [使用说明](FILE_IMPORT.md)及[真实入库验收](acceptance/2026-11-09-grok-file-import.md)。

**2026-11-06 手机界面正式实现（含白天/黑夜）：** 按最后确认的间距稿落地炭灰/浅蓝/淡紫卡片与液态玻璃底部导航；新增分组会话、设置纵向概览与返回，手机通话入口移至聊天顶部，桌面语音条保留；列表结尾预留导航空间，任务保留恢复/取消并减轻底色。修复手机首页刷新误跳聊天。现有内容、业务 API、角色及自定义头像继续使用。构建/类型检查通过，隔离库手机专项通过（主题记忆、Bob 防遮挡、导航/设置、真实临时库文件上传、通话卡、任务取消、320/390/430px 与缩短高度、桌面布局）；页面错误 0，无真实推理或音频。实际截图与报告见 [手机实现记录](../../pic/mobile-implemented-2026-11-06/README.md)。iPhone 的真实软键盘与语音体验仍需设备确认。

该轮原应用浏览器回归 21 组通过，页面/控制台错误 0；局域网服务已正常重启到当前构建。运行中 HTTPS 与新版 JS/CSS 只读检查通过，报告 `pic/mobile-implemented-2026-11-06/live-assets.json`。

**2026-11-06 iPhone 局域网安装支持：** 新增 `Start-Lydia-Phone.cmd`，检查端口、选择电脑私有 IPv4、验证 HTTPS 证书、构建并启动唯一后端；4319 仅供公开 CA 与安装引导，4318 提供 HTTPS 工作区。设置 → 手机新增地址、指纹、Safari 安装说明和当前设备检查；修复电脑使用自身 LAN 地址时无法首次设置密码的问题。未自动改变防火墙或系统信任。具体步骤见 [iPhone 安装](IPHONE_INSTALL.md)。真实 iPhone 的证书信任、主屏幕安装及设备交互仍待用户验收，不以桌面测试替代。

电脑验证：前端构建/TypeScript 通过，3 项本机登录与 LAN 边界回归通过；隔离库中实际 LAN-IP TLS 证书链/主机名、首次密码设置、Secure Cookie、CSRF 拒绝、公开 CA 与私钥路径隔离通过；390px/桌面手机设置页验证通过，页面错误 0。运行中服务只读检查也通过（正式账号已设置，未修改密码或项目）。报告：`test-results/phone-verification.json`、`phone-live-check.json`，截图 `phone-mobile.png`/`phone-desktop.png`。浏览器测试跳过测试证书的 OS 信任安装，真实 TLS 则独立使用显式 CA 验证；不代表 iPhone 信任成功。

**2026-11-05 已确认的柔和三栏设计：** 按 `pic/07-full-page-soft-assistant-style.png` 落地浅色柔和背景、圆角面板、紧凑顶部、自动增高的输入框和真实通话入口；右侧去掉重复项目选择，研究工具与方法介绍折叠。三栏在可用内容空间保持 27/42/31。桌面/手机视口、深色模式、资料与任务流程、连续通话浏览器检查通过；实际截图与专项报告见 [pic/implemented](../../pic/implemented/README.md)。测试使用临时数据，不代表真人声音或真实市场验证。

**2026-11-05 ElevenLabs 可选 TTS：** 完成公开页面 REA、官方 API 调查及后端加密凭据/音色/试听/流式代理、前端语音设置与专家音色接入。Claude CLI 与 STT 保留，默认仍是浏览器语音。84 项测试及浏览器替身验证通过，真实 ElevenLabs 合成需用户 Key；见 [接入说明](../../audio/elevenlabs/README.md)。

**2026-11-05 实际通话故障修复：** 修复 CLI schema 方言声明导致结构化工具未注册的问题；通话专用 low effort、短回答与字幕复用，增加失败重试和重复语音拦截。真实 CLI 两轮测量 7.707s / 7.575s；完整语音体验仍待重测，见 [验收报告](../../audio/acceptance-report.md)。

**2026-11-05 持续专家通话：** 已按 v1.3 实现自动端点/提交/倾听恢复、语音打断、静音、识别有限重试、最新意图替换及长通话历史。74 项单元/API 测试与浏览器 mock 验证通过；真实语音闭环、10 分钟通话、实际延迟和手机尚未验收。详见 [语音验收报告](../../audio/acceptance-report.md)。

**2026-11-04 用户指定路径修正：** 当前数据模块的唯一位置为 `C:\maven\business_agent\data`，与 `business` 同级；此前 `business/data` 是位置理解错误，已迁出。模块入口与审计见 [data/README](../../data/README.md)、[数据审计](../../data/DATA_AUDIT_AND_SOLUTIONS.md)。跨目录引用、依赖解析、类型检查范围及图示随之调整。迁移记录为 `verification/workspace-data-layout.json`。本机实际数据库仍在 `business/.runtime/data`，应用仍从 business 启动；下文目录记录为历史状态。

**2026-11-04 首轮数据模块整理（历史）：** 当时将 `RAG/` 迁至 `business/data/RAG/`、`database/` 迁至 `business/data/database/`；之后根据用户明确路径再次迁出，当前以本页顶部修正记录为准。首轮完整性与验证记录保留于 `verification/data-layout.json`。当前说明见 [data/README](../../data/README.md)，数据问题与建议见 [数据审计](../../data/DATA_AUDIT_AND_SOLUTIONS.md)。该整理没有新增抽样/代表性判断或数据质量门禁，也不改变真实专家与手机验收状态。

**当前布局依据最新参考图：** 桌面打开右栏时，左/中/右约27% / 42% / 31%；关闭右栏后聊天自动展开。列表18–20px、消息18–20px、右栏正文17–19px，辅助说明16–18px，随桌面窗口缩放。平板使用右侧浮层，手机单栏/抽屉；保留原头像、主题与研究逻辑。验证记录见 verification/reference-proportions.json。

**前次字号放大记录：** 右侧设置面板曾调为标题18px、说明/状态15px、正文/按钮16px、聊天/输入17px、面板380px；该阶段18项检查通过，报告为 verification/readable-type.json。当前尺寸以上述新比例为准。

**当前产品名：Lydia。** 已按用户要求更名，主入口为 Start-Lydia.cmd；原 Start-Crew.cmd 兼容转到新入口。正式界面、浏览器标题、PWA 名称、下载报告前缀、包名与启动日志同步调整。旧主题偏好向后读取，现有数据库/案件、证书与会话继续保留；此前 Crew 设计名称和历史报告不改写。

改名验证：前端构建与类型检查通过；18项浏览器检查通过，包含 Lydia 品牌/title/PWA 名称、旧主题偏好迁移、旧缓存清理、lydia-report 下载名与原有操作流程，页面/控制台错误为0。最初测试准备页触发的 favicon 404 已通过调整测试准备步骤修正，未忽略控制台错误；保留首轮报告，见 verification/lydia-name.json。未运行真实模型推理。

2026-11-03，Asia/Kuala_Lumpur。用户已授权执行最终设计。本地应用已实现并运行；新增三语查询扩展和相关性重排已在小型合成集通过，真实五专家联调、生产检索质量和手机安装尚未全部验收。下列状态分别报告，不宣称整套系统已完成验收。

**当前唯一项目位置：`C:\maven\business_agent\business`。** 首先将 app/docs 从旧 Hackathon_map 根迁入，3,107 个文件哈希一致。随后按用户“负责什么放什么 folder”的要求拆分 app：检索实现进入 RAG，专家编排进入 agents，API 进入 backend，存储进入 database，界面进入 frontend/research-pwa；入口与依赖位于 business 根，运行数据进入 .runtime。第二次移动 3,106 个文件，修改引用前哈希全部一致，见 verification/responsibility-layout.json。旧 app 目录已移除；原有 skills、expert-team 和 React 前端原文件保留。

**当前正式前端已改为用户原有 Crew React/Vite 设计。** 源码 frontend/src、资源 frontend/public、实际服务 frontend/dist；frontend/research-pwa 只作旧版备份，不再作为默认入口。已复用原侧栏、头像、聊天、深浅主题与手机布局，并接入统一 RAG API。设置页太阳/白天、月亮/黑夜切换会记住偏好。根 npm start 与 Start-Lydia.cmd 自动构建，再启动唯一后端。

**头像后续更新：** 根据用户提供的彩色几何角色参考图，Avatars.jsx 已改为蓝色软方块、橙色圆形、青绿色软方块、粉色三角、紫色菱形和黑色个人角色；团队与堆叠头像同步使用这些角色。深色主题下黑色角色有细轮廓。原 styles.css 保持，头像组件是本次明确授权的后续修改，不再声称它当前仍与最初哈希相同。最新17项浏览器检查通过，已查看桌面、手机、深浅主题截图；见 verification/character-avatars.json。

## 已核实

- Node v24.12.0、npm.cmd 11.6.2；PowerShell 的 npm.ps1 受执行策略阻止，使用原生 npm.cmd，不修改全局策略。
- Claude Code 2.1.143 实际认证为 claude.ai / firstParty / pro。用户确认额外用量关闭后，真实最小结构化调用 TEST_PASSED；没有注入 Anthropic API key、读取 token 或修改全局登录。详见 verification/cli-connectivity.json。
- Ollama 0.17.1 本地服务与 nomic-embed-text:latest（274,302,450 bytes）实际连接成功；未下载新模型。六条合成中英马来语查询的 Recall@3=0.5556、MRR=1，低于预设 Recall@3>=0.8，标 PARTIAL，不作广泛多语言效果保证。
- 继续执行后加入 Claude CLI 三语查询扩展和相关性重排。同一 15 文档/15 查询集对照：原查询 Recall@3=0.3333，扩展后=0.60，重排后=1、MRR=1。新保留集仅3条，旧保留集用于诊断后已改标 development。最新小型评估 TEST_PASSED，不覆盖原始 PARTIAL，也不等于生产保证。
- RAM 31.2 GiB、可用磁盘约 322.7 GiB。CIM/GPU 查询被拒绝，未绕过。
- PostgreSQL 命令未找到；Docker engine 未运行且其配置访问被拒绝，未启动/更改服务。
- 已确认原有技能、expert-team 和 Crew 前端位于当前根目录；之前未找到的是旧 `Hackathon_map\business` 下的副本，并非文件丢失。六份技能的入口与方法/协议已实际只读加载，状态为 LOADED，见 verification/skills-loaded-current.json；不等于五专家行为验收通过。
- 旧 idea bot 仅作参考，未修改或启动。

## 实施决策

使用本地 PGlite（嵌入式 PostgreSQL WASM）+ pgvector，保留参数化 SQL 和迁移文件，避免安装全局数据库/Docker。它不是独立 PostgreSQL 服务器；以实际向量、事务、持久化测试验收。TypeScript 后端+轻量原生 Web PWA，不强制云 API。Claude CLI 仅显式注入已读技能/证据，关闭模型工具，由应用处理持久化。

## 实施与验证

- [x] 按职责拆分原 app 并修复 107 处相对 import；新目录下类型检查、32 项功能测试、9 项浏览器检查、HTTPS 传输/登录检查通过。六 skills 读取成功；现有运行进程的首页、JS、CSS、manifest 与新 frontend/research-pwa 逐文件哈希一致，见 verification/layout-live-service.json。
- [x] 保存 IMPLEMENTATION_PLAN.md，完成本地依赖安装并锁版本。网络权限和 TLS 校验曾失败，最终使用本机 npm 缓存离线安装；未关闭 TLS 校验或修改全局 npm 配置。
- [x] PGlite 0.3.16 + pgvector 0.8.0 的事务、持久化、向量 SQL 实测通过。
- [x] 案件/证据/来源版本/要求/决策/Gap 选择门禁、幂等任务、恢复、取消和报告导出已实现。
- [x] 受控 Claude CLI adapter、脱敏认证检查、stdin/参数数组、额度/认证错误暂停、超时与进程取消已实现；最小真实订阅调用通过。
- [x] skills 入口只读加载并记录 hash；详细方法按角色索引/检索，关键入口直接注入。迁移后当前六份原有技能均已 LOADED，模式为应用显式注入上下文，不声称 CLI 原生技能注册；工作流控制测试仍使用明确的 TEST_ONLY 夹具。
- [x] 单用户密码/会话、同源/CSRF 校验、文本上传、公开 URL 抽取、免费搜索配额门禁与条件采集、PWA shell/图标已实现。
- [x] 最新33项 node:test 功能/边界测试 TEST_PASSED；包括并发去重、取消期间不可复活、断点不重复已完成步骤、引用 ID 与语义复核、查询扩展缓存/降级、串行CLI调用、重排伪造ID拒绝与空结果分支，以及原 React 构建资源白名单、字体和源码/配置访问边界。报告 test-results/unit-tests-original-frontend.txt。语义复核/控制分支使用 mock，不代表真实专家语义准确率已验收。
- [x] 原 Crew 设计集成后的16项真实 Chrome 浏览器流程 TEST_PASSED：登录、项目创建/刷新恢复、资料索引/检索/隔离、暂停取消、显式 Gap 选择、企业要求、Settings 太阳/月亮切换与偏好记忆、导出、390px 布局、PWA 哈希资源缓存及退出。pageErrors=0、consoleErrors=0、旧 /api/reply 请求=0。使用独立 TEST_ONLY 数据库和导出、模拟 CLI 身份、禁用真实推理；不据此宣称真实专家行为通过。已查看 crew-design-light/dark/mobile-*.png。
- [x] 公开来源 Example Domain 真实连接读取 171 字符正文，CONNECTED；仅采集链路检查，不是市场需求证据。
- [x] 六条真实本地 embedding 检索评估已保存，状态 PARTIAL。
- [x] 三语查询扩展实际 Claude CLI 测试与重排评估已运行：15条合成查询，最终保留组3条；报告为 test-results/rerank-evaluation.json。扩展/重排不计作市场证据，缓存按案件和来源版本隔离，失败则明确降级。
- [x] 已为当前电脑私有IP生成本地CA/叶证书和 deployment/.env.lan.example；OpenSSL证书链/IP检查通过。证书位于 deployment/certs，另在隔离数据库中实测HTTPS连接、登录和Secure cookie通过。没有修改系统信任库、防火墙或现有loopback监听；手机信任仍未验证。
- [ ] 真实五专家任务和单顾问基线对照：NOT_RUN；目录阻塞已解除，需要单独执行行为评估，不能以 LOADED 代替。
- [ ] Tavily 真实搜索：NOT_RUN，没有配置已确认的免费账号/额度；默认不发请求、不收费回退。
- [ ] 真手机证书信任、主屏幕安装与真实设备交互：NOT_RUN，需要用户手机操作；局域网互访未测试。仅完成证书准备与本机显式CA验证，未修改防火墙/信任库或开放公网。

## 本机入口

应用在 `http://127.0.0.1:4318` 运行，进程信息位于 .runtime/data/server-process.json。首次在电脑浏览器设置个人密码；没有预设密码，真实数据库未混入 TEST_ONLY 案件。运行进程只绑定 loopback，手机暂时不能连接。

重新启动：进入 `C:\maven\business_agent\business` 根目录，运行 `npm.cmd start` 或双击根目录 Start-Lydia.cmd；会先构建 frontend/dist，再执行 backend/server.ts，并读取存在的 deployment/.env。不要同时以不同端口启动相同数据库目录。服务进程信息在 .runtime/data/server-process.json；未安装模型或数据库全局服务。早期 layout-final-check.json 是旧静态界面当时的检查，新 React 入口与主题验证以 verification/frontend-design-integration.json 为准。首次使用在电脑上设置个人密码。

代码与说明：[????](RUNNING.md)。测试记录：[test-results](../test-results)。手机配置指南在 README 的“手机与 HTTPS”。

## 重要边界

- 原有真实技能、TEAM_GUIDE 和 Crew HTML 保留，未重新蒸馏或覆盖。当前复用 frontend/src 原有 React 设计并连接 RAG，styles.css 保持原哈希；Avatars.jsx 按用户后续参考图明确修改。旧 frontend/server 不在默认或开发调用链，不使用 API key 回退。
- 独立 PostgreSQL/Docker 未安装或启动，实际采用嵌入式 PostgreSQL，区别已记录。
- 费用：使用本人已授权的现有 Claude Pro 订阅额度；未开通额外付费资源，没有 API key 回退。token 计数不是账单/剩余额度证明。
- 没有真实新 brief、真人访谈、付费验证或外联。公开来源读取与测试数据不等于真实市场调研已完成。
- 原始失败和修订说明保存在 verification/test-history.json；检索未达标结果不会被功能测试通过覆盖。
- 原始CLI曾返回非结构化正文，查询扩展按规则降级；已补充显式schema约束，并仅接受整段JSON或完整JSON代码围栏，不从解释性文字中猜测抽取JSON。失败与修订评估分文件保留。
- 迁移前的测试原文、旧进程记录和旧绝对路径作为历史记录保留；当前运行入口与操作说明均使用 business_agent 根目录。迁移完整性报告见 verification/project-relocation.json。

## 状态词

GENERATED=已生成；LOADED=实际读入；CONNECTED=真实连接；TEST_PASSED=指定测试通过；NOT_RUN=未运行；BLOCKED=具体依赖阻塞。依赖检查不等于端到端通过。
