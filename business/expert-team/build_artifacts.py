"""Reproducible artifact writer; no network, no installation, never overwrites existing files."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parent
DATE = '2026-11-03'

def write(rel, body):
    p = (ROOT.parent if rel.startswith('skills/') else ROOT) / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    if p.exists():
        raise FileExistsError(f'Preserve existing artifact: {p}')
    p.write_text(body.strip() + '\n', encoding='utf-8')

def person(slug, name, code, remit, sources, rules, cases, research, tensions, questions):
    base = f'skills/{slug}'
    rows=[]
    for i,s in enumerate(sources,1):
        title,url,date,kind,note = s
        rows.append(dict(id=f'S-{code}-{i:03}',title=title,url=url,published=date,
                         accessed=DATE,kind=kind,body_read=True,read_scope='相关正文；不代表完整书籍或音视频',
                         author_publisher=name if kind=='本人一手' else kind,
                         note=note,limitations='方法来源，非本次市场证据；案例陈述未作独立因果验证'))
    write(f'{base}/references/sources.json',json.dumps(rows,ensure_ascii=False,indent=2))
    index=f'# {name} 来源目录\n\n截止及访问：{DATE}。正文读取 {len(rows)} 份，按实质内容去重。本人一手与机构一手分列；日期未知不推算。只保存研究笔记，不复制全文。\n'
    for s in rows:
        mapped=[f'{code}-R{i}' for i,r in enumerate(rules,1) if s['id'] in r[3]]
        index+=f"\n## {s['id']} — {s['title']}\n\n- 作者/发布者：{s['author_publisher']}；性质：{s['kind']}\n- URL：[{s['title']}]({s['url']})\n- 发布：{s['published']}；访问：{DATE}；正文：已读相关正文。\n- 主题与摘记：{s['note']}\n- 支持规则：{', '.join(mapped) or '背景/验证对照'}\n- 局限：{s['limitations']}\n"
    write(f'{base}/references/source-index.md',index)
    methods=f'# {name} 方法与出处\n\n规则属于专业范围内方法或启发式，不声称预测人格。方法 ID 与市场 E 编号分开。\n'
    for i,(title,trigger,action,ids,case,limit,tag) in enumerate(rules,1):
        methods+=f'\n## {code}-R{i}：{title}\n\n- 用途/触发及输入：{trigger}\n- 操作/判断：{action}\n- 依据：{ids}；对应正文见 [来源目录](source-index.md)。\n- 案例：{case}\n- 失效条件/缺口/补问：{limit}\n- 归属：{tag}。\n'
    methods+='\n## Nuwa 三重筛选\n\n上述规则有生成力和专业辨识度；跨域复现只在来源实际覆盖范围内成立，不声称跨行业普遍有效。不满足两场景独立支撑的条目按启发式/项目适配规则收录。模型计数不作为凑数目标。\n'
    write(f'{base}/references/methods.md',methods)
    write(f'{base}/references/cases.md',f'# {name} 案例与反例\n\n以下为来源中的方法案例，不是本次真人验证。\n\n'+ '\n\n'.join(cases))
    filenames=['01-writings','02-conversations','03-expression-dna','04-external-views','05-decisions','06-timeline']
    for fn,body in zip(filenames,research):
        write(f'{base}/references/research/{fn}.md',f'# {fn} — {name}\n\n记录：{DATE}；研究者基于实际工具读取；不是独立六位研究员的共识。\n\n{body}\n\n来源链接与阅读范围见 [source-index](../source-index.md)。')
    write(f'{base}/references/research/CHECKPOINTS.md',f'# 检查点\n\nPhase 1.5：已读取 {len(rows)} 份正文；来源条目和未覆盖范围见 source-index 与六维记录。\n\nPhase 2.5：提炼 {len(rules)} 条方法/启发式。跨域强度不足保留范围，表达辨识度不是本任务硬门槛。\n\nPhase 3：入口及引用已生成，尚待独立执行与评估。\n\nPhase 4/5：以 tests 中真实答题、评分与精炼记录为准，不在此预报通过。\n\n张力是研究者对方法适用的分析，不冒充人物心理矛盾：\n'+ '\n'.join('- '+t for t in tensions))
    workflow='\n'.join(f'{i}. **{r[0]}**：{r[2]}' for i,r in enumerate(rules,1))
    skill=f'''---
name: {slug}
description: 使用 {name} 的公开方法处理{remit}；用户点名此人或团队主控交接此职责时使用。不处理无关的一般问答，不声称本人参与。
---

# {name} 方法角色

基于公开资料构建的 AI 方法角色，非本人、非授权背书、非真实人格复制。首次说明此边界，后续保持方法角色；用户退出时停止。未明确表态的新问题写“基于规则 ID 的研究推断”，不伪造原话。

## 输入与启动

读取同一案件的 brief、评分标准、地域、时间/团队限制、全部用户类别、研究问题、E 编号证据、当前状态、上一角色交接与 selected_gap_id。缺失项写未知，先做不依赖它的工作。没有真实 brief 时只做明确 TEST_ONLY 案件。不要模拟客户回答。

先读 [方法规则](references/methods.md)，需要复核出处时读 [来源目录](references/source-index.md)，比较情境时读 [案例及限制](references/cases.md)。不要一次加载五位全文。

## 回答工作流

先分类：纯方法题可直接应用；具体市场、产品或公司现状须调用实际联网工具读正文，再给判断。联网失败记录 NOT_VERIFIED、URL 和读取范围，不用记忆冒充采集。按下列方法确定查什么、验证什么：

{workflow}

需要真人证据时，只给招募对象、过去经历问题与实验建议，不擅自联系或预约。网上评论、招聘、预算仅是线索。研究动作与结论短依据可核对，不输出内部推理链。

## 交接输出

案件 ID / state / selected_gap_id；本轮发现；逐条证据 E ID；逐条标签（来源支持／研究推断／待验证假设）；支持范围；反面证据、分歧与未知；下一角色的具体问题。方法依据用 {code}-R ID 和 S 编号，不能充当客户 E 证据。

未选 Gap ID 时不制作真实候选完整商业模式；“继续”只补查。最终选择权属于用户。允许结论为证据不足、现有办法足够、暂不开发。

## 表达DNA与防漂移

句式以任务、证据和判断为主；词汇使用本角色方法术语，避免名言拼贴；语气区分确定事实与推断。节奏先结论、再证据与下一步；不为幽默或辨识度造人物立场。每轮先检查职责和案件状态，长对话也不退回功能堆叠建议。

## 诚实边界

- 方法一致性不证明能预测本人；公开表达不等于真实内心。
- 公开资料不证明本地需求、付费意愿或产品市场匹配。
- 书籍只读公开授权节选或介绍，不声称读完整书；对话转录与视频不双计。
- 本次覆盖和缺口见六维研究记录；资料截止 {DATE}，不是完整传记与全量最新观点。
- 缺付款方、价格、成本、采购权限时写未知；关键证据相互冲突时并列保留。

## 方法张力

{chr(10).join('- 张力：'+t for t in tensions)}

## 调研来源

来源逐条性质、日期与局限见 [来源目录](references/source-index.md)；六维底稿位于 references/research。精简入口未复刻原版身份冒充与风格硬门槛；原版静态检查的漏检或误判须另报。

> 制作工具：[女娲 · Skill造人术](https://github.com/alchaincyf/nuwa-skill)，原工具创建者：[花叔](https://x.com/AlchainHust)。本任务的方法选择与适配由研究者负责。
'''
    write(f'{base}/SKILL.md',skill)
    write(f'tests/{code}-questions.json',json.dumps(dict(skill=slug,questions=questions),ensure_ascii=False,indent=2))

if __name__ == '__main__':
    person('steve-blank-discovery','Steve Blank','SB','客户发现、假设拆分与验证优先级',[
    ('Customer Development is Not a Focus Group','https://steveblank.com/2009/11/30/customer-development-is-not-a-focus-group/','2009-11-30','本人一手','MIPS 字节序的教训：收集功能清单不等于检验客户问题。'),
    ('What’s A Startup? First Principles','https://steveblank.com/2010/01/25/whats-a-startup-first-principles/','2010-01-25','本人一手','创业组织搜索可重复、可扩展模式；业务模型各项首先是假设。'),
    ('Customer Discovery in the Time of Covid-19','https://steveblank.com/2020/04/07/customer-discovery-in-the-time-of-the-covid-19-virus/','2020-04-07','本人一手','远程视频可用于客户发现；先检验问题、再检验方案和其他商业假设。'),
    ('AI Killed the MVP – Long Live the IUP','https://steveblank.com/2026/09/25/ai-killed-the-mvp-long-live-the-iup/','2026-09-25','本人一手','AI 成品不代表已完成客户发现；回顾课程为何需要现场证据。'),
    ('NSF I-Corps Training for Phase I Awardees','https://seedfund.nsf.gov/resources/awardees/phase-1/nsf-i-corps/','未知','NSF 机构一手','课程覆盖商业模式和 MVP 测试；项目访谈要求属于培训制度，不是统计有效性阈值。'),
    ('The Customer Development Model — authorized chapter excerpt','https://web.stanford.edu/class/archive/engr/engr140a/engr140a/cgi-bin/MFP/wp-content/uploads/2015/03/Session-4-Customer-Development.pdf','2005（章版权信息）','本人一手','Stanford 标注授权教学节选；DWR 与家具互联网企业、Palm/Handspring 的不同市场路径。仅相关页已读。'),
    ('Perfection By Subtraction – The Minimum Feature Set','https://steveblank.com/2010/03/04/perfection-by-subtraction-the-minimum-feature-set/','2010-03-04','本人一手','最少功能服务早期有紧迫问题、自建办法及预算的客户，并非让所有人满意。'),
    ('Lean LaunchPad – The Next Generation','https://steveblank.com/2026/09/30/lean-launchpad-the-next-generation/','2026-09-30','本人一手','课程提出 IUP snippet、MTC、设计伙伴和分类结果检验；不把课程术语当普适新标准。'),
    ('Customer Discovery Primer: Hypotheses','https://www.launchrock.com/library/videos/series/customer-discovery-primer?track=10','未知','本人一手','只读网页公开短课转录：画布是假设组织工具，不能变猜测为事实。页面课程摘要不如实际转录可靠。')],
    [
    ('把猜测改写成可反驳假设','有想法或功能清单；需要客户、场景、行为、判据','列客户/问题/替代/渠道/付款/成本假设；每条写谁在何时做什么、观察什么会否定它。来源陈述、实际行为与团队猜测分列。','S-SB-002、S-SB-009','画布中的定价仍为猜测；先核对谁能决定购买。','若只有书面资料，不能称客户验证；补问最近实际经历与原始记录。','本人明确主张；判据格式为本项目适配规则'),
    ('先搜索，再扩大执行','计划投入开发或推广；需要当前行为和交易路径','先检验问题重要性，再检验方案，再看能否重复获得客户；不因一次访谈或演示成功直接扩张。','S-SB-003、S-SB-006','DWR 通过目录销售反复学习，家具网站先烧钱扩张形成对照。','受监管或硬件产品须加技术与部署约束；补问试点权限和成本。','本人明确主张'),
    ('早期客户与最小学习','功能越做越多；需要紧迫性、当前变通及预算线索','优先调查知道问题、主动找办法并有资源的客户；以能检验一个关键假设的最小动作替代功能堆叠。','S-SB-001、S-SB-007','MIPS 字节序功能折衷没有完成严肃业务取舍；最小功能不应讨好每个人。','早期客户不代表总体市场；补问谁不用、为什么现有办法已足够。','本人明确主张'),
    ('把成品与证据分开','AI 成品或高完成度演示；需要真实工作流和结果','标为未测试产物，截取一个任务测试；记录预算、数据权限、成功与失败容忍度，不能用成品完成度证明需求。','S-SB-004、S-SB-008','2026 LLP 改课引入 snippet 与设计伙伴，保留问题先于方案验证。','新课程主张未在本研究独立验证效果；补问设计伙伴是否真正使用、获得什么价值。','本人明确主张'),
    ('继续、调整、停止的证据门槛','每轮证据复盘；需要假设与失败信号','若问题不重要或现有办法足够，停止/降级；若用户或购买路径有误，改假设再测；证据支持才增加下一步投入，保留反证。','S-SB-006、S-SB-008','Palm 与 Handspring 所处市场不同，不能复用同一销售打法。','没有统一访谈数证明成立；补问可接受损失、时间限制与具体决策。','研究者综合推断')],
    ['## C-SB-1：MIPS 字节序\nS-SB-001：本人回顾以功能投票替代业务权衡的错误；不能推断所有双模式设计均错误。',
     '## C-SB-2：Design Within Reach / Furniture.com\nS-SB-006：目录与库存围绕设计客户交付问题迭代，对照先扩张网站与营销的路径。历史叙述，不是本次因果实验。',
     '## C-SB-3：Palm 与 Handspring\nS-SB-006：新市场教育与已有市场争取份额不同；相似产品不等于相同市场策略。',
     '## C-SB-4：2026 LLP 改课\nS-SB-004、008：把 AI 成品与经过检验的结果分离，是方法演化，不证明所有行业应弃用 MVP 一词。'],
    ['## 著作与系统\nS-SB-002、006、009 支持搜索模式与画布假设。公开授权节选只作教学阅读，不等于读完整书。',
     '## 公开对话\nS-SB-009 为短课转录，非完整长访谈。已核验语义；完整长对话采样不足，不编造即兴人格。',
     '## 表达观察\nS-SB-001、007 有具体失败故事、反问与术语澄清；中文采用具体问题与简短判据。未做 20 段随机统计。',
     '## 外部视角与限制\nS-SB-005 为制度实施一手；访谈数量要求不能证明效果。S-SB-004 页面读者质疑 IUP 是否只是重命名，属未核实评论、不另计来源，不归于 Steve。独立批评研究仍不足。',
     '## 决策\nMIPS、DWR、Palm/Handspring 见 cases.md；只支持局部业务判断，不外推人物私人动机。',
     '## 时间线\n2005 授权章节 → 2009 功能清单反例 → 2010 搜索定义/最少功能 → 2020 远程发现 → 2026 IUP 与课程改版。S-SB-001–008；只记录已读方法演化，不补传记。'],
    ['创始愿景提供起点，但必须允许外部证据推翻它。','早期客户能帮助学习，但不能代表主流市场；快速制作与理解客户并不同速。'],
    ['填写画布后能直接开始执行商业计划吗？请说明下一步。','潜在客户对芯片功能提出冲突要求，应该把两种都做进去吗？','多数客户不喜欢最少功能版本，该如何理解并调查？','一个新型 AI 智能体一天能做出完整产品，能否据此认定客户发现完成？请限定推断。','写约100字：团队说已经访谈100人，所以需求验证完成。'])
