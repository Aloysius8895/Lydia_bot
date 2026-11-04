"""Check durable TEST_ONLY case invariants, separate from model judgment."""
from pathlib import Path
import json
import re

root=Path(__file__).resolve().parents[1]
case=root/'cases/TEST_ONLY-smoke'
required=['brief.md','state.json','evidence-ledger.json','gaps.md','handoffs.md','model.md','validation.md']
checks=[]
def check(name,ok,detail):
    checks.append({'check':name,'status':'PASS' if ok else 'FAIL','detail':detail})

check('required_case_files',all((case/p).is_file() and (case/p).stat().st_size for p in required),required)
if checks[-1]['status']=='PASS':
    state=json.loads((case/'state.json').read_text(encoding='utf-8'))
    ledger=json.loads((case/'evidence-ledger.json').read_text(encoding='utf-8'))
    seed=next(x for x in json.loads((root/'tests/inputs.json').read_text(encoding='utf-8')) if x['id']=='T11')
    records=ledger['evidence']
    check('explicit_selection_preserved',state.get('selected_gap_id')=='G11' and state.get('state')=='MODELING' and bool(state.get('selection_event')),state)
    check('test_only_isolation',state.get('test_only') is True and ledger.get('test_only') is True and len(records)==2 and all(e.get('synthetic') is True and e.get('url') is None for e in records),len(records))
    original={e['id']:e for e in seed['evidence']}
    check('origin_and_claim_preserved',all(e['id'] in original and all(e.get(k)==original[e['id']][k] for k in ['claim','origin_group','fixture_ref','url','synthetic']) for e in records),list(original))
    mentioned=set()
    for fn in ['model.md','validation.md','handoffs.md','gaps.md']:
        mentioned.update(re.findall(r'\bE\d{3}\b',(case/fn).read_text(encoding='utf-8')))
    check('no_orphan_case_evidence_refs',mentioned<=set(original),sorted(mentioned))
report={'scope':'STATIC_DURABLE_CASE_INVARIANTS_ONLY','checks':checks,'status':'PASS' if all(x['status']=='PASS' for x in checks) else 'FAIL'}
(root/'tests/persistence-static.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=True,indent=2))
raise SystemExit(0 if report['status']=='PASS' else 1)
