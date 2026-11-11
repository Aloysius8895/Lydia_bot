# Drive 手动单批接收

本阶段仅手动：不创建轮询、定时任务、每日服务或公开写入接口。Grok 的上传授权与 Lydia 的服务账号完全独立。

- credentials.ts：固定本机 DPAPI 凭据位置、服务账号结构和 drive.readonly scope。
- drive-client.ts：固定 Google OAuth/Drive 主机、只读 GET、短期令牌续取、有限重试与脱敏错误。
- drive-batch.ts：根/批次/文件 ID、查看/下载权限、ready 冲突、SHA256、字节数、条数及稳定 ID 校验。
- receipts.ts：原始交付保存、逻辑批次去重和物理交付审计。收据不是数据库已入库的独立证明。
- provenance.ts：把经过验证的 Drive 标识附到现有导入批次 JSON 描述，不增表。

操作步骤见 [Drive 配置与验收](../../docs/DRIVE_MANUAL_SETUP.md)。实际 Google Cloud、共享权限、凭据、Grok 上传与真实联调均待用户完成，不把模拟通过描述成云端已连接。
