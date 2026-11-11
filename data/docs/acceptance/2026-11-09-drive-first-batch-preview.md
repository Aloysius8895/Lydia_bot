# Drive 首批拉取与去重预览

日期：2026-11-09，Asia/Kuala_Lumpur。状态：VALIDATED_NOT_IMPORTED；未 execute，未入库，未补写身份映射，每日同步关闭。

批次：`grok-daily-20261109-0230-test01`；producer：`grok-daily`。

## 校验结果

- 根/批次/文件父目录、普通 JSON、只读与下载权限检查通过。
- ready 及两份资料已由独立服务账号真实读取。两份资料的 SHA256、字节数和条数均与 ready 一致，原始 ready 字节也与接收记录一致。
- 包装兼容：projects 文件采用 {"projects":[…]}，news 文件采用 {"news":[…]}，实际解析为 1 个作品及 1 条新闻，无需修改解析器。

| 文件 | Drive file ID | 字节 | SHA256 |
| --- | --- | ---: | --- |
| ready.json | `1PW8maJrLFNYFAijpCXCCEBUdIC6Zgrk6` | 529 | `e2bad81290326bd3a23445780f34a12aa639260f63973f278b06ae8be1964ca1` |
| projects.json | `1ew2UeaCZ4RBclAyGzvCBYytGm3Rn0Zhs` | 749 | `5676b6510669488c94301d0661bfe68df075140c49a07bae7699aafab598c7d1` |
| news.json | `1PRFzKVfm3jb71sVUWkIlOTS0xIGPygHp` | 1034 | `fab2dd259df759ba081432cadac5a5d8a09ccb46ab83fd207ee9d76d6cd9e650` |

## 身份与内容分开判断

| 条目 | 历史 Lydia ID | 比对结果 | 当前严格导入器预测 |
| --- | --- | --- | --- |
| Takarabako | `d970b4f4-7705-4a52-85fc-cceb044aa152` | 同一历史实体；差异字段：id | conflict |
| OpenAI 发布 GPT-6 Cyber | `9319044d-7caa-42a7-89c9-1a52d292cced` | 同一历史实体；差异字段：无 | duplicate |

- Takarabako 的平台、专属作品 URL、标题及除 id 外的全部原始字段均与历史入库记录相同。新增稳定 ID project-ethglobal-takarabako 应关联原 UUID，不能创建第二个作品。
- 现有指纹包含 id，因此它会先命中旧作品，再因为新增 id 触发 EXISTING_CONTENT_DIFFERS_PRESERVED。该保护会阻止新增/覆盖，但当前尚未支持把仅新增稳定 ID 单独作为身份补录处理。本轮未修改代码策略或写入别名。
- 新闻沿用 news-2026-11-07-01，完整原条目及指纹相同，预计 duplicate。
- 业务身份口径：已有 2、新增 0。当前导入器口径预测：新增 0、重复 1、冲突 1、失败 0；这是预判，不是实际入库计数。

## 比对依据与边界

Identity comparison uses the previously verified real-database catalog and historical import fingerprints. The live service is running; no second PGlite connection, live identity query, or database write was performed. No new stable-ID mapping was persisted.

正式服务正在运行，未暂停或重启服务，也未另开正式 PGlite。身份依据为此前已从正式库逐条核验的分类快照及历史真实导入指纹；本次未实时查询 file_import_identities。所有写入仅限原始下载、收据与本预览报告。

机器可读报告：`C:\maven\business_agent\data\data_storage\reports\sync\manual\previews\grok-daily-20261109-0230-test01-identity-review.json`。
