"""Update live references after the authorized move; historical output text stays intact."""
from pathlib import Path
import json
import os
import re

ROOT = Path(__file__).resolve().parents[1]
OLD = ROOT/'skills'
NEW = ROOT.parent/'skills'
changed=[]
for p in [*ROOT.rglob('*.md'),*NEW.rglob('*.md')]:
    original_p = OLD/p.relative_to(NEW) if p.is_relative_to(NEW) else p
    body=p.read_text(encoding='utf-8-sig')
    def relink(m):
        target=m.group(2)
        if re.match(r'https?://|#',target):
            return m.group(0)
        raw=target.strip('<>')
        path,sep,fragment=raw.partition('#')
        q=Path(path)
        if not q.is_absolute():
            q=(original_p.parent/q).resolve()
        if q.is_relative_to(OLD):
            q=NEW/q.relative_to(OLD)
        updated=os.path.relpath(q,p.parent).replace('\\','/')+(sep+fragment if sep else '')
        return m.group(1)+updated+m.group(3)
    updated=re.sub(r'(\[[^\]]*\]\()([^)]+)(\))',relink,body)
    if updated!=body:
        p.write_text(updated,encoding='utf-8')
        changed.append(str(p.relative_to(ROOT.parent)))

# Retarget current helpers; keep old actual execution reports and hash snapshots as history.
p=ROOT/'build_artifacts.py'
s=p.read_text(encoding='utf-8').replace('p = ROOT / rel',"p = (ROOT.parent if rel.startswith('skills/') else ROOT) / rel")
p.write_text(s,encoding='utf-8')
p=ROOT/'apply_refinements.py'
s=p.read_text(encoding='utf-8').replace("(root/'skills')","(root.parent/'skills')").replace("root/'skills/","root.parent/'skills/")
p.write_text(s,encoding='utf-8')
p=ROOT/'tests/verify_artifacts.py'
s=p.read_text(encoding='utf-8').replace("(ROOT/'skills')","(ROOT.parent/'skills')").replace('relative_to(ROOT)', 'relative_to(ROOT.parent)')
s=s.replace('import hashlib','import argparse\nimport hashlib',1)
s=s.replace("reports = ROOT/'tests'/'static'", "parser = argparse.ArgumentParser()\nparser.add_argument('--report-dir', default='tests/static')\nargs = parser.parse_args()\nreports = (ROOT/args.report_dir).resolve()\nreports.relative_to(ROOT)  # Reports must stay in the build directory")
p.write_text(s,encoding='utf-8')
p=ROOT/'tests/finalize_audit.py'
s=p.read_text(encoding='utf-8')
s=s.replace("missing=[]", "skills=root.parent/'skills'\nall_files=[p for scope in (root,skills) for p in scope.rglob('*') if p.is_file()]\nmissing=[]",1)
s=s.replace("for p in root.rglob('*.md'):","for p in (p for p in all_files if p.suffix=='.md'):")
s=s.replace("json_files=list(root.rglob('*.json'))", "json_files=[p for p in all_files if p.suffix=='.json']")
s=s.replace("for p in root.rglob('*') if p.is_file()", "for p in all_files if p.is_file()")
s=s.replace('relative_to(root)', 'relative_to(root.parent)')
s=s.replace("(root/'skills')",'skills')
s=s.replace("'status':'PASS' if not missing and not bad_json else 'FAIL'", "'status':'PASS' if not missing and not bad_json and len(list(skills.glob('*/SKILL.md')))==6 else 'FAIL'")
p.write_text(s,encoding='utf-8')
p=ROOT/'TEAM_GUIDE.md'
s=p.read_text(encoding='utf-8').replace('business\\expert-team\\skills\\','business\\skills\\')
s=s.replace('# Hackathon 缺口研究团队使用说明', '# Hackathon 缺口研究团队使用说明\n\n当前位置：六技能及其references/assets位于 `C:/maven/Hackathon_map/business/skills`；本指南、案件、测试与制作记录位于 `C:/maven/Hackathon_map/business/expert-team`。历史测试输出中的旧路径保留为当时的实际加载记录，当前调用使用新路径。',1)
s=s.replace('全部产物在本目录，无自动发布/推送。','当前技能已迁移到相邻的business/skills；本目录保留案件、测试与制作记录，无自动发布/推送。')
p.write_text(s,encoding='utf-8')
(ROOT/'tests/relocation-reference-updates.json').write_text(json.dumps({'updated_markdown_links':changed,'historical_actual_output_paths':'preserved','canonical_skill_root':str(NEW)},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'updated_markdown_files':len(changed),'canonical_skill_root':str(NEW)},ensure_ascii=True))
