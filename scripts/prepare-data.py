"""Reproduce bundled factual data from pinned HTTPS sources, checking SHA-256.
Run from the repository root after npm ci. Python 3.10+ required only for this optional task.
"""
import hashlib
import json
import pathlib
import sqlite3
import subprocess
import tempfile
import urllib.request

root = pathlib.Path(__file__).resolve().parent.parent
sources = json.loads((root / 'public/data/sources.json').read_text())
with tempfile.TemporaryDirectory() as tmp:
    tmp = pathlib.Path(tmp)
    for key, name in [('boundaries', 'regions.json'), ('restAreas', 'rest.db')]:
        source = sources[key]
        with urllib.request.urlopen(source['source'], timeout=60) as response:
            data = response.read()
        if hashlib.sha256(data).hexdigest() != source['sha256']:
            raise RuntimeError(f'{key}: checksum mismatch; no outputs changed')
        (tmp / name).write_bytes(data)
    subprocess.run([str(root / 'node_modules/.bin/mapshaper'), str(tmp / 'regions.json'),
                    '-simplify', 'weighted', '8%', 'keep-shapes', '-o',
                    str(tmp / 'regions.geojson'), 'format=geojson', 'precision=0.00001'], check=True)
    subprocess.run(['node', '--input-type=module', '-e', '''
import fs from 'node:fs'; import {geoArea} from 'd3';
const file=process.argv[1], geo=JSON.parse(fs.readFileSync(file));
for(const f of geo.features) {
  const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
  for(const polygon of polygons) if(geoArea({type:'Polygon',coordinates:polygon})>2*Math.PI) polygon.forEach(r=>r.reverse());
}
if(geo.features.length!==250)throw Error('Unexpected boundary count');
fs.writeFileSync(file,JSON.stringify(geo));
''', str(tmp / 'regions.geojson')], cwd=root, check=True)
    connection = sqlite3.connect(tmp / 'rest.db')
    connection.row_factory = sqlite3.Row
    rows = connection.execute('SELECT * FROM rest_areas ORDER BY id').fetchall()
    assert len(rows) == 210
    assert all(33 <= r['latitude'] <= 39 and 124 <= r['longitude'] <= 132 for r in rows)
    rests = [dict(id=f"rest-{r['id']}", name=r['name'], route=r['route_no'],
                  direction=r['direction'], lat=r['latitude'], lng=r['longitude']) for r in rows]
    (root / 'public/data/regions.geojson').write_bytes((tmp / 'regions.geojson').read_bytes())
    (root / 'public/data/rest-areas.json').write_text(json.dumps(rests, ensure_ascii=False, separators=(',', ':')))
    connection.close()
subprocess.run(['node', 'scripts/build-hierarchy.mjs'], cwd=root, check=True)
print('Verified sources and prepared the two-level hierarchy and 210 rest areas.')
