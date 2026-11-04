# 项目资料 → Steve 讨论 → 按项目执行

2026-11-05。按用户最新要求，删除侧栏 Artifacts 和 Recents；Projects 现在是实际项目管理页面，侧栏专家恢复较大头像和行高，团队会话/研究专家直接展开，无折叠按钮。聊天仍保持 27% / 42% / 31%。

## 使用流程

1. 在 Projects 选择项目，或 New 创建一个 hackathon 研究项目。
2. 添加 brief、规则、项目说明、TXT/MD/JSON/CSV 文件或公开网页链接，点击“保存到项目”。文件上限 1 MiB、150,000 字符；PDF 暂需先提取文字。
3. 点击“与 Steve 讨论此项目”。聊天顶部显示当前项目。
4. 发出讨论或执行请求。单纯选择项目/打开讨论不会创建任务；发送后任务绑定该项目 ID。

文件与链接默认归入当前案件的 PROJECT，用于说明项目背景和约束。市场证据保持 MARKET；PROJECT 不会冒充验证市场需求的证据。爬虫项目也可以继续通过 Crawl 导入指定案件的 PROJECT。

## 实现

- `ProjectsPage.jsx`、`projects.css`：项目列表、资料页、上传/粘贴/URL、资料预览、讨论入口，支持手机。
- `App.jsx` / `hooks.js`：#/projects 路由、明确的项目选择、案件链接恢复、创建后进入资料页；任务仍通过原认证 API 提交。
- `Sidebar.jsx`：去掉 Artifacts/Recents，Projects 和 Search 进入项目页面；专家常展开、48px 头像。
- `data/database/store.ts`：在本案快照列出激活的 PROJECT 资料（最近 100 条，每条正文预览最多 6000 字）。完整资料仍在原 documents/chunks 中保存。
- `sources.ts` / backend API：URL 按请求的 PROJECT/MARKET 存储；默认仍是 MARKET，兼容原自动市场采集。私网、DNS、重定向、大小与超时保护保留。
- `agents/research.ts`：顾问输入新增仅本案的 `project_context`，相关检索加有界预览回退，总正文最多 40,000 字；与市场 evidence 和引用校验分开。

## 验证

构建和类型检查通过，完整测试 **55/55** 通过。新增用例确认 Steve 收到当前案件 PROJECT 文本、不收到另一项目资料，也不能用 PROJECT 作为市场引用。

新项目流程浏览器 **10 项**通过：移除两个侧栏块、专家常展开、PROJECT 文件入库、链接分类与私网拒绝、资料隔离、精确任务绑定、刷新恢复、三栏比例及手机布局。原 App 21 项、新组件 11 项、Crawl 14 项回归通过。全部临时 TEST_ONLY 数据，无正式案件写入、无真实模型调用。

[桌面截图](validation/sidebar-reference/projects-light.png) · [深色截图](validation/sidebar-reference/projects-dark.png) · [手机截图](validation/sidebar-reference/projects-mobile.png) · [流程测试](validation/sidebar-reference/report.json)

已有后端需要正常停止并重启 `crawl\Start-Crawler.cmd`，然后浏览器 `Ctrl+F5`。这里更新了后端的 PROJECT 上下文读取，不能仅靠旧服务刷新来加载全部变化。
