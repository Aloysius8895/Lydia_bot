"""Apply the reviewed v1 refinement once; preserve all test outputs."""
from pathlib import Path
import json

root=Path(__file__).resolve().parent
old_start='读取同一案件的 brief、评分标准、地域、时间/团队限制、全部用户类别、研究问题、E 编号证据、当前状态、上一角色交接与 selected_gap_id。缺失项写未知，先做不依赖它的工作。没有真实 brief 时只做明确 TEST_ONLY 案件。不要模拟客户回答。'
new_start='先区分纯方法问答与具体案件。纯方法题直接读取本角色方法规则并回答，不要求比赛 brief、案件文件或 Gap ID；答完即结束。具体案件读取已有 brief、评分标准、地域、时间/团队限制、全部用户类别、研究问题、E 编号证据、当前状态、交接与 selected_gap_id。缺失项写未知，先做不依赖它的工作；缺少决定范围的 brief 时只补问该范围，不自行编造案件。只有用户要求演练时才建立明确 TEST_ONLY 案件。不要模拟客户回答。'
old_net='先分类：纯方法题可直接应用；具体市场、产品或公司现状须调用实际联网工具读正文，再给判断。联网失败记录 NOT_VERIFIED、URL 和读取范围，不用记忆冒充采集。按下列方法确定查什么、验证什么：'
new_net='需要对当前市场、产品或公司事实作独立判断时，在用户允许范围内使用实际联网工具读正文，搜索摘要只用于发现。若用户限定离线或仅分析给定材料，则只分析可读材料，注明提供者、日期、读取范围和未独立核验的事实，不作超出材料的现状断言。禁止联网或工具不可用而未尝试时写 NOT_ATTEMPTED 与原因，URL可为null；实际读取失败才写 NOT_VERIFIED、已尝试URL、读取范围与错误。不用记忆补作采集。按下列方法确定查什么、验证什么：'
for p in (root.parent/'skills').glob('*/SKILL.md'):
    if p.parent.name=='hackathon-gap-research':
        continue
    s=p.read_text(encoding='utf-8')
    assert s.count(old_start)==1 and s.count(old_net)==1,p
    s=s.replace(old_start,new_start).replace(old_net,new_net)
    s=s.replace('## 表达DNA与防漂移','交接前核对：引用的 E ID 必须存在于同一案件台账；方法规则 ID 来自本角色已读 methods。推断注明 basis_evidence_ids、method_rule_ids、bridge_and_alternative；没有 E 证据不升级为客户事实。附已完成/未执行动作、原因、最后产物与下一步。恢复先读原state、ledger与最近交接，复用原E ID，不重复计数。完成本次职责即交回主控，不能自行扩展到下一角色。\n\n## 表达DNA与防漂移')
    p.write_text(s,encoding='utf-8')

p=root.parent/'skills/hackathon-gap-research/SKILL.md'
s=p.read_text(encoding='utf-8')
s=s.replace('使用真实联网工具搜索并读正文。搜索摘要仅发现来源；只读摘要、付费墙或失败时记录限制，不冒充读完。','需要独立核实当前事实时，在用户允许范围内使用真实联网工具搜索并读正文。若用户限定离线或给定材料，只分析可读材料并注明未独立核验，不越过范围。禁止/不可用而未尝试时写 NOT_ATTEMPTED 与原因；实际请求失败才写 NOT_VERIFIED、原URL及错误。搜索摘要仅发现来源；只读摘要、付费墙或失败时记录限制，不冒充读完。')
s=s.replace('联网或权限失败时保存已完成部分、原URL、错误、下一步；','每轮按用户预算/范围采集；完成一次全用户类别覆盖检查及拟保留候选替代/反证检查后，可交付清单与空白，不为凑数无限补查。模式、验证附录与交接写完即结束本轮，状态保持MODELING不等于已执行真人验证。\n\n交接前核对E ID存在于同一案件台账、规则ID来自已读方法；执行记录附已完成/未执行及原因、最后产物和下一步。恢复先读state、ledger、最近交接，复用E ID，不重做有效用户选择。联网或权限失败时保存已完成部分、原URL、错误、下一步；')
p.write_text(s,encoding='utf-8')
p=root.parent/'skills/hackathon-gap-research/references/protocol.md'
s=p.read_text(encoding='utf-8')
s+='''

## 本轮结束与恢复

每轮沿用用户的研究范围、时间与决策问题。未给预算时先做一次覆盖检查：逐类记录已查证据或空白，拟保留候选核对当前替代和反证。达到预算、足够支撑本轮交付，或可访问渠道只能重复已有信息时，保存结果与空白，交付清单到AWAITING_SELECTION，不为凑数继续。MODELING中写完所选缺口的model.md、validation.md、交接后结束本轮；状态可保持MODELING，next_actions说明等待的用户输入或新证据，生成验证计划不等于执行。

交接附execution记录：completed_actions、not_attempted（原因）、last_completed_role、last_artifact、next_action、access_attempts。禁止/不可用而未尝试联网写NOT_ATTEMPTED，无URL保留null；真实请求失败写NOT_VERIFIED、原URL、读取范围及错误。恢复读取已有state、ledger和最近交接，只续做未完成动作，复用原E ID避免重复计数。状态/选择冲突保留原记录，仅核对冲突字段，不擅改用户选择。

交接前校验本轮E ID均在该案ledger，规则ID在已读methods。推断填写basis_evidence_ids、method_rule_ids、bridge_and_alternative；无E不能升级客户事实，纯方法推论也不能伪装市场发现。
'''
p.write_text(s,encoding='utf-8')
p=root.parent/'skills/hackathon-gap-research/assets/evidence-ledger.json'
d=json.loads(p.read_text(encoding='utf-8'))
d['entry_schema'].update(basis_evidence_ids=[],method_rule_ids=[],bridge_and_alternative=None)
p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
