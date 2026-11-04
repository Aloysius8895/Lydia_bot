# Grok Bot 本地分析与 Lydia 前端接入

日期：2026-11-04。本机分析对象为已安装的 **Grok Bot 0.78.1**，不是 Downloads 中的旧 0.77.0 安装包。不需要购买 Grok plan；本次没有登录、购买套餐或调用 Grok 云端 Bot。

- [分析结果](ANALYSIS.md)：结构、证据、前端设计值和未验证边界。
- [当前项目研究流程](PROJECT_WORKFLOW_REPORT.md)：Projects 放资料、选择项目、与 Steve 讨论并按项目执行；Artifacts/Recents 已删除，专家列表不再折叠。
- [最新页面/组件交付](COMPONENT_PORT_REPORT.md)：新侧栏、欢迎页、多行聊天、详情、设置、登录/创建项目与手机页面；含截图和验证。
- [左侧栏参考图更新](CLAUDE_SIDEBAR_REPORT.md)：按用户最新截图应用 Claude 式导航、真实 Recents 和固定账户栏，保留三栏比例。
- [实施范围](IMPLEMENTATION_PLAN.md)：用户授权的设计接入与验证。
- [REA 精简结果](evidence/rea-summary.json)、[完整 Evidence](evidence/rea-analysis.json)、[执行命令与退出码](evidence/rea-run.json)。
- [应用清单及归档 SHA-256](evidence/artifact-inventory.json)、[设计 token](evidence/grok-design-tokens.json)、[字体来源与 SHA-256](evidence/font-provenance.json)。
- `reference/`：从本机应用只读提取的原 CSS/HTML 与主要 renderer bundles，供本地分析追溯；Lydia 没有执行这些 Electron/云端业务 bundle。
- `validation/`：真实临时库交互测试报告及截图，均为 TEST_ONLY。

前端已接入 [grok-design.css](../business/frontend/src/grok-design.css)，由 [main.jsx](../business/frontend/src/main.jsx) 加载。沿用 Lydia 的登录、案件、研究流程、Settings → Crawl 和导出。

启动：在工作区根 CMD 运行 `crawl\Start-Crawler.cmd`，打开 http://127.0.0.1:4318/。已有服务正常重启后刷新；这是同一个 Lydia App。

复现：`python bot_rea/inspect_artifact.py`、`python bot_rea/run_rea.py`。脚本固定 REA 6.4.0，仅分析应用安装目录的 ASAR；不会读取 Grok 用户账号配置。完整 Evidence 约 72 MB，执行脚本会重新生成本目录的相应报告。

本目录的第三方参考资源来自本机已安装应用，用于用户要求的本地分析与设计对照；它们不是 Lydia 原创源码。未验证可对外分发的授权。

**公开仓库说明：** `reference/`、`evidence/rea-analysis.json`（约 72 MB）以及 Grok 字体 `business/frontend/src/assets/grok/` 均来自本机已安装的第三方应用，分发授权未经核实，因此已在 `.gitignore` 中排除，只保留在本机。运行上述复现脚本可在本地重新生成；字体缺失时前端自动回退为系统字体。
