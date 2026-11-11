# 来源、覆盖范围与维护

本 skill 是原始记录与当前代码的知识提炼，不是仓库备份、原始聊天全集或完整操作审计的替代品。整理日期 2026-11-11，原始 UTC 时间在查看用户日期时转换为 Asia/Kuala_Lumpur（UTC+8）。

## 本次读取范围

- Codex：`C:/Users/User/.codex/sessions` 中元数据 cwd 属于 business_agent 或旧 Hackathon_map 的 11 条主会话，10 条历史会话及本次整理。原始 response_item.message 的 user 消息与 assistant 最终回复，以及 function_call/custom_tool_call 与返回结构用于区分授权、执行与结果。
- 另对含 business_agent 的会话做路径检索，识别一条 assignment/humanize 跨项目误命中并排除。
- Claude：`C:/Users/User/.claude/projects/c--maven-business-agent` 中有用户文本的 12 条顶层会话，包括最新 11-09 至 11-11 的 UI、Drive、时效性、CLI、远程访问决定。排除工具返回、系统／skill 注入、图片尺寸提示、后台通知和续接摘要作为直接用户决定。
- 项目：模块 README、设计／计划／验收、业务方法协议与评估、当前关键源码与 package scripts。`source-index.json` 保存文件路径／大小／SHA256 和会话元数据／计数，不复制凭据或整份私人对话。

没有声称逐条重放所有工具、读取所有几十 MB REA bundle、看完每张图／影音或重新验收整套应用。嵌套子会话、已删除聊天、其他平台未落盘历史可能不在本次范围；执行结果细节需按索引返回原始日志核实。当前 skill 的静态验证也不等于重新完成应用测试。

## 聊天与执行记录的检索方式

先用 source-index 的会话 ID／路径／时间缩小范围，再读相关消息，避免全库 rg 输出泄露无关私人内容。

Codex JSONL：首行 session_meta 含 cwd／id／timestamp；response_item.message 含 role 和 content 文本块；事件 user_message 在新版会话可能存在、历史导入会话可能没有。工具记录为 response_item 的 function_call／custom_tool_call 及对应 output，用 call_id 关联；不能只数「提到执行」就说已运行。

Claude JSONL：顶层 type=user／assistant，message.content 可以是字符串或文本／tool_use／tool_result 数组。用户消息内也会有 IDE 文件提示、技能注入、图片元数据、通知或续接摘要，不能全当用户指令。工具 ID／tool_use_id 关联请求与结果；查 exit code／错误和产物，不保存账号敏感输出。

开发会话位于 `c--maven-business-agent`，`.runtime-claude` 等目录多是应用调用记录。按任务需要只读具体请求，不把模型输出当用户许可。项目目录中 `.runtime`、reports、test-results、pic 下的 render／pipeline 日志提供另一层证据。

## 追溯主题

| 主题 | 优先来源 |
| --- | --- |
| 最初专家蒸馏、RAG、迁移、费用路线 | Codex 01a19d3f；business/expert-team 与 skills |
| 根 data 决定、语音设计 | Codex 01a1a4fe；data/DATA_AUDIT_AND_SOLUTIONS.md、audio |
| 爬虫、Grok REA、原前端复用 | Codex 01a1a618；crawl/docs/reports、bot_rea |
| 持续通话、ElevenLabs、双主题手机设计 | Codex 01a1a97d、01a1ac38；audio 与 pic/mobile-* |
| X、案例调查、样本限制 | Codex 01a1b03d；crawl/docs/TWITTER_* |
| 知识库、IdeaLab、新闻混合、Obsidian | Codex 01a1b6eb；pic/hackathon-idea-lab-* |
| Tailscale、52 条导入、Drive 手动前置 | Codex 01a1ba4d；data/docs、business/docs/FILE_IMPORT.md |
| 每日 10 点、赛事、聊天开关、模型与 UI | Claude 68cdc79e、cc01bd3c；CLI／frontend／daily 源码 |
| 所有项目简介、书飞来本地搜索 | Claude 79e8888a；pic/project-brief 与 magic-search |
| 深入解读、365 天、27 条回补、免密码、schema | Claude a74bebc3；retention、parse、auth、deep-dive 源码 |
| 本次 skill 整理 | Codex 01a1ca34；另一 Claude 62d077db 是同一请求的并行会话，不作为此前项目方法证据 |

完整 ID／路径与可用的消息定位行见 source-index。它记录本次索引时的快照；增长中的 JSONL 仍会继续追加。

## 如何更新

完成真实任务后，只把可复用的新决定、实际故障原因与验证方法补进对应参考，不复制整段对话或把一次授权写为永久许可。区分计划、代码、线上和真实行为；有冲突标明新旧日期并回链来源。

更新受影响源码／文档的索引哈希；未重查的来源保留旧快照时间，不伪装成整库已重新核实。维护本 skill 不应触发数据库、联网研究、服务重启或发布。保留这个目录即可长期显式读取；注册到任意 runtime 的自动发现状态另核实。
