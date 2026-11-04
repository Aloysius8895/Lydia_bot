from pathlib import Path
import re, os, json

workspace = Path(__file__).resolve().parents[3]
business = workspace / 'business'
manifest_path = business / 'docs/verification/workspace-data-layout.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8-sig'))
assert manifest['status'] == 'MOVED_VERIFIED_BEFORE_IMPORT_EDITS'
mapping = {(workspace / f['oldPath']).resolve(): (workspace / f['newPath']).resolve() for f in manifest['movedFiles']}
reverse = {v:k for k,v in mapping.items()}
pattern = re.compile(r'''(\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(['"])(\.[^'"\r\n]+)\2''')
edits = []
for folder in [business / n for n in ['backend','agents','shared','scripts','tests']] + [workspace / 'data']:
    for file in folder.rglob('*.ts'):
        if 'node_modules' in file.parts: continue
        original = file.read_bytes().decode('utf-8')
        old_file = reverse.get(file.resolve(), file.resolve())
        def rewrite(match):
            old_target = (old_file.parent / match[3]).resolve()
            new_target = mapping.get(old_target, old_target)
            relative = Path(os.path.relpath(new_target, file.parent)).as_posix()
            if not relative.startswith('.'): relative = './' + relative
            if relative == match[3]: return match[0]
            edits.append({'file':file.relative_to(workspace).as_posix(),'before':match[3],'after':relative})
            return match[1] + match[2] + relative + match[2]
        updated = pattern.sub(rewrite, original)
        if updated != original: file.write_bytes(updated.encode('utf-8'))
config = business / 'tsconfig.json'
config.write_bytes(config.read_bytes().replace(b'"data/**/*.ts"', b'"../data/**/*.ts"'))
manifest.update(status='IMPORTS_REPAIRED', importChanges=edits)
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(f'Rebased {len(edits)} references for sibling data folder.')
