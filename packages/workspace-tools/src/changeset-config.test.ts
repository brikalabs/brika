import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { Glob } from 'bun';
import { z } from 'zod';

/**
 * Guard: the Changesets config and per-package `private` flags must agree, so the
 * published surface never silently drifts.
 *
 * The model is "private is the single source of truth": a package is published iff
 * `private !== true`. The Changesets `ignore` is deny-by-default (ignore all
 * `@brika/*`, then un-ignore exactly the published ones), because Changesets
 * version-bumps a private dependent on a cascade and only `ignore` stops that.
 * This test pins the contract: the `!`-negations must equal the non-private
 * `@brika/*` packages. Add a published package -> set `private:false` AND add its
 * `!` negation, or this fails (which is the point: the two stay coupled).
 */

const REPO_ROOT = join(import.meta.dir, '..', '..', '..');

const configSchema = z.object({ ignore: z.array(z.string()) }).loose();
const pkgSchema = z
  .object({ name: z.string().optional(), private: z.boolean().optional() })
  .loose();

const config = configSchema.parse(
  JSON.parse(await Bun.file(join(REPO_ROOT, '.changeset/config.json')).text())
);

async function workspacePackages(): Promise<Array<{ name: string; private: boolean }>> {
  const out: Array<{ name: string; private: boolean }> = [];
  for (const pattern of [
    'apps/*/package.json',
    'packages/*/package.json',
    'plugins/*/package.json',
  ]) {
    for await (const rel of new Glob(pattern).scan({ cwd: REPO_ROOT })) {
      const pkg = pkgSchema.parse(JSON.parse(await Bun.file(join(REPO_ROOT, rel)).text()));
      if (pkg.name) {
        out.push({ name: pkg.name, private: pkg.private === true });
      }
    }
  }
  return out;
}

describe('changeset config stays in sync with package privacy', () => {
  test('ignore is deny-by-default: a single `@brika/*` positive plus negations', () => {
    const positives = config.ignore.filter((entry) => !entry.startsWith('!'));
    expect(positives).toEqual(['@brika/*']);
  });

  test('un-ignored @brika packages equal the non-private @brika packages', async () => {
    const packages = await workspacePackages();
    const nonPrivateBrika = packages
      .filter((p) => p.name.startsWith('@brika/') && !p.private)
      .map((p) => p.name)
      .sort();
    const unIgnored = config.ignore
      .filter((entry) => entry.startsWith('!@brika/'))
      .map((entry) => entry.slice(1))
      .sort();
    expect(unIgnored).toEqual(nonPrivateBrika);
  });

  test('create-brika (the one non-@brika published package) is not private', async () => {
    const createBrika = (await workspacePackages()).find((p) => p.name === 'create-brika');
    expect(createBrika?.private).toBe(false);
  });
});
