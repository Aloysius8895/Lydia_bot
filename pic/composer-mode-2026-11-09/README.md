# 输入框：「完整研究」开关 + 模型选择

状态：**已实现（2026-11-10）**。代码在 `business/frontend/src/components/GrokComposer.jsx` 和 `business/frontend/src/composer-mode.css`，实际效果截图见 [implemented/](implemented/)。下面的设计稿截图是在真实应用上用临时数据库、临时注入 `proposed/composer-mode.css` 和示意按钮拍的。

确认的改动（2026-11-10）：「完整研究」**发送后保持开着**，再点一次才关；刷新页面后也保持。模型选择按设计稿实现。

## 怎么用

- **默认（开关关着）**：每条消息都是普通对话，Claude 直接回答，不会自己决定去跑研究。这会取代上一版「Claude 自己判断要不要研究」的做法。
- **点亮「完整研究」**：这条消息会启动完整流程，也就是联网搜资料，再由 Steve、Teresa、April、Bob 加最终复核共 5 位专家出带来源的结论，大约 5–15 分钟。开关亮着时，右侧会提示「发送后启动 5 位专家完整研究」。
- ~~发送后开关自动关回去~~ → 已改为保持开着（见上方确认）。
- **模型选择**（像 Claude Code 那样，点「Sonnet 5.5 低 ⌃」弹出）：
  - **可选模型**：Opus 5.5、Sonnet 5.5、Haiku 5.5。
  - **思考强度**：低、中、高。
  - **默认值**：Sonnet 5.5 · 低。选择会记在这台设备的浏览器里。
  - **作用范围**：聊天回复用你选的模型。开启「完整研究」时，4 位专家和最终复核也用它。查询扩展、资料排序、引用检查这些辅助步骤仍然固定用 Haiku（省额度，质量影响小）。
  - **不受影响**：语音通话和 Idea 实验台。
- **顶部的「需求研究 / 顾问问答 / 商业模式」下拉框去掉**：
  - 「需求研究」由「完整研究」开关取代。
  - 「顾问问答」由默认的普通对话取代。
  - 「商业模式」：选定 Gap 之后，「完整研究」旁边会多出一个「商业模式」开关（两个只能开一个）。没有选 Gap 时不显示，所以截图里看不到。
- **输入框变化**：从一行变成两行，上面打字，下面一排按钮，和你截图里的 Claude Code 一样。整体高度约 84px，之前是 48px。

## 截图

| 场景 | 现在 | 改成：普通对话 | 改成：完整研究开启 | 改成：模型菜单 |
|---|---|---|---|---|
| 电脑 · 白天 | [前](light-desktop-before.png) | [全图](light-desktop-chat.png) · [特写](light-desktop-chat-closeup.png) | [全图](light-desktop-research-on.png) · [特写](light-desktop-research-on-closeup.png) | [全图](light-desktop-model-menu.png) · [特写](light-desktop-model-menu-closeup.png) |
| 电脑 · 黑夜 | [前](dark-desktop-before.png) | [全图](dark-desktop-chat.png) · [特写](dark-desktop-chat-closeup.png) | [全图](dark-desktop-research-on.png) · [特写](dark-desktop-research-on-closeup.png) | [全图](dark-desktop-model-menu.png) · [特写](dark-desktop-model-menu-closeup.png) |
| 手机 · 白天 | [前](light-phone-before.png) | [图](light-phone-chat.png) | [图](light-phone-research-on.png) | [图](light-phone-model-menu.png) |

手机上屏幕窄，所以按钮里不显示「低/中/高」，也不显示右侧提示，打开菜单才能看到思考强度。

## 落地方式（确认后）

- **输入框**：`GrokComposer.jsx` 加两个按钮和菜单；`composer-mode.css` 放进 `frontend/src/`，在 `warm-theme.css` 之后加载；去掉 `App.jsx` 顶部的类型下拉框。
- **后端接收**：任务接口多收两个字段，`mode`（chat / research / model）和 `model`（模型 + 思考强度），模型只接受上面三种。
- **后端行为**：chat 直接回答，research 跑完整流程，并按所选模型调用专家和复核。
- **重新生成截图**：在 `business/` 目录下运行 `node --experimental-strip-types scripts/composer-mode-design.ts`。
