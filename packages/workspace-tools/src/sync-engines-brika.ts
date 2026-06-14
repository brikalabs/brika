#!/usr/bin/env bun
/**
 * Sync every plugin's `engines.brika` to the binary release line.
 *
 * The running hub's version is `buildInfo.version` (a build-time macro derived
 * from the binary release version), NOT `package.json` at runtime. The hub's
 * compatibility gate checks `semver.satisfies(stripPrerelease(HUB_VERSION),
 * engines.brika)`, so each plugin's `engines.brika` must track the binary line,
 * not the Changesets number.
 *
 * This script reads the binary release version from `BRIKA_RELEASE_VERSION`
 * (falling back to the root `package.json` version), derives a `^<major>.<minor>.0`
 * range, and rewrites every `plugins/<name>/package.json`'s `engines.brika` to
 * match. It is idempotent: a plugin already on the target range is left untouched
 * (and reported as unchanged).
 *
 * Run by `version-packages` right after `changeset version`, so the plugin
 * manifests the publisher ships always advertise the correct hub range.
 *
 * Usage:
 *   bun run packages/workspace-tools/src/sync-engines-brika.ts
 *   BRIKA_RELEASE_VERSION=0.5.0 bun run packages/workspace-tools/src/sync-engines-brika.ts
 */

import { join } from 'node:path';
import { Glob } from 'bun';
import { z } from 'zod';

// Always invoked from the repo root (via the root `sync:engines-brika` script).
const REPO_ROOT = process.cwd();

/** Minimal shape we read/write; everything else in the manifest is preserved. */
const pluginManifestSchema = z
  .object({
    name: z.string(),
    private: z.boolean().optional(),
    engines: z.object({ brika: z.string() }).loose().optional(),
  })
  .loose();

const semverSchema = z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/, {
  message: 'expected a semver string like "0.4.0" or "0.4.0-rc.1"',
});

/** Resolve the binary release version, env first, root manifest second. */
async function resolveReleaseVersion(): Promise<string> {
  const fromEnv = process.env.BRIKA_RELEASE_VERSION;
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') {
    return semverSchema.parse(fromEnv.trim());
  }
  const rootRaw: unknown = await Bun.file(join(REPO_ROOT, 'package.json')).json();
  const root = z.object({ version: z.string() }).loose().parse(rootRaw);
  return semverSchema.parse(root.version);
}

/** Derive the `^<major>.<minor>.0` engines range from a release version. */
function enginesRange(version: string): string {
  const [major, minor] = version.split(/[.+-]/);
  return `^${major}.${minor}.0`;
}

async function main(): Promise<void> {
  const version = await resolveReleaseVersion();
  const target = enginesRange(version);
  console.log(`sync:engines-brika  release ${version}  ->  engines.brika ${target}`);

  const glob = new Glob('plugins/*/package.json');
  const changed: string[] = [];
  const unchanged: string[] = [];

  for await (const relPath of glob.scan({ cwd: REPO_ROOT, onlyFiles: true })) {
    const file = Bun.file(join(REPO_ROOT, relPath));
    const raw = z.record(z.string(), z.unknown()).parse(JSON.parse(await file.text()));
    const manifest = pluginManifestSchema.parse(raw);

    if (manifest.private === true) {
      continue;
    }

    const current = manifest.engines?.brika;
    if (current === target) {
      unchanged.push(manifest.name);
      continue;
    }

    // Mutate `engines.brika` in place on the order-preserving raw object, so the
    // committed Version-Packages diff is one line, not a full key reorder.
    const engines = raw.engines;
    raw.engines = {
      ...(typeof engines === 'object' && engines !== null ? engines : {}),
      brika: target,
    };
    await Bun.write(file, `${JSON.stringify(raw, null, 2)}\n`);
    console.log(`  ${manifest.name}: ${current ?? '(unset)'} -> ${target}`);
    changed.push(manifest.name);
  }

  console.log(`Done. ${changed.length} updated, ${unchanged.length} already on ${target}.`);
}

if (import.meta.main) {
  await main();
}
