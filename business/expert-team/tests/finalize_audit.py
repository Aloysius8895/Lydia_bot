"""Final local inventory/link audit; no semantic pass claims."""
from pathlib import Path
import hashlib
import json
import re

root=Path(__file__).resolve().parents[1]
skills=root.parent/'skills'
all_files=[p for scope in (root,skills) for p in scope.rglob('*') if p.is_file()]
missing=[]
for p in (p for p in all_files if p.suffix=='.md'):
    for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)',p.read_text(encoding='utf-8-sig')):
        target=target.strip('<>')
        if re.match(r'https?://|#',target):
            continue
        q=Path(target.split('#')[0])
        if not q.is_absolute():
            q=p.parent/q
        if not q.exists():
            missing.append({'file':str(p.relative_to(root.parent)),'target':target})
json_files=[p for p in all_files if p.suffix=='.json']
bad_json=[]
for p in json_files:
    try:
        json.loads(p.read_text(encoding='utf-8-sig'))
    except Exception as exc:
        bad_json.append({'file':str(p.relative_to(root.parent)),'error':str(exc)})
inventory={str(p.relative_to(root.parent)):hashlib.sha256(p.read_bytes()).hexdigest() for p in all_files if p.is_file() and '__pycache__' not in p.parts and p.name!='final-audit.json'}
result={'status':'PASS' if not missing and not bad_json and len(list(skills.glob('*/SKILL.md')))==6 else 'FAIL','scope':'LOCAL_LINKS_JSON_INVENTORY_ONLY',
        'missing_local_links':missing,'invalid_json':bad_json,'skill_entries':len(list(skills.glob('*/SKILL.md'))),
        'source_records':sum(len(json.loads(p.read_text(encoding='utf-8'))) for p in skills.glob('*/references/sources.json')),
        'files_excluding_python_cache':len(inventory),'sha256':inventory}
(root/'tests/final-audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k!='sha256'},ensure_ascii=True,indent=2))
raise SystemExit(0 if result['status']=='PASS' else 1)
