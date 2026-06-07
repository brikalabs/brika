/**
 * Bundle the `brika` author CLI into a single self-contained file.
 *
 * The build toolchain (@brika/compiler, @brika/cli, @brika/schema, picocolors)
 * is a devDependency, inlined here, so it never enters a plugin's install
 * closure — a plugin's only dependency stays @brika/sdk. @brika/sdk itself is
 * external (the bin runs from inside the installed package), and the native
 * typechecker (@typescript/native-preview) is spawned, never bundled.
 */

const result = await Bun.build({
  entrypoints: [`${import.meta.dir}/src/cli/brika.ts`],
  outdir: `${import.meta.dir}/dist/bin`,
  target: 'bun',
  external: ['@brika/sdk', '@typescript/native-preview'],
  banner: '#!/usr/bin/env bun',
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(String(log));
  }
  process.exit(1);
}
console.log(`✓ built ${result.outputs.map((o) => o.path.split('/').pop()).join(', ')}`);
