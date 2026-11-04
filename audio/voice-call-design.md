# 专家按轮语音通话 · 实施设计与能力表

依据：[business/docs/prompts/2026-11-04-expert-voice-call-prompt.md](../business/docs/prompts/2026-11-04-expert-voice-call-prompt.md) v1.2。
日期：2026-11-05。本文记录实际检测结果和实现边界，不代表语音闭环已经通过验收。

## 1. 本机能力（2026-11-05 实测检测）

| 项目 | 检测结果 | 状态 | 处理位置 / 说明 |
| --- | --- | --- | --- |
| Chrome | 147.0.7727.138 | 已检测到 | 提供 `webkitSpeechRecognition` 与 `speechSynthesis`；Chrome 识别通常将音频发送到 Google 服务（云端，免费但非离线） |
| Edge | 156.0.4314.58 | 已检测到 | 提供 `SpeechRecognition`，识别通常走微软在线服务（云端）；另有 “Online (Natural)” 在线音色 |
| Windows 本地音色 | Huihui / Kangkang / Yaoyao（zh-CN），David / Zira / Mark（en-US），Hazel / George / Susan（en-GB） | 已检测到 | 本机 OneCore/SAPI，浏览器 `speechSynthesis` 中通常标记 `localService=true` |
| Windows 本地识别 | SAPI 桌面识别器 zh-CN、en-US、en-GB、zh-TW | 已检测到，**未接入** | 离线，但需要 WAV PCM 输入；准确率未实测，列为后续候选 |
| whisper / whisper.cpp / 模型 | 未找到 | 待配置 | 未擅自下载 |
| ffmpeg | 未找到 | 待配置 | 无音频转码工具，所以第一版不走后端音频上传 |
| 麦克风 | Realtek 麦克风阵列、NVIDIA Broadcast | 已检测到设备 | 设备存在不等于浏览器权限或识别可用 |
| Claude CLI | `claude.exe` 已安装 | 已检测到 | 推理仍走原有订阅与串行调度 |
| 真实语音识别 / 朗读 / 专家生成 | — | **未实测** | 需要用户本人在电脑上说话、听朗读；会消耗订阅额度，没有用户确认不自动执行 |

## 2. 第一版采用的组合

* **STT**：浏览器 Web Speech `SpeechRecognition`（Chrome / Edge）。不新增付费服务，但**音频由浏览器厂商的在线服务处理**，界面会说明“可能需要联网”。如果浏览器暴露 `SpeechRecognition.available({processLocally:true})`，界面只报告检测结果，不声称离线。浏览器不支持时界面显示“当前未配置可用的语音识别”，保留文字输入。
* **TTS**：浏览器 `speechSynthesis`，优先选择 `localService=true` 的本机音色（Windows 已有 zh-CN / en-US 音色）。没有合适音色时只显示文字。
* **推理**：新增专用 dialogue 路径（`agents/dialogue.ts`），复用 `Skills`、`retrieve`、PROJECT 上下文、`checkEvidence`、`reviewCitations` 与 `ClaudeCLI` 串行调度；不跑五步研究流程，也不另开 CLI 实例。
* **传输**：普通 HTTP + 轮询（202 + 轮次 ID）。不需要 WebSocket，CSP 不变。

## 3. 主要等待点

1. 浏览器识别出最终文字：通常 1 秒以内，取决于网络和厂商服务（未实测）。
2. **共享 CLI 排队**：研究任务正在调用 CLI 时，通话轮次会显示“排队”，可以取消，不会抢占或取消研究任务。
3. **Claude CLI 生成**：非流式，每轮需要启动进程、检查认证、生成完整 JSON；预计需要数秒到几十秒（未实测）。这是最主要的等待。
4. 若回答带来源支持的主张，会再调用一次引用复核，因此等待时间会更长。
5. 浏览器开始朗读：本机音色通常很快（未实测）。

## 4. 架构

```text
浏览器（CallCard）                               后端                                    CLI
麦克风 ─► SpeechRecognition（厂商服务）
         ─► 临时/最终文字 ─► 可编辑字幕
用户点“发送” ─► POST /api/cases/:c/calls/:k/turns ─► call_turns(QUEUED) ─► Dialogue.run
         ◄── 202 {turn}                                                     ├─ Skills.load(role)
轮询 GET …/turns/:t ◄── QUEUED / THINKING / COMPLETED                       ├─ METHOD / MARKET / PROJECT 检索
                                                                            ├─ ClaudeCLI.run（共享串行）──► claude -p
                                                                            └─ Zod + 证据校验 + 引用复核
speechSynthesis.speak(spoken_text) ─► POST …/turns/:t/playback（实际播放结果）
```

* 数据：迁移 `data/database/migrations/006-voice-calls.sql` 新增 `call_sessions` / `call_turns`（只新增表，兼容旧库）；访问封装在 `data/database/calls.ts`。
* API：`backend/calls.ts`，路由挂在 `/api/cases/:caseId/calls/...` 下，每次都校验 call 属于该 case、turn 属于该 call；所有 mutation 继续要求同源和 CSRF。
* 角色白名单：`steve | teresa | april | bob | ash`；controller 不可拨打。
* 半双工：同一通话同一时间只允许一个 QUEUED/THINKING 轮次；`request_key` 保证幂等。
* 取消：每轮有自己的 AbortController；CLI 排队可中途放弃，且不影响后面的队列；迟到结果按状态条件写入，被丢弃。
* 重启：服务启动时，把未完成的轮次标记为 `FAILED/INTERRUPTED`，不自动重跑，也不重复消耗额度。
* 原始音频：浏览器识别模式下应用拿不到也不保存原始音频，只提交最终文字和 provider / 语言元数据。

## 5. 证据边界

* METHOD：方法依据；MARKET：唯一可以作为市场证据的来源；PROJECT：背景和约束（列出采用/未纳入的文档）；通话历史：`HISTORY_NOT_EVIDENCE`；用户口述：`USER_REPORTED`。
* 每条主张都必须使用本轮读取的 MARKET `source_id`；`SOURCE_SUPPORTED` 必须有证据，并通过引用复核。
* `proposed_actions` 只显示为候选，不会自动选择 Gap、启动研究或建模。

## 6. 回退

删除 `backend/calls.ts` 的挂载代码和前端电话入口后即可停用。新表不被其他模块引用，保留在库中不会影响原有功能。
