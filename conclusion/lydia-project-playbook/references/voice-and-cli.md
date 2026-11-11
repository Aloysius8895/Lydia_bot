# Claude CLI、持续通话与语音

## CLI adapter 的契约

`business/agents/providers/claude.ts` 通过参数数组 spawn、shell:false、stdin 传 prompt，工作目录为 `.runtime/claude`。应用明确注入已读方法和资料；禁外部工具／MCP／hook，不让模型操作项目。chat／dialogue 仅开放内部 StructuredOutput 返回工具，它不是 shell 或外部动作。

子进程 subscriptionEnv 去除 API／OAuth override 及相关 SDK 变量，沿用本人已登录的 firstParty claude.ai 订阅；不读取原始 token。auth status 只取已登录、方式、provider、subscriptionType，不能把旧 Pro 写死，用户后来已提及 Max。应用要求额外用量关闭确认，额度不足暂停而不切 API。

适配参数包括 json output、json-schema、no-session-persistence、project setting sources、strict empty MCP 和禁 hook；保留当前实现的明确边界，不为解决输出问题开放全部工具。

## 实际踩过的结构化输出故障

Zod 输出的 Draft 2020-12 `$schema` 声明导致已用 CLI 版本静默不注册 StructuredOutput 或直接退出。所有 profile 都应在传输 schema 副本上去掉 `$schema`，保留字段约束并在本地 Zod 重新验证。只在 chat 去掉会造成完整研究仍第一步失败；不能把它误判为 Opus、网络或证据不足。

优先读取 structured_output；兼容整段 JSON 或完整 JSON 围栏。不从自然语言里捞一个花括号片段冒充合法结果。检查 exit code、type/subtype、is_error，分类 quota/auth/update/timeout，而不是只凭 stdout 有文本就成功。stderr 可能带账号信息，不原样写报告。

CLI 调用全局串行，取消等待不提前释放前一任务槽位，取消执行终止子进程树且持久状态不可复活。当前超时最多 300000ms、输出上限 2MiB，参数以代码为准。记录 auth_ms 与 generation_ms，别只靠增加 timeout 掩盖错误。

型号与 effort 从 CLI_TIERS／USER_MODELS 及环境 override 读取；代码目前使用完整型号 ID 以避免旧 alias 映射。这里是项目配置快照，不是对这些型号当前公开可用性的保证。真实可用性通过当前官方 CLI 验证，不凭历史成功承诺。

## 持续通话链路

浏览器识别语音 → 应用保存／提交文本 → Claude dialogue → 回复字幕 → browser speechSynthesis 或可选 ElevenLabs TTS → 自动恢复倾听。用户想要持续一对一专家聊天，换声音不能替换其 Claude 推理后端。

需维护明确状态：识别、倾听、提交、生成、播放、打断、静音、结束及错误。端点检测后自动提交，避免每句点按钮；识别有限重试。用户插话停止旧播放／生成，最新意图替换；旧回包、重复 transcript 不得再次朗读或入库。播放中避免把自身 TTS 当用户话；结束清理音频、识别、请求与计时器。

沿用 case／专家上下文和已有通话历史。通话回答短、自然、低 effort，字幕复用，不每轮重复自我介绍或把每句升级成五专家流程。长通话需要保留实际历史与取消恢复，不能只演示一轮。

## ElevenLabs 只是可选声音提供器

真实 key 由用户在设置输入，后端保护凭据、列音色、试听和代理流；前端／日志／导出不含 key。没有配置时默认浏览器声音。账户额度与真实合成需独立验收，mock 响应不等于付费服务已连接。音色克隆或新增收费操作不能从「换声音」推断授权。

## 验收方式

分别报告 UI、文字对话、电脑音频、持续通话、真手机。自动测试可验证状态机、拒绝非法请求、打断／重试／重复语音、字幕与播放，但真实麦克风、听感、延迟和 10 分钟稳定性需实际设备。过去两轮 CLI 约 7.7／7.6 秒不是完整端到端语音延迟保证。

先分解识别结束、队列等待、auth、generation、TTS 首包、播放时间；排除排队／结构化失败／模型不支持，再调整 effort、上下文和声音。不要用户说「慢」就默认需要买另一套推理 API。

来源：`audio/voice-call-design.md`、`audio/acceptance-report.md`、`audio/elevenlabs/README.md`、`audio/skill/lydia-voice-validation/SKILL.md`、`business/backend/{calls,voice-tts}.ts`、`business/agents/dialogue.ts`、`business/frontend/src/call-session.js`、`business/docs/prompts`。
