# Hackathon Knowledge Workspace Implementation Plan

> Implementation is carried out inline in this session, using the approved v4 design and the user's follow-up instructions.

**Goal:** Lydia 的知识库入口打开可交互项目空间，Lydia 返回原工作页；真实项目支持比较生成和收藏，同步到现有 Obsidian Vault，并使用可用 Blender 连接制作空间资产。

**Architecture:** React 增加独立 hash 路由，原 App 状态继续由父组件持有。项目读取现有 crawl 数据，比较运行与收藏用新增持久表，模型复用串行 Claude CLI。Obsidian 只管理 Vault 内 Lydia 子目录，以数据库快照导出，保留用户备注；Blender 生成独立资产，不改用户当前场景。

**Tech Stack:** React/Vite、TypeScript、PGlite、现有 Claude CLI、SVG 空间交互层、Blender Python、本地 Markdown。

## 完成核对

- [x] 原 Lydia / 知识库往返，保留专家、案件和未发送草稿；已用真实浏览器确认。
- [x] 项目数据、空态、筛选分页、来源、空间缩放平移、列表替代、黑白主题。
- [x] 比较任务、输入版本、引用校验、条件、结果、取消与重复请求边界。
- [x] 原生拖入项目与拖拽收藏、备注、刷新恢复、明确的研究交接。
- [x] 临时 Vault 备注/冲突检查，真实 Vault 增量同步和目录核对。
- [x] 本机 Blender 独立进程制作 .blend / GLB / 页面渲染素材；MCP 场景读取超时，未声称通过。
- [x] 构建、类型检查、104 项功能测试、原应用浏览器回归和知识库专项。
- [x] 正式服务和真实空库、Obsidian、返回入口验证。
- [x] 真实 CLI 尝试并明确记录额度阻塞，修正非零退出的额度错误分类；未运行付费后备。

实施结果与边界见 implemented/README.md。当前视图基于 Blender 渲染素材而非 WebGL 自由旋转；真实案例生成质量未验收，正式库未混入测试项目。

## Global Constraints

- 以 v4 深浅主题、浮动侧栏、大空间项目书库为视觉依据。
- 不把比赛案例或模型生成 idea 当成已验证市场需求。
- 原工作页、当前项目、专家与草稿在往返时保留。
- 私有内容不放 localStorage；接口复用登录、同源和 CSRF。
- Obsidian 默认使用已发现 Vault 的 Lydia 子目录，不覆盖其他笔记。
- 模型输出必须校验结构和来源；失败不伪造候选。

## Task 1 · 导航与空间

- [ ] hooks.js 增加 knowledge 路由，App.jsx 保存返回 hash 并挂载知识库，Sidebar/MobileHome 添加入口。
- [ ] KnowledgeWorkspace.jsx 使用 /api/crawl/projects 分页、过滤、选择与详情；空库显示真实空态。
- [ ] KnowledgeScene.jsx 以等距投影绘制可选择/拖拽物件、书架、缩放和平移，支持列表和键盘替代。
- [ ] knowledge.css 完成独立深浅主题及手机回退，不污染原 App。

## Task 2 · 比较与收藏

- [ ] 007-knowledge.sql 新增比较运行和收藏；knowledge.ts API 复用 auth 和 CSRF。
- [ ] idea-lab.ts 固定输入版本，校验项目引用，生成共同点、差异及带假设的候选；排队、取消、失败与重启状态明确。
- [ ] 实现托盘、结果抽屉、约束输入、拖拽/按钮收藏、备注与研究交接。
- [ ] API 测试覆盖身份边界、版本、未知引用、幂等收藏与取消。

## Task 3 · Obsidian 与 Blender

- [ ] obsidian.ts 发现本机 Vault；在 Lydia 子目录导出比赛项目、候选、研究摘要，使用稳定文件名与相对 wiki links。
- [ ] 定时增量导出与手动同步；保存用户备注，检测受管内容改动，不静默覆盖。
- [ ] 检查实际 Blender 插件协议，生成独立集合和 .blend、GLB/预览资产；保持现有场景。
- [ ] UI 显示真实连接、同步结果和失败，附本机使用说明。

## Task 4 · 验证与交付

- [ ] npm.cmd run check、npm.cmd run build:frontend、npm.cmd test。
- [ ] 隔离数据库浏览器验证导航往返与草稿、真实 API 项目、拖入分析、收藏重载、主题、手机和无结果；保存截图与报告到 pic。
- [ ] 临时 Vault 验证笔记与用户备注，再连接实际 Vault 并核对文件。
- [ ] 检查生产服务与数据库单实例，启动当前构建并只读核对。
