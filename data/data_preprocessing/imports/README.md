# 导入与分类

- parse.ts：JSON 结构、字段验证、原条目和身份规范化。
- store.ts：逐条事务、身份去重、冲突保护和批次审计。
- verify.ts：行指纹、真实读回、作品与新闻搜索验证。
- catalog.ts：依据标签/状态组织可阅读目录，区分 SDG 候选和核实结论，不修改数据库。

原始输入在 `../../data_storage/raw_imports`，分类快照在 `../../data_storage/library`，结果在 `../../data_storage/reports/imports`。CLI 在相邻的 `../cli`，没有自动同步。
