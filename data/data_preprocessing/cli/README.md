# 数据维护命令

在 `C:\maven\business_agent\data` 显式执行。

| 入口 | 作用 |
| --- | --- |
| import-files.ts | 默认仅预览；execute 导入要求备份和停写 |
| backup-for-import.ts | 完整备份、文件哈希与隔离恢复检查 |
| export-data-library.ts | 对正式库只读，输出一次分类目录，拒绝覆盖已有目录 |
| relocate-data-storage.ts | 历史迁移工具，旧源已消失，不重复运行 |
| protect-drive-credential.ps1 | 将本机服务账号 JSON 加密为当前 Windows 用户 DPAPI 凭据；不连接云端 |
| drive-manual.ts | 显式连接检查、单批拉取预览、备份后入库验收 |
| drive-daily.ts | 每日 10:00（计划任务 Lydia Drive Daily）：发现新批次 → 预览 → 停服务、备份 → 在备份副本上演练导入 → 0 冲突 0 失败才正式导入并读回 → 重启服务、清理旧自动备份。`--plan` 只列出将要处理的批次 |
| setup-drive-daily.ps1 | 注册/移除 Lydia Drive Daily（`-RootFolderId`、`-At`、`-Keep`、`-Remove`） |

导出不抓网页、不调用模型、不部署、不同步 Obsidian。修改分类目录不会反写数据库。维护工具占用 4317 保护端口并检查 4318 服务。

Drive 操作另用 4316 防止两个手动进程同时写收据，只有显式 execute 时才调用需要停写/备份的导入器。完整步骤见 [Drive 配置](../../docs/DRIVE_MANUAL_SETUP.md)。
