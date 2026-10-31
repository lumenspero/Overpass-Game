// Compiles every maps/*.map-src.json into maps/<id>.map.json.
// Usage: pnpm compile-maps          (writes the files)
//        pnpm compile-maps --check  (exits 1 if any compiled file is out of date)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { compileMap } from '@overpass-game/map-compiler';
import { parseSourceMap } from '@overpass-game/map-schema';

const mapsDir = new URL('../../maps/', import.meta.url);
const check = process.argv.includes('--check');

let stale = 0;
for (const file of readdirSync(mapsDir).filter((f) =>
  f.endsWith('.map-src.json'),
)) {
  const source = parseSourceMap(
    JSON.parse(readFileSync(new URL(file, mapsDir), 'utf8')),
  );
  const text = JSON.stringify(compileMap(source), null, 2) + '\n';
  const out = new URL(`${source.id}.map.json`, mapsDir);
  if (check) {
    let current = '';
    try {
      current = readFileSync(out, 'utf8');
    } catch {
      // missing counts as stale
    }
    if (current !== text) {
      console.error(`stale: maps/${source.id}.map.json`);
      stale++;
    }
  } else {
    writeFileSync(out, text);
    console.log(`compiled maps/${source.id}.map.json`);
  }
}
if (stale > 0) process.exit(1);
