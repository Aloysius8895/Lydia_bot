# Google Drive 手动单批配置与验收

2026-11-09 更新：每日自动导入已启用（计划任务 `Lydia Drive Daily`，每天 10:00，`data_preprocessing/cli/drive-daily.ts`）。流程与下文手动验收相同，另加备份副本上的演练导入：有冲突、无效条目或任何检查失败的批次不写库，标为待处理并显示在「追踪 Hackathon」面板顶部。自动备份放在 `backups/database/daily/`，只保留最近 30 份；手动备份不会被清理。运行结果见 `data_storage/reports/sync/daily/latest.json`。

状态更新：服务账号已完成真实只读连接；首批 1 作品/1 新闻已拉取、校验及预览，未 execute 入库。见 [首批预览](acceptance/2026-11-09-drive-first-batch-preview.md)。每日同步关闭，无部署、推送或现有 52 条修改。以下为配置与后续验收步骤，预览通过不等于已入库。

## 你需要先完成的 Google Cloud 配置

1. 使用本人账号打开 Google Cloud Console，创建或选择专用项目，例如 Lydia Drive Receiver。
2. 在 API 与服务的库中启用 Google Drive API。
3. 在 IAM 与管理 → 服务账号创建 `lydia-drive-reader`。无需授予项目 Owner/Editor，也无需域级委派，不填写代用户身份。
   此方案不需要创建 API key、用户 OAuth client 或 OAuth 同意屏；Drive 的查看权限在文件夹共享里授予，代码固定申请 drive.readonly。
4. 进入该账号的 Keys，创建 JSON 凭据并下载到本机、非同步、非 Git 仓库的私有目录。不要把 JSON、private_key、access token、截图或其内容发到聊天/日志/交付目录。
5. 若组织策略禁止生成服务账号密钥，不修改或绕过组织策略；让管理员评估允许的本机凭据方式。

官方依据：[创建凭据与直接共享](https://developers.google.com/workspace/guides/create-credentials)、[密钥管理](https://docs.cloud.google.com/iam/docs/keys-create-delete)。仅在读取被直接共享的文件夹时无需管理员角色和域级委派。

## 交付根文件夹的共享

1. 在 Drive 创建本人拥有的专用根文件夹，例如 `Lydia-Grok-Deliveries`。
2. 保持“常规访问权限”为受限，不启用任何人可访问的链接。
3. 把服务账号邮箱添加为查看者。允许查看者下载文件，不只分享元数据视图。
4. 记录根 folder ID（文件夹网址中 folders/ 后的 ID），不要依赖可重名的名称。
5. 另行把 Grok 上传方需要的身份连接到此文件夹；Grok 的认证由它独立保存，不接收 Lydia 的只读凭据。
6. 首次准备时用普通 My Drive 专用文件夹即可；如果使用 Workspace Shared Drive，先确认组织允许分享给服务账号，以及子文件可继承查看和下载权限。

`drive.readonly` 是程序申请的只读范围，不是自动缩到一个文件夹。服务账号只能获得这个交付目录的共享，不共享其他资料；程序还会固定检查根 folder ID。代码拒绝看到 canEdit=true 或缺少下载权限的交付对象。

## 本机安全导入凭据

在运行 Lydia 的同一 Windows 用户下，以普通 PowerShell 执行。命令会提示输入本机 JSON 文件路径，不接受你把 JSON 内容粘贴进命令。

```powershell
cd C:\maven\business_agent\data
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\data_preprocessing\cli\protect-drive-credential.ps1
```

脚本用 Windows DPAPI CurrentUser 加密，目录 ACL 仅授予当前用户。加密结果保存在 `business/deployment/.runtime/credentials/google-drive-reader.dpapi`；该目录已忽略，不进入 Git、数据库备份或交付文件。程序只通过内部进程管道解密到内存，不打印内容，不使用 .env 储存私钥。

脚本不自动删除明文下载副本。加密和连接检查成功后，由你自行将原 JSON 移出日常下载/同步目录并安全保管或处理。任何凭据轮换都只在本机进行；显式 `-Replace` 可原子替换旧加密凭据，不涉及数据库。

## 连接检查（不入库）

在下列命令中把 `ROOT_FOLDER_ID` 替换成真实 ID，参数仅是普通标识，不是密钥：

```powershell
node --experimental-strip-types data_preprocessing/cli/drive-manual.ts --check --root-folder-id ROOT_FOLDER_ID
```

只检查服务账号能读取正确根目录且无编辑权限，不上传、不改共享、不打开数据库。结果必须是 CONNECTED 且 daily_sync_enabled=false；这还不代表 Grok 上传或入库已经通过。

## 给 Grok 的交付约定

每批新建独立文件夹。先上传 `projects.json` / `news.json` 普通 JSON 文件，等待获得各自 file ID，最后上传 ready.json。JSON 不转换为 Docs，不使用快捷方式。每个资料条目必须有长期不变的 id；作品继续是外部项目，不生成 Lydia Idea。

ready 使用下列字段契约，示例中的 ID 和 SHA256 只作字段说明，必须换成真实值；SHA256 是文件原始 UTF-8 字节的 64 位小写十六进制摘要：

```json
{
  "schema_version": "1",
  "producer_id": "grok-daily",
  "batch_id": "unique-batch-id",
  "batch_folder_id": "BATCH_FOLDER_ID",
  "created_at": "2026-11-09T12:00:00+08:00",
  "files": [
    {"kind": "projects", "file_id": "PROJECTS_FILE_ID", "sha256": "<64位真实SHA256>", "bytes": 1234, "records": 1},
    {"kind": "news", "file_id": "NEWS_FILE_ID", "sha256": "<64位真实SHA256>", "bytes": 1234, "records": 1}
  ]
}
```

允许只有一种资料文件，最多各一份；kind 可为 projects、news 或 events（追踪中的赛事，字段见 [GROK_HACKATHON_EVENTS.md](GROK_HACKATHON_EVENTS.md)）；文件每份不超过 10 MiB、10000 条；ready 不超过 256 KiB。导入字段继续使用已批准的 Grok JSON 契约。未来修订版本字段可随原条目保留，但本手动阶段不会自动更新旧条目：内容变化一律 conflict，保留原有资料。

同名文件不代表同一文件。程序按 ready 的 file ID 精确下载，校验父目录/哈希/大小/条数。相同批次、相同内容但新 file ID 为重复交付；同批内容不同则冲突，不按“最新同名”覆盖。ready 自己的 ID 由读取时记录，不能把自身 ID 当资料文件。

## 手动拉取及预览（不入库）

```powershell
node --experimental-strip-types data_preprocessing/cli/drive-manual.ts --pull --root-folder-id ROOT_FOLDER_ID --batch-folder-id BATCH_FOLDER_ID --producer-id grok-daily
```

存在多个相同交付的 ready 时可增加 `--ready-file-id READY_FILE_ID`。不同内容的 ready 仍会拒绝，不允许通过这个参数跳过冲突。

默认仅拉取、校验和预览，输出 VALIDATED_NOT_IMPORTED。原始字节保存在 `data_storage/raw_imports/drive/<producer>/<batch>/<逻辑校验值>/`，收据/操作记录保存在 `data_storage/reports/sync/manual/`。文件 ID、ready 原始 SHA、逻辑批次 SHA、条目标题和外部 ID 可见；凭据和上游错误正文不可见。

重复拉取不代表重复入库。收据显示曾入库也不替代数据库检查；显式 execute 仍通过实际导入与读回验证。

## 备份后显式入库及验收

先暂停 Lydia 服务和自动重启启动器。备份必须对应当前真正的数据库；不能直接沿用迁移前指向旧地址的历史备份清单。

```powershell
node --experimental-strip-types data_preprocessing/cli/backup-for-import.ts --db C:/maven/business_agent/data/data_storage/database --destination C:/maven/business_agent/data/data_storage/backups/database
```

使用上述工具刚生成并验证恢复的清单：

```powershell
node --experimental-strip-types data_preprocessing/cli/drive-manual.ts --pull --execute --root-folder-id ROOT_FOLDER_ID --batch-folder-id BATCH_FOLDER_ID --producer-id grok-daily --backup-manifest C:/真实新备份目录/manifest.json
```

该命令会复用现有三张审计表和独占导入 CLI，无新迁移。批次 files JSON 中追加经过验证的 Drive provenance，包括根/批次/ready/资料 file ID、校验值、producer 和 batch ID。没有后台轮询或服务启动。

正式验收必须核对：

1. Grok 的真实上传记录及文件 ID，ready 确实最后上传。
2. 拉取后的真实 SHA256、字节和条数与清单一致，同名新文件不被混淆。
3. 实际导入计数、逐条目标 ID、真实数据库搜索读回与批次 provenance。
4. 自动复导新增 0；已有 52 条及研究资料的行指纹保留。来源内容变更记录冲突，不覆盖。
5. 缺失 ready、校验错误、权限撤销、错误根目录、同批异内容均不能误记成功。
6. 每日同步开关依然 false，未创建任务。双方和首批真实验收通过后才另行进入每日同步实施。

## 授权失效和恢复

- 短期 token 到期：代码重新签发短期访问令牌；401 最多刷新一次，不无穷循环。
- AUTHORIZATION_REQUIRED / CREDENTIAL_STORE_UNREADABLE：检查本机凭据、服务账号及密钥状态；本机显式 -Replace 导入新凭据后先重跑 check，再重跑 pull。
- FOLDER_PERMISSION_REQUIRED / FILE_MISSING_OR_NOT_SHARED：恢复同一服务账号对正确根目录及子文件的查看/下载共享，再检查。绝不自动改为公开或申请写权限。
- NETWORK_RETRY_REQUIRED / REMOTE_RETRY_REQUIRED / RATE_LIMIT_RETRY_REQUIRED：保留交付与原始字节，有限重试或等待后手动重跑，不清空收据。
- AUTH_TEMPORARILY_UNAVAILABLE：Google 令牌端点限流或暂时故障，等待后手动重试，不自动认定私钥失效或要求扩大权限。
- CONTENT_CONFLICT / ready 冲突：保留原输入和状态，要求 Grok 使用新 batch ID 修正交付；不按时间挑一个覆盖。
- IMPORT_NOT_COMPLETED_CHECK_BACKUP_AND_WRITER：检查是否停写、备份是否是本库最新基线以及当前入库报告。若部分已提交，先重新备份当前库再显式执行，已有条目会通过身份去重，不丢失审计。

操作报告只记录安全错误码与恢复动作，不记录密钥、授权头、令牌或 Google 的原始错误消息。没有连接凭据时不会尝试真实联调，不把本地模拟验收写成云端已可用。
