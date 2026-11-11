# 追踪 Hackathon（侧栏入口 + 卡片面板）


2026-11-09 已实现：截图为 `../knowledge-iso-warehouse-2026-11-09/implemented/06–08、10、12`。后端为 `business/backend/hackathon-tracker.ts`，迁移为 `010-hackathon-events.sql`，grok 交付约定见 `data/docs/GROK_HACKATHON_EVENTS.md`。
2026-11-09。状态：**设计稿，待用户确认**。正式应用未修改。

需求：grok bot 会持续发现新的 Hackathon。在左侧「工作区」新增一个按钮，点开后在旁边显示追踪中的赛事卡片：
- 黄色外框：已发现、正在追踪，显示提交日期。
- 绿色外框：已抓到 finalist 或获奖作品。

## 文件

| 图 | 内容 |
| --- | --- |
| 01-new-capture-toast-dark.png | 面板关闭时：按钮带黄点和计数；grok 发现新赛事时，在按钮旁弹出黄色提示卡 |
| 02-panel-open-dark.png | 点击按钮后，侧栏右侧滑出 384px 面板；场景变暗，不离开当前页面 |
| 03-card-states-dark.png | 六种卡片状态和整体流程 |
| 04-panel-open-light.png / 05-card-states-light.png | 白天模式 |
| 06-phone-sheet-dark.png | 手机：同一面板改为底部弹出 |
| tracker.html / render.mjs | 参考页与截图脚本 |

背景使用 v5 等距仓库的截图，表示面板叠在新的项目库上方。

## 侧栏按钮

- 位置：工作区内「采集项目」与「新闻与资讯」之间，与采集功能放在一起。
- 右侧两个计数：黄色空心圈表示正在追踪的赛事数，绿色实心圈表示还没看过的新结果数，打开面板后清零。
- grok 发现新赛事时，图标左上角出现黄点，并弹出提示卡（赛事名、提交截止、剩余天数，以及「查看追踪 / 稍后」）。打开面板后，黄点消失。
- 再次点击按钮、点 ×、点暗色区域或按 Esc，都可以关闭面板。

## 卡片规则

| 状态 | 颜色 | 何时出现 | 显示 |
| --- | --- | --- | --- |
| 提交中 | 黄 | grok 发现了赛事，提交还没截止 | 平台、赛事名、提交截止（日期、星期、时间，GMT+8）、剩余天数、时间线停在「提交」、原始页面 |
| 临近截止 | 黄（实心天数标签） | 剩余 ≤ 3 天 | 同上，排在最前 |
| 等待结果 | 黄 | 已过截止，还没抓到任何 finalist 或获奖作品 | 截止日期、时间线停在「评审」、上次检查时间 |
| 已有结果 | 绿 | 抓到至少 1 个 finalist 或获奖作品 | 已收录的作品（finalist 显示名称，获奖作品显示奖项和名称，超过两项折叠为 +N）、「在项目库查看 N 个」 |

- 「在项目库查看」会切换到项目库，并聚焦该平台区（v5 的区域聚焦）。
- 只有 finalist、获奖还没公布时，如实显示「获奖待公布」。
- 官方没有写明提交日期时，显示「官方未写明 · 待确认」，不推算日期（例如 Google Solution Challenge 2026 India）。
- 线下赛的提交日期写成「提交 11月7日（活动 5–7日）」，同时列出活动期。
- 筛选：全部 / 追踪中 / 已有结果。排序：追踪中按截止时间，已有结果按最新在前。

## 数据来源与诚实性

- 绿色卡片来自本地 grok 导入 `data/data_storage/raw_imports/grok/2026-11-07_08/lydia-import-2026-11-07_08.json` 的 `event_and_date_evidence` 和 `status`：ETHGlobal Mumbai 2026（5 个 finalist）、ETHGlobal Tokyo 2026（3 个）、Hackster Arduino UNO Q（6 个获奖）、GSC 2026 India（1 个）。
- 目前资料库里没有「尚未出结果」的赛事，所以三张黄色卡片是**标有「示例」的占位**，赛事名称和日期都不是真实数据。

## 若确认实施（需要的后端字段）

目前 grok 只导入作品，不导入赛事。要实现这个功能，需要新增一个赛事记录（例如 `library/hackathon_events/`），并让 grok 的提示词输出：

`event_id, platform, name, url, submission_deadline（含时区）或 deadline_unknown, event_start/end, results_published_at?, discovered_at, last_checked_at`

状态由系统推导，不交给 grok 填写：
- 有关联的 finalist 或 winner 作品 → 绿色。
- 否则，当前时间早于截止时间 → 提交中；晚于截止时间 → 等待结果。

作品与赛事通过 `event_id` 关联，第一个关联作品进入资料库时，卡片自动变绿，并产生一条「新结果」。

前端改动：在 `KnowledgeWorkspace.jsx` 侧栏新增按钮和面板组件，样式加入 `knowledge.css`（黄、绿两套 token，深色和白天各一套）；手机端在项目库顶栏加一个入口，打开底部面板。
