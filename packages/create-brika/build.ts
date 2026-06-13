import { chmod } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = import.meta.dir;
const DIST = join(ROOT, 'dist');

// The `create-brika` bin: a standalone executable, so it gets the shebang + +x.
const bin = await Bun.build({
  entrypoints: [join(ROOT, 'src/index.ts')],
  outdir: DIST,
  target: 'bun',
  minify: true,
  banner: '#!/usr/bin/env bun',
});

// The `./run` module: imported by @brika/sdk's `brika create` command, so it is a
// plain module (NO shebang -- a shebang would make an `import` of it throw).
const lib = await Bun.build({
  entrypoints: [join(ROOT, 'src/run.ts')],
  outdir: DIST,
  target: 'bun',
  minify: true,
});

for (const result of [bin, lib]) {
  if (!result.success) {
    for (const log of result.logs) console.error(log.message);
    process.exit(1);
  }
}

await chmod(join(DIST, 'index.js'), 0o755);
