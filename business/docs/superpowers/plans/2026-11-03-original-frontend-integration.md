# Original Frontend Integration Implementation Plan

> 执行方式：依据用户指定的 frontend 设计，在当前会话顺序实施；不委派、不增加审批步骤。

**Goal:** 默认启动页面实际采用用户现有 React/Vite Crew 设计，并连接唯一 RAG 后端。

**Architecture:** 复用原前端视觉组件，新增研究工作区与会话客户端。Vite 构建 frontend/dist，backend/server.ts 服务构建白名单并维持现有 API。

**Tech Stack:** React 18、现有 Vite 5、Node >=24、TypeScript、PGlite、Playwright；不新增依赖。

## Global Constraints

- 根目录 C:\maven\business_agent\business；沿用原设计 tokens、avatars、chat/sidebar/mobile 结构。
- Claude CLI 是唯一推理路径，前端不得调用旧 /api/reply 或 API key 回退。
- 会话/CSRF、来源隔离和明确 Gap 选择保留；测试只用临时数据库，不做真实推理。

### Task 1: 设计参考与客户端

- [x] 保存原 frontend/dist 桌面/手机参考截图、源文件哈希。
- [x] frontend/src/api.js 实现请求、CSRF、身份失效通知；App.jsx 用后端案件、任务、产物驱动，移除私有 localStorage 对话和直接逐专家回复。
- [x] 保留 Sidebar/Conversation/MobileHome 结构；New project 与研究面板复用现有表单、卡片、按钮和颜色变量。
- [x] 工作区具备来源上传/URL/检索、缺口显式选择、企业要求、任务恢复/取消、连接状态/订阅确认/导出/退出。

### Task 2: 构建与唯一入口

- [x] Vite 移除旧 apiMiddleware，开发代理连现有后端；public 保存 PWA 图标/manifest，构建插件生成包含哈希资源的 SW。
- [x] backend 读取 Vite manifest，仅服务构建公开资源；CSP 兼容 React 现有动态样式且保持脚本 self、禁止 frame/object、同源 API。
- [x] shared/config.ts 的 frontendRoot 改 frontend/dist；根 package 与 Start-Crew.cmd 先构建，启动唯一 backend/server.ts。
- [x] 类型检查、后端/API 回归；验证构建资源和路径穿越/源码访问边界。

### Task 3: 浏览器与交付

- [x] scripts/browser-test.ts 改用原设计页面，测试真实 API、刷新恢复、主题、桌面与 390px 手机、长任务、缺口选择约束、导出、退出、私有缓存和 XSS；模型使用禁用/夹具流程。
- [x] 查看截图并修正布局，保留报告与实际限制。
- [x] 更新 root/frontend/backend README、运行指南、当前进度和 FINAL_REPORT；重启本项目服务并验证实际入口是 Vite 构建页。

自查：全部界面动作均有现有 API 或明确禁用说明；不声称测试通过前已完成。对结构改动复用现有测试，并仅增加资源服务/业务连线所需检查。

Completed. See ../../verification/frontend-design-integration.json for live asset hashes, browser checks, original design hashes and preserved failures.
