---
name: lydia-project-playbook
description: 在 business_agent／Lydia 项目中延续开发、排障、研究、数据导入与同步、爬虫、知识库、语音及本机运维时使用。包含从项目源码、Codex 与 Claude 聊天和执行记录提炼的工作流程、用户决定、证据边界及验证入口。适用于该项目及明确要求复用其做法的任务。
---

# Lydia 项目永久工作手册

这是项目知识与操作 skill，整理日期为 2026-11-11（Asia/Kuala_Lumpur）。永久保存的是流程与决策；账号状态、端口、数据量、模型可用性和部署状态都必须在执行时重新确认。不要因历史任务曾获授权，就擅自重复导入、删除、发布或推送。

## 开始工作

1. 项目根默认 `C:/maven/business_agent`。先读当前任务相关代码、`git status --short` 及适用的 `AGENTS.md`，保留已有未提交工作。历史 `Hackathon_map`、`business/app`、`business/data` 路径只作溯源。
2. 先判断用户要普通对话、研究、数据维护、界面设计还是排障。按下表加载必要参考，避免把完整历史、五位专家研究全文或第三方 bundle 塞满上下文。
3. 对冲突信息，分别核对最新用户决定、现有代码、带时间的实际报告。计划不证明执行成功，代码不证明线上已更新；需要时只读核对服务和报告。
4. 沿用单后端、唯一数据库和原有 React 界面。按职责放文件，真实资料只放 `data/data_storage`。Windows 优先 `npm.cmd`，不为了执行 npm 改全局执行策略。
5. 完成后说明改动、验证范围、实际产物和仍未完成部分。使用 GENERATED / LOADED / CONNECTED / TEST_PASSED / NOT_RUN / BLOCKED 等准确状态，保留首次失败和修订记录。

## 按任务加载

| 任务 | 参考 |
| --- | --- |
| 目录、技术栈、入口、迁移 | [architecture.md](references/architecture.md) |
| 五种专家方法、RAG、市场证据、研究状态 | [research-and-rag.md](references/research-and-rag.md) |
| JSON、备份、Drive、每日同步、365 天保留 | [data-lifecycle.md](references/data-lifecycle.md) |
| Hackathon / X 采集、资源、奖项、RAG 投影 | [crawl.md](references/crawl.md) |
| 预览、双主题、书库、拖放、简介、深入解读 | [frontend-and-knowledge.md](references/frontend-and-knowledge.md) |
| 持续通话、TTS、Claude 结构化输出和延迟 | [voice-and-cli.md](references/voice-and-cli.md) |
| 启动、Tailscale、免密码、Obsidian、故障定位 | [operations.md](references/operations.md) |
| 测试命令、证据等级、交接、回归范围 | [verification.md](references/verification.md) |
| 用户长期偏好、关键修正、成功与失败案例 | [decisions-and-lessons.md](references/decisions-and-lessons.md) |
| 找原文、聊天与工具执行记录、更新本 skill | [provenance.md](references/provenance.md) 和 [source-index.json](references/source-index.json) |

## 不变的项目约束

- Lydia 是本人电脑／手机使用的商业研究助手。Steve 是主要交流窗口，其他角色按研究阶段协作；这些是公开方法的 AI 角色，不是专家本人参与或背书。
- 推理沿用本人已登录的 Claude CLI 订阅，不默默切换 Anthropic API 或开额外计费。当前订阅与型号以官方认证和项目 adapter 为准，不固定为旧 Pro 套餐。
- 普通聊天默认直接回答；只有用户打开「完整研究」才启动流程。开关发送后保持、刷新后记忆。商业模式必须已有明确选择的 Gap ID。
- 原始作品、媒体新闻、用户构想、AI 推断、市场证据和用户决定分开。获奖不等于有需求，引用字面匹配不等于事实已证实；允许零缺口／零 idea。
- PGlite 只能单进程打开。运行中通过 API；维护需停写、完整备份、哈希比对与隔离恢复检查后独占操作。不能为预览另开正式库。
- 新增 schema 用只增不改的校验和迁移。导入冲突保留现状；外部摘要不冒充全文、不进入需要原文的 Idea 分析。
- 新视觉方向依用户明确要求先在 `pic` 预览、确认再落地；已确认方案和明确授权的修复直接推进，不重问相同许可。

## 直接使用

把本文件及 `references` 一起保留。其他会话可明确请求：

> 读取 C:/maven/business_agent/conclusion/lydia-project-playbook/SKILL.md，按需读取参考，继续处理 Lydia 的当前任务。

此文件本身持久保存在指定目录；仅放在 `conclusion` 不代表运行平台已自动注册 `$lydia-project-playbook`。原生自动发现需要目标平台的 skill 目录安装／链接；不要声称已经注册，也不要把本 skill 当成应用加载的六份专家技能。
