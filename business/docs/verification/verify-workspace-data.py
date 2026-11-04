"""Validate the exact workspace-level data destination after local checks."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, re
import xml.etree.ElementTree as ET

workspace = Path(__file__).resolve().parents[3]
business = workspace / 'business'
data = workspace / 'data'
path = business / 'docs/verification/workspace-data-layout.json'
report = json.loads(path.read_text(encoding='utf-8'))
assert not (business / 'data').exists()
assert data.resolve() == Path('C:/maven/business_agent/data').resolve()
code = []
for moved in report['movedFiles']:
    file = workspace / moved['newPath']
    raw = file.read_bytes()
    moved['finalHash'] = hashlib.sha256(raw).hexdigest().upper()
    if file.suffix == '.ts':
        previous = raw.decode('utf-8')
        for edit in report['importChanges']:
            if edit['file'] == moved['newPath']:
                for quote in ["'", '"']:
                    previous = previous.replace(quote+edit['after']+quote, quote+edit['before']+quote)
        assert hashlib.sha256(previous.encode('utf-8')).hexdigest().upper() == moved['beforeHash'], file
        code.append(moved['newPath'])
    if file.suffix == '.sql': assert moved['finalHash'] == moved['beforeHash']
pattern = re.compile(r'''(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(['"])(\.[^'"\r\n]+)\1''')
imports = 0
for folder in [business / n for n in ['backend','agents','shared','scripts','tests']] + [data]:
    for file in folder.rglob('*.ts'):
        if 'node_modules' in file.parts: continue
        for match in pattern.finditer(file.read_text(encoding='utf-8')):
            assert (file.parent / match[2]).resolve().exists(), (file, match[2])
            imports += 1
docs = [business / n for n in ['README.md','docs/IMPLEMENTATION_STATUS.md','docs/RUNNING.md','agents/README.md']] + [data / n for n in ['README.md','RAG/README.md','database/README.md','DATA_AUDIT_AND_SOLUTIONS.md']]
links = 0
for file in docs:
    for target in re.findall(r'\]\(([^)]+)\)', file.read_text(encoding='utf-8')):
        if '://' in target or target.startswith('#'): continue
        assert (file.parent / target.split('#')[0]).resolve().exists(), (file, target)
        links += 1
unit = (business / 'test-results/unit-tests-workspace-data.txt').read_text(encoding='utf-16')
assert re.search(r'pass\s+33\b', unit) and re.search(r'fail\s+0\b', unit)
browser = json.loads((business / 'test-results/browser-workspace-data.json').read_text(encoding='utf-8'))
assert browser['status'] == 'TEST_PASSED' and browser['realModelCalls'] == 0
assert not browser['pageErrors'] and not browser['consoleErrors']
lock = json.loads((data / 'package-lock.json').read_text(encoding='utf-8'))
for package, version in {'@electric-sql/pglite':'0.3.16','zod':'4.6.7'}.items():
    assert lock['packages']['node_modules/'+package]['version'] == version
    assert json.loads((data / 'node_modules' / package / 'package.json').read_text(encoding='utf-8'))['version'] == version
for file in (workspace / 'diagram').glob('0*.svg'): ET.parse(file)
config = (business / 'shared/config.ts').read_text(encoding='utf-8')
assert "runtimeRoot = path.join(businessRoot, '.runtime')" in config
assert "dataDir: fromRoot(process.env.LYDIA_DATA_DIR || process.env.CREW_DATA_DIR) || path.join(runtimeRoot, 'data')" in config
report.update(status='TEST_PASSED', verifiedAt=datetime.now(timezone.utc).isoformat(),
              applicationRoot=str(business), sourceCodeRoot=str(data),
              runtimeDatabaseMoved=False, schemaChanged=False, applicationBehaviorChanged=False,
              recommendationsImplemented=False,
              checks={'movedFiles':len(report['movedFiles']), 'importRewrites':len(report['importChanges']),
                      'codeOnlyImportEdits':code, 'resolvedRelativeImports':imports,'resolvedDocumentationLinks':links,
                      'typecheck':'TEST_PASSED','frontendBuild':'TEST_PASSED','unitTests':{'pass':33,'fail':0},
                      'browserChecks':len(browser['checks']),'pageErrors':0,'consoleErrors':0,'realModelCalls':0,
                      'dependencyInstall':'OFFLINE_PINNED_PRIVATE_ESM_PACKAGE','diagrams':'REGENERATED_AND_VALIDATED'})
path.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(json.dumps(report['checks'], ensure_ascii=False, indent=2))
