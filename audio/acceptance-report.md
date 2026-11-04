# 专家按轮语音通话 · 第一阶段交付与验收状态

日期：2026-11-05。需求：`business/docs/prompts/2026-11-04-expert-voice-call-prompt.md` v1.2。设计与本机能力表：[voice-call-design.md](voice-call-design.md)。

**结论：现在还不能称为“此电脑上第一版按轮语音通话可用”。** 代码已经完成，自动化测试（mock）全部通过，但真实麦克风 → 真实识别 → 真实专家生成 → 可听朗读这条链路还没有运行。

## 四项验收（分开报告）

| 验收项 | 状态 | 证据 | 限制 / 下一步 |
| --- | --- | --- | --- |
| 通话界面 | **通过（自动化）** | `results/call-desktop-connected.png`、`results/call-mobile-connected.png`、`results/call-no-recognition.png`、`results/call-browser-evaluation.json` | Chrome headless 测试使用假识别、假朗读和 Chrome 假媒体设备；还需要你用肉眼确认一次 |
| 指定专家文字对话 | **通过（自动化，CLI 为 stub）** | `business/tests/calls.test.ts` 9 项、`results/unit-tests.txt` | 尚未进行真实 Claude CLI 生成（会消耗订阅额度，需要你确认后再执行） |
| 电脑语音闭环 | **未运行** | — | 需要你在 Chrome/Edge 中真实说话并听朗读；见下方“如何实测” |
| 手机通话 | **未运行** | — | 需要真机、受信任 HTTPS（`npm.cmd run start:lan`）、权限和挂断释放测试；390px 视口模拟不能代替 |

## 已执行的命令（business 根目录）

| 命令 | 结果 |
| --- | --- |
| `npm.cmd run check` | 通过（tsc 无错误） |
| `npm.cmd test` | 64/64 通过，其中新增 9 项 calls 测试；`crawl.test.ts` 的迁移数量断言从 5 更新为 6，并检查 `006-voice-calls.sql` |
| `npm.cmd run build:frontend` | 通过 |
| `npm.cmd run test:browser` | 原有浏览器测试 + 新增通话浏览器测试均为 `TEST_PASSED`，无页面错误或控制台错误 |
| 迁移兼容 | 在现有 `.runtime/data` 的**副本**上执行，001–006 全部应用；原数据库未改动 |

## 自动化测试覆盖（mock，不是真实语音）

* 电话按钮位于“项目选择 / 需求研究 / 阶段标签”同一行的最右侧；桌面三栏 27% / 42% / 31% 在 1388、1440、1920 宽度下不变，专家列表保持展开。
* 未接通时不显示计时；接通后才开始计时。
* 开始说话 → 结束本轮 → 可编辑字幕 → 必须由用户按“发送”才会提交。
* 拨给 Teresa 时只加载 `teresa-torres-opportunity` 技能，存储角色也是 teresa；其他四位与 controller 都不加载。
* PROJECT 约束会进入上下文；但把 P 编号、伪造的 E 编号、或无证据的 SOURCE_SUPPORTED 当证据时，本轮判为 FAILED；引用复核判 UNSUPPORTED（例如扩大到“所有马来西亚诊所”）时也判为 FAILED。
* 通话历史标记为 USER_REPORTED / HISTORY_NOT_EVIDENCE；失败的轮次不会作为历史回放；通话不会写入研究 claims。
* 说“继续，就这样”不会选择 Gap，也不会启动研究任务；proposed_actions 只显示为候选。
* 幂等：同一 key 返回同一轮；同一 key 不同内容返回 409；半双工下第二轮返回 409。
* 共享 CLI：研究占用 CLI 时，通话轮次显示 QUEUED（`cli_slots_in_use=2`）；在排队中取消不会触达 CLI，也不影响研究任务。
* 思考中挂断：轮次变为 CANCELLED，迟到结果被丢弃，也不会朗读。
* 朗读中按麦克风会打断朗读，记录 INTERRUPTED（进度未知时记为 UNKNOWN，不声称用户已经听到）。
* 切换项目、退出登录都会结束通话；收起卡片不会挂断；团队房间不能拨打。
* 麦克风权限被拒绝、浏览器没有 SpeechRecognition 时，界面都会给出明确提示，文字通话仍然可用。
* 通话记录可以查看、导出 Markdown（附来源说明）、删除；更正转写只更正记录，原文保留。
* 服务重启后，未完成的轮次标记为 INTERRUPTED，不自动重跑。
* CSRF 错误、外部 Origin、controller 或伪造角色、跨项目 callId/turnId、超长文本、未知输入来源，都会被拒绝。

## 费用构成

* 没有新增付费语音服务或 API；推理仍走 Claude CLI 订阅额度（每轮 1 次调用；回答含来源支持的主张时再加 1 次引用复核）。
* Chrome/Edge 的语音识别是浏览器自带的免费服务，但**音频可能发送到 Google/微软服务器**，并不是完全在本机处理。
* 朗读优先使用 Windows 本机音色（Huihui/Kangkang/Yaoyao、David/Zira/Mark）。

## 未完成项与限制

* 真实语音（中文、英文）、真实推理和延迟数据：未运行。
* 马来语：未测试，界面不提供选择。
* 本地离线 STT：本机有 Windows SAPI 识别器（zh-CN / en-US），但没有接入；whisper/ffmpeg 未安装，也没有擅自下载。
* 对话路径为降低延迟，没有跑查询扩展和重排（provenance 中记为 `NOT_RUN_FOR_DIALOGUE_LATENCY`）。
* 现有聊天标题在 `#/bot/teresa` 等路由下仍显示 Steve Blank（这是原有行为，没有修改）；通话卡片显示的是实际拨打的专家。
* 所有专家的通话入口都标为“待实测验证”，在真实测试通过前不会去掉。

## 如何实测（电脑）

1. 在 `business/` 运行 `npm.cmd start`，用 Chrome 或 Edge 打开 `http://127.0.0.1:4318`。
2. 在 Projects 选择项目 → 在左侧选择专家 → 点击工具栏右侧的电话按钮 → 接通。
3. 点击麦克风，用中文说一句包含数字和否定词的话（例如“我们预算不到五千，不想做硬件”）→ 再点击结束本轮 → 核对字幕 → 发送 → 听朗读。
4. 再切换为 English 测一次。
5. 让我读取 `call_turns.timings` 和 `playback` 的数据，填写延迟和验收表。
