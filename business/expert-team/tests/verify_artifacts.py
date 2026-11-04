"""Static integrity and original validators. Does not simulate LLM behavior."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parents[1]
NUWA = WORKSPACE/'Distillation'/'nuwa-skill'
QUICK = Path('C:/Users/User/.codex/skills/.system/skill-creator/scripts/quick_validate.py')
env = {**os.environ,'PYTHONUTF8':'1','PYTHONIOENCODING':'utf-8','PYTHONDONTWRITEBYTECODE':'1'}
parser = argparse.ArgumentParser()
parser.add_argument('--report-dir', default='tests/static')
args = parser.parse_args()
reports = (ROOT/args.report_dir).resolve()
reports.relative_to(ROOT)  # Reports must stay in the build directory
reports.mkdir(exist_ok=True)
rows=[]
for skill in sorted((ROOT.parent/'skills').iterdir()):
    if not skill.is_dir():
        continue
    row={'skill':skill.name}
    scripts=[('quick',QUICK,[str(skill)])]
    if skill.name!='hackathon-gap-research':
        scripts.extend([('nuwa-quality',NUWA/'scripts'/'quality_check.py',[str(skill/'SKILL.md')]),
                        ('nuwa-merge',NUWA/'scripts'/'merge_research.py',[str(skill)])])
    for label,script,args in scripts:
        result=subprocess.run([sys.executable,str(script),*args],capture_output=True,text=True,encoding='utf-8',env=env)
        (reports/f'{skill.name}-{label}.txt').write_text(result.stdout+result.stderr,encoding='utf-8')
        row[label]={'exit_code':result.returncode,'status':'PASS' if result.returncode==0 else 'FAIL_OR_ERROR'}
    rows.append(row)

missing=[]
for p in (ROOT.parent/'skills').rglob('*.md'):
    for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)',p.read_text(encoding='utf-8')):
        if not re.match(r'https?://|#',target):
            resolved=p.parent/target.split('#')[0]
            if not resolved.exists():
                missing.append({'file':str(p.relative_to(ROOT.parent)),'target':target})

sources=[]
id_errors=[]
for p in (ROOT.parent/'skills').glob('*/references/sources.json'):
    data=json.loads(p.read_text(encoding='utf-8'))
    ids={s['id'] for s in data}
    refs=p.parent
    for doc in [refs/'methods.md',refs/'cases.md']:
        mentioned=set(re.findall(r'S-[A-Z]{2}-\d{3}',doc.read_text(encoding='utf-8')))
        id_errors.extend({'file':str(doc.relative_to(ROOT.parent)),'unknown_id':s} for s in mentioned-ids)
    sources.append({'skill':p.parents[1].name,'count':len(data),
                    'body_read':sum(s['body_read'] for s in data),
                    'personal_primary':sum(s['kind']=='本人一手' for s in data),
                    'kinds':{k:sum(s['kind']==k for s in data) for k in sorted({s['kind'] for s in data})},
                    'unique_urls':len({s['url'] for s in data})})

hashes={str(p.relative_to(NUWA)):hashlib.sha256(p.read_bytes()).hexdigest() for p in NUWA.rglob('*') if p.is_file()}
(reports/'nuwa-readonly-source-hashes.json').write_text(json.dumps(hashes,indent=2),encoding='utf-8')
summary={'format_validators':rows,'missing_relative_links':missing,'unknown_source_ids':id_errors,
         'sources':sources,'integrity_status':'PASS' if not missing and not id_errors else 'FAIL',
         'scope':'STATIC_ONLY; original Nuwa string heuristics are not semantic/fidelity validation'}
(reports/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False,indent=2))
