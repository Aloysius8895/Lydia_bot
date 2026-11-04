# Lydia frontend — 原有设计与 RAG 集成

当前品牌为 Lydia；浏览器标题、登录/手机页、PWA 与导出文件名一致。主题偏好写入 lydia-theme，同时兼容读取改名前 crew-theme；历史缓存会迁移清理。

当前按用户最新参考图设置比例：桌面左/聊天/右约27% / 42% / 31%，关闭右栏后聊天自动展开。列表18–20px、消息18–20px、右侧正文17–19px随窗口缩放；具体覆盖在 src/research.css。平板使用430px以内右侧浮层，手机单栏和不超过视口的抽屉，保留纵向滚动。

当前正式界面使用本目录原有的 React/Vite Crew 设计：侧栏、专家头像、聊天、深浅主题、手机首页及聊天布局。不是 frontend/research-pwa 的旧静态页面。

从 business 根启动：

```powershell
cd C:\maven\business_agent\business
npm.cmd start
```

也可双击根目录 Start-Lydia.cmd。启动自动构建 frontend/dist，然后由统一 backend/server.ts 在 http://127.0.0.1:4318 同源提供页面与 API。无需单独启动另一套聊天后端。

## 设置与主题

桌面侧栏点击 Settings，右侧设置页的“外观”按钮可切换：太阳代表白天，月亮代表黑夜。手机首页右上角齿轮打开设置；聊天页右上角详情按钮 → 设置。主题记在此设备 localStorage；私有对话、密码、CSRF 不写入 localStorage。

## 文件职责

- src/styles.css：保留原设计 tokens；components/Avatars.jsx 按用户最新参考图绘制彩色几何角色，专家、个人、团队与手机界面统一使用。
- src/App.jsx、api.js：登录、服务器项目状态、任务/报告及带 CSRF 的 API 客户端。
- src/components/Sidebar.jsx、Conversation.jsx、MobileHome.jsx：复用原设计布局。
- src/components/ResearchPanel.jsx、ResearchForms.jsx、src/research.css：研究资料、缺口选择、企业要求、设置与太阳/月亮开关。
- public：PWA manifest、图标和从官方 Google Fonts 本地保存的字体；字体授权文件一并保留。
- pwa/service-worker.template.js、vite.config.js：构建带哈希资源清单的公开 shell 缓存；不缓存 /api。
- dist：自动生成的正式构建；不要直接编辑。
- research-pwa、server：早期界面/旧聊天服务历史参考；不在当前默认启动或开发调用链中。当前不调用旧 /api/reply，不使用 API key 回退。

## 研究流程

创建项目或直接输入 idea → Steve 按题调度专家并统一汇总 → 添加真实资料/公开 URL → 查看来源、候选缺口、企业产品要求 → 用户明确选择 Gap → 商业模式任务。专家导航展示方法，群组不会自动让所有人轮流回答。任务实际持久化在电脑数据库，刷新恢复项目；暂停/取消保留真实状态，不伪装 token 流。

## 开发

保持 business 根后端运行，在另一个终端进入 frontend 执行 `npm.cmd run dev`，访问 http://127.0.0.1:5173。Vite 只代理到同一后端；没有第二套模型服务。`npm.cmd run build` 只构建；`npm.cmd start` 委托根目录正式启动。独立 preview 仅作静态预览，正式功能应使用 4318 或开发代理。

验证与截图见 ../test-results/browser-evaluation.json 和 crew-design-*.png；真实五专家整轮行为、真实市场验证和手机安装仍未验收。所有本轮浏览器测试使用独立 TEST_ONLY 数据库/导出、模拟 CLI 身份并禁用实际推理。
