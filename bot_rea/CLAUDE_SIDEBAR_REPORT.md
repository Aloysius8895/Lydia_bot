# 左侧栏参考图适配

后续已按用户要求移除 Artifacts/Recents、恢复较大专家行并常展开，Projects 已升级为项目资料页。当前状态见 [项目流程报告](PROJECT_WORKFLOW_REPORT.md)，下文为最初参考图适配记录。

2026-11-05。按用户提供的 Claude 侧栏截图重新组织左侧导航，保留 Lydia 名称、现有功能和 **27% / 42% / 31%** 桌面比例。聊天区和右侧详情没有重新缩窄。

已实现：衬线品牌字、顶部小图标、单列细线图标菜单、行悬停/选中底色、真实项目 Recents、独立滚动和固定账户栏。研究专家和团队会话收纳到折叠的“研究团队”区域，原置顶筛选仍可用。最近项目切换使用真实案件 ID，不创建演示数据到正式库。

| 菜单 | 实际操作 |
| --- | --- |
| New | 创建研究项目 |
| Search | 搜索现有项目与团队成员；Escape 清空并关闭 |
| Projects | 展开并定位最近项目列表 |
| Artifacts | 当前案件的资料与引用 |
| Crawl | Settings 中的爬虫管理，保留蜘蛛图标 |
| Design | 头像设计 |
| Customize | 连接设置 |
| 底部账户区 | 账户设置 |

参考图中的 Scheduled 未作为假功能加入，底部也没有显示未购买的 Pro 套餐。主题支持现有深浅模式。

源码：`business/frontend/src/components/Sidebar.jsx`、`sidebar-reference.css` 及 App 的实际案件/设置回调。

验证：build 与 TypeScript check 通过；原应用 21 项、新组件 11 项、Crawl 14 项浏览器验证通过；新增侧栏 9 项验证通过，覆盖搜索、案件切换、滚动固定账户、真实菜单入口、主题、三种宽度比例。全部使用临时 TEST_ONLY 案件，无正式库写入。

[侧栏浅色截图](validation/sidebar-reference/sidebar-light.png) · [侧栏深色截图](validation/sidebar-reference/sidebar-dark.png) · [整个 App](validation/sidebar-reference/desktop-light.png) · [测试报告](validation/sidebar-reference/report.json)

已有服务请正常停止并用 `crawl\Start-Crawler.cmd` 重启，然后在 App 按 `Ctrl+F5` 加载新构建。
