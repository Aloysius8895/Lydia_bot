# Drive 手动单批实施状态

日期：2026-11-09，Asia/Kuala_Lumpur。

更新：首批 `grok-daily-20261109-0230-test01` 已真实拉取并预览，解析为 1 作品/1 新闻；校验通过，未 execute、未写身份映射。实体匹配已有 2 条，当前严格导入器预计 1 duplicate、1 conflict（作品仅新增稳定 ID）。详见 [首批预览](acceptance/2026-11-09-drive-first-batch-preview.md)。

| 项目 | 当前状态 |
| --- | --- |
| 独立服务账号、drive.readonly、无域级委派 | 已真实连接并用于本批只读拉取 |
| Google Cloud Drive API、私有文件夹查看/下载共享 | 根目录与本批父目录、查看/下载检查通过 |
| 本机凭据保护 | Windows CurrentUser DPAPI 与当前用户 ACL 已实现；临时生成凭据的加解密和损坏错误脱敏通过 |
| Grok 上传 | 独立交付的首批文件已被 Lydia 读取并校验 |
| 单批 ready/file ID/校验 | 首批真实读取通过，1 作品/1 新闻；未入库 |
| 模拟拉取→入库→搜索读回 | 独立临时数据库通过 |
| 真实单批上传→拉取→入库→搜索 | 已到真实拉取/预览；入库与入库后搜索 NOT_RUN |
| 每日同步 | 2026-11-09 起启用：计划任务 Lydia Drive Daily，每天 10:00；冲突或失败的批次不写库，标为待处理 |
| 数据库迁移 | 本阶段不需要；复用现有三张审计表，仅可在 files JSON 附加 Drive provenance |
| 正式库和原有 52 条 | 本阶段未打开正式数据库、未执行真实导入、未修改 |
| 部署/推送 | 本次未执行；既有正式服务运行中，未停止或重启 |

## 已验证

`npm.cmd run check` 通过。

```powershell
node --experimental-strip-types --test --test-concurrency=1 tests/drive-manual.test.ts tests/file-import.test.ts tests/knowledge.test.ts
```

共 24 项通过。覆盖：精确文件 ID、同名不同文件、同批相同内容的新物理 ID、ready 冲突、错误父目录、快捷方式拒绝、下载/编辑权限、大小/哈希/条数、稳定条目 ID、原始 ready 字节保存、本地文件篡改、持久收据、单批去重、既有行指纹保留、Drive 来源审计、真实临时库搜索、401 令牌续取和上游错误脱敏。服务账号 JWT 仅申请 drive.readonly，断言没有 sub claim。

PowerShell 凭据导入脚本语法检查通过；实际加解密使用新生成的 TEST_ONLY 临时密钥，未读取本人真实服务账号文件。真实云端授权、组织策略、共享继承及账户是否有效必须在本人完成配置后实测。

## 下一步

按 [本机配置与交付契约](DRIVE_MANUAL_SETUP.md)完成本人配置；先运行只读 check，再由 Grok 上传一批真实小数据并最后上传 ready。先 pull 预览，确认资料及预计数量后，正常停写、完整备份与恢复验证，再显式 execute。逐条核对结果、记录 ID、现有 52 条行指纹与搜索读回。任何一环失败都不视为真实验收成功，每日同步继续关闭。
