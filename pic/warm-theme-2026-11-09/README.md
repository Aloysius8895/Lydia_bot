# 主页配色统一成项目库的颜色

状态：**已实现（2026-11-09）**。代码在 `business/frontend/src/warm-theme.css`，实际效果截图见 [implemented/](implemented/)。下面的对比图是设计阶段在真实应用上临时加载 `proposed/warm-theme.css` 拍的。

## 要做的事

把主页（Lydia 聊天、侧栏、项目详情、手机首页）换成 项目库 的配色：

- **白天模式**：暖米灰背景 `#f3f2ef`，卡片象牙白 `#fffefa`，细边框 `#d8d6d0`，文字深炭灰 `#22211f`。去掉现在背景里的粉色 / 紫色渐变，语音通话条也不再是淡紫色。
- **黑夜模式**：和项目库的黑夜一样，纯黑 `#080808` 底、`#101010` 卡片、中性灰边框。去掉现在偏蓝紫的底色。
- **手机首页**：项目选择框、「全部会话」标签原来是淡蓝色，Expert team 卡片原来是淡紫色，都改成同色系的米灰（黑夜是深灰）。
- **保持不变**：专家头像本身的颜色（Steve 蓝、Ash 橙等）、布局、字号都不变。

## 对比图

| 页面 | 现在 | 改成 | 参考：项目库 |
|---|---|---|---|
| 电脑 · 白天 | [light-chat-before.png](light-chat-before.png) | [light-chat-after.png](light-chat-after.png) | [light-reference-project-library.png](light-reference-project-library.png) |
| 电脑 · 黑夜 | [dark-chat-before.png](dark-chat-before.png) | [dark-chat-after.png](dark-chat-after.png) | [dark-reference-project-library.png](dark-reference-project-library.png) |
| 手机首页 · 白天 | [light-phone-home-before.png](light-phone-home-before.png) | [light-phone-home-after.png](light-phone-home-after.png) | |
| 手机首页 · 黑夜 | [dark-phone-home-before.png](dark-phone-home-before.png) | [dark-phone-home-after.png](dark-phone-home-after.png) | |

截图用临时数据库和 TEST_ONLY 示例项目拍摄，Steve 的回复是排版用的示例文字，不是 Claude 生成的。

## 落地方式

`proposed/warm-theme.css` 作为 `business/frontend/src/warm-theme.css`，在 `main.jsx` 中于 `chat-text.css` 之后、`knowledge.css` 之前加载，项目库自己的样式不受影响。

重新生成截图：`node --experimental-strip-types scripts/warm-theme-design.ts ../pic/warm-theme-2026-11-09`（在 `business/` 目录下运行）。
