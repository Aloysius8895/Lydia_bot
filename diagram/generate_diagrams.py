"""Rebuild the Lydia documentation diagrams with Graphviz (dot on PATH)."""
from pathlib import Path
import subprocess
import json
import html

ROOT = Path(__file__).resolve().parent
BASE = '''graph [fontname="Microsoft YaHei", fontsize=22, bgcolor="#F8FAFC", pad=0.45, nodesep=0.35, ranksep=0.65, compound=true, labelloc=t, labeljust=l];
node [fontname="Microsoft YaHei", fontsize=12, shape=box, style="rounded,filled", fillcolor="white", color="#CBD5E1", fontcolor="#0F172A", margin="0.18,0.12"];
edge [fontname="Microsoft YaHei", fontsize=10, color="#64748B", fontcolor="#475569", arrowsize=0.7];
'''
DIAGRAMS = {}

def diagram(key, title, body):
    DIAGRAMS[key] = (title, 'digraph G {\n' + BASE + '\nlabel=' + json.dumps(title + '\nLydia · Current implementation / 当前实现', ensure_ascii=False) + ';\n' + body + '\n}\n')

diagram('01-use-case', '用例图 / Use Case Diagram', '''
rankdir=LR;
user [label="«actor»\n个人用户 / Project owner", fillcolor="#DBEAFE", color="#60A5FA"];
claude [label="«actor»\nClaude CLI / 云端推理", fillcolor="#EDE9FE"];
ollama [label="«actor»\nOllama / 本地向量服务", fillcolor="#EDE9FE"];
web [label="«actor»\n公开网站 / Public websites", fillcolor="#EDE9FE"];
tavily [label="«actor»\nTavily / 可选搜索服务", style="rounded,dashed,filled", fillcolor="#FEF3C7"];
subgraph cluster_system {
 label="Lydia 商业研究助手 / System boundary"; color="#94A3B8"; style=rounded; fontsize=16;
 node [shape=ellipse, fillcolor="#EFF6FF"];
 login [label="设置密码、登录与退出\nManage personal session"];
 projects [label="创建与查看研究项目\nCreate / view projects"];
 upload [label="导入文本资料\nImport text evidence"];
 fetch [label="采集公开网页\nFetch public URL"];
 retrieve [label="检索项目资料\nRetrieve evidence"];
 research [label="发起研究或追问\nRun research / ask questions"];
 choose [label="明确选择机会缺口\nConfirm a Gap selection"];
 model [label="生成商业模式与验证方案\nGenerate model / validation plan"];
 tasks [label="查看、取消及恢复任务\nView / cancel / resume tasks"];
 export [label="导出研究报告\nExport research snapshot"];
 appearance [label="调整主题与头像\nCustomize appearance"];
 search [label="搜索资料来源（可选）\nDiscover sources", fillcolor="#FEF3C7", style="dashed,filled"];
}
user -> {login projects upload fetch retrieve research choose model tasks export appearance search} [dir=none];
claude -> {research retrieve model} [dir=none];
ollama -> {upload fetch retrieve research model} [dir=none];
web -> fetch [dir=none]; tavily -> search [dir=none, style=dashed];
note [shape=note, label="约束 / Constraints\\l• 商业模式任务须先明确选定 Gap\\l• 专家是系统内部角色，不作为外部用户\\l• Tavily 需确认免费额度，真实搜索待验收\\l• 手机 PWA 安装与真实五专家联调待验收\\l", fillcolor="#FFFBEB"];
choose -> note [style=dotted, arrowhead=none];
''')

diagram('02-technical-stack', '技术栈图 / Technical Stack Diagram', '''
rankdir=TB;
subgraph cluster_client {label="01 · 界面 / Presentation"; color="#93C5FD"; style=rounded;
 react [label="React 18 · JSX\n聊天 / 项目 / 资料 / 设置", fillcolor="#DBEAFE"];
 vite [label="Vite 5 · CSS\n构建 frontend/dist", fillcolor="#DBEAFE"];
 pwa [label="Web App Manifest + Service Worker\nPWA shell / 公共静态缓存", fillcolor="#DBEAFE"];
}
subgraph cluster_app {label="02 · 应用与业务 / Application"; color="#86EFAC"; style=rounded;
 nodejs [label="Node.js ≥24 · TypeScript\n原生 node:http / node:https", fillcolor="#DCFCE7"];
 validation [label="Zod 4\n输入与模型输出 schema 校验", fillcolor="#DCFCE7"];
 auth [label="node:crypto · scrypt\nCookie session / CSRF / 同源校验", fillcolor="#DCFCE7"];
 worker [label="持久化 Worker + 专家编排\n串行 CLI / 检查点 / 取消恢复", fillcolor="#DCFCE7"];
}
subgraph cluster_ai {label="03 · AI 与检索 / AI and Retrieval"; color="#C4B5FD"; style=rounded;
 cli [label="Claude CLI → 云端 Claude\n现有订阅 / 结构化推理\n查询扩展 / 重排 / 引用复核", fillcolor="#EDE9FE"];
 embed [label="Ollama · nomic-embed-text\n本地 embedding / HTTP", fillcolor="#EDE9FE"];
 skills [label="Markdown 技能与方法\n5 位专家 + 主控 / 显式上下文注入", fillcolor="#EDE9FE"];
 hybrid [label="RAG\n分块 / 词法 + 向量融合 / 案件隔离", fillcolor="#EDE9FE"];
}
subgraph cluster_data {label="04 · 存储 / Persistence"; color="#FCD34D"; style=rounded;
 db [label="PGlite 0.3.16 + pgvector\n嵌入式 PostgreSQL WASM / SQL / JSONB", fillcolor="#FEF3C7"];
 disk [label="本地文件系统\n.runtime/data · skills · cases", fillcolor="#FEF3C7"];
}
quality [label="开发与验证 / Tooling\nTypeScript tsc · node:test · Playwright Core / Chrome", fillcolor="#F1F5F9"];
optional [label="可选集成 / Optional\nTavily API（真实搜索待验收）\n局域网 HTTPS / 手机安装待验收", fillcolor="#FFFBEB", style="rounded,dashed,filled"];
react -> nodejs [label="同源 HTTP(S) / JSON"];
vite -> react [style=dotted, label="构建"];
pwa -> react [style=dotted];
nodejs -> {validation auth worker}; worker -> {cli skills hybrid};
hybrid -> {embed db}; nodejs -> db; db -> disk;
quality -> nodejs [style=dotted, label="验证"];
nodejs -> optional [style=dashed];
''')

diagram('03-system-architecture', '系统架构图 / System Architecture Diagram', '''
rankdir=LR;
browser [label="用户浏览器 / Browser\nReact UI + PWA", fillcolor="#DBEAFE"];
subgraph cluster_local {label="用户电脑 / Local computer · 单进程应用 + 本地服务"; color="#94A3B8"; style=rounded;
 api [label="business/backend/server.ts\n静态资源 + HTTP(S) JSON API\n身份 / CSRF / Zod 校验", fillcolor="#DCFCE7"];
 worker [label="business/agents/worker.ts\n任务调度 / 检查点 / 取消 / 恢复", fillcolor="#DCFCE7"];
 research [label="business/agents/research.ts + prompts.ts\n角色路由 / 上下文 / 结构化结果\ncitations.ts 引用语义复核", fillcolor="#EDE9FE"];
 rag [label="data/RAG/\n导入 / 版本 / 分块 / 混合检索\n查询扩展 + 候选重排", fillcolor="#EDE9FE"];
 skills [label="business/agents/skills.ts → business/skills/\n只读加载入口、方法与主控协议", shape=folder];
 cli [label="business/agents/providers/claude.ts\n受控 CLI 子进程 / 串行请求", fillcolor="#EDE9FE"];
 ollama [label="Ollama 本地服务\n127.0.0.1:11434\nnomic-embed-text", fillcolor="#EDE9FE"];
 store [label="data/database/store.ts + schema.sql\nPGlite + pgvector\nbusiness/.runtime/data 持久化", shape=cylinder, fillcolor="#FEF3C7"];
 sources [label="data/RAG/sources.ts + search.ts\n公开 URL / SSRF 校验\n搜索额度门禁", fillcolor="#FFFBEB"];
 export [label="business/backend/export.ts → business/cases/\n版本化 Markdown / JSON 快照", shape=folder];
}
cloud [label="Claude 云端推理\n通过已登录 CLI 订阅访问", fillcolor="#FCE7F3"];
public [label="公开 HTTP(S) 网站", fillcolor="#FCE7F3"];
tavily [label="Tavily API（可选）\n真实调用待验收", style="rounded,dashed,filled", fillcolor="#FFFBEB"];
browser -> api [label="同源请求 / 状态轮询"];
api -> {worker rag store export};
worker -> research; worker -> sources;
research -> {skills rag cli store};
rag -> {ollama store cli};
cli -> cloud [label="网络推理"];
sources -> public [label="读取正文"];
sources -> tavily [style=dashed, label="额度已确认时"];
sources -> rag [label="正文入库"];
export -> store [label="读取快照"];
note [shape=note, label="部署边界\\l默认 127.0.0.1:4318，仅本机\\l无独立 PostgreSQL / Docker 依赖\\l手机访问需可信 HTTPS 与局域网配置\\l真实五专家全流程尚未验收\\l", fillcolor="#FFFBEB"];
browser -> note [style=dotted, arrowhead=none];
''')

diagram('04-research-workflow', '研究流程图 / Research Workflow', '''
rankdir=TB;
start [shape=oval, label="登录 / Login", fillcolor="#DBEAFE"];
brief [label="创建项目与 brief\nSCOPED"];
materials [label="导入文本 / 公开网页\n规范化、分块、版本与向量索引"];
request [label="提交 research 任务\nrequest_key 幂等入队"];
collect [label="尝试可选搜索与采集\n不可用则记录状态，仅分析已有资料"];
research [label="研究阶段 / RESEARCHING\nSteve → Teresa → April → Bob → Steve review\n每步：技能 + 检索 → CLI → 引用复核 → 持久化", fillcolor="#EDE9FE"];
gaps [label="研究摘要 / 候选 Gap / 企业要求\nAWAITING_SELECTION", fillcolor="#FEF3C7"];
choice [shape=diamond, label="用户明确确认\n具体 Gap？", fillcolor="#FEF3C7"];
wait [label="继续查看、追问或补充资料\n不自动替用户选择"];
decision [label="记录选择与 selection_version\n提交 model 任务"];
model [label="商业模式阶段 / MODELING\nBob → April → Ash → Steve review\n生成模式与验证方案", fillcolor="#DCFCE7"];
export [label="用户随时可导出当前快照\nbrief / summary / evidence / gaps / requirements / decisions\n有结果时附 model / validation", shape=folder, fillcolor="#DBEAFE"];
paused [label="PAUSED\n认证 / 额度 / 超时 / 输出验证失败\n保存已完成步骤", fillcolor="#FFEDD5"];
resume [label="用户恢复 / Resume\n跳过已完成步骤"];
cancel [shape=oval, label="CANCELLED\n用户取消，终止活动进程", fillcolor="#FEE2E2"];
start -> brief -> materials -> request -> collect -> research -> gaps -> choice;
choice -> wait [label="否"]; wait -> materials [label="补资料 / 再研究"];
choice -> decision [label="是"]; decision -> model;
{gaps model} -> export;
research -> paused [label="失败", style=dashed]; model -> paused [style=dashed];
paused -> resume; resume -> research [label="按原任务 kind 恢复", style=dashed]; resume -> model [style=dashed];
{research model paused} -> cancel [label="用户取消", style=dotted];
note [shape=note, label="追问 question 会按主题路由角色，未必运行完整研究链。\n图示为当前代码流程；真实完整联调待验收。", fillcolor="#FFFBEB"];
request -> note [style=dotted, arrowhead=none];
''')

tables = {
 'cases': 'PK id|title, brief, phase|selected_gap_id (logical)|selection_version, meta',
 'documents': 'PK id|FK case_id (nullable)|collection, source_id, version|content, content_hash, meta',
 'chunks': 'PK id|FK document_id|FK case_id (nullable)|content, position, search_text|embedding vector, model, dimension',
 'tasks': 'PK id|FK case_id|kind, status, input, checkpoint|request_key, selection_version|UQ (case_id, request_key)',
 'expert_runs': 'PK/FK task_id + PK step|role, output, provenance',
 'gaps': 'PK/FK case_id + PK id|data JSONB',
 'claims': 'PK/FK case_id + PK id|data JSONB',
 'requirements': 'PK/FK case_id + PK id|FK (case_id, gap_id) nullable|data JSONB',
 'decisions': 'PK id, FK case_id|FK (case_id, gap_id)|version, user_message',
 'artifacts': 'PK id, FK case_id|FK task_id (nullable)|kind, selection_version, content',
 'fetch_attempts': 'PK id, FK case_id|url, status, details',
 'search_requests': 'PK id, FK case_id|FK task_id (nullable)|account_id, period, credits, status',
 'search_budgets': 'PK (account_id, period)|remaining, checked_at',
 'settings': 'PK key|data JSONB',
 'sessions': 'PK token_hash|csrf, expires_at',
 'counters': 'PK scope|value',
}
erd = ['rankdir=LR; node [shape=plain, fontsize=11];']
for name, fields in tables.items():
    rows = ''.join('<TR><TD ALIGN="LEFT">' + html.escape(field) + '</TD></TR>' for field in fields.split('|'))
    erd.append(f'{name} [label=<<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" CELLPADDING="9" COLOR="#CBD5E1" BGCOLOR="#EFF6FF"><TR><TD BGCOLOR="#DBEAFE"><B>{name}</B></TD></TR>{rows}</TABLE>>];')
for child in ['documents','chunks','tasks','gaps','claims','requirements','decisions','artifacts','fetch_attempts','search_requests']:
    erd.append(f'cases -> {child} [label="1 : 0..*", arrowhead=crow];')
for parent, child in [('documents','chunks'),('tasks','expert_runs'),('tasks','artifacts'),('tasks','search_requests'),('gaps','requirements'),('gaps','decisions')]:
    erd.append(f'{parent} -> {child} [label="1 : 0..*", arrowhead=crow];')
erd.append('''cases -> gaps [style=dashed, color="#D97706", label="selected_gap_id 逻辑引用", constraint=false, arrowhead=vee];
search_requests -> search_budgets [style=dashed, color="#D97706", label="account_id + period\n应用层关联，无 FK", constraint=false];
note [shape=note, label="实线：schema.sql 中的外键（FK）\\l虚线：应用层逻辑关联，无数据库外键\\l字段列表为核心字段摘要，非完整 DDL\\lMETHOD 资料可为全局，case_id 允许为空\\lclaims 等 data 内引用为 JSON，不是 SQL FK\\l", fillcolor="#FFFBEB"];
''')
diagram('05-database-erd', '数据库关系图 / Database ER Diagram', '\n'.join(erd))

def main():
    for key, (_, source) in DIAGRAMS.items():
        path = ROOT / (key + '.dot')
        path.write_text(source, encoding='utf-8')
        for fmt in ['svg', 'png', 'pdf']:
            args = ['dot', '-T' + fmt, str(path), '-o', str(ROOT / (key + '.' + fmt))]
            if fmt == 'png': args.insert(2, '-Gdpi=150')
            subprocess.run(args, check=True, capture_output=True)
    cards = []
    for key, (title, _) in DIAGRAMS.items():
        cards.append(f'<section><h2>{html.escape(title)}</h2><p>' + ' · '.join(f'<a href="{key}.{ext}">{ext.upper()}</a>' for ext in ['svg','png','pdf','dot']) + f'</p><a href="{key}.svg"><img src="{key}.svg" alt="{html.escape(title)}"></a></section>')
    (ROOT / 'index.html').write_text('''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lydia 项目图集</title><style>body{margin:0 auto;padding:40px 24px;max-width:1500px;background:#f1f5f9;color:#0f172a;font-family:"Microsoft YaHei",sans-serif}h1{font-size:32px}p{line-height:1.8;color:#475569}a{color:#2563eb}section{background:white;border:1px solid #cbd5e1;border-radius:16px;padding:24px;margin:24px 0}img{width:100%;height:auto}h2{font-size:22px}</style><h1>Lydia 项目图集</h1><p>依据当前代码生成 · 2026-11-04（Asia/Kuala_Lumpur）<br>SVG 可缩放；PNG 适合文档；PDF 适合打印；DOT 为可编辑源文件。点击图片可单独打开。<br>图示描述已实现的结构与流程；真实五专家全流程、Tavily 搜索和真手机安装仍待验收。</p>''' + ''.join(cards) + '</html>', encoding='utf-8')
    print(f'Generated {len(DIAGRAMS)} diagrams in SVG, PNG, PDF and DOT: {ROOT}')

if __name__ == '__main__':
    main()
