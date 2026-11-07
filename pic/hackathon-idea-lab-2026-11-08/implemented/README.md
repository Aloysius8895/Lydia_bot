# Lydia 知识库 · 已实现与验证

后续更新：已加入独立新闻库与混合分析（见 ../NEWS_MIXED_IMPLEMENTATION.md）。当前完整功能测试 106/106、知识库专项 8 组通过；下文 104 项与 7 组为新闻扩展前的历史记录。真实 Claude 额度限制仍未解除。

2026-11-08，Asia/Kuala_Lumpur。已实现知识库独立工作区，入口为原 Lydia 侧栏或手机首页“知识库”；工作区顶部 Lydia / 返回 Lydia 回到原专家、项目与未发送草稿。

## 已落地

- v4 浮动侧栏、等距多排项目书库、深浅主题、筛选、分页、详情、来源、缩放和平移。
- 原有 crawl 数据作为项目来源，排除社交推文；没有给正式库写入虚构比赛项目。
- 拖入 2–6 个项目比较，设置用户、地区、技能、时间、预算与主题。
- 持久比较任务，复用 Claude CLI 串行队列，明确排队、失败、取消和重启中断；项目版本固定，引用必须来自输入并能逐字匹配。
- 共同点、差异、资料缺口及最多 5 个待验证 idea；可拖拽或点击收藏，保存来源快照、条件、备注和状态。
- 收藏后的 idea 可明确交给 Lydia 建立研究背景，不自动选择 Gap，不变成 MARKET 证据。
- Obsidian 自动发现本机已打开的 Vault，每分钟及手动同步；管理 Vault / Lydia 子目录。以数据库导出为准，不扫描或导入整个 Vault。
- 项目、收藏 idea、研究摘要为稳定 Markdown 文件，相互使用链接。每篇下方保留“我的笔记”；用户修改受管正文会列入冲突，不覆盖。

## 实际连接情况

运行地址：http://127.0.0.1:4318/#/knowledge
真实 Vault：C:/Users/User/OneDrive/Documents/Obsidian Vault
同步目录：上述 Vault 内 Lydia/

现场只读检查：正式比赛项目 0 个、收藏 idea 0 个，已有研究项目 3 个。已同步 Index.md 和三份研究笔记，后续采集与收藏后继续增量同步。原始比赛样本报告存在不等于正式数据库已填入，未将测试库内容复制进正式库。

## Blender 资产

本机安装 Blender 5.2.2，插件端口首次监听但场景读取超时，未获得有效 MCP 场景响应。改用独立后台 Blender 进程生成，未修改用户打开的场景。

源文件在 ../blender/lydia-project-binders.blend，可复用模型为 ../blender/project-binders.glb；脚本为 business/scripts/knowledge-blender.py。

当前页面使用这套模型的透明 PNG 渲染素材，配合 SVG / DOM 等距空间交互，可平移、缩放与选择。不是 WebGL 自由旋转场景；GLB 为后续模型升级保留。

## 验证证据

- TypeScript 检查与 Vite 构建通过。
- 完整功能测试 104/104 通过；之后 CLI 非零退出额度分类修订的相关 24 项回归通过。
- 原 Lydia 浏览器回归通过，页面和控制台错误 0，见 business/test-results/browser-evaluation.json。
- 新知识库专项 7 组通过，见 report.json。包括原路返回与草稿、实际临时库项目、真实原生拖拽、收藏重载、备注与隔离 Vault 同步，以及 320/390/430px。
- 新页面黑白主题与分析抽屉已实际截图、查看；图中 TEST_ONLY 是隔离样本，不是正式项目。
- live-check.json / live-browser.json 记录正式服务、真实 Vault、空库与返回入口验证。
- Obsidian 临时 Vault 验证了用户备注保留和受管正文冲突拒绝覆盖。

## 真实模型边界

浏览器专项使用构造模型返回。额外真实 CLI 检查遇到订阅额度限制，两个请求均未得到生成答案；没有切换 API 或付费后备。详见 real-cli-diagnosis.json。

发现 CLI 会在 exit=1、subtype=success、is_error=true 时表达额度限制，现已调整解析顺序，优先显示额度或认证原因，其他非零退出仍拒绝。真实案例生成质量尚待额度恢复和真实项目入库后验收。

## 使用

1. 启动 Lydia，点击知识库；当前空库可通过左侧“采集项目”进入 Crawl。
2. 采集完成后在空间或列表中选择案例；拖到底部，或点击加入分析。
3. 设置条件后点击分析。候选仅是待验证方向，检查来源和适配假设。
4. 拖到右侧书架或点击收藏；备注、收藏和输入版本保存在数据库。
5. 在 Obsidian 打开 Lydia/Index；底部个人笔记可编辑，受管正文应在 Lydia 中更新。
6. 点击工作区的 Lydia 返回原页面。

本次没有实现 Obsidian 全库双向导入、WebGL 旋转、生产检索质量保证或真实 iPhone 设备验收。
