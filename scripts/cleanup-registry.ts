#!/usr/bin/env bun

/**
 * Reconcile the npm registry with the repo's `private` flags.
 *
 * A package is published iff `private !== true` (the single source of truth that
 * scripts/release-libs.ts and the changeset guard already enforce). Over time the
 * registry drifts: packages that were published once and later made `private`
 * (internalized) stay live on npm. This tool finds those "private-in-repo but
 * still-live-on-npm" packages and cleans them up.
 *
 * Two modes:
 *   (default) DEPRECATE  -- reliable, reversible, recommended. Marks each stale
 *                           package deprecated with a message. Safe to automate.
 *   --unpublish          -- prints a dependency-ORDERED removal plan plus the
 *                           blockers (npm refuses to unpublish a package other
 *                           live packages depend on, and refuses entirely past
 *                           the 72h window without meeting its policy). Unpublish
 *                           is destructive + irreversible + often needs npm
 *                           support, so this mode only PRINTS the plan; it never
 *                           runs the deletions.
 *
 * Dry-run by default. `--execute` runs the `npm deprecate` calls (deprecate mode
 * only). The npm calls use your logged-in npm auth -- run `npm whoami` first.
 *
 * Usage:
 *   bun run scripts/cleanup-registry.ts                 # show what would be deprecated
 *   bun run scripts/cleanup-registry.ts --execute       # run the deprecations
 *   bun run scripts/cleanup-registry.ts --unpublish     # print the ordered removal plan
 */

import { parseArgs } from 'node:util';
import { z } from 'zod';
import { discoverWorkspace } from './release-libs';

const DEPRECATE_MESSAGE = 'Internal Brika package, not published for standalone use.';

/**
 * Live on npm but published from a SIBLING repo, not this monorepo. The cleanup
 * must never touch these even though they are absent here: @brika/i18n-devtools
 * (being extracted to its own repo), @brika/clay (the Clay design system), and
 * @brika/icon-studio (icon.brika.dev). Add a package here when it gets its own repo.
 */
const KEEP_ON_NPM = new Set(['@brika/i18n-devtools', '@brika/clay', '@brika/icon-studio']);

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  strict: false,
  options: {
    execute: { type: 'boolean', default: false },
    unpublish: { type: 'boolean', default: false },
    message: { type: 'string' },
  },
});

const execute = values.execute === true;
const message =
  typeof values.message === 'string' && values.message !== '' ? values.message : DEPRECATE_MESSAGE;

const registrySchema = z
  .object({
    'dist-tags': z.record(z.string(), z.string()).default({}),
    versions: z
      .record(
        z.string(),
        z.object({ dependencies: z.record(z.string(), z.string()).default({}) }).loose()
      )
      .default({}),
    time: z.record(z.string(), z.string()).default({}),
  })
  .loose();

interface NpmInfo {
  readonly live: boolean;
  readonly latest: string | null;
  readonly ageDays: number;
  /** Every dependency declared by ANY published version (for dependent analysis). */
  readonly dependedNames: Set<string>;
}

async function fetchNpm(name: string, now: number): Promise<NpmInfo> {
  const res = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2F')}`);
  if (!res.ok) {
    return { live: false, latest: null, ageDays: -1, dependedNames: new Set() };
  }
  const data = registrySchema.parse(await res.json());
  const latest = data['dist-tags'].latest ?? Object.keys(data.versions).at(-1) ?? null;
  const publishedAt = latest === null ? undefined : data.time[latest];
  const ageDays =
    publishedAt === undefined ? -1 : Math.round((now - Date.parse(publishedAt)) / 86_400_000);
  const dependedNames = new Set<string>();
  for (const version of Object.values(data.versions)) {
    for (const dep of Object.keys(version.dependencies)) {
      dependedNames.add(dep);
    }
  }
  return { live: latest !== null, latest, ageDays, dependedNames };
}

/** Run `npm <args>`, inheriting stdio so auth prompts / errors are visible. */
function npm(args: string[]): number {
  return Bun.spawnSync(['npm', ...args], { stdout: 'inherit', stderr: 'inherit' }).exitCode;
}

const isPublishable = (name: string): boolean =>
  name.startsWith('@brika/') || name === 'create-brika';

const ownedSchema = z.record(z.string(), z.string());

/**
 * Every @brika package the logged-in user owns (`npm access list packages`).
 * Needed to catch ORPHANS: packages live on npm but deleted from the repo, which
 * a repo-only scan can't see. Returns null when not logged in (orphan detection
 * is then skipped with a warning).
 */
function listOwnedPackages(): Set<string> | null {
  const proc = Bun.spawnSync(['npm', 'access', 'list', 'packages', '--json'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (proc.exitCode !== 0) {
    return null;
  }
  const parsed = ownedSchema.safeParse(JSON.parse(proc.stdout.toString()));
  if (!parsed.success) {
    return null;
  }
  return new Set(Object.keys(parsed.data).filter((n) => n.startsWith('@brika/')));
}

interface Reconciliation {
  /** Packages to clean up: private-in-repo-but-live, plus orphans (live, not in repo). */
  readonly targets: string[];
  readonly orphans: Set<string>;
  readonly kept: string[];
  readonly keeperNames: Set<string>;
  readonly npmByName: Map<string, NpmInfo>;
  readonly ownedKnown: boolean;
}

/** Reconcile npm against the repo: find stale (private-in-repo) + orphan packages. */
async function reconcile(now: number): Promise<Reconciliation> {
  const workspace = await discoverWorkspace().then((w) => w.filter((p) => isPublishable(p.name)));
  const repoNames = new Set(workspace.map((p) => p.name));
  const privateNames = workspace.filter((p) => p.isPrivate).map((p) => p.name);
  const keeperNames = new Set(workspace.filter((p) => !p.isPrivate).map((p) => p.name));

  const owned = listOwnedPackages();
  const orphanCandidates = [...(owned ?? [])].filter(
    (name) => !repoNames.has(name) && !KEEP_ON_NPM.has(name)
  );

  const npmByName = new Map<string, NpmInfo>();
  for (const name of new Set([
    ...privateNames,
    ...keeperNames,
    ...orphanCandidates,
    ...KEEP_ON_NPM,
  ])) {
    npmByName.set(name, await fetchNpm(name, now));
  }
  const isLive = (name: string): boolean => npmByName.get(name)?.live === true;

  const staleLive = privateNames.filter(isLive).filter((name) => !KEEP_ON_NPM.has(name));
  const orphans = new Set(orphanCandidates.filter(isLive));
  return {
    targets: [...staleLive, ...orphans].sort(),
    orphans,
    kept: [...KEEP_ON_NPM].filter(isLive).sort(),
    keeperNames,
    npmByName,
    ownedKnown: owned !== null,
  };
}

const tag = (name: string, orphans: Set<string>): string =>
  orphans.has(name) ? ' (orphan: not in repo)' : '';

/** Deprecate every target package (the default, reversible cleanup). */
function deprecate(targets: string[], orphans: Set<string>, npmByName: Map<string, NpmInfo>): void {
  console.log(
    `DEPRECATE ${targets.length} package(s)${execute ? '' : '  (dry run -- pass --execute to run)'}:`
  );
  let failures = 0;
  for (const name of targets) {
    console.log(`  npm deprecate "${name}" "${message}"${tag(name, orphans)}`);
    if (execute && npm(['deprecate', name, message]) !== 0) {
      failures += 1;
      console.error(`    FAILED to deprecate ${name}`);
    }
  }
  if (!execute) {
    console.log('\nThis is reversible: clear with `npm deprecate <pkg> ""`.');
    return;
  }
  console.log(
    failures === 0 ? `\nDeprecated ${targets.length} package(s).` : `\n${failures} failed.`
  );
  if (failures > 0) {
    process.exit(1);
  }
}

/**
 * Dependents-first removal order over the stale set (Kahn's algorithm): a package
 * can only be unpublished once nothing in the set still depends on it.
 */
function unpublishOrder(stale: string[], npmByName: Map<string, NpmInfo>): string[] {
  const staleSet = new Set(stale);
  const dependsOn = new Map<string, Set<string>>(
    stale.map((name) => [
      name,
      new Set([...(npmByName.get(name)?.dependedNames ?? [])].filter((d) => staleSet.has(d))),
    ])
  );
  const inDegree = new Map<string, number>(stale.map((n) => [n, 0]));
  for (const deps of dependsOn.values()) {
    for (const dep of deps) {
      inDegree.set(dep, (inDegree.get(dep) ?? 0) + 1);
    }
  }
  const order: string[] = [];
  const remaining = new Set(stale);
  while (remaining.size > 0) {
    const ready = [...remaining].filter((n) => (inDegree.get(n) ?? 0) === 0).sort();
    if (ready.length === 0) {
      order.push(...[...remaining].sort()); // cycle: append the rest so the plan stays complete
      break;
    }
    for (const n of ready) {
      order.push(n);
      remaining.delete(n);
      for (const dep of dependsOn.get(n) ?? []) {
        inDegree.set(dep, (inDegree.get(dep) ?? 0) - 1);
      }
    }
  }
  return order;
}

/** Kept (non-private) packages whose published versions still depend on a stale one. */
function keeperBlockers(
  stale: string[],
  keeperNames: Set<string>,
  npmByName: Map<string, NpmInfo>
): Array<{ stale: string; keeper: string }> {
  const staleSet = new Set(stale);
  const blockers: Array<{ stale: string; keeper: string }> = [];
  for (const keeper of keeperNames) {
    for (const dep of npmByName.get(keeper)?.dependedNames ?? []) {
      if (staleSet.has(dep)) {
        blockers.push({ stale: dep, keeper });
      }
    }
  }
  return blockers.sort((a, b) => a.stale.localeCompare(b.stale));
}

/** Print (never run) the ordered, blocker-annotated unpublish plan. */
function unpublishPlan(
  targets: string[],
  orphans: Set<string>,
  keeperNames: Set<string>,
  npmByName: Map<string, NpmInfo>
): void {
  console.log(`UNPUBLISH plan for ${targets.length} package(s) (dependents-first order).`);
  console.log('Unpublish is destructive + irreversible; this prints the plan only.\n');
  for (const name of unpublishOrder(targets, npmByName)) {
    const ageDays = npmByName.get(name)?.ageDays ?? -1;
    const past72 = ageDays > 3 ? '   # >72h: npm may refuse -> email support@npmjs.com' : '';
    console.log(`  npm unpublish "${name}" --force${past72}${tag(name, orphans)}`);
  }
  const blockers = keeperBlockers(targets, keeperNames, npmByName);
  if (blockers.length > 0) {
    console.log('\nBLOCKERS (npm refuses these until the dependent is removed/changed):');
    for (const b of blockers) {
      console.log(
        `  ${b.stale}  <- still depended on by the kept package ${b.keeper} (old published version)`
      );
    }
    console.log(
      '  Resolve: publish fresh keeper versions, then unpublish the old versions that reference these.'
    );
  }
  console.log(
    '\nReminder: unpublished versions can never be reused; the package NAME returns after 24h.'
  );

  // Past 72h, the CLI usually refuses (dependents + npm policy), so removal goes
  // through npm support. Emit a ready-to-send request listing the whole set.
  console.log('\nIf the CLI refuses any, send this to support@npmjs.com (you are the sole owner):');
  console.log('  ---');
  console.log('  Subject: Unpublish request for internalized @brika/* packages');
  console.log('  Please remove these packages from the public registry. They were published in an');
  console.log(
    '  earlier release, have since been internalized into @brika/sdk, are not intended for'
  );
  console.log('  standalone use, and we are the sole maintainer:');
  for (const name of targets) {
    console.log(`    ${name}`);
  }
  console.log('  ---');
}

async function main(): Promise<void> {
  const now = Date.parse(new Date().toISOString());
  const { targets, orphans, kept, keeperNames, npmByName, ownedKnown } = await reconcile(now);

  if (kept.length > 0) {
    console.log(`Keeping on npm (published from elsewhere): ${kept.join(', ')}\n`);
  }
  if (!ownedKnown) {
    console.log('Note: `npm access list packages` failed (run `npm login`), so orphan');
    console.log('packages (live on npm but absent from the repo) were NOT checked.\n');
  }
  if (targets.length === 0) {
    console.log('Registry is clean: nothing private-in-repo or orphaned is live on npm.');
    return;
  }

  if (values.unpublish) {
    unpublishPlan(targets, orphans, keeperNames, npmByName);
  } else {
    deprecate(targets, orphans, npmByName);
  }
}

await main();
