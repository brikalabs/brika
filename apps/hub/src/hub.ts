/**
 * Hub Metadata
 *
 * Centralized module for hub identity and metadata. The version field
 * is overridden with the build-time `BRIKA_VERSION` (via `buildInfo`)
 * so the updater's comparator, the startup log, and the plugin
 * compatibility check all see the same value the binary actually
 * reports through `--self-check` — not the stale `apps/hub/package.json`
 * version that may have drifted from the tag the binary was built for.
 */

import pkg from '../package.json';
import { buildInfo } from './build-info';

/**
 * Hub metadata. Repository + name come from package.json; version comes
 * from `buildInfo.version` (injected at compile time, falls back to
 * `pkg.version` in dev). `bun run bump` keeps pkg.version in sync
 * across the workspace for local convenience, but it is no longer
 * authoritative for the running binary.
 */
export const hub = { ...pkg, version: buildInfo.version };

/**
 * Hub version string (shorthand for hub.version).
 */
export const HUB_VERSION = hub.version;

/**
 * GitHub repository slug (e.g. "brikalabs/brika"), derived from package.json.
 */
export const HUB_REPO = hub.repository.url
  .replace(/^https?:\/\/github\.com\//, '')
  .replace(/\.git$/, '');

/**
 * GitHub repository URL (e.g. "https://github.com/brikalabs/brika").
 */
export const HUB_REPO_URL = `https://github.com/${HUB_REPO}`;

/**
 * GitHub API URL for the latest stable release.
 */
export const HUB_GITHUB_RELEASES_API = `https://api.github.com/repos/${HUB_REPO}/releases/latest`;

/**
 * GitHub API URL for listing all releases (used for canary/pre-release channels).
 */
export const HUB_GITHUB_RELEASES_LIST_API = `https://api.github.com/repos/${HUB_REPO}/releases`;
