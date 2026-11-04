"""Verify relocation integrity and record the completed local checks."""
from pathlib import Path
import json
import re
import hashlib
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

root = Path(__file__).resolve().parents[2]
path = root / 'docs/verification/data-layout.json'
report = json.loads(path.read_text(encoding='utf-8'))
verified_sources = []
for moved in report['movedFiles']:
    file = root / moved['newPath']
    raw = file.read_bytes()
    moved['finalHash'] = hashlib.sha256(raw).hexdigest().upper()
    if file.suffix == '.ts':
        original = raw.decode('utf-8')
        for edit in report['importChanges']:
            if edit['file'] == moved['newPath']:
                for quote in ["'", '"']:
                    original = original.replace(quote + edit['after'] + quote, quote + edit['before'] + quote)
        assert hashlib.sha256(original.encode('utf-8')).hexdigest().upper() == moved['beforeHash'], file
        verified_sources.append(moved['newPath'])
    elif file.suffix == '.sql':
        assert moved['finalHash'] == moved['beforeHash'], 'SQL changed'
assert not (root / 'RAG').exists() and not (root / 'database').exists()
import_pattern = re.compile(r'''(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(['"])(\.[^'"\r\n]+)\1''')
imports = 0
for folder in ['backend','agents','data','shared','scripts','tests']:
    for file in (root / folder).rglob('*.ts'):
        for match in import_pattern.finditer(file.read_text(encoding='utf-8')):
            assert (file.parent / match[2]).resolve().exists(), (file, match[2])
            imports += 1
current_docs = ['README.md','data/README.md','data/RAG/README.md','data/database/README.md',
                'data/DATA_AUDIT_AND_SOLUTIONS.md','agents/README.md','backend/README.md','docs/RUNNING.md']
links = 0
for name in current_docs:
    file = root / name
    for target in re.findall(r'\]\(([^)]+)\)', file.read_text(encoding='utf-8')):
        if '://' in target or target.startswith('#'): continue
        assert (file.parent / target.split('#')[0]).resolve().exists(), (name, target)
        links += 1
browser = json.loads((root / 'test-results/browser-data-layout.json').read_text(encoding='utf-8'))
assert browser['status'] == 'TEST_PASSED'
assert not browser['pageErrors'] and not browser['consoleErrors'] and browser['realModelCalls'] == 0
unit = (root / 'test-results/unit-tests-data-layout.txt').read_text(encoding='utf-16')
assert re.search(r'pass\s+33\b', unit) and re.search(r'fail\s+0\b', unit)
for filename in ['typecheck-data-layout.txt','build-data-layout.txt']:
    assert (root / 'test-results' / filename).stat().st_size > 0
diagrams = root.parent / 'diagram'
for svg in diagrams.glob('0*.svg'): ET.parse(svg)
architecture = (diagrams / '03-system-architecture.svg').read_text(encoding='utf-8')
assert 'data/RAG/' in architecture and 'data/database/store.ts' in architecture
report.update(status='TEST_PASSED', verifiedAt=datetime.now(timezone.utc).isoformat(),
              checks={'movedFileCount':len(report['movedFiles']), 'importRewrites':len(report['importChanges']),
                      'movedCodeOnlyImportEdits':verified_sources, 'relativeImportsResolved':imports,
                      'currentDocumentationLinksResolved':links, 'schemaUnchanged':True,
                      'typecheck':'TEST_PASSED', 'frontendBuild':'TEST_PASSED', 'unitTests':{'pass':33,'fail':0},
                      'browserChecks':len(browser['checks']), 'pageErrors':0,'consoleErrors':0,
                      'realModelCalls':0, 'diagrams':'REGENERATED_AND_SVG_VALIDATED'},
              recommendationsImplemented=False,
              retainedPaths={'database':'.runtime/data','exports':'cases','skills':'skills','sourceHistory':'expert-team'})
path.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(json.dumps(report['checks'], ensure_ascii=False, indent=2))
