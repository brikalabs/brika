/**
 * Publish @brika/compiler to npm as `<base>-<fingerprint>` (e.g. 0.4.0-00e5f35c9ec7).
 *
 * The suffix is the compiler's content fingerprint (OUTPUT_VERSION), so identical
 * source republishes to the SAME version and npm rejects the duplicate: publishing
 * is idempotent, and a version maps 1:1 to the exact compiler that produced it.
 * The stamped version is reverted afterwards, so the committed package.json stays
 * on the plain base version.
 *
 * Prereq: `npm login` (a valid npm auth token). Run: `bun run release`.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { OUTPUT_VERSION } from './src/output-version';

const dir = new URL('.', import.meta.url).pathname;
const pkgPath = `${dir}package.json`;
const original = readFileSync(pkgPath, 'utf8');
const pkg = JSON.parse(original);
const base = String(pkg.version).split('-')[0];
const version = `${base}-${OUTPUT_VERSION}`;

console.log(`publishing @brika/compiler@${version}`);
writeFileSync(pkgPath, `${JSON.stringify({ ...pkg, version }, null, 2)}\n`);
try {
  // prepublishOnly rebuilds dist; --access public is required for a scoped package.
  execSync('npm publish --access public', { cwd: dir, stdio: 'inherit' });
} finally {
  writeFileSync(pkgPath, original); // keep the committed version on the plain base
}
