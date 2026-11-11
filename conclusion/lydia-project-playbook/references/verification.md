# 验证、证据与交接

## 选择与改动相称的检查

应用代码变更按影响选择以下命令，工作目录 business；仅整理本 skill 不需要启动服务或重跑全部生产评估。

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run build:frontend
```

test 默认 `--test-concurrency=1`。专项优先，完成要求后不无意义重复整套；浏览器脚本可能构建／生成文件，要先检查使用隔离 DB。

| 改动 | 主要专项（tests/ 下）与证据 |
| --- | --- |
| JSON／身份／摘要 | file-import、knowledge、catalog；原行指纹和重复导入 |
| Drive | drive-manual，生成测试凭据／模拟网络与临时 PGlite；真实云链另报告 |
| 365 天保留 | retention，特别是新 FK_POLICY、被引用保护和 dry-run 回滚 |
| RAG | query-expansion、rerank、core；质量评估与控制测试分开 |
| worker／选择／取消 | workflow、core、api；不可复活和检查点幂等 |
| 采集 | crawl、crawl-api/data/discovery/worker；真实 pilot 另做 |
| X | twitter-crawl、twitter-api；构造页面与真实账号分开 |
| 简介／深入解读／本地搜索 | project-brief、deep-dive；字面＋语义审核、无效 ID／引文 |
| 语音 | calls、continuous-call、voice-tts；call-browser-test 和真实声音分开 |
| 登录／手机／远程 | local-access、phone、phone-launcher、remote-config；TLS 及真机分开 |
| 赛事 | hackathon-tracker 与 Grok 赛事字段读回 |

浏览器脚本位于 business/scripts；标准 browser-test、call-browser-test 及按需 knowledge、touch、crawl、twitter 等专项。截图看整页、目标组件、手机窄屏／短高度、双主题；检查 pageErrors／consoleErrors 与真实交互，不只 screenshot 存在。必要时验证构建 hash 与运行资产一致。

## 不同证据不要混成一个「完成」

| 记录 | 可以证明 | 不可推出 |
| --- | --- | --- |
| 文件存在／GENERATED | 内容已写入 | 已自动注册或线上已生效 |
| 实际加载与 hash／LOADED | 本轮上下文读过 | 专家思维保真、独立角色已执行 |
| CONNECTED | 指定时刻真实链路可访问 | 数据质量、端到端完结 |
| 隔离／mock 测试通过 | 已覆盖行为的实现正确性 | 真实搜索／市场／麦克风／手机验收 |
| 私有库副本＋真实 CLI | 某次真实推理与流程 | 正式库已写入、全场景质量保证 |
| 正式库逐条读回 | 真实目标记录、计数与字段 | 已在运行页面显示、获奖／新闻属实 |
| 逐字引用核对 | 引文来自已读资料 | 引文语义充分、来源客观真实 |
| 真实小样本检索指标 | 该数据集的效果 | 总体代表性或生产泛化 |

未知写 NOT_RUN；具体依赖阻塞写 BLOCKED 和实际原因；未尝试写 NOT_ATTEMPTED，不伪装成请求失败。PARTIAL 保留未达标指标。不要把历史 33／84／160／164 项测试数写成永远的当前总数；本轮运行才能报告本轮总数。

audit.ts 会打开正式数据库，不能与运行服务并行。retrieval／expansion／rerank 评估可能调用 Ollama／真实 CLI 和订阅额度，文档整理不自动触发。真实联网 pilot 使用独立临时库，不能混 TEST_ONLY 进生产。

## 交接最少内容

记录当前任务与明确用户决定、代码／数据路径、改动文件、执行命令和退出码、隔离／真实范围、产物与报告、失败修订、未完成原因及下一步。研究交接附 case/state/selected_gap_id 和 E 编号；导入附 batch／记录 ID、manifest、repeat 与旧行保留；UI 附设计／实现／运行状态与截图路径。

只保留可审查判断依据和产物，不要求保存模型隐含推理。真实用户资料和副本放私有 data_storage，截图、日志公开前检查。既有工作区未提交改动可能来自其他会话，不 reset／清理，不自动 commit／push。

维护本 skill 时运行 skill-creator 的 quick_validate，再核对内部引用、原始来源路径与历史覆盖。静态检查不能证明未来所有任务都执行正确。
