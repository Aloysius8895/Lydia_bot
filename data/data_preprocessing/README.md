# 数据处理代码

本目录只放数据处理、存储接口和维护工具，真实数据放在相邻的 `../data_storage`。

| 目录 | 职责 |
| --- | --- |
| RAG | 获取与清理、分块、检索、embedding、查询扩展、重排 |
| database | PostgreSQL/pgvector schema、增量迁移、参数化存储接口 |
| crawl | 采集结果持久化、任务恢复、来源证据、关系与 RAG 投影 |
| imports | 外部解析、去重、批次结果、读回和分类目录导出 |
| sync | Drive 只读认证、父目录/文件身份与 ready 校验、手动交付收据 |
| cli | 必须显式运行的导入、备份、分类快照与历史迁移命令 |

RAG/providers 只放提供器；database/migrations 只放不可原地修改的迁移。不把真实数据库、抓取正文、报告和备份放进源码目录。
