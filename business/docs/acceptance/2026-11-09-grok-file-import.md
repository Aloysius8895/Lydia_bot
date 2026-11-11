# Grok JSON 真实入库验收

日期：2026-11-09，Asia/Kuala_Lumpur。

## 当前数据位置

正式数据库：`C:\maven\business_agent\data\data_storage\database`。

可阅读分类资料：`C:\maven\business_agent\data\data_storage\library`。

导入后已按用户要求迁移到根 data，旧报告内的 business/.runtime 路径为导入时历史值，不是当前运行路径。完整映射保留在 data/data_storage/reports/relocations。

## 入库与去重结果

- 37 个外部比赛项目、15 条新闻摘要，共 52 条真实业务记录。
- 两个原始文件合计 67 个输入，15 条新闻跨文件重复。
- 最终复导：新增 0、重复 67、冲突 0、失败 0。
- 正式库逐条读回、原始字段比对与现有作品/新闻搜索实现逐条检出均通过。
- 原有 3 个研究项目、19 份文档、187 个块与其他已有业务行指纹保留；未伪造知识库 Idea、网页快照、原文或已核实奖项。

| 阶段 | 批次 ID | 新增 | 重复 | 冲突 | 失败 |
| --- | --- | ---: | ---: | ---: | ---: |
| 首轮 | `d58a37bc-5022-46e4-affa-3703da5b9ac3` | 47 | 15 | 5 | 0 |
| 首轮复导 | `aed3259d-062b-4c6b-bac0-4bf380bec869` | 0 | 62 | 5 | 0 |
| 修正辅助 URL 后补全 | `ce02a870-518b-4a5f-b95a-c8354be71139` | 5 | 62 | 0 | 0 |
| 最终复导 | `2160b66d-3465-44b7-8279-0fc094ff35db` | 0 | 67 | 0 | 0 |

首轮 5 个 Hackster 作品被辅助竞赛页的过宽回退匹配拦为冲突，没有误合并或覆盖。修正为实际专属 URL/平台作品身份匹配并补测试后，再次完整备份并补全 5 条，所有历史审计保留。

## 迁移与分类验收

- 迁移存储文件 6,763 个，移动后逐文件 SHA-256 相同。原处理代码 36 文件、4 个维护入口在引用更新前逐字节保留。
- 迁移后 52 个正式记录再次读回、搜索并与分类目录 JSON 完整比对；原业务行指纹不变。
- 作品：{"finalist_claimed": 19, "participant_claimed": 10, "winner_claimed": 8}。
- 主题：{"ai": 11, "space": 5, "web3": 13, "hardware_iot": 8}。
- 标签索引 67 类、SDG 候选索引 3 类；251 个引用全部能定位到同一份记录。SDG 候选为整理建议，不是原始来源声明或独立核实。
- 数据库仍为唯一权威；分类目录是显式只读快照，没有接入自动同步。

## 备份与测试

备份位于 `C:\maven\business_agent\data\data_storage\backups\database`，含导入前和补全前两份完整备份及恢复检查副本，原始清单/文件内容不改写。

导入专项与知识库回归已通过；目录调整后的全套首次 121 项中 120 项通过，剩余 1 项是旧迁移数量断言（仍写 8），已改为核对实际迁移文件，相关 3 项重新验证通过。类型检查通过。前端未部署，正式服务保持暂停，未推送。

## 全部真实记录 ID

### 37 个外部作品

| 标题 | ID | 读回与搜索 |
| --- | --- | --- |
| Revora Health | `04d246ad-3ab8-42ed-9cb8-2a718c19205f` | 通过 |
| Bido | `05a8c92d-be8b-4514-b672-ebad99729343` | 通过 |
| ECI Centauri / Exoplanet Hunter AI | `0c3a2a20-519f-44dc-9c34-5c96dda1b303` | 通过 |
| DIVE | `1713a7c9-40c2-40f1-85ad-4bff97c7297f` | 通过 |
| Gaia+LEO | `2a328ca2-f8d0-4621-b5eb-74f77f45a6b1` | 通过 |
| Muralis | `2b71ef9b-3f5e-4e78-b07e-e588239b8cee` | 通过 |
| Curie | `2eafc7cc-a550-4323-81d2-f031e0289172` | 通过 |
| Bramble | `2ffaa82e-b828-41f5-86f7-934cb49c3ada` | 通过 |
| Aven | `3dcb6ee1-d36e-42dc-8bc7-3b6c2c06db7c` | 通过 |
| ENShell | `4245e583-79eb-4ef4-abfb-0488fed2d61b` | 通过 |
| CopyFlag | `44fe6160-ecd3-4738-97d0-9ffd1c67dbca` | 通过 |
| Edge-AI Spectrophotometer | `4654bc17-bb46-429b-9236-963f41397122` | 通过 |
| Astro Sweepers | `574e9137-e02b-4ab9-b26a-3c4a3136ae6c` | 通过 |
| True Deal | `59b52b2f-e572-4267-977e-9243de8d11fe` | 通过 |
| SpoilSafe | `59eda488-a19a-45cc-a248-8665627e4f36` | 通过 |
| CopeyBara | `6621fd50-60d1-4866-bbc0-861b46c52e06` | 通过 |
| Tokito | `6caf9742-3d71-47ec-ae7c-c7aa7cdc5c49` | 通过 |
| ApprenticeCircle+ | `7185dd23-f054-4d8c-93a7-bdffba8bc14d` | 通过 |
| STRUCTA | `71ea5bbc-e03b-4762-925b-7a31f97f9dcc` | 通过 |
| HaloSense V1 | `748a15d1-fa15-4d32-8470-76376857a692` | 通过 |
| Senthos | `751922dd-0906-4c4e-b9be-980a155ae503` | 通过 |
| Smart Coop 2.0 | `7fdd43d6-7683-46af-b6cc-db0340428342` | 通过 |
| Echo (TeamCookie()) | `819f1d34-b0be-4b6f-b1ae-dd5b047022a4` | 通过 |
| AgentBazaar | `a7218222-bbe6-49b8-9bed-cdd0f69fa5c8` | 通过 |
| CFO Copilot | `abae35f3-2c15-4d53-8f97-c0ff296eb222` | 通过 |
| RCT IRL | `b7af06c1-7996-4d84-b7cf-25eb3df2ffa1` | 通过 |
| Enconomy | `bff31e52-30ee-4e40-b241-89ccd0244abf` | 通过 |
| Tap2ETH | `c149c267-1ba5-43c2-8844-af33b117e025` | 通过 |
| CodeArcheology | `c4984487-d267-405a-a0bd-db101d39c679` | 通过 |
| CloudMap / AirWatch Pro | `caa2c2fa-5e51-48f6-853e-fab25f3a919c` | 通过 |
| Herald Protocol | `d2581912-3c31-418a-9e3b-93f5e9af226e` | 通过 |
| Takarabako | `d970b4f4-7705-4a52-85fc-cceb044aa152` | 通过 |
| RupeeRail | `e5027aff-0173-4e2d-826f-bc6dcb38e6d3` | 通过 |
| ciFHEr | `e60de305-f924-4e7e-859e-e0e575670f99` | 通过 |
| Smart Water Guardian AI | `f024b02c-d6a3-4f52-a1ea-4419dde54a8f` | 通过 |
| CosmicNova | `f7c84b04-9c21-49ca-8750-945698c8d150` | 通过 |
| yohaku | `fe609e86-62ea-4c87-9d35-883b6d463303` | 通过 |

### 15 条新闻摘要

| 标题 | ID | 读回与搜索 |
| --- | --- | --- |
| OpenAI 发布 BioBasicsBench | `0410b3b1-e809-4073-a3ff-88afac1953dc` | 通过 |
| Meta 无限期暂停商业条款更新 | `27e95d97-8db2-4c5c-9ce2-a6be8427e0a3` | 通过 |
| Meta 为 Muse 与 Meta AI 更新专项模型 | `32b89bf8-38e2-4210-bb14-64398a671782` | 通过 |
| OpenAI 据报已融110亿美元，估值1.25万亿 | `3c4b4946-8914-4f01-b316-42f41c8c550c` | 通过 |
| 美国民主党人重提暂停建设数据中心 | `449ef676-6414-4c7c-9b34-e8f4596dfb89` | 通过 |
| OpenAI 与 Hacktron 合作安全测试 | `478ab3b9-e50a-46f3-9809-564794d22980` | 通过 |
| Anthropic IPO 估值承压 | `4a392c55-ff5f-4b5b-be4c-be81173116b8` | 通过 |
| 美国情报备忘录称有人被招募接近黄仁勋 | `50755473-d557-45b0-b84b-43216b20abb7` | 通过 |
| 豆包工作个人版取消5小时额度限制 | `5d8a65e4-85f9-45c6-b88d-6e62d6682f75` | 通过 |
| Meta 在 Muse 推出 Spaces | `6ad08dbd-ab24-47d2-a0f5-948f07b8784d` | 通过 |
| Google 接手 Crusoe 怀俄明数据中心项目，计划投资170亿美元 | `92ed77db-944f-4228-b0f2-ae3868490e69` | 通过 |
| OpenAI 发布 GPT-6 Cyber | `9319044d-7caa-42a7-89c9-1a52d292cced` | 通过 |
| Google 推出 Gemini Omni 1.2 Flash | `a692c9b1-a84e-4cdd-b3ab-7457c5b02335` | 通过 |
| NVIDIA 完成10亿美元入股 Naver，持股4.13% | `d4c630b1-8607-493f-9503-9824271827b3` | 通过 |
| DeepMind AI 智能体在人工指导下发现旧版 RSA-1024 两处弱点 | `f8e43c72-625f-4732-8f4f-116d5d033ca2` | 通过 |

机器可读报告：data/data_storage/reports/imports/batches 与 reports/relocations。历史文件不改写，当前数据库与分类核验以 2026-11-09-final-layout-verification.json 为准。
