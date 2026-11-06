# ElevenLabs → Lydia 专家声音接入

日期：2026-11-05（Asia/Kuala_Lumpur）。结论：**适合替换 Lydia 的朗读声音；保留 Claude CLI 讨论与当前 STT。** 代码已经接入，真实 ElevenLabs 声音需配置用户自己的 API Key 后验证。

## 调查结论与来源

你提供的 `https://elevenlabs.io/app/create-voice/instant` 对应 Instant Voice Cloning。官方说明它用于从声样本创建音色；创建好的音色留在 ElevenLabs 账户中，可以通过 API 调用，不能导出为本地声音模型。[官方 Instant Voice Cloning 文档](https://elevenlabs.io/docs/eleven-creative/voices/voice-cloning/instant-voice-cloning)

Lydia 接入的是 [Text-to-Speech streaming API](https://elevenlabs.io/docs/api-reference/text-to-speech/stream)，不是 ElevenAgents 的回答模型。官方协议为 `POST /v1/text-to-speech/{voice_id}/stream`，使用 `xi-api-key`，返回音频流。音色来自账户的 [GET /v2/voices](https://elevenlabs.io/docs/api-reference/voices/search)，包含分页；没有写死示例音色 ID。

本版提供 Flash v2.5 与 Multilingual v2 两个模型选项。前者官方定位为实时应用，支持中文和英语；厂商公布的延迟不包含你的应用和网络，不能当作本项目实测。[官方模型列表](https://elevenlabs.io/docs/overview/models)

它能改善声音自然度与音色选择。Claude CLI 的生成等待、对话记忆与专家判断仍由 Lydia 负责，更换 TTS 不会自动消除这些等待。

## REA 实际做了什么

使用缓存中的 REA 6.4.0，在独立、未登录的 Chrome 147 观察环境中执行：

1. `list-browser-targets`，选择提供的站点。
2. `inspect-web-page`，保留 DOM/无障碍/资源和结构化网络形状证据。
3. `analyze-web-bundle`，静态分析可观察到的 201 个脚本；无源代码执行、无 source-map 主动抓取。
4. `capture-web-screenshot`，保存实际可见页面截图。

实际路由跳转到 `https://elevenlabs.io/app/sign-in?redirect=%2Fapp%2Fcreate-voice%2Finstant`。因此 **没有观察到登录后的克隆操作**，也没有观察到真实合成请求。静态路由/端点字符串只是候选，不证明服务调用成功；后端声音模型不在前端分析覆盖范围内。

证据：[REA 摘要与哈希](evidence/rea-summary.json)、[页面证据](evidence/rea-page.json)、[脚本分析](evidence/rea-bundle.json)、[截图](evidence/instant-voice-page.png)。本次未登录、未上传声样本、未创建克隆、未创建账户、未购买套餐。独立观察浏览器已关闭。

## 在 Lydia 使用

1. 打开 `http://127.0.0.1:4318`，登录后进入 **Settings → 语音**。
2. 在 [ElevenLabs API Keys](https://elevenlabs.io/app/settings/api-keys) 创建或选择自己的 Key；需要 Text to Speech 与 Voices 读取权限。账户可用音色与套餐权限由 ElevenLabs 决定。
3. 在 Lydia 的密码输入框填写 Key，点击 **保存 Key 并读取音色**。不要把 Key 发到聊天里。
4. 选择默认音色；可为 Steve、Teresa、April、Bob、Ash 分别指定不同音色。已有的授权克隆音色也可使用。
5. 点击 **试听所选音色（使用额度）**。确认音色后选择 ElevenLabs 服务，再点击 **保存语音设置**。
6. 打开通话并接通。通话卡片内也可切换已配置的服务与音色；Claude CLI 和项目上下文保持原工作流。

默认服务仍是浏览器/Windows 朗读。没有 Key 时 ElevenLabs 不启用；错误时保留文字和手动切回浏览器的入口，不自动再次调用计费合成。

## 费用和数据位置

合成与试听会使用你账户的额度，具体价格、套餐、音色 API 权限以 [ElevenLabs API Pricing](https://elevenlabs.io/pricing/api) 与账户为准，不声明永久免费。Voice Library 的 API 权限在免费层有限制。[官方 Voices 说明](https://elevenlabs.io/docs/overview/capabilities/voices)

朗读文字发往 ElevenLabs 云端；收到的 MP3 通过 Lydia 后端返回。麦克风仍使用当前浏览器识别方案，不因本次接入额外上传录音给 ElevenLabs。未启用企业零保留参数，也不声称云服务零保留。

API Key 只由后端使用，依据 [官方认证要求](https://elevenlabs.io/docs/api-reference/authentication) 放在 `xi-api-key` 请求头。UI 保存时使用 AES-256-GCM 加密到已有私有数据库，解密主密钥在 `business/.runtime/voice-secrets/master.key`；两者都不公开服务、不写入源码或导出报告。具有本机文件访问权限的人仍能接触主密钥，这不等于硬件或操作系统凭据库保护。

也可用后端环境变量 `ELEVENLABS_API_KEY`，它优先于 UI 保存的 Key。此时界面显示环境变量来源，不提供删除环境变量的按钮。可给服务商 Key 设置额度上限。

## 实现位置

| 文件 | 职责 |
| --- | --- |
| `business/backend/voice-tts.ts` | 配置、加密凭据、账户音色、固定文本试听、已校验回答的流式代理、错误与取消 |
| `business/backend/server.ts` | 既有鉴权/CSRF、同源路由、媒体 CSP、退出和挂断清理 |
| `business/frontend/src/remote-voice.js` | MP3 流式播放；MediaSource 不支持时完整缓冲；打断中止 fetch/播放并释放 URL |
| `business/frontend/src/components/VoiceSettings.jsx` | Key、服务、模型、默认/专家音色、试听 |
| `business/frontend/src/components/CallCard.jsx`、`call-session.js` | 通话服务与音色选择、问候、播放记录及语音打断 |
| `business/tests/voice-tts.test.ts` | 后端边界测试，使用本地服务替身 |
| `business/scripts/call-browser-test.ts` | 浏览器设置、持久化、试听和云语音打断测试，使用假媒体与提供商替身 |

音频只保存在短期内存中，不保存 MP3 文件。服务端只对已完成且通过校验的当前通话回答生成音频；试听与问候是固定文本。跨项目、未完成或已挂断的回答不允许生成语音。

## 验收边界

见 [验收记录](validation.json)。本地模拟服务可以验证路由、保密、状态与取消，不能证明 ElevenLabs 声音质量、真实额度权限或实际网络延迟。实际合成与中文/英文听感仍待用户配置 Key 后测试；没有使用你的真实 Key，也没有生成或克隆任何真人声音。
