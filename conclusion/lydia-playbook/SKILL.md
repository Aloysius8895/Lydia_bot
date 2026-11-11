---
name: lydia-playbook
description: Lydia 项目（C:\maven\business_agent，个人商业研究 RAG PWA：五位专家 + Claude CLI 订阅 + PGlite + Grok/Drive 资料导入 + Tailscale 手机访问）的全部做法、规矩和踩坑记录。只要在 C:\maven\business_agent 里工作，或用户提到 Lydia、商业逻辑、知识库、项目库、专家、完整研究、Grok 批次、Lydia Remote，就先用这个 skill：启动或部署服务、改界面（必须先在 pic/ 出设计稿）、修 bug、导入资料、排查"打不开/很慢/超时/任务暂停"、调整 Claude 模型和思考强度、写测试和汇报。Also use it when building a similar personal AI app on the user's own Claude subscription, because it captures the user's working preferences (design-first, Chinese replies, no fabrication, no paid fallbacks, verified backups before touching data).
---

# Lydia 做法手册

Lydia 是用户自己用的商业研究助手：后端跑在用户电脑上，手机和平板通过 Tailscale 打开。推理用用户已登录的 Claude Code CLI（订阅额度，不用 API key）；检索用本地 Ollama embedding 加 PGlite/pgvector。资料有三个来源：用户上传、公开网页，以及 Grok（"每日情报台"）每天放进 Google Drive 的资料包。

这份手册从 2026-11-03 到 2026-11-11 的全部对话和执行记录里整理出来。最重要的是用户的工作习惯和定下的规矩，其次是项目地图和验证过的操作步骤。细节在 `references/` 里，按任务读对应的那一份，不用全读。

## 底线：每次都适用

1. **界面改动先出设计稿，用户点头才改正式代码。** 新界面、改版、新交互、动画都算，哪怕用户只说"帮我调整一下"。设计稿放 `pic/<主题>-<日期>/`，用真实数据截图，写 README，等用户说"可以/确认/就这样实现"。用户明确要修的 bug（穿模、点不了、溢出）和数据、运维任务不受此限。原因：用户在手机上看线上版本，没确认的改动上线就是事故。2026-11-09 违反过一次，只能回滚重来。→ `references/design-first.md`
2. **测试和排查不碰正式库、不打扰线上服务。** 正式库只在停服务、做完验证过的备份之后才写。排查用库副本，测试用临时库和随机端口。原因：PGlite 只能单进程打开；两个实例同时开过一次，后端卡死。→ `references/deploy-ops.md`
3. **不编造，状态如实。** 证据、日期、原文、数字都不能补造；没跑的写"未运行"，模拟测试通过不等于真实可用；自己说错了、偏离了用户的指令，主动讲出来。原因：这是研究工具，用户的原话是"我不要随便乱讲的"。→ `references/ai-evidence.md`
4. **用了用户的额度要说。** 真实 Claude 调用会消耗用户的订阅额度，要说清用了大约几次。批量生成（比如 107 份简介）先说明耗时和额度，再动手。不接任何收费后备，不自动升级套餐，不擅自运行 `claude update`。
5. **中文回复，说人话，先给结论。** 用户写中文、夹英文词，不读代码。回复先说结论，然后讲原因和怎么做；命令给用户实际在用的终端能直接贴的版本。不小心冒出整段英文时，用户会问"这是什么来的"。→ `references/working-agreement.md`
6. **不提交、不推送、不输出凭据，除非用户明确要求。** 工作区里有很多用户自己没提交的改动，不要碰它们；每次汇报末尾说一句"还没提交到 git"。`.env`、API key、邮箱只查"有没有"，不打印值。

## 先判断这次是什么任务

| 用户大概会这么说 | 任务类型 | 先做什么 | 读 |
| --- | --- | --- | --- |
| "怎么启动""打不开""手机连不上""是不是已经部署了" | 运维 | 跑 `scripts/lydia-status.ps1`，先看实际状态再回答 | deploy-ops.md |
| "帮我 redesign""调整一下界面""加个按钮""动画""颜色统一" | 界面设计 | 在 `pic/` 出设计稿，不改正式代码 | design-first.md |
| 截图加一句"这个是什么情况""为什么出问题" | 排查 | 在库副本上复现，找到根因再说 | deploy-ops.md、ai-evidence.md |
| "为什么这么慢""超时""用哪个模型""思考强度" | 推理性能 | 用真实调用在库副本上计时 | ai-evidence.md |
| "拉取批次""导入""新的资料进来了吗""自动导入" | 数据 | 走预览、备份、试导入、导入、复导、读回 | data-pipeline.md |
| "帮我 push 上 github" | git | 先查秘密、大文件和第三方素材 | working-agreement.md |
| 新功能，涉及后端或数据库 | 开发 | 摸清现状，跑基线测试，界面部分先出设计稿 | architecture.md、testing.md |

## 标准循环

几乎每个任务都按这个顺序走：

1. **摸清现状。** 读相关代码和文档（`business/docs/`、`data/README.md`、对应 `pic/` 设计稿）。改代码前先跑一次基线：`npm.cmd run check` 和相关测试。问到线上状态时先查实际状态（计划任务、端口、日志），不凭文档回答。
2. **做。** 界面先出设计稿；后端和数据按项目现有写法来（参数化 SQL、迁移只增不改、新文件放在对应职责目录）。
3. **测。** 单元测试加浏览器测试，全部在临时库上跑。每修一个 bug 补一条回归测试。需要真实 Claude 输出时在库副本上跑，并告诉用户用了几次调用。→ `references/testing.md`
4. **部署**（用户确认过或明确要求时）：停 `Lydia Remote`，做验证过的备份，构建（只改后端时跳过），启动，验证线上。避开每天 10:00 的自动导入。→ `references/deploy-ops.md`
5. **记录。** 更新设计稿 README 的状态（"已实现并上线（日期）"，写明和设计稿不同的地方）、`pic/README.md` 索引、相关 docs。出现新的长期规矩就更新本 skill。
6. **汇报。** 用下面的格式。

## 汇报格式

用户在手机上看回复，所以要短、要具体：

- **第一句就是结论**："已经上线，刷新就能看到"/"还没有，原因是……"/"设计稿放在 pic/…，正式应用没改"。
- **然后分块讲**：做了什么、为什么出问题（人话版根因）、怎么验证的（测试数量、真实还是模拟）、你需要做什么。
- **数字要具体**：用了几秒、几项测试通过、导入多少条、几条冲突。
- **需要用户决定的事放最后**，编号列出，每项带选项和推荐（"我建议 A，因为……"）。
- **结尾的固定说明**：没提交 git；动了线上就写备份位置和停服时长；用了真实 Claude 调用就写大约几次。

模板见 `assets/report-template.md`。

## 文件索引

| 文件 | 什么时候读 |
| --- | --- |
| `references/working-agreement.md` | 第一次接手、要和用户沟通决定、push 代码、涉及隐私时 |
| `references/architecture.md` | 要改代码，需要知道东西放在哪 |
| `references/design-first.md` | 任何界面、视觉、交互、动画改动 |
| `references/deploy-ops.md` | 启动、部署、重启、手机访问、各种"打不开" |
| `references/data-pipeline.md` | Grok/Drive 导入、每日 10:00 任务、365 天清理、写给 Grok 的说明 |
| `references/ai-evidence.md` | Claude CLI 调用、模型分档、研究流程、引用和原文核对 |
| `references/testing.md` | 写测试、跑测试、截图验证 |
| `references/windows-pitfalls.md` | 命令报错、换行符、编码、TLS、npm 卡住 |
| `references/decision-log.md` | 想知道某个功能为什么是现在这样、还有哪些事没收尾 |
| `assets/design-render-template.mjs` | 新设计稿的截图和录屏脚本，复制到 `pic/<主题>/render.mjs` 再改 |
| `assets/design-readme-template.md` | 设计稿 README 模板 |
| `assets/report-template.md` | 给用户的最终汇报模板 |
| `scripts/lydia-status.ps1` | 只读健康检查：服务、端口、Tailscale、线上页面、CLI、备份、导入 |
| `scripts/extract-transcripts.js` | 从新的聊天记录里提取用户原话，用来更新本 skill |

## 维护这份 skill

用户定下新规矩（尤其是"以后都……""记得……"这类话），或某个流程第一次被验证成功时：

1. 把规矩写进对应的 reference，带上用户原话和原因；在 `decision-log.md` 补一行日期和决定。
2. 如果是跨项目的偏好，同时写进 Claude 的 memory（`C:\Users\User\.claude\projects\c--maven-business-agent\memory\`）。
3. 想从新的对话里补充内容时，运行：
   ```powershell
   node C:\maven\business_agent\conclusion\lydia-playbook\scripts\extract-transcripts.js C:\Users\User\.claude\projects\c--maven-business-agent <输出目录>
   ```
   它为每个会话生成一份 Markdown，只含用户原话和 Claude 的文字回复，不含工具输出。读用户的话，找纠正和新决定。

本 skill 放在 git 仓库里，而 GitHub 仓库是公开的。所以这里不写邮箱、密钥、Drive 文件夹 ID 和具体 Tailscale 主机名，只写它们存在哪里。
