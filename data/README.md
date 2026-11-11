# 数据目录（当前布局，2026-11-09）

数据处理代码和实际资料现已分开，实际数据库不再放在 business。

```text
data/
├─ data_preprocessing/              # 处理代码，进入版本控制
│  ├─ RAG/                         # 来源抓取、分块、检索、查询扩展与重排
│  │  └─ providers/                # embedding 提供器
│  ├─ database/                    # schema、迁移、Store 与通话存储接口
│  │  └─ migrations/              # 只增不改的数据库迁移
│  ├─ crawl/                       # 采集结果、证据、关系、快照与投影处理
│  ├─ imports/                     # JSON 解析、去重、审计、读回与分类导出
│  ├─ sync/                        # Drive 只读认证、交付校验和手动收据
│  └─ cli/                         # 导入、备份和显式导出维护命令
└─ data_storage/                   # 实际资料，已忽略，不提交仓库
   ├─ database/                    # 唯一正式 PGlite 数据库
   ├─ library/                     # 可直接阅读的分类快照
   │  ├─ hackathon_projects/        # 状态 → 主题 → 子主题 → 平台 → 作品
   │  ├─ news/                     # 主题 → 子主题 → 采集日期 → 新闻
   │  └─ indexes/                  # 标签、发布者和 SDG 候选索引
   ├─ raw_imports/grok/             # 原始 JSON 资料包存档
   ├─ crawl/                       # 抓取快照、正文和导出对象
   ├─ research/exports/            # 研究项目 → 时间/版本 → 报告
   ├─ backups/database/            # 完整备份和隔离恢复检查副本
   └─ reports/
      ├─ imports/previews/          # 字段映射预览
      ├─ imports/batches/           # 导入、复导和逐条结果
      └─ relocations/              # 迁移映射、哈希与记录核验
```

直接查看 [分类资料目录](data_storage/library/README.md)。37 个作品和 15 条新闻各有独立文件夹，README.md 显示摘要，record.json 保留真实记录 ID、原始字段与来源。分类目录是显式导出的只读快照，数据库是唯一权威，不进行自动同步。

finalist_claimed/winner_claimed/participant_claimed 表示上游声称，未升级为独立核实；主题依据原始 tags。SDG 候选索引保留规则和标签依据，不伪造正式 SDG 归属。

维护工具在 data_preprocessing/cli，见 [维护说明](data_preprocessing/cli/README.md)。依赖仍由 data 根 package.json 管理；路径统一由 business/shared/data-paths.ts 按模块位置解析。真实数据库只能由一个进程打开，不手工编辑 PostgreSQL 文件，不推送资料和备份。

本次实际文件与记录核验见 [目录迁移验收](docs/2026-11-09-layout-acceptance.md)。

Drive 接收仅实现手动单批，尚未连接或做真实云端验收，每日同步关闭。Google Cloud、私有文件夹共享和本机凭据步骤见 [Drive 手动配置](docs/DRIVE_MANUAL_SETUP.md)。
