"""Optional reproducible fetch of the 2018 SGIS Dokdo supplement; no runtime downloads."""
import hashlib
import json
import pathlib
import subprocess
import tempfile
import urllib.request
root = pathlib.Path(__file__).resolve().parent.parent
source = json.loads((root / 'public/data/sources.json').read_text())['dokdo']
with urllib.request.urlopen(source['source'], timeout=60) as response:
    data = response.read()
if hashlib.sha256(data).hexdigest() != source['sha256']:
    raise RuntimeError('Pinned source checksum mismatch; existing data unchanged')
with tempfile.TemporaryDirectory() as tmp:
    input_file = pathlib.Path(tmp) / 'source.geojson'
    input_file.write_bytes(data)
    subprocess.run(['node', 'scripts/extract-dokdo.mjs', str(input_file)], cwd=root, check=True)
subprocess.run(['node', 'scripts/build-hierarchy.mjs'], cwd=root, check=True)
