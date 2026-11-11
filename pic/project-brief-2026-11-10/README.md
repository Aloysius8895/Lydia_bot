# Hackathon 项目侧栏：「问题 / 方案 / 实现」简介

2026-11-10。状态：**已实现并上线**（同一天确认）。用户的决定：

- 现有的每个项目都要生成简介。
- 以后新进来的项目，先生成简介再放进书库。

和设计稿相比，正式版有这些不同：

- 「还没有简介」改成「排队中」，因为后台会自动生成。卡片上有「优先生成」按钮，可以把这个项目排到最前面。
- 项目页面读不到时，自动改用资料包摘要生成，并标明「仅依据资料包摘要」。只有页面和摘要都没有时，才算失败。
- 去掉了「取消」按钮。
- Claude 本身出问题时（登录失效、额度用完），项目不算失败，而是退回队列，后台暂停 15 分钟后再试。
- 功能上线之后进来的新项目，在简介生成完（或者确定失败）之前不显示在书库里，最多隐藏 24 小时。

正式代码在：`business/backend/project-brief.ts`、迁移 `011-project-briefs.sql`、测试 `business/tests/project-brief.test.ts`。上线前做过一次完整备份：`data/data_storage/backups/database/grok-import-2026-11-10T08-37-03-279Z-a2496fbd`。

以下是当时的设计稿说明。

需求：在项目库右侧栏，读取每个 Hackathon 项目的原始页面，整理成三段中文简介：要解决的问题、提出的方案、如何实现。

## 截图

| 图 | 内容 |
| --- | --- |
| 01-desktop-kalash-light.png | 电脑整页：选中 kalash，简介卡片在侧栏最上面 |
| 02-inspector-kalash-ready.png | 侧栏特写：已生成 |
| 03-inspector-takarabako-ready.png | 侧栏特写：已生成（另一个项目） |
| 04-inspector-bramble-none.png | 还没有简介：一个「✦ 生成简介」按钮 |
| 05-inspector-yohaku-running.png | 生成中：显示正在读哪个网站，可以取消 |
| 06-inspector-cosmicnova-failed.png | 来源读不到：列出每个来源的失败原因，可以重试或只用摘要生成 |
| 07-inspector-dark-smart-water.png | 黑夜模式 |
| 08-phone-kalash.png | 手机：侧栏排在书库下面，同一张卡片 |

截图用的是真实前端和 11-10 数据库备份的副本（`render.mjs`）。只替换了侧栏组件，其他界面保持原样。

## 简介内容是真的生成的

`samples.json` 里的 6 段简介，是原型（`proposed/project-brief.ts`）读取真实项目页面、用你的 Claude 订阅生成的，没有手写。覆盖 5 个平台：

| 项目 | 平台 | 读到的来源 | 用时 |
| --- | --- | --- | --- |
| kalash | ETHGlobal | ethglobal.com 项目页（x.com 需要登录，跳过） | 17 秒 |
| Takarabako | ETHGlobal | ethglobal.com 项目页 | 7 秒 |
| Smart Water Guardian AI | Hackster | hackster.io 项目页 | 11 秒 |
| Tokito | Devfolio | devfolio.co 项目页 | 8 秒 |
| SpoilSafe | Imagine Cup | 微软博客（三个项目共用一页，只取了它那段） | 11 秒 |
| True Deal | TAIKAI | taikai.network（页面内容少，也够用） | 8 秒 |

第一版提示词写得太长（某些段落超过 200 字），见 `samples-v1-long.json`。现在规定每段 1–3 句、不超过 100 字，并用全角标点。

截图里只有这 6 个项目有简介，其余项目显示「还没有简介」。yohaku（生成中）和 CosmicNova（读取失败）这两个状态是为了展示界面效果而设置的，不是真的生成结果。NASA Space Apps 的网站今天在我这边确实读取超时。

## 卡片规则

- 位置：只在比赛项目的侧栏顶部显示，新闻不显示。原来的「外部资料摘要 / 日期 / 分类 / 核实说明」收进下面的「资料包信息」折叠栏，内容不变。
- 标注：标题旁写「AI 整理」，底部写「根据 ethglobal.com 整理 · 日期 · 未独立核实」，并列出实际读到的网站。
- 某一段在来源里找不到依据时，写「来源未说明」，并用灰色斜体显示，不编造。
- 只用资料包摘要生成时（来源全部读不到），卡片顶部会有黄色提示「仅依据资料包摘要，信息有限」。
- 右上角 ↻ 可以重新生成。
- 简介是**阅读辅助，不是证据**。项目在取得原文前仍然不能「加入分析」，这条规则不变。

## 怎么生成（如果确认）

1. 读取项目的来源链接：最多 3 个，每个最多 12,000 字；x.com 需要登录，直接跳过；使用已有的 `fetchPublic`（会拦截私网地址，限制 1 MiB 和 15 秒）。
2. 用 Claude CLI 的 Sonnet 5.5（low effort，和 Idea 实验台同一档）生成三段，并用 zod 校验格式和长度。网页内容按不可信数据处理，不执行其中的指令。
3. 存进新表 `project_briefs`（迁移 011：project_id、状态、三段内容、来源列表、模型、生成时间、项目 revision）。**不改 `crawl_projects` 原有的行**，所以导入时记录的行指纹保持不变。
4. 接口：`POST /api/knowledge/projects/:id/brief` 生成或重新生成；读取项目详情时一并返回 `brief`。走现有的 CLI 串行队列，不并发占用订阅。

需要修改的正式文件：`backend/project-brief.ts`（新增）、`backend/knowledge.ts`（加路由）、迁移 011、`KnowledgeMaterialDetails.jsx`、`KnowledgeWorkspace.jsx`（接上生成按钮）、`knowledge.css`。建议的代码见 `proposed/`。

## 想请你决定

1. **要不要一次给全部项目生成？** 现在库里有 107 个项目，每个大约 10 秒，全部生成大约 18 分钟，会占用订阅额度。可以选三种方式：只在点按钮时生成（截图就是这种）；在项目库加一个「为全部项目生成」按钮；新导入的项目自动排队生成。
2. Idea 实验台比较项目时，要不要把简介也作为参考资料（标注「AI 整理」）？

## 顺便发现的线上问题

你电脑上的 Claude CLI 已经自动更新到 **2.1.322**。新版本不再接受 zod 生成的 JSON Schema 里的 `$schema` 头部，碰到会直接退出（报错：`--json-schema is not a valid JSON Schema`）。

`agents/providers/claude.ts` 只在「对话」和「语音」两类调用里删掉了这个头部。专家研究、Idea 实验台、检索翻译和重排这些调用都会带上这个头部，**现在大概率都会失败**。我用同样的参数复现了这个错误。原型代码里已经绕开了这个问题，正式代码还没有改。
