"""Rebase relative imports after the verified data directory move."""
from pathlib import Path
import re
import os
import json
import hashlib

root = Path(__file__).resolve().parents[2]
manifest_path = root / 'docs/verification/data-layout.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8-sig'))
assert manifest['status'] == 'MOVED_VERIFIED_BEFORE_IMPORT_EDITS', 'Run once after the verified move'
old_to_new = {(root / f['oldPath']).resolve(): (root / f['newPath']).resolve() for f in manifest['movedFiles']}
new_to_old = {new: old for old, new in old_to_new.items()}
pattern = re.compile(r'''(\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(['"])(\.[^'"\r\n]+)\2''')
edits = []
for folder in ['backend', 'agents', 'data', 'shared', 'scripts', 'tests']:
    for file in sorted((root / folder).rglob('*.ts')):
        old_file = new_to_old.get(file.resolve(), file.resolve())
        original = file.read_bytes().decode('utf-8')
        def rebase(match):
            old_target = (old_file.parent / match[3]).resolve()
            new_target = old_to_new.get(old_target, old_target)
            relative = Path(os.path.relpath(new_target, file.parent)).as_posix()
            if not relative.startswith('.'): relative = './' + relative
            if relative == match[3]: return match[0]
            edits.append({'file': file.relative_to(root).as_posix(), 'before': match[3], 'after': relative})
            return match[1] + match[2] + relative + match[2]
        updated = pattern.sub(rebase, original)
        if updated != original: file.write_bytes(updated.encode('utf-8'))
tsconfig = root / 'tsconfig.json'
text = tsconfig.read_bytes().decode('utf-8')
text = text.replace('"RAG/**/*.ts", "database/**/*.ts"', '"data/**/*.ts"')
tsconfig.write_bytes(text.encode('utf-8'))
unresolved = []
for folder in ['backend', 'agents', 'data', 'shared', 'scripts', 'tests']:
    for file in (root / folder).rglob('*.ts'):
        for match in pattern.finditer(file.read_bytes().decode('utf-8')):
            if not (file.parent / match[3]).resolve().exists():
                unresolved.append({'file': file.relative_to(root).as_posix(), 'import': match[3]})
assert not unresolved, unresolved
manifest.update(status='IMPORTS_REPAIRED', activeImportsUpdated=True, importChanges=edits, unresolvedImports=unresolved)
for file in manifest['movedFiles']:
    file['finalHash'] = hashlib.sha256((root / file['newPath']).read_bytes()).hexdigest().upper()
schema = next(f for f in manifest['movedFiles'] if f['oldPath'] == 'database/schema.sql')
assert schema['beforeHash'] == schema['finalHash'], 'SQL schema must be unchanged'
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Rebased {len(edits)} imports; all relative TypeScript imports resolve; schema unchanged.')
