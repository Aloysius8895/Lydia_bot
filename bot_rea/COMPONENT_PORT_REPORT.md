# 页面与组件适配交付

更新：2026-11-05（Asia/Kuala_Lumpur）。本轮补上此前只有字体和 token 的不足：Lydia 主要页面已有新的原生组件结构，并接回原有数据和操作。

## 已改动的页面

| 页面/组件 | 现在的结构与可用操作 | 实现位置 |
| --- | --- | --- |
| 桌面侧栏 | 工作区标识、新建项目、资料库/Crawl 快捷入口、搜索、按既有置顶元数据筛选、团队/专家分组折叠；列表独立滚动，底部 Settings/个人区固定 | `Sidebar.jsx` |
| 聊天空白页 | 顾问资料头、任务建议卡、点击填入草稿、添加项目资料入口 | `GrokWelcome.jsx` |
| 输入框 | 独立多行编辑区与操作栏；自动增高、Enter 发送、Shift+Enter 换行、输入法组合状态处理、8000 字符上限、真实任务取消、失败保留草稿 | `GrokComposer.jsx` |
| 消息 | 作者头、对话正文、复制及成功/失败反馈；文字仍经过原安全渲染流程 | `GrokMessage.jsx` |
| 顾问详情/研究面板 | 顾问资料头、项目概览、来自当前案件的统计卡、资料/缺口快捷导航、方法说明；原资料、缺口选择、企业要求流程保留 | `ResearchPanel.jsx` |
| 设置 | 分类页标题、说明和原生设置内容；头像、主题、连接、导出、Crawl 继续使用真实功能 | `SettingsModal.jsx` |
| 登录 | 工作区介绍与本机登录双区页面；原密码和会话保护保留 | `ResearchForms.jsx` |
| 创建项目 | 项目说明、独立表单、地区字段、保存位置提示和真实创建操作 | `ResearchForms.jsx` |
| 手机首页/聊天 | 新建/资料库/Crawl 快捷入口、专家列表、多行输入与抽屉详情 | `MobileHome.jsx`、共享聊天组件 |

组件样式在 `business/frontend/src/grok-pages.css`，源设计字体和色板在 `grok-design.css`。桌面 **27% / 42% / 31%** 为用户明确要求，优先于原 Grok 默认宽度。没有加入无后端支持的云电脑、购买、语音拨号或假运行状态。

## 对照截图

- [桌面浅色](validation/components/desktop-light.png)
- [桌面深色](validation/components/desktop-dark.png)
- [手机聊天](validation/components/mobile-chat.png)
- [登录页](validation/components/login.png)
- [创建项目](validation/components/new-project.png)

截图均来自 TEST_ONLY 临时案件，不能当成真实市场数据。

## 验证

- React production build 与 TypeScript check 通过。
- 完整测试 54/54 通过。
- 原应用 21 项浏览器检查、Crawl 14 项浏览器检查通过。
- 新组件 11 项交互检查通过：[报告](validation/components/report.json)。覆盖置顶/折叠、建议不自动发送、草稿保持、模拟请求失败、实际任务入库与取消、剪贴板换行、三种桌面宽度及 390px 手机。
- 所有验证在临时数据库进行，未写正式案件、未调用真实模型或 Grok 云服务。

## 证据与范围

原应用结构线索保存在 [组件源定位](evidence/component-source-anchors.json)，对应已提取的 renderer bundle。实际主题/字体有归档原文与哈希证据；当前组件是适配 Lydia 数据与功能的 React 实现。未执行原厂云端流程，也没有验证全部 Grok 登录后状态，因此这里交付的是 **Lydia 主要页面的组件层适配**，不是宣称恢复了原厂完整应用、私有后端或全部像素级细节。

旧的“仅 token 适配、组件未改”记录保留为历史，本报告反映当前实现。安装包分析的部分语义和原生文件完整性限制仍然有效。

## 查看当前版本

先在原服务终端按 `Ctrl+C` 正常停止，再从工作区根 CMD 运行 `crawl\Start-Crawler.cmd`。打开 http://127.0.0.1:4318/ 并按 `Ctrl+F5`。启动脚本会构建和运行同一个 Lydia App；无需运行 bot_rea 的分析脚本。
