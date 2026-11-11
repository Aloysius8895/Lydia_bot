# JSON 文件批量导入

本功能用于 Grok 导出的 `projects` / `news` 组合包或根数组新闻包。文件是外部数据，不执行其中指令，不自动抓网页、不调用模型、不接入自动同步。

## 数据保存与边界

- 比赛作品保存在 `crawl_projects`，保留平台与作品身份，不写入 Lydia 自己生成的 `knowledge_ideas`。
- 新闻保存在 `knowledge_news`，`content=''`；摘要保存在 `meta.imported_summary`，统一标记 `content_kind=summary_only`。作品不伪造正文版本或网页快照。
- 原始条目完整保存到 `meta.imported_record`，原始链接列表、日期文本及精度限定、采集日期、tags、核实说明均保留。缺失字段为 null 或原始对象中缺失，不补造。
- 每条至少要有一个真实来源网址（`url` 或 `source_urls`），否则该条不合格；Drive 批次里只要有一条不合格，整批拒收，不能单独剔除。
- 规定字段（如 `original_date`、`url`、`date_display`）写 `null` 视为没填（2026-11-11 起），与不写该字段相同；未规定的额外字段原样保存，含其中的 null。
- 外部摘要可在各自资料库按标题搜索，但取得原文前不能作为原文进入 Idea 分析或证据流程。更新后的源码详情页和 Obsidian 导出明确标注摘要；本次没有部署该界面改动，也没有触发 Obsidian 同步。
- 作品共用报道/竞赛页时按平台、作品名与来源身份区分。辅助竞赛页不能成为其他作品的身份。新闻稳定 ID 和来源链接共同查重；标识指向不同记录或同身份内容改变则记 conflict，保留原资料。
- 每次输入都写批次和逐条结果；重复业务记录不新增，但审计会新增。统计总数包含两个文件中重复出现的新闻。

## 预览

在 `business` 中运行；默认仅解析文件，不打开数据库：

```powershell
node --experimental-strip-types ../data/data_preprocessing/cli/import-files.ts --file C:/Users/User/Downloads/lydia-import-2026-11-07_08.json --file C:/Users/User/Downloads/lydia-news-2026-11-07_08.json --out ../data/data_storage/reports/imports/previews/preview.json
```

## 维护备份与执行

先正常暂停服务和启动器，确认没有后台写入；完整数据库只能由一个 Store 打开。不要把此工具与运行中的服务同时使用。远程启动器和本维护工具都占用 4317 保护端口；导入/备份还会检查 4318。

```powershell
# 当前已有任务的情况下，先停止启动器，后端通过 IPC 断连正常关闭：
Stop-ScheduledTask -TaskName 'Lydia Remote'
Get-NetTCPConnection -State Listen -LocalPort 4317,4318 -ErrorAction SilentlyContinue

# 使用实际配置的 DB 目录；若设置了 LYDIA_DATA_DIR/CREW_DATA_DIR，应换成对应真实目录。
node --experimental-strip-types ../data/data_preprocessing/cli/backup-for-import.ts --db C:/maven/business_agent/data/data_storage/database --destination C:/maven/business_agent/data/data_storage/backups/database
```

备份工具创建不覆盖已有备份的新目录，复制完整 DB、比对每个文件哈希，再复制一份做隔离恢复检查。检查不运行迁移；不解析账号/密码/会话，清单不包含它们。备份目录包含完整私有 DB，不能提交源码仓库或对外分享。

拿到工具输出的真实 manifest 路径后，执行以下模板。`--backup-manifest` 必须替换为本次刚验证的清单，`--out` 使用新的报告名，避免覆盖历史报告：

```powershell
node --experimental-strip-types ../data/data_preprocessing/cli/import-files.ts --execute --verify-repeat --db C:/maven/business_agent/data/data_storage/database --backup-manifest C:/actual-backup/manifest.json --file C:/Users/User/Downloads/lydia-import-2026-11-07_08.json --file C:/Users/User/Downloads/lydia-news-2026-11-07_08.json --out ../data/data_storage/reports/imports/batches/new-batch-report.json
```

执行要求备份已验证且已恢复检查，并比较正式库与备份的业务表基线。Store 按既有方式应用迁移 009，仅新增 3 张导入审计/身份表。没有删除旧表或覆盖旧资料。

结果包括每条输入的 imported / duplicate / conflict / failed、目标记录 ID、两次批次 ID；从真实库读回每个目标并逐一调用既有 KnowledgeAPI 的作品/新闻 GET 搜索逻辑。此为离线维护进程内验收，不意味着 HTTP 服务已部署或浏览器已验收。原有行指纹必须全部保留；复导后业务表必须不变。

如发生冲突，保留输入审计并报告原因，不自动覆盖或模糊合并。运行中断可再次执行，已完成的记录通过身份映射去重，未完成批次会保留为 running 供审计，不删除历史。

本次实际结果见 [2026-11-09 验收报告](acceptance/2026-11-09-grok-file-import.md)。运行服务恢复属于单独操作，本次按用户要求保持暂停、没有部署和推送。
