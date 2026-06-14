/**
 * The single correct mechanism for shipping one workspace package to npm,
 * shared by both publisher entries: the automated CI release
 * (./release-libs.ts, which walks the topo order) and the interactive publisher
 * (./publish.ts, which lets a human pick packages). Both delegate here so the
 * on-disk manifest transforms, idempotent skip, and publish flags stay identical
 * no matter who triggers the release.
 *
 * Uses `npm publish`, NOT `bun publish`: Bun 1.3.x has no `--provenance` flag and
 * no OIDC / trusted-publishing support. `npm publish` prompts for an OTP on stdin
 * when 2FA is required (the interactive path keeps stdin attached for that) and
 * attaches provenance under GitHub Actions.
 *
 * THE workspace REWRITE: the internal `@brika/*` deps use the `workspace:`
 * protocol, which `npm publish` would ship verbatim (no consumer can install it).
 * So every `@brika/*` `workspace:` range is rewritten to a concrete `^<version>`
 * ON DISK just before publish, then the manifest is restored. The same disk pass
 * also strips workspace-only `./internal/*` exports and dev-only tooling keys,
 * and (for bundle packages) builds the dist and repoints exports src -> dist.
 */

import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  bundleExports,
  isBundlePublished,
  rewriteWorkspaceRanges,
  stripDevManifestFields,
  stripInternalExports,
} from './publish-manifest';

/** Identifies the one package to publish. */
export interface PublishTarget {
  /** Absolute path to the package directory (the one holding package.json). */
  readonly dir: string;
  readonly name: string;
  readonly version: string;
}

export interface PublishOptions {
  /**
   * Concrete versions for every workspace package, keyed by name. Used to rewrite
   * the target's `@brika/*` `workspace:` ranges to `^<version>` before publish.
   */
  readonly versions: Map<string, string>;
  /** Repo root: the source of the root LICENSE for packages that list it in `files`. */
  readonly repoRoot: string;
  /** Exercise the full flow but pass `--dry-run`, writing nothing to the registry. */
  readonly dryRun?: boolean;
  /** Force a dist-tag; when omitted it is derived from the version (prerelease -> `next`). */
  readonly tag?: string;
  /**
   * Keep stdin attached so `npm publish` can prompt for an OTP. The interactive
   * publisher sets this; the CI release leaves it off (no TTY, 2FA via token).
   */
  readonly interactive?: boolean;
}

/** The result of one publish attempt. */
export type PublishOutcome =
  | { readonly status: 'published'; readonly tag: string }
  | { readonly status: 'skipped'; readonly reason: 'already-published' }
  | { readonly status: 'failed'; readonly reason: string };

/**
 * Default dist-tag: a prerelease version (containing `-`, e.g. `0.5.0-rc.1`)
 * routes to `next`; a stable version routes to `latest`. An explicit tag
 * overrides both.
 */
export function resolveTag(version: string, explicitTag?: string): string {
  if (explicitTag !== undefined && explicitTag !== '') {
    return explicitTag;
  }
  return version.includes('-') ? 'next' : 'latest';
}

/** True if `name@version` already exists on the registry (npm versions are immutable). */
export function isPublished(name: string, version: string): boolean {
  const proc = Bun.spawnSync(['npm', 'view', `${name}@${version}`, 'version'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return proc.exitCode === 0 && proc.stdout.toString().trim() === version;
}

/**
 * Publish one package: skip if it is already live, otherwise rewrite its
 * manifest on disk (workspace ranges, internal exports, bundle exports, dev
 * fields), `npm publish`, then restore the manifest. The manifest restore and
 * LICENSE cleanup run in `finally`, so a thrown error never leaves the working
 * tree dirty.
 */
export async function publishPackage(
  target: PublishTarget,
  options: PublishOptions
): Promise<PublishOutcome> {
  const { versions, repoRoot, dryRun = false, interactive = false } = options;
  const tag = resolveTag(target.version, options.tag);

  // Idempotent: npm versions are immutable, so a re-run after a partial publish
  // must skip what is already live rather than 409 and wedge the release.
  if (!dryRun && isPublished(target.name, target.version)) {
    return { status: 'skipped', reason: 'already-published' };
  }

  const manifestPath = join(target.dir, 'package.json');
  const original = await Bun.file(manifestPath).text();
  const rewritten = rewriteWorkspaceRanges(original, versions);
  if (rewritten?.includes('"workspace:')) {
    // A non-@brika workspace range survived the rewrite: never ship that.
    return { status: 'failed', reason: 'unresolved workspace: range after rewrite' };
  }
  // Trim workspace-only `./internal/*` exports from the published manifest. The
  // strip runs on top of the workspace-range rewrite, so publishText carries both.
  const stripped = stripInternalExports(rewritten ?? original);
  let publishText = stripped ?? rewritten;

  // Bundle-published packages (build:dist script): build the dist, then repoint
  // exports src -> dist so consumers get the self-contained bundle. The build
  // must run before publish since we publish with --ignore-scripts.
  if (isBundlePublished(original)) {
    console.log(`  ${target.name}: building publish bundle (build:dist)`);
    const build = Bun.spawnSync(['bun', 'run', 'build:dist'], {
      cwd: target.dir,
      stdout: 'inherit',
      stderr: 'inherit',
    });
    if (build.exitCode !== 0) {
      return { status: 'failed', reason: 'build:dist failed' };
    }
    publishText = bundleExports(publishText ?? original) ?? publishText;
  }

  // Drop dev-only tooling keys (e.g. `knip`) so the published manifest carries
  // only what a consumer needs.
  publishText = stripDevManifestFields(publishText ?? original) ?? publishText;

  // --ignore-scripts: artifacts (sdk bin, create-brika dist) are pre-built; a
  // lifecycle script failing mid-publish would leave a partial publish of
  // immutable versions.
  const args = ['npm', 'publish', '--access', 'public', '--tag', tag, '--ignore-scripts'];
  // Provenance needs the OIDC id-token that only exists in GitHub Actions.
  if (process.env.GITHUB_ACTIONS === 'true') {
    args.push('--provenance');
  }
  if (dryRun) {
    args.push('--dry-run');
  }

  // Packages list LICENSE in files[] but keep only the root LICENSE on disk; copy
  // it in for the publish so npm shows the license, then remove the copy.
  const licensePath = join(target.dir, 'LICENSE');
  const rootLicense = join(repoRoot, 'LICENSE');
  const addLicense = !existsSync(licensePath) && existsSync(rootLicense);

  try {
    if (publishText !== null) {
      await Bun.write(manifestPath, publishText);
    }
    if (addLicense) {
      await Bun.write(licensePath, Bun.file(rootLicense));
    }
    const proc = Bun.spawn(args, {
      cwd: target.dir,
      stdout: 'inherit',
      stderr: 'inherit',
      // Keep stdin attached for the interactive publisher so npm can prompt for
      // an OTP; the CI release has no TTY and authenticates via a token.
      stdin: interactive ? 'inherit' : 'ignore',
    });
    const exitCode = await proc.exited;
    return exitCode === 0
      ? { status: 'published', tag }
      : { status: 'failed', reason: `npm publish exited ${exitCode}` };
  } finally {
    if (publishText !== null) {
      await Bun.write(manifestPath, original);
    }
    if (addLicense) {
      await rm(licensePath, { force: true });
    }
  }
}
