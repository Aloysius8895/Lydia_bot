# 资料导入、每日任务和 365 天清理

## 目录

1. 资料从哪来
2. Drive 批次的格式
3. 工具
4. 正式导入流程（用户授权过的标准做法）
5. 规则：什么会被拒、什么算冲突
6. 每日 10:00 自动导入
7. 365 天自动清理
8. 项目简介：先生成，再上架
9. 踩过的坑

## 1. 资料从哪来

- **Grok（用户叫它"每日情报台"，对话里也叫 Didi）** 每天采集 Hackathon 作品、新闻和赛事，上传到用户的 Google Drive 根文件夹。producer 是 `grok-daily`。
- Lydia 用一个只读服务账号（`drive.readonly`，凭据用 DPAPI 加密存在本机）拉取。文件夹 ID 不算凭据，但这里不写；需要时从上次的 operation report 或计划任务参数里取。
- 用户也会在知识库里用"新闻"表单手动加新闻，在研究项目里上传资料。
- 爬虫（Settings → Crawl）要手动开始，不会定时跑。

## 2. Drive 批次的格式

- 每批一个文件夹，命名为 `grok-daily-YYYYMMDD-HHMM-<种类><编号>`，例如 `…-events04`、`…-news-backfill02`。
- 文件夹里必须有 `ready.json`，否则跳过（说明 Grok 还在上传）。ready.json 的 `files` 列出每个文件的 kind（`projects`/`news`/`events`）、sha256、bytes 和 records。每种 kind 最多一个文件，单个文件不超过 10 MiB、10000 条。
- 每条记录要有长期不变的 `id`。
- 赛事格式见 `data/docs/GROK_HACKATHON_EVENTS.md`；作品和新闻见 `business/docs/FILE_IMPORT.md` 和 `data/data_preprocessing/crawl/DATA_CONTRACT.md`。

## 3. 工具

都在 `C:\maven\business_agent\data` 目录下运行，用 `node --experimental-strip-types data_preprocessing/cli/<文件>`：

| 工具 | 用途 |
| --- | --- |
| `drive-manual.ts --pull --root-folder-id <id> --batch-folder-id <id> --producer-id grok-daily` | 下载、校验、暂存一批，状态是 `VALIDATED_NOT_IMPORTED`，**不写库** |
| `drive-manual.ts --pull … --execute --backup-manifest <manifest>` | 拉取并正式导入（要求服务已停、备份已验证） |
| `import-files.ts --file <json> [--out <报告>]` | 本地 JSON 预览（默认不打开数据库） |
| `import-files.ts --execute --verify-repeat --db <库> --backup-manifest <manifest> --file <json> --out <报告>` | 本地 JSON 正式导入，带复导去重 |
| `backup-for-import.ts --db data_storage/database --destination data_storage/backups/database` | 完整备份，逐文件比哈希，并做隔离恢复检查 |
| `drive-daily.ts --plan` | 只列出每日任务会做什么：不停服务、不写库 |
| `setup-drive-daily.ps1 [-At 10:00] [-Remove]` | 注册、修改或删除 `Lydia Drive Daily` 计划任务（`-RootFolderId` 沿用原值） |

## 4. 正式导入流程（用户授权过的标准做法）

用户 2026-11-09 授权的完整顺序是：预览 → 停服务 → 完整备份和还原校验 → 正式导入 → 复导去重 → 读回验收 → 重启服务。遇到冲突或任何检查失败就**停下来报告，不覆盖原数据**。

1. **拉取和预览**（服务不用停）：核对条数、无效条数、必填字段、日期带不带时区，和 ready.json 是否一致。
2. **冲突预检**：在最新备份的副本上试导入，看哪些是新的、重复的、冲突的。冲突要逐条讲清楚差在哪个字段，以及谁的版本更新。
3. **停服务和备份**：按 deploy-ops.md 第 2 节。
4. **正式导入**，然后**复导一次**：第二次应该是新增 0、全部算作重复。
5. **读回验收**：每条通过 API 读回，并和原始记录逐字段比对；其他表原有数据一条不少、一条不多。
6. **重启服务**，确认返回 200。
7. **汇报**：用表格列每一步的结果、导入了哪些内容，加上备份路径、报告路径和停服时长。

用户只给了"导入"的指令、没给授权细节时，先做第 1、2 步，把预览结果给用户看，再继续。

## 5. 规则：什么会被拒、什么算冲突

- **整批拒收**：Drive 批次里只要有一条不合格（例如没有网址），整批不导入。Lydia 不能在预览时单独删掉某一条，要让 Grok 重做批次。
- 每条至少要有一个真实来源网址（`url` 或 `source_urls`）。
- 规定的可选字段（`original_date`、`url`、`date_display` 等）写 `null` 等同于没写（2026-11-11 起）。没规定的额外字段原样保存。
- 赛事的 `submission_deadline` 必须带时区。官方没写截止时间就填 `deadline_note`，界面显示"待确认"，**不推算日期**。
- **冲突**：同一个 id 再次交付、内容一致记为 duplicate；内容不同记为 conflict（`EXISTING_CONTENT_DIFFERS_PRESERVED`），保留原记录。每日任务遇到一条冲突，会把整批挂起。目前没有"接受更新"这个选项（2026-11-11 提议过，用户还没决定）。
- 摘要不是原文：新闻 `content=''`，摘要存在 `meta.imported_summary` 里，标记 `summary_only`。没取得原文之前，不能当证据进 Idea 分析。
- 作品的 finalist/winner 状态显示为"上游声称"，不当作已核实；赛事标 `EXTERNAL_EVENT_LISTING_NOT_VERIFIED`。
- 每次导入都写批次和逐条结果；重复的业务记录不新增，但会新增审计记录。

## 6. 每日 10:00 自动导入

用户 2026-11-09 定的规则（"每天早上10 点跑吧"），代码在 `data_preprocessing/cli/drive-daily.ts`：

1. 找出 Drive 上还没导入过的批次。没有就结束，服务不受影响。
2. 预览；有无效条目就把那批标为待处理，服务不用停。
3. 停 `Lydia Remote`，完整备份。手机断线约 1–2 分钟。
4. 在备份副本上演练导入。有 1 条冲突或失败，真实库一个字都不写。
5. 演练干净才正式导入，然后复导、读回。
6. 不管成功还是失败，最后都重启服务。

- 每个批次分开处理：一批冲突不影响别的批次。
- 自动备份放在 `backups/database/daily/`，只保留最近 30 份（`--keep`，最少 3 份），只在有新批次的日子才产生，每份约 64 MB。手动备份不在这个文件夹，不会被删。
- 电脑在 10:00 关机或睡眠时，开机后补跑。
- 结果写在 `reports/sync/daily/latest.json`，「追踪 Hackathon」面板顶部会显示；有待处理批次时侧栏按钮出现黄点。
- 退出码 `0xC000013A` 表示控制台窗口被关掉或按了 Ctrl+C，这时没写下结果。可以提醒用户：10:00 弹出黑色窗口时不要关。

## 7. 365 天自动清理

用户 2026-11-11 要求"每个数据只能在我的数据库上存在365 天"，并通过选项定了规则。代码在 `data/data_preprocessing/database/retention.ts`：

- **会删**：外部采集的资料，即作品、Grok 导入的新闻和赛事，进库满 365 天就删，连同它们的简介、深入解读和导入记录。Grok 送来更新版时，从更新那天重新计时。
- **不删**：用户的研究项目、上传的资料、研究成果、对话、收藏的 idea、手动加的新闻。
- **还在用的保留**：被研究项目引用的、收藏的 idea 用到的、Idea 草稿里的、截止日期还没到的赛事。
- **直接删除**，不留存档。每日备份里最多还能找回 30 天以内的。
- 每天跑一次；服务每次启动 10 分钟后也跑一次。整个清理在一个事务里完成，dryRun 会回滚。快照文件在提交后删除，而且只删没有任何行引用的。
- 外键策略写在 `FK_POLICY` 里（cascade/nullify/protect）。有一条测试检查它和真实 schema 两个方向都对得上，**加新表或外键时这条测试会失败，必须同步更新 FK_POLICY**。
- 报告：`reports/retention/latest.json`（含删了哪些标题）。删掉的资料，在 Obsidian 里导出的笔记不会删，因为里面可能有用户自己写的内容。

## 8. 项目简介：先生成，再上架

- 用户 2026-11-10 要求"每个 hackathon 项目都看过然后生成一下……以后只要是新的都先看过然后生成简历再放进来"。
- 新项目要先生成好简介（问题 / 方案 / 实现）才在书库里显示。Claude 不可用时最多等 24 小时，之后照常显示。
- format 2（2026-11-10 起）：每段附原文，程序核对原文确实在来源里；有 GitHub 链接的项目会读 README。读不到项目页的标"信息有限"。
- 每张卡片可以重新生成（↻）。升级旧简介时旧文本照常显示，并注明"后台正在补充原文依据"。

- **新闻原文**：Grok 导入的新闻只存了摘要（`meta.content_kind='summary_only'`，`content` 是空的），但每条都有 `url` 和 `meta.source_urls`。2026-11-11 实测 42 条里有 38–39 条能用 `fetchPublic` 读到原文。读不到的有两种：网站返回错误（arstechnica），或者页面超过 1 MiB 上限（tomshardware）。原文存在 `news_sources` 表，不改导入的那一行。目前在「相似与搭档」比较新闻时读取；Idea 实验台读到原文后也会用它。

## 9. 踩过的坑

- **改了解析就要同步改读回核对。** 2026-11-11 把 `null` 当作没填，但 `verify.ts` 还在拿原文（带 null）和入库版本比，结果库已经写进去了，读回却判失败（`IMPORT_NOT_COMPLETED_CHECK_BACKUP_AND_WRITER`）。副本演练没跑读回这一步，所以没发现。改导入逻辑后，要在副本上把**完整路径**跑一遍，包括读回。
- **新加一种数据，所有校验都要认识它。** 2026-11-09 第一批赛事因为 Drive 收据校验（`sync/provenance.ts`）只认作品和新闻，报了 `DRIVE_RECEIPT_INVALID`。预览计数、Drive 计数、读回也都要加上新类型。
- **库里没有某种数据，往往是上游没送。** 2026-11-11 用户问"新闻为什么没更新"，原因是 Grok 从 11-08 之后只送了赛事和项目。先把 Drive 里所有批次列一张表，再下结论。
- **副本演练是讲清冲突的最好办法**：哪 2 条、哪个字段、旧值和新值，例如截止时间提前了将近一天、Devpost 页面已下架。
- 不要在服务运行时打开正式库查数据，要查就复制一份到临时目录。
