# 数据输入、备份、Drive 与保留期限

## JSON 输入与身份

入口 `data/data_preprocessing/cli/import-files.ts`，解析／入库／验收分别在 imports/{parse,store,verify}.ts。先读实际附件结构，不凭文件名猜 schema；已支持 projects/news 包装及新闻根数组，赛事按 `data/docs/GROK_HACKATHON_EVENTS.md` 契约和现有 parser。

- 外部作品进 crawl_projects，新闻进 knowledge_news，赛事进 hackathon_events；不写成 Lydia 自己生成的 knowledge_ideas。
- 外部新闻摘要放 meta.imported_summary，`content=''`、`content_kind=summary_only`，原条目保存在 meta.imported_record。作品也不伪造全文／原始快照。
- 每条须有真实来源 URL。Drive 批次任一无效整批拒收，不能声称会在预览时静默剔除坏行。
- 2026-11-11 修正：规定的可选字段写 null 与缺失相同；任意扩展字段仍原样保存。日期不确定留空／未知，不拿采集日期替代发布日期。
- 按稳定条目 ID、平台／作品身份及来源共同查重。共用报道、赛事链接不能成为不同作品的主身份；不同 ID 指向同实体不能直接新增。
- 同身份内容改变按当前实现记 conflict 并保留旧记录，不把「计划支持更新」写成已能自动覆盖。新增别名或接受冲突需按具体用户决定执行。
- 每次输入保存 batch／item 审计；复导业务不新增，但审计可能新增。原始交付和失败不能删除来美化结果。

## 离线维护标准流程

1. 默认解析预览不打开正式库。预览数、身份与冲突可先利用已有报告或备份副本核对。
2. 确认实际数据库路径和唯一写入者。正常停止当前启动器／服务；远程任务会自动重启进程，不能只杀后端。
3. 取得 4317 维护锁并检查 4318 无监听；锁不足以证明其他端口没有误开的写入者，还需核对启动配置。
4. 运行完整备份：拒绝源内备份；复制全库；逐文件路径、字节、SHA256 比对；再复制 restore-check 并只读打开，记录业务表基线与迁移，不运行迁移。
5. 用本次真实 manifest 显式 execute，比较基线，按条事务导入，不覆盖冲突。
6. 逐条正式读回，调用既有作品／新闻搜索逻辑，核对目标 ID、字段、计数和原有行指纹。复导业务应 0 新增。报告失败后停止，保留备份和审计，不擅自回滚覆盖现有库。
7. 恢复之前确实运行的服务，验证能看到同一批资料。离线进程内读回不能替代线上 HTTP 或页面验收。

以下命令从 business 运行，`$inputFile` 为用户提供的实际 JSON，`$manifestFile` 为本轮工具返回值，`$reportFile` 为新报告绝对路径：

```powershell
node --experimental-strip-types ../data/data_preprocessing/cli/import-files.ts --file $inputFile --out $reportFile
node --experimental-strip-types ../data/data_preprocessing/cli/backup-for-import.ts --db C:/maven/business_agent/data/data_storage/database --destination C:/maven/business_agent/data/data_storage/backups/database
node --experimental-strip-types ../data/data_preprocessing/cli/import-files.ts --execute --verify-repeat --db C:/maven/business_agent/data/data_storage/database --backup-manifest $manifestFile --file $inputFile --out $reportFile
```

正式路径有环境覆盖时替换为已核实路径，不直接复制旧进程 JSON 中的 Hackathon_map。备份含完整私有资料，不提交。`export-data-library.ts` 只读库、显式生成分类快照并拒绝覆盖；历史 relocate 工具不重跑。

## Drive 交付与只读拉取

Grok 上传与 Lydia 拉取使用独立授权。Lydia 专用服务账号、文件夹查看者、drive.readonly、无域级委派。私钥仅本机 CurrentUser DPAPI／ACL 保存，不读到聊天、不提交、不复制至 skill。当前代码在 sync/{credentials,drive-client,drive-batch,receipts,provenance}.ts。

每批独立文件夹，内容文件上传完成后最后放 ready.json。精确核对 root、batch、file ID、父子关系、是否快捷方式、查看下载权限、字节、SHA256、records 和稳定条目 ID。同名文件可并存，不能按名字选「最新一个」；批次 ID + 文件 ID + 逻辑内容哈希用于去重和冲突。保留原始 ready 字节和 provenance；收据不单独证明数据库已入库。401 按现有有限续取／重试，授权失效明确报错。

首次连接按 check → pull 预览 → 已验证备份 → execute → 复导／搜索读回验收；不推断 Grok 能写本机磁盘。电脑关闭时 Drive 保存交付，电脑恢复后才能处理，不能宣称 Lydia 关机仍运行。

## 每日同步（后续决定已覆盖「仅手动」阶段）

用户选择每天早上 10:00，计划任务名 `Lydia Drive Daily`；client 时区为 Asia/Kuala_Lumpur，Windows 调度依主机时区，排障时核对。入口 drive-daily.ts，注册／移除 setup-drive-daily.ps1；没有必要不要重建任务。

发现批次 → 验证 → 跳过已导入与内容未变的 REVIEW_REQUIRED → 无新数据则不动服务 → 停服务 → 完整备份 → 在备份副本演练 → 0 conflict 且 0 failed 才正式导入 → repeat／读回／旧行保留检查 → finally 恢复原运行服务 → 按保留策略清理自动备份 → 报告。4315 防每日任务重叠，4316 防 Drive 收据并写，4317 维护，4318 服务。

`--plan` 会真实访问 Drive 但不停止服务／写业务库；不能称离线演练。正式执行失败后停止处理后续批次，保留 ERROR／待处理原因；同一未改冲突批次不每天反复停机。

新闻缺失按生产者是否交付 news.json → ready 是否齐全 → 字段／网址有效 → 冲突／演练结果 → 导入报告 → 现有 API 排查。曾经实际是 Grok 只送赛事／项目，另一个 DailyNewsAutoPublish 项目没有接 Lydia，不能归咎于 retention 或直接改库。

## 365 天时效性（2026-11-11 用户决定）

实现 database/retention.ts：从入库／最后刷新算 365 天，不从内容发布日期算。服务启动 10 分钟后一次，再每天一次；数据库删除事务失败整体回滚。删除外部作品、Grok 新闻／赛事、相关简介／深入解读／导入记录和无引用采集历史；磁盘 blob 清理另核对实现，不能把数据库事务说成文件系统也可事务回滚。

保护研究项目、上传、成果、聊天／通话、收藏 idea、IdeaLab 记录和手工新闻；仍被研究引用、收藏／草稿／运行中的 Idea 使用、正在生成简介／深入解读、未到截止日期的活动继续保留。直接删除、不另留存档；自动备份仍可能在配置的保留窗口内含旧副本。默认 keep 30 是备份份数策略，错过运行时不保证恰好 30 个自然日。

新外键必须更新 FK_POLICY（cascade/nullify/protect）并通过 retention.test.ts。报告 `reports/retention/latest.json`，保存最近摘要和有限运行明细。数据库过期不会删除 Obsidian 用户笔记，Index 更新不等于笔记删除。
