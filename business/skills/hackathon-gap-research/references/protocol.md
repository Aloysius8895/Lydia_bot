# 共享案件、状态与交接协议

## 案件持久化

每个真实案件只用一份 evidence-ledger.json，所有角色引用它，不创建角色自己的市场事实副本。目录：brief.md、state.json、evidence-ledger.json、gaps.md、handoffs.md、用户选定后的model.md与validation.md。每次写入先读取原文件，追加/精确更新并保留原始证据和用户修改，不覆盖清空。TEST_ONLY 用独立目录，与真实市场证据完全分开。

state.json 字段：case_id、test_only、state、selected_gap_id、selection_event（原话/日期/用户来源）、updated_at、brief_missing、next_actions。制作进度不写入 state。

| 状态 | 进入条件 | 可执行 | 离开条件 |
|---|---|---|---|
| SCOPED | brief范围已整理，未知已记录 | 覆盖矩阵、问题、采集计划 | 开始实际采集→RESEARCHING |
| RESEARCHING | 已启动研究 | 采集、去重、角色交接、反证 | 交付清单→AWAITING_SELECTION |
| AWAITING_SELECTION | 清单已交付，含证据不足的0项清单 | 补查/比较/修订清单 | 用户明确选唯一存在Gap ID→MODELING |
| MODELING | 有明确选择事件 | 仅选中缺口的一页模式与验证 | 新证据可使模式不成立；撤销选择须用户明确指示，保留历史 |

若状态/selected_gap_id/选择事件冲突，暂停模式生成并核对；已有用户明确选择有效时，无需反复征求权限。没有支付数据仍可输出带未知的模式草稿。

## 采集与核验

按用户类别建矩阵，逐类记录：任务、已查渠道、地域、时间、支持/反面证据、空白。渠道可包括评论、官方企业痛点、招聘、公开采购预算、报告、论坛。具体产品当前状态优先官方版本/功能文档；核实旧评论所指版本、套餐、语言、地域、权限及问题是否仍存。

独立来源数按原始事件及说话者计算：三篇转同一报道为一个 origin_group；同一招聘跨平台为一个职位事件。新增角度不自动增加独立来源。区分“来源确实说了X”与“X被证实”：来源支持只担保前者。

时间以运行当天和用户地域为准；访问日期与发布日期不同。无本地材料标适用限制，不凭全球数据计算马来西亚市场规模。对预算记录 approved/announced/spent/unknown，对支出记录谁付给谁、用途、日期与是否已发生；不把相近支出当对新方案的承诺。

非选择阶段输出可只有待核实线索：不够成为候选的说明缺什么；已解决问题标 resolved 并降级/移除；仍存在的价格、部署或权限障碍须另有证据。没有证据不制造“残余机会”。

## 三标签与交接

- 来源支持：E ID、谁在什么场景说/做了什么、可读取范围。
- 研究推断：依据E ID和规则ID、桥接解释及可能反解释。
- 待验证假设：最先需要真人/行为验证什么、什么结果会推翻。

标准交接：case/state/selected_gap_id → 发现 → 证据ID → 标签 → 局限/反证/分歧 → 下一角色具体问题。不同角色不能互相给“事实”投票，分歧保留在同一案件。

## 比较维度

缺口逐项说明证据强度、痛点后果、付款链清晰度、可触达性、比赛适配、团队可实现性。可用“弱/中/强+理由”，不能折成无依据精确商业分数。整体研究覆盖全部题目人群，最终MVP可只服务一个已选人群。

## 方法重叠与张力

Steve 管验证顺序，Ash 管整页模式与当前约束；两人都用假设，但不能互相替代证据。Teresa 的持续故事发现与 Bob 的近期转换重建互补，未消费群体需要额外招募。April 从赢单差异找细分，而早期无客户时只能是定位假设。Steve 的培训100访谈、Teresa 的持续每周、Bob 的少量深访用于不同学习目标，均非统计成立门槛。Ash 的早期价格测试不能污染 Teresa/Bob 的开放发现访谈。


## 本轮结束与恢复

每轮沿用用户的研究范围、时间与决策问题。未给预算时先做一次覆盖检查：逐类记录已查证据或空白，拟保留候选核对当前替代和反证。达到预算、足够支撑本轮交付，或可访问渠道只能重复已有信息时，保存结果与空白，交付清单到AWAITING_SELECTION，不为凑数继续。MODELING中写完所选缺口的model.md、validation.md、交接后结束本轮；状态可保持MODELING，next_actions说明等待的用户输入或新证据，生成验证计划不等于执行。

交接附execution记录：completed_actions、not_attempted（原因）、last_completed_role、last_artifact、next_action、access_attempts。禁止/不可用而未尝试联网写NOT_ATTEMPTED，无URL保留null；真实请求失败写NOT_VERIFIED、原URL、读取范围及错误。恢复读取已有state、ledger和最近交接，只续做未完成动作，复用原E ID避免重复计数。状态/选择冲突保留原记录，仅核对冲突字段，不擅改用户选择。

交接前校验本轮E ID均在该案ledger，规则ID在已读methods。推断填写basis_evidence_ids、method_rule_ids、bridge_and_alternative；无E不能升级客户事实，纯方法推论也不能伪装市场发现。
