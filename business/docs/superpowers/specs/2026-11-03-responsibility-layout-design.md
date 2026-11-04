# 按职责组织 Business Research 项目

用户要求：全部实现位于 `C:\maven\business_agent\business`，按职责分目录，缺少目录自行创建。该指令授权本次目录整理；沿用既有 RAG/PWA 设计，不增加产品功能。

采用一个 Node/TypeScript 包、多个职责目录：相较全部留在 app，此结构使 RAG 实现可直接找到；相较为每个目录建立独立服务，此结构保留现有单进程、单数据库及串行 CLI 行为，不增加部署成本。

| 目录 | 职责 |
| --- | --- |
| RAG | 来源抓取、安全校验、资料入库/分块、混合检索、多语查询扩展、重排、搜索额度、Ollama embedding |
| agents | 专家任务编排、技能上下文加载、提示词、引用复核、Claude CLI 适配 |
| backend | HTTP 接口、会话登录、导出 |
| database | PostgreSQL/pgvector schema 和持久化接口 |
| shared | 根路径、配置及公共错误类型 |
| frontend/research-pwa | 当前后端所服务的 PWA 静态界面 |
| skills、expert-team | 原有专家方法和蒸馏记录，原文件保留 |
| scripts、tests、test-results | 运行工具、自动化测试、测试记录 |
| deployment | 环境配置示例及本机证书 |
| .runtime | 现有数据库/日志与 Claude 隔离工作目录 |
| docs | 设计、进度、运行说明及验证记录 |
| cases | 实际研究导出；在第一次导出时创建 |

依赖安装和启动入口位于 business 根目录。现有 frontend React/Vite 项目不移动、不替换，与 research-pwa 分别记录入口。移动已有依赖、数据库和证书，不重新下载。配置根路径基于模块位置，不能依赖启动工作目录；相对 TLS 路径从 business 根解析。数据库 schema 从 database 模块相对加载。

移动前核实服务 PID/启动时间，仅停止本项目进程；校验所有路径均在指定根目录，拒绝覆盖。移动后逐文件 SHA-256 比对，再修改必要的文本引用；保留原始路径的历史报告作为历史证据。最后执行类型检查、32 项现有测试、9 项浏览器检查、六 skills 读取、HTTPS 传输检查及本机服务检查。

本次不触发 Claude 推理或付费请求，不声称真实专家联调、市场验证或手机安装已通过。若目录迁移或测试失败，记录实际失败并修复，不以创建目录替代实现。

自查：目录均对应已有实现；单一启动入口、单一数据库和统一根目录，无未决设计项。当前目录不是 Git 仓库，无法提交设计文档；不擅自初始化仓库。
