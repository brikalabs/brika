import { chmod } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = import.meta.dir;
const DIST = join(ROOT, 'dist');

const result = await Bun.build({
  entrypoints: [join(ROOT, 'src/index.ts')],
  outdir: DIST,
  target: 'bun',
  minify: true,
  banner: '#!/usr/bin/env bun',
});

if (!result.success) {
  for (const log of result.logs) console.error(log.message);
  process.exit(1);
}

await chmod(join(DIST, 'index.js'), 0o755);
