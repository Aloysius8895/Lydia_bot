# Hackathon 缺口研究团队使用说明

当前位置：六技能及其references/assets位于 `C:/maven/Hackathon_map/business/skills`；本指南、案件、测试与制作记录位于 `C:/maven/Hackathon_map/business/expert-team`。历史测试输出中的旧路径保留为当时的实际加载记录，当前调用使用新路径。

本目录是基于公开方法构建的 AI 研究能力，不是五位专家本人参与、授权背书或人格复制。没有启动真实新比赛研究，没有选择真实缺口，没有真人访谈或外部联系。

## 入口与职责

| 角色 | 实际入口 | 核心方法与边界 |
|---|---|---|
| Steve Blank | [steve-blank-discovery](../skills/steve-blank-discovery/SKILL.md) | 假设地图、搜索先于扩张、早期客户、最小学习；成品不等于证据 |
| Ash Maurya | [ash-maurya-lean-model](../skills/ash-maurya-lean-model/SKILL.md) | 一页假设、GO LEAN、最小价值与实验、承诺分层；明确选择后才建模式 |
| Teresa Torres | [teresa-torres-opportunity](../skills/teresa-torres-opportunity/SKILL.md) | 具体故事、单案快照、跨案机会与OST分层；评论不是本团队访谈 |
| April Dunford | [april-dunford-positioning](../skills/april-dunford-positioning/SKILL.md) | 真实替代→能力→价值→在意者→类别；早期定位仅假设 |
| Bob Moesta | [bob-moesta-demand](../skills/bob-moesta-demand/SKILL.md) | 转换时间线、四力量、角色与取舍；兴趣和类似支出不等于本方案付费 |
| 流程主控 | [hackathon-gap-research](../skills/hackathon-gap-research/SKILL.md) | 共享案件、实际采集、交接、选择关卡、模式与验证；不扮演第六专家 |

制作顺序：Steve → Ash → Teresa → April → Bob → 主控 → 验收。未来研究顺序：Steve → 实际联网采集 → Teresa → April → Bob → Steve复核 → 缺口清单 → 等用户选Gap ID → Bob/April/Ash/Steve完成模式与验证。

先交付有证据的缺口清单，用户选择后才提供针对一个缺口的一页模式和真人验证问题。“继续”不等于选择。所有角色用同一案件台账；方法S编号不能充当市场E编号。

## 版本、来源口径与薄弱点

制作日期/资料截止：2026-11-03，Asia/Kuala_Lumpur。产物版本：本地构建v1（后续修订见测试日志）。Nuwa为本地metadata.version 1.0.0，非Git克隆，commit未知；未更新或修改Nuwa源目录。

| 人物 | 实质材料 | 本人一手 | 其他材料 | 一手比例（宽口径） |
|---|---:|---:|---|---:|
| Steve | 9 | 8 | NSF机构一手1 | 9/9，100% |
| Ash | 9 | 9 | 无 | 9/9，100% |
| Teresa | 8 | 5 | 机构词条1、参与者采访报告2 | 8/8，100% |
| April | 8 | 6 | 外部二手报道/整理2 | 6/8，75% |
| Bob | 8 | 4 | 实施方案例3、机构理论兼案例转述1 | 8/8，100%（理论/实施层） |

宽口径的一手包括机构自己发布的方法/制度与项目参与者、实施方对自己工作的报告；不等于专家本人一手，更不等于独立证实业绩。若对Bob的餐桌历史案例使用最保守转述口径，则为7/8（87.5%）；本人材料只有4/8（50%），不能写成“本人一手超过一半”。Teresa两篇采访不是Teresa亲笔。42份不同材料中32份为本人文章/发言；同一故事不算多个独立案例。日期未知如实保留，网页显示日期不证明初版日期。部分正文只读相关段，未声称全书或完整影音已读。

各人完整来源、发布日期、访问日期、已读范围、规则映射及限制见各自references/source-index.md与sources.json。没有复制原始书籍全文。当前主要缺口：独立批评覆盖薄弱；Steve/Ash的完整长对话覆盖有限；Bob最近12个月个人方法变化未充分核验；方法测试材料与提炼材料重叠，没有真正留出测试。

## 重叠与张力

Steve与Ash都拆假设，前者管验证顺序，后者管所选模式和当前约束。Teresa强调开放故事，Bob聚焦实际转换；两者都可能漏掉无法购买者，须补查未消费与退出群体。April对成熟赢单的分析不能直接迁移到尚无客户的产品。Ash早期价格测试和开放发现访谈应分开。

Steve的培训访谈要求、Teresa的持续习惯与Bob的小样本深访用于不同学习问题，不能合并成统一统计门槛。本次提炼是专业范围内方法/启发式，不为满足Nuwa模型数量而虚构跨域心理规律。

## 当前已验证的加载方式

已实际验证：独立agent用本地文件读取SKILL.md，再按相对引用读methods/cases/source-index并执行题目；主控按需读取五个角色并串行完成TEST_ONLY案件。文件读取进入上下文称LOADED，不等于平台技能注册。测试中角色是同一运行者串行，人物单人测试及普通AI对照才是不同上下文；多角色不构成真人证据。

本目录不在本会话的已公布可自动发现技能目录中。本次未安装/注册、未改全局设置，`$hackathon-gap-research`自动命中状态为NOT_VERIFIED，不承诺任意平台通用。当前可用方式是明确要求读取本地绝对路径。需要未来做原生注册时，另按目标runtime实际文档与授权实施；本交付无需先注册。

可直接使用的请求：

```text
请读取 C:\maven\Hackathon_map\business\skills\hackathon-gap-research\SKILL.md，
按其中的相对引用加载必要协议和角色，使用本会话实际联网工具执行。
比赛 brief：<粘贴比赛题目、全部用户类别与评分标准>
地域：马来西亚；团队与时间限制：<填写>。
案件ID：<填写唯一ID>；selected_gap_id：未选择。
先建立共享案件与证据台账，调查三类缺口并交付清单，
到 AWAITING_SELECTION 等我选 Gap ID，不自动建商业模式，不联系任何人。
缺少资料先记录未知，并继续不依赖它的调查。
```

以上尖括号为调用者待填输入，不是现有真实比赛资料。未提供brief时主控不能自动重做Domain 1。

## 验证文件与复现

- 方法实际输出、独立原文评分：[FIDELITY_EVALUATION](tests/FIDELITY_EVALUATION.md)。
- 初轮方法14PASS/1PARTIAL，TT针对性修复后五题复测通过；不累计成新题准确率，不代表独立留出。Steve原AI边缘题与已读材料重叠，额外新情境另存SB-edge2输入/输出/评分。
- 团队真实输入：[inputs.json](tests/inputs.json)；[加载版输出](tests/team-actual-output.md)；[普通AI输出](tests/baseline-actual-output.md)。
- [团队判定](tests/TEAM_EVALUATION.md)：12/12；[基线对照](tests/BASELINE_COMPARISON.md)：基线也12/12，未观察到净通过率增益。团队显式事件/模板/停止条件较完整，代价为更长结构，未测费用与token。
- [最终精炼轮2](tests/ROUND2_EVALUATION.md)：纯方法、离线限制与七文件实际落盘均通过；新上下文只读恢复通过，案件文件hash前后不变。仅限一次合成案件恢复，不证明所有运行环境可靠。修订见[REVISION_LOG](tests/REVISION_LOG.md)。
- 静态脚本：`python business/expert-team/tests/verify_artifacts.py`。仅运行本地原版检查与文件引用/来源ID核验，不模拟LLM行为。
- tests/static/保留quick_validate、原版Nuwa quality/merge输出及summary.json；Nuwa的字符串计数器不能证明方法保真。merge只在六维底稿中找URL，本构建用来源ID关联source-index，故其URL计数不作真实来源统计；真实计数来自sources.json人工分类与独立抽查。
- build_*.py是初次构建记录，采用存在即拒绝覆盖保护；后续文档修订以当前文件与REVISION_LOG为准，不运行它们覆盖成果。当前技能已迁移到相邻的business/skills；本目录保留案件、测试与制作记录，无自动发布/推送。
