"""Read the installed application archive without launching the application."""
import hashlib
import json
import os
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ARCHIVE = Path(os.environ['LOCALAPPDATA']) / 'Programs/Grok Bot/resources/app.asar'

def inventory():
    with ARCHIVE.open('rb') as stream:
        header = struct.unpack('<4I', stream.read(16))
        tree = json.loads(stream.read(header[3]))
    def walk(node, prefix=''):
        for name, value in node.get('files', {}).items():
            key = prefix + name
            if 'files' in value:
                yield from walk(value, key + '/')
            else:
                yield key, value
    return 8 + header[1], dict(walk(tree))

def read_entry(name, base, files):
    entry = files[name]
    if entry.get('unpacked'):
        return (Path(str(ARCHIVE) + '.unpacked') / name).read_bytes()
    with ARCHIVE.open('rb') as stream:
        stream.seek(base + int(entry['offset']))
        return stream.read(entry['size'])

if __name__ == '__main__':
    base, files = inventory()
    directory = ROOT / 'evidence'
    directory.mkdir(parents=True, exist_ok=True)
    package = json.loads(read_entry('package.json', base, files))
    record = {'archive': str(ARCHIVE), 'sha256': hashlib.file_digest(ARCHIVE.open('rb'), 'sha256').hexdigest(), 'package': {key: package.get(key) for key in ['name', 'productName', 'version', 'main']}, 'files': [{'path': key, 'bytes': value.get('size'), 'unpacked': value.get('unpacked', False)} for key, value in files.items()]}
    (directory / 'artifact-inventory.json').write_text(json.dumps(record, indent=2), encoding='utf-8')
    relevant = [key for key in files if 'node_modules/' not in key and (key.endswith(('.css', '.html', '.woff2')) or key.endswith(('.js', '.cjs')) and ('renderer' in key or 'preload' in key))]
    print(json.dumps({'identity': record['package'], 'files': len(files), 'ui_files': relevant[:70]}, indent=2))
