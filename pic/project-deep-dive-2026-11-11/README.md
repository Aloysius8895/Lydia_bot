# 项目「深入了解」：Claude 读完项目页和 GitHub 再详细解释

2026-11-11。状态：**已实现并上线**（同一天确认，包括两项附加决定）。

和设计稿的不同：

- 每条要点可以附 1–3 段原文（设计稿只有 1 段），原文合起来要覆盖要点里的每个事实。
- 加了第二步：Claude Haiku 逐条判断原文是否足以支持要点。不支持的删除，只支持一部分的保留并标黄。实测 Tap2ETH：只附 1 段原文时 20 条里有 16 条被标为部分支持；改成 1–3 段后，18 条里只有 3 条。
- 现有 107 份简介也改为「每段附原文、程序核对」，有 GitHub 链接时读 README 原文。后台逐个升级，升级完成前旧简介照常显示。
- 正式代码：`business/backend/project-deep-dive.ts`、`project-sources.ts`、`project-brief.ts`，迁移 `012-project-deep-dives.sql`，测试 `business/tests/deep-dive.test.ts`、`project-brief.test.ts`。上线前完整备份：`data/data_storage/backups/database/grok-import-2026-11-10T18-15-05-351Z-23281484`。

以下是当时的设计稿说明。

需求：在项目简介旁边加一个「深入了解」按钮。点击后，Claude 先把这个项目的资料看一遍，再给出更详细的解释。不能随便乱讲。

## 先看视频

`demo.webm`（用 Chrome 打开）：点「深入了解」→ 显示正在读什么 → 出结果 → 点开两条的原文 → 打开「展开全部原文」→ 往下滚到资料清单 → 关闭。

## 截图

| 图 | 内容 |
| --- | --- |
| 01-brief-card-button.png | 选中 Tap2ETH，简介卡片右上角多了一个深色的「深入了解」按钮 |
| 02-reading-progress.png | 点击后，中间的书库区域换成解读面板，一步一步显示正在读哪里 |
| 03-tap2eth-result.png | 解读完成：一句话概述，绿色的核对结果，然后分段列出要点，每条后面标着出处 |
| 04-quote-open.png | 点开一条的出处：显示从来源里原样复制的那句原文，可以点链接回到原页面 |
| 05-all-quotes.png | 勾选「展开全部原文」：每条要点下面都显示原文 |
| 06-unknowns-and-sources.png | 最后是「资料里没说清楚的」和「读过的资料」清单，没读的 x.com 也写明了原因 |
| 07-dark-smart-water.png | 黑夜模式：Smart Water Guardian AI |
| 08-tokito.png | Tokito（devfolio） |
| 09-phone-button.png / 10-phone-result.png | 手机：解读铺满整个屏幕 |

## 解读内容是真的生成的

`samples.json` 里的 3 份解读，是原型（`proposed/project-deep-dive.ts`）真实读取资料、用你的 Claude（Sonnet 5.5，中等思考）生成的，没有手写。截图里重放的就是这 3 份结果。

| 项目 | 平台 | 读到的资料 | 用时 | 原文核对 |
| --- | --- | --- | --- | --- |
| Tap2ETH | ETHGlobal | 项目页、GitHub 仓库信息、README、文件目录、3 个配置文件（共 7 份） | 21 秒 | 25 条全部找到原文 |
| Smart Water Guardian AI | Hackster | 项目页、比赛页、GitHub 仓库信息、README、文件目录、requirements.txt（共 6 份） | 22 秒 | 24 条全部找到原文 |
| Tokito | Devfolio | 项目页、GitHub 仓库信息、README、文件目录、pyproject.toml（共 5 份） | 23 秒 | 25 条全部找到原文 |

Smart Water Guardian AI 和 Tokito 的资料包里本来没有 GitHub 链接，仓库是从项目页里自动找到的。Tokito 的项目页上还有第二个 GitHub 链接，但那个仓库不公开，清单里写了「仓库不存在或不公开」。

## 怎么防止乱讲

1. **只读真实资料**：项目页全文（最多 3 万字符）、GitHub 的 README（直接从 GitHub 接口取原文，不含网页导航）、文件目录（最多列 250 个文件），以及几个配置文件，比如 `package.json`、`hardhat.config.js`、`requirements.txt`。x.com 需要登录，所以不读，并写明原因。
2. **每条都要附原文**：Claude 写的每一条要点，都必须附上从某份资料里原样复制的一句原文，不能翻译，也不能改写。
3. **程序逐条核对**：生成之后，程序会检查每句原文是否真的出现在那份资料里。找不到原文的那一条直接删掉，并在顶部写明删了几条。如果原文出现在另一份资料里，就自动改成正确的编号。
4. **不评价**：不打分，不写「值得借鉴」这类话。资料里找不到的内容不硬写，而是放进「资料里没说清楚的」。
5. **标明出处**：每条后面都有 [编号] 和资料类型，点开能看到原文和链接。底部写着：原文核对只证明这句话出自来源，不代表来源本身属实。

**核对的局限**：核对只能证明那句原文确实出自来源，不能证明要点里的每个字都被原文覆盖。例如 Tap2ETH「做到了哪一步」的第 1 条写了「Uniswap Foundation 第 4 名和 Whitechain 第 2 名」，附的原文只包含 Whitechain 那一半。我另外查过，项目页上确实有 Uniswap Foundation 第 4 名，所以这条是对的，但程序没有核对到这一半。如果要更严，可以再加一步：用 Haiku 逐条检查「这句原文是否足以支持这条要点」。每次多花几秒，也多用一点额度。

## 规则

- 只有点了按钮才会生成，不会在后台给所有项目批量生成。
- 生成一次以后会保存下来，下次点「深入了解」直接打开。右上角的「↻ 重新解读」会重新读取资料。
- 生成时可以先关掉面板，后台会继续。
- 选中别的项目时，解读面板自动关闭。
- 按 Esc 也可以关闭面板。
- GitHub 不登录时，每小时最多访问 60 次。每次解读大约用 5 次，所以一小时最多解读 10 个左右的项目。超过时会提示「稍后再试」。
- 每次解读调用一次 Claude，用的是你的订阅额度，不走付费 API。

## 如果确认，要改的正式文件

- `backend/project-deep-dive.ts`（新增）：读取资料、调用 Claude、核对原文（`proposed/project-deep-dive.ts`）
- 数据库迁移（新增）：`project_deep_dives` 表，保存状态、结果、读过的资料、出错原因
- `backend/knowledge.ts`：加 `GET` / `POST /api/knowledge/projects/:id/deep-dive`，走现有的 Claude 排队
- `data/data_preprocessing/RAG/sources.ts`：让 `fetchPublic` 顺便返回页面里的链接。原型为了找 GitHub 链接，单独又抓了一次网页
- `frontend/src/components/ProjectDeepDive.jsx`（新增），`frontend/src/deep-dive.css`（新增）
- `components/KnowledgeMaterialDetails.jsx`：简介卡片上的按钮
- `components/KnowledgeWorkspace.jsx`：打开、关闭解读面板
- `main.jsx`：引入 CSS

和现在正式版本的差别见 `proposed/*.patch`。确认后会补测试，重建 `frontend/dist`，并重启 Lydia Remote。

## 待你决定

1. 要不要加上面说的第二步检查（Haiku 逐条复核），让核对更严？
2. 现有的 107 份简介，要不要也改成「每段附原文、程序核对」，然后全部重新生成？这需要大约 107 次 Claude 调用。
