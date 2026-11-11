# conclusion

把 Lydia（business_agent）从 2026-11-03 到 2026-11-11 的全部做法整理成一个 Claude Code skill：`lydia-playbook/`。

来源：12 个 Claude Code 会话的聊天和执行记录（`C:\Users\User\.claude\projects\c--maven-business-agent\*.jsonl`）、Claude 的 memory、`business/docs`、`data/docs`、`pic/` 设计稿，以及代码本身。

## 里面有什么

```text
lydia-playbook/
├─ SKILL.md                     入口：底线、任务分类、标准循环、汇报格式、文件索引
├─ references/
│  ├─ working-agreement.md      和你一起工作的约定（你的原话和原因）
│  ├─ architecture.md           项目地图：目录、技术栈、模块、端口
│  ├─ design-first.md           界面改动先进 pic/ 的完整流程
│  ├─ deploy-ops.md             部署步骤、手机接入、排障对照表
│  ├─ data-pipeline.md          Grok/Drive 导入、每天 10:00 任务、365 天清理
│  ├─ ai-evidence.md            Claude CLI 调用、模型分档、研究流程、原文核对
│  ├─ testing.md                测试和验收用语
│  ├─ windows-pitfalls.md       踩过的 Windows/工具坑
│  └─ decision-log.md           按日期的决定，以及还没收尾的事
├─ assets/
│  ├─ design-render-template.mjs  设计稿截图/录屏脚本模板（已在真实应用上跑通）
│  ├─ design-readme-template.md
│  └─ report-template.md
└─ scripts/
   ├─ lydia-status.ps1          只读健康检查（服务、端口、Tailscale、线上版本、CLI、备份、导入）
   └─ extract-transcripts.js    从新的聊天记录里提取你的原话，用来更新这份 skill
```

## 怎么让 Claude Code 自动用上

Claude Code 只会在 `~/.claude/skills/` 或项目的 `.claude/skills/` 里找 skill。已经建了一个目录联接，指向这里，所以在这里改的内容会立刻生效：

```powershell
# 查看
Get-Item C:\Users\User\.claude\skills\lydia-playbook | Select-Object FullName,LinkType,Target
# 取消（只删联接，不删这里的文件）
cmd /c rmdir C:\Users\User\.claude\skills\lydia-playbook
# 重新建立
New-Item -ItemType Junction -Path C:\Users\User\.claude\skills\lydia-playbook -Target C:\maven\business_agent\conclusion\lydia-playbook
```

也可以在对话里直接说"用 lydia-playbook"。

## 注意

- 这个文件夹在 git 仓库里，而 GitHub 上的 `Lydia_bot` 是公开仓库。skill 里没写邮箱、密钥、Drive 文件夹 ID 和具体的 Tailscale 主机名，但写了项目的内部做法。要不要提交，由你决定。
- 以后有新的规矩（比如"以后都……"），让 Claude 按 `SKILL.md` 最后一节"维护这份 skill"更新。
