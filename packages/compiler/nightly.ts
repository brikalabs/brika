/**
 * Publish a NIGHTLY of @brika/compiler as `<base>-<fingerprint>` under the
 * `nightly` dist-tag, so `@brika/compiler@nightly` tracks the bleeding edge while
 * `latest` stays on the stable semver release (`npm version patch && bun publish`).
 *
 * The suffix is the compiler's content fingerprint (OUTPUT_VERSION): identical
 * source republishes to the SAME version and npm rejects the duplicate, so a
 * nightly maps 1:1 to the compiler that produced it. The stamped version is
 * reverted afterwards, so the committed package.json stays on the plain base.
 *
 * Prereq: `npm login`. Run: `bun run nightly`.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { OUTPUT_VERSION } from './src/output-version';

const dir = new URL('.', import.meta.url).pathname;
const pkgPath = `${dir}package.json`;
const original = readFileSync(pkgPath, 'utf8');
const pkg = JSON.parse(original);
const base = String(pkg.version).split('-')[0];
// A hex fingerprint is alphanumeric (a valid semver prerelease id); guard the
// rare all-digit hash, which semver would treat as a leading-zero-illegal number.
const id = /^\d+$/.test(OUTPUT_VERSION) ? `g${OUTPUT_VERSION}` : OUTPUT_VERSION;
const version = `${base}-${id}`;

console.log(`publishing @brika/compiler@${version} (dist-tag: nightly)`);
writeFileSync(pkgPath, `${JSON.stringify({ ...pkg, version }, null, 2)}\n`);
try {
  // prepack rebuilds dist; --tag nightly keeps it off `latest`; --access public for the scoped pkg.
  execSync('bun publish --tag nightly --access public', { cwd: dir, stdio: 'inherit' });
} finally {
  writeFileSync(pkgPath, original); // committed version stays on the plain base
}
