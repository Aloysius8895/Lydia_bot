import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
requests = json.loads((ROOT/'tests/round2-inputs.json').read_text(encoding='utf-8-sig'))
raw = json.loads((ROOT/'tests/inputs.json').read_text(encoding='utf-8-sig'))
fixture = next(x for x in raw if x.get('case_id') == 'TEST_ONLY-T11')
case = ROOT/'cases/TEST_ONLY-smoke'
case.mkdir(parents=True, exist_ok=True)
assert not any(case.iterdir()), 'Do not overwrite an existing case'

def write(name, content):
    (case/name).write_text(content, encoding='utf-8')

write('brief.md', '''# TEST_ONLY — TEST_ONLY-T11

'''+fixture['brief']+'''

- 原始title：明确正常选择；原始id：T11。
- 原始state：AWAITING_SELECTION；原始selected_gap_id：null。
- 原始user_request：'''+fixture['user_request']+'''
- 原始output_request：'''+fixture['output_request']+'''
- 地域：虚构城；日期：2026-11-03（测试日期）。未引入真实市场资料。
- 用户选择事件原文：我明确选择G11：月末对表重复录入。该事件来自用户输入夹具，不来自角色建议。
- 本轮约束：只用T11、离线、不联系、不上传、不执行对外验证。
- 覆盖角色：执行者、主管、付款/审批者。两人团队、48小时演示；评分：证据、简洁、可验证性。

## 原始输入（逐字段保留）
```json
'''+json.dumps(fixture,ensure_ascii=False,indent=2)+'''
```
''')

ledger = {'case_id':fixture['case_id'],'test_only':True,'evidence':fixture['evidence'],
 'read_scope':'完整读取T11两条合成原始claim及元数据；未读取原始网站或真实发票。',
 'verification':{'status':'NOT_ATTEMPTED','url':None,'reason':'用户禁止联网；仅分析给定TEST_ONLY夹具，未独立核验。'},
 'limitations':['全部证据为synthetic=true，不是真人访谈或真实市场行为。','E001和E002分属两个origin_group，但说话者同为未识别的合成说话者；不推断两个独立真人。','fixture body_read=true是原始标记，不表示本轮访问了来源正文。','E002仅支持合成记录中主管批准过人工核对服务；金额、实际支付者、收款人、支付日期与实付状态未知，未承诺AI试点。']}
write('evidence-ledger.json',json.dumps(ledger,ensure_ascii=False,indent=2)+'\n')

write('gaps.md','''# TEST_ONLY — G11：月末对表重复录入

状态：MODELING；只处理用户已明确选择的G11，不新增或排名其他缺口。

来源支持：E001合成任务记录称协会执行者月末抄表两次、错项被主管退回；E002合成发票描述主管批准过人工核对服务，会员秘书可引荐执行者，未承诺本AI试点。原记录均为虚构城、2026-10-01（合成日期）；说话者具体身份/角色未知。

类型：需求/产品缺口假设。执行者为潜在使用者，主管为受益/审批线索；付款者、否决者和完整采购链未知。两个origin_group不等于两个独立真人。

研究推断：重复抄表和退回可能产生返工；basis_evidence_ids=[E001]；method_rule_ids=[SB-R1]；bridge_and_alternative=从任务动作提出返工假设，另一解释是两次抄表为必要控制，改流程已足够。

现有替代：人工抄表和人工核对为夹具出现的办法；未提供认真比较的软件。表格优化/内部流程调整仅为待查替代，不能称已采用。当前软件版本、已解决与否均未核验。反证空白不是没有反证；现有人工核对可能足够。

证据强度弱：仅合成资料；后果未知：无耗时/错误率；付款链弱：批准不等于已付；可触达性为合成引荐线索，未获现实授权；比赛适配为研究推断：行政任务与brief一致；两人48小时能否完成闭环待技术验证，不能据此声称可行。

优先补查：最近一次任务是否有可避免的重复动作、现有办法是否足够、谁实际付费和审批、能否提供合法脱敏样本。若重复为必要控制且已有办法足够，应降级/停止方案投入。
''')

write('model.md','''# TEST_ONLY — 一页模式 v1（未验证草稿）

case_id=TEST_ONLY-T11；state=MODELING；selected_gap_id=G11。
选择事件：用户原话“我明确选择G11：月末对表重复录入”。仅表示选题许可，不表示需求/采购验证。角色是公开方法的AI适配，非本人参与。

| 项目 | 内容与证据边界 |
|---|---|
| 1 项目/Gap | G11：月末对表重复录入；TEST_ONLY假设模式。 |
| 2 谁使用 | 协会执行者为候选使用者（E001）；主管参与退回（E001）。规模、具体职位未知。 |
| 3 谁付款/审批 | E002描述主管批准过人工核对服务；不证明实际支付、本方案预算或审批权。付款者、金额、权限均未知。 |
| 4 痛点/办法 | E001称两次抄表、错项退回；E002出现人工核对服务。返工重要性、必要性未知。 |
| 5 差异价值 | 待验证定位假设：相对手工两次抄表，让执行者只录入一次并保留主管检查依据。未证明优于现有服务或流程改进。 |
| 6 最小闭环 | 假设能力最多三项：导入合成样表→标示待核对差异→导出供人工复核的结果；只演示，不接真实数据。不承诺自动识别准确率或已实现。 |
| 7 收入/成本/价格 | 收费方式、拟测试价格、技术与服务成本、CAC/LTV未知；无依据不填数字。不得把主管批准旧服务当新收入。 |
| 8 首批触达 | E002合成会员秘书引荐线索；未实际联系、未获试点承诺。实际渠道可用性未知。 |
| 9 指标/下一验证 | 拟观察任务完成、遗漏/错项、复核结果和相对人工的耗时；事前与有权限的人约定阈值。无已测效果。 |
| 10 支持/未知 | E001支持合成任务描述；E002支持合成旧服务批准与引荐描述。未知：问题重要性、替代充足性、购买链、可用数据、交付差异。没有不公平优势证据。 |

推断/假设记录：basis_evidence_ids=[E001,E002]；method_rule_ids=[BM-R3,BM-R5,AD-R1,AD-R2,AD-R3,AM-R1,AM-R3,AM-R4]；bridge_and_alternative=以现有抄表/核对为比较基线提出可演示假设；也可能仅需流程整理或维持现状，旧支出不导出新购买。

版本记录：v1由T11原始证据及用户选择建立；无新增市场证据。未来新证据须记录修改原因。
''')

write('validation.md','''# TEST_ONLY — 真人验证短附录（全部待执行）

本次没有真人接触、试点、付款或实际访谈。不得把下列问题当回答；当前禁止对外联系。负责人待团队指定；时间箱仅48小时比赛限制，实际安排未知。先由用户提供已有合法脱敏材料或调整授权范围，才可能进行后续真人工作。

最高后果低证据假设：重复录入可避免且值得改变（E001，SB-R1/SB-R2/AM-R2）；若是必要控制或现有办法足够，方案应停止/改向。其次是权限/付款链（E002，BM-R3/BM-R5），第三是闭环技术质量（SB-R4）。

- 使用者：请讲最近一次月末对表从接到材料到提交的经过；第二次抄写发生在哪一步、为何需要？错项退回后怎样处理？可以展示经授权脱敏的当时产物吗？
- 主管：最近一次退回是什么原因、造成什么后果？何时人工核对已足够？最近一次选择核对服务比较过什么，实际由谁完成？
- 付款/审批者：最近一次同类服务是谁提出、谁签批、谁付款、预算来源与步骤是什么？是否实付、付给谁、什么时候？谁可否决数据使用或试点？
- 试点资源：若以后获授权，由谁在什么条件下确认实际任务、时间、脱敏数据和复核责任？目前全部未知，不要求本轮提供。

最小学习动作（本轮未执行）：先核对最近一次任务的样本和角色，再决定是否演示；与执行者/主管预先约定必须保留的控制、成功任务、可容忍错误和退出条件。若不能安全取得数据或无法保留必要控制，则停止试点。演示只用合成样表，技术通过不等于市场验证。

事前判据草案（待相关角色确认，非已验证）：发现可避免重复且后果被当事人具体说明，才推进方案测试；证实必要重复或现有办法足够则降级；未确认付款/数据权限只继续调查，不声称交易成立。阈值没有依据，保持未知。

记录方式：未来在ledger新增同案E ID，分别保存原话、可观察动作、解释、反证、承诺条件；未付费试用不当付费验证。本轮没有新增E ID。
GO LEAN：目标=判断是否值得继续；障碍=仅合成线索；学习=必要性与采购链；实验=上述待授权最小动作；分析=尚无结果；下一动作=等待用户提供已有材料，当前不联系。
''')

handoff='''# TEST_ONLY — 本轮交接与执行记录

case_id=TEST_ONLY-T11；state=MODELING；selected_gap_id=G11；2026-11-03（测试日期）。
五位是公开方法AI角色，非本人参与。本轮由单一执行者串行应用角色，未运行独立角色agent，无独立专家共识。

1. 主控核对：原state=AWAITING_SELECTION、原selected_gap_id=null是选择前快照；夹具内有明确用户选择事件，G11存在。记录事件后进入MODELING；没有冲突需要再次询问，不重做已有效选择。
2. Bob→April：来源支持E001/E002仅为合成任务/旧服务批准。basis_evidence_ids=[E001,E002]，method_rule_ids=[BM-R1,BM-R3,BM-R5]；bridge_and_alternative=旧任务和批准可指导追查采购，但可能维持人工即可；新AI试点未承诺。下一问题：真正替代是什么，差异是否可交付？
3. April→Ash：basis_evidence_ids=[E001,E002]，method_rule_ids=[AD-R1,AD-R2,AD-R3,AD-R5]；研究推断=人工抄表/核对是当前比较基线；价值仅定位假设，现有服务可能足够。下一问题：不虚构收支的最小闭环和假设地图是什么？
4. Ash→Steve：依据同案E001/E002，AM-R1/AM-R2/AM-R3/AM-R4；产物model.md。模式为未验证假设，价格成本留未知，闭环最多三项能力。下一问题：先检验哪些足以推翻模式的风险？
5. Steve→主控：依据E001/E002，SB-R1/SB-R2/SB-R4/SB-R5；先确认重复的必要性与现有办法，再核采购/数据权限，再测闭环；若问题不重要或既有办法足够则降级停止。validation.md是计划，没有验证结果。

## 全用户类别覆盖
执行者：E001任务线索，无真人经历/耗时；主管：E001退回、E002批准线索，无审批权限或完整过程；付款/审批者：主管批准不等于实际付款方，仍为空白。替代/反证：人工已出现；必要控制、现有办法足够均待查；未独立核查产品版本。

## execution
- completed_actions：读取round2请求与仅T11原始输入；加载所需技能/方法/协议/四模板；顺序应用Bob→April→Ash→Steve；保留原始夹具、两条E证据及选择事件；写七个案件文件；本轮输出与加载记录另存tests/round2-actual-output.md。
- not_attempted：联网=NOT_ATTEMPTED（用户禁止）；对外联系/上传/真人验证/收款=NOT_ATTEMPTED（用户禁止）；独立角色agent=NOT_ATTEMPTED（本轮串行方法角色）；未查看其他测试输入证据、原测试输出、评分或优化日志。
- access_attempts：[status=NOT_ATTEMPTED,url=null,reason=用户要求离线仅夹具]。未发生失败URL请求，不能写成NOT_VERIFIED请求失败。
- last_completed_role：Steve复核；last_artifact：validation.md与本交接。
- next_action：下一会话先读state.json、evidence-ledger.json和本交接；保留G11和E001/E002，不重复请求选择。等待用户给本案已有脱敏任务/采购材料；无新材料时只修订假设，不擅自联系。

## 核对
本轮引用E ID只有E001/E002，均存在于本案ledger；方法ID来自已实际读取的methods。文件存在/JSON可解析只表示落盘检查，不表示真人行为或市场验证通过。
'''
write('handoffs.md',handoff)
state={'case_id':fixture['case_id'],'test_only':True,'state':'MODELING','selected_gap_id':'G11',
 'selection_event':fixture['selection_event'],'selection_event_context':{'source':'tests/inputs.json:T11.selection_event','recorded_at':'2026-11-03（测试日期）','original_event_date':None},
 'updated_at':'2026-11-03（测试日期）','brief_missing':[],
 'next_actions':['恢复先读state、ledger、最近handoff；复用G11及E001/E002。','等待用户提供本案已有合法脱敏任务/采购材料；当前禁止联网、联系、上传。'],
 'state_history':[{'state':'AWAITING_SELECTION','selected_gap_id':None,'source':'原始夹具快照'},{'state':'MODELING','selected_gap_id':'G11','cause':'原始明确用户选择事件'}]}
write('state.json',json.dumps(state,ensure_ascii=False,indent=2)+'\n')

r1='''以下是基于Teresa Torres公开方法的AI方法角色说明，非本人参与或背书。

机会描述客户在具体情境中的需求、痛点或希望取得的进步；解决方案是满足机会的一种办法。检验方法是看能否有多种办法满足同一表述：若只对应某个功能，应追问背后的任务与障碍；研究者重述要标为推断，保留原话（TT-R3）。

开始第一棵机会图前，先有三项：目标客户及价值主张的理论、清晰结果、至少三至四个具体过去经历故事。三至四是起始组织门槛，不证明需求或市场成立。缺任一项时只列机会假设与补查，不把假故事当访谈（TT-R4）。随后区分结果→机会→方案→测试，先整理结果与问题层，再比较多个方案并拆验证假设。纯方法问答无需比赛brief或Gap ID；本次没有建立市场案件，也未联网。'''
r2='''TEST_ONLY。本次仅审阅用户提供这一段“合成组织公告说正在招聘一位数据助理”；没有公告正文、URL、日期或组织身份。唯一来源支持是用户段落转述了招聘线索，不是本轮确认存在该职位。招聘不等于软件采购、预算已支出或愿买AI（BM-R5）。

已完成：识别材料范围、来源与证据空白、检查执行者/主管/付款审批者覆盖；三类均缺任务和采购经历。未选择缺口，候选为0，selected_gap_id=null，交付状态AWAITING_SELECTION；不生成商业模式。此题要求仅审阅段落，本次未建立落盘案件。

无法核实：组织与公告真实性、发布日期/有效性、岗位任务、痛点、地点、替代、实际支出、付款和审批人、采购意愿。联网status=NOT_ATTEMPTED，url=null，原因=用户禁止联网；没有请求失败，不能声称读过公告或核验失败。

具体下一步：补齐研究范围brief，并提供已持有的公告原文及最近一次具体任务材料；先把招聘与实际任务/障碍关联，查现有办法是否足够，再形成候选清单。无需现在强行选Gap；无新材料则保持线索与未知。'''
r3='''TEST_ONLY：已将T11作为独立案件实际保存至cases/TEST_ONLY-smoke/，包含brief.md、state.json、evidence-ledger.json、gaps.md、handoffs.md、model.md、validation.md。原始夹具完整保存在brief.md；原始两条合成证据及用户选择事件均保留。

用户明确选择G11，状态已由选择前快照AWAITING_SELECTION进入MODELING；这允许输出模式草稿，不代表需求或付费验证。E001仅支持合成任务记录的两次抄表/错项退回；E002仅支持合成记录的旧人工核对服务批准和秘书引荐线索，不支持本AI采购承诺。付款方、金额、实际支付与权限未知。

串行执行Bob→April→Ash→Steve，产出含十项内容的一页假设模式与分使用者、主管、付款审批者的待执行问题。闭环最多三项能力；收入、成本、价格与效果均未编数字。先核重复是否必要及现有办法是否足够，再查采购/数据权限；必要控制或现有办法足够会推翻当前方案。

联网/联系/上传均NOT_ATTEMPTED，原因是用户禁止；没有真人验证。下次先读state、ledger与最近handoff，复用E001/E002与G11，等待用户给已有脱敏材料。本轮没有读取原测试输出或评分。'''
loaded=['hackathon-gap-research/SKILL.md','hackathon-gap-research/references/protocol.md']
for role in ['teresa-torres-opportunity','bob-moesta-demand','april-dunford-positioning','ash-maurya-lean-model','steve-blank-discovery']:
    loaded += [role+'/SKILL.md',role+'/references/methods.md']
loaded += ['hackathon-gap-research/assets/'+x for x in ['evidence-ledger.json','gap-card.md','one-page-model.md','validation-plan.md']]
out='# Round 2 实际执行完整回答与记录\n\n日期：2026-11-03（测试日期）。单一执行者，顺序执行三请求；不评分，不提供预期答案。所有案件证据均TEST_ONLY。\n\n## 实际加载\n\n- tests/round2-inputs.json：读取全部三个请求。\n- tests/inputs.json：本地JSON解析后只取case_id=TEST_ONLY-T11；未展示/使用其他题证据。\n'
out += ''.join('- skills/'+x+'\n' for x in loaded)
out += '\n未读取：历史测试输出、评分、优化/修订日志；未读来源全文，不声称此轮做过来源网络核验。读取入口列表仅用于定位技能；首次PowerShell默认编码显示乱码，随后UTF-8重读请求，按UTF-8内容执行。\n\n'
for req,ans in zip(requests,[r1,r2,r3]):
    out += '## '+req['id']+'\n\n### 原始请求\n\n'+req['user_request']+'\n\n### 实际完整回答\n\n'+ans+'\n\n'
out+='## R2-03 执行/交接正文\n\n'+handoff+'\n## 实际文件检查\n\n'
for name in ['brief.md','state.json','evidence-ledger.json','gaps.md','handoffs.md','model.md','validation.md']:
    p=case/name
    assert p.exists() and p.stat().st_size
    if name.endswith('.json'):
        json.loads(p.read_text(encoding='utf-8'))
    out+='- '+str(p.relative_to(ROOT)).replace('\\','/')+'：已写入，非空'+('，JSON可解析' if name.endswith('.json') else '')+'。\n'
out+='\n此检查仅确认文件落盘与JSON可解析；没有把它称作需求/采购/真人行为验证。案件七文件为完整模式/验证产物，以上三个回答为真实本轮对请求的完整答复。\n'
(ROOT/'tests/round2-actual-output.md').write_text(out,encoding='utf-8')
print('Saved 7 case files and tests/round2-actual-output.md; JSON parsed; no external actions.')
