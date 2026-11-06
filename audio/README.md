# audio：专家语音通话的交付资料

这里存放语音通话功能的文档、验收结果和开发技能。可运行的代码仍放在 `business/` 和 `data/`，因为应用从 business 启动，前端构建、tsconfig 和数据库迁移都只从那些目录加载。

| 路径 | 内容 |
| --- | --- |
| [voice-call-design.md](voice-call-design.md) | 实施设计、本机能力表、架构与时序、证据边界、回退方式 |
| [acceptance-report.md](acceptance-report.md) | 五项验收状态（界面 / 文字对话 / 电脑语音 / 持续通话 / 手机）、测试结果、费用、未完成项 |
| [results/](results/) | 自动化测试输出：截图、`call-browser-evaluation.json`、`unit-tests.txt`（由 `business/scripts/call-browser-test.ts` 写入） |
| [skill/lydia-voice-validation/](skill/lydia-voice-validation/SKILL.md) | 开发用验收技能（§13.4 规格），与 `business/skills/` 的专家技能分开 |

技能放在这里不会被 Claude Code 自动发现。如需自动触发，可以把 `skill/lydia-voice-validation` 复制或链接到 `.claude/skills/`。

## ElevenLabs 语音接入

[调查、REA 证据、设置与验收](elevenlabs/README.md)。可选替换朗读声音，保留 Claude CLI 与现有识别；需要用户自己的 API Key 和账户额度，默认仍使用浏览器声音。
