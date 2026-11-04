# 候选工具与来源能力评估

日期：2026-11-04。四个候选工具的评估级别为**本地文档/包声明检查**，未安装或启动这些工具。后续已使用 Node HTTP 完成两站样本和十站入口审核；最新结果见 [真实报告](../reports/LATEST_LIVE_REPORT.md)，下文来源矩阵保留设计时状态。以下版本来自本地源码，不表示线上最新版本。

| 候选 | 实际找到的资料 | 本地版本/前提 | 用途与决定 | 未验证/回退 |
| --- | --- | --- | --- | --- |
| Agent-Reach | `../scrap/Agent-Reach/README.md`、`agent_reach/skill/SKILL.md`、`pyproject.toml` | 1.5.0；Python >=3.10；按 channel 需要 CLI、API 或登录态 | 可辅助官方入口发现、GitHub/字幕资源定位；不作为十站枚举核心 | 未运行路由、凭证和各平台；回退官方导航/直接公开请求 |
| browser-use | `../scrap/browser-use/README.md`、`skills/browser-use/SKILL.md`、`pyproject.toml` | 0.13.13；Python >=3.11,<4；Agent/云路径的模型和凭证依赖按配置确认 | 仅建议复杂交互勘察；把观察结果固化为适配器 | 未安装、未启动浏览器、未验证模型；回退 Playwright 确定性步骤 |
| Crawl4AI | `../scrap/crawl4ai/README.md`、`pyproject.toml`；版本声明转向源码 | Python >=3.10；本地浏览器环境需安装；本地库与云路径分开 | 可选 Python 获取/Markdown 后端；首版 TS 不将其列为强制依赖 | 未运行提取、未核对实际 runtime 版本；回退 TS HTTP/Playwright |
| REA | `../rea/README_zh.md`、`package.json` | rea-agents 6.4.0；Node ^22.19.0 或 ^24.11.0 或 >=26；native 能力前提各异 | 文档明确为二进制/应用/运行时逆向 MCP；本任务无需引入，不因名称猜成网页爬虫框架 | 未启动 MCP/native 工具；公开交互分析用浏览器网络观察 |

用户 prompt 第 25 节中的建议作为候选评估材料处理，没有据此执行本地 skill 内的更新、安装、联网或登录指令。本次真正应用的流程技能为 brainstorming；writing-plans 已预读，需设计确认后才编写实现计划。未调用上述四个工具进行采集，不声称“已接入”。

## 来源状态（初始设计快照）

当前能力以 [最新扩展矩阵](../reports/EXPANSION_REPORT.md) 为准，下表仅保留最初勘察状态。

| 来源 | 入口线索 | 当前状态 |
| --- | --- | --- |
| Devfolio | https://devfolio.co/ | 未勘察/未实现 |
| TAIKAI | https://taikai.network/en/hackathons | 未勘察/未实现 |
| DoraHacks | https://dorahacks.io/ | 未勘察/未实现 |
| ETHGlobal | https://ethglobal.com/showcase | 网页工具可读项目列表；未完成访问规则、原始获取与分页核查；未实现 |
| HackQuest | https://www.hackquest.io/projects | 未勘察/未实现 |
| Hackster.io | https://www.hackster.io/contests | 未勘察/未实现 |
| NASA Space Apps | https://www.spaceappschallenge.org/ | 未勘察/未实现 |
| Imagine Cup | https://imaginecup.microsoft.com/ | 未勘察/未实现 |
| Junction | https://www.hackjunction.com/ | 未勘察/未实现 |
| Google Solution Challenge | https://developers.google.com/ | 未定位年度入口/未实现 |

未找到、受阻、没有公开入口和确认不存在必须分开；当前没有证据将任何来源标为“全量支持”或“确认不存在”。正式 source audit 还需逐站记录实际入口/跳转、核查时间、2025/2026、访问规则、分页、原始快照、代表模板、奖项证据、样本量和覆盖边界。
