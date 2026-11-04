"""Run a pinned REA CLI against the read-only installed application ASAR."""
import json
import os
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parent
evidence = root / 'evidence'
evidence.mkdir(exist_ok=True)
target = Path(os.environ['LOCALAPPDATA']) / 'Programs/Grok Bot/resources/app.asar'
command = [shutil.which('npx.cmd'), '--yes', '--package=rea-agents@6.4.0', 'rea', 'analyze-javascript-application', str(target), '--integrity-policy', 'record-and-continue', '--max-heap-mb', '2048', '--analysis-timeout-ms', '60000', '--format', 'json']
with (evidence / 'rea-analysis.json').open('wb') as out, (evidence / 'rea-progress.log').open('wb') as err:
    result = subprocess.run(command, stdout=out, stderr=err, timeout=900)
record = {'created_at': datetime.now(timezone.utc).isoformat(), 'command': command, 'exit_code': result.returncode, 'launched_target': False}
(evidence / 'rea-run.json').write_text(json.dumps(record, indent=2), encoding='utf-8')
print(json.dumps(record))
