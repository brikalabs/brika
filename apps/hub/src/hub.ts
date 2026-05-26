/**
 * Hub Metadata
 *
 * Centralized module for hub identity and metadata.
 * Loads package.json once at module initialization.
 */

import { BRIKA_VERSION } from '@brika/version';
import pkg from '../package.json';

/**
 * Hub metadata loaded from package.json, with the version field
 * overridden by the canonical `@brika/version` constant so a single
 * `package.json` bump at the monorepo root propagates everywhere.
 */
export const hub = { ...pkg, version: BRIKA_VERSION };

/**
 * Hub version string (shorthand for hub.version).
 */
export { BRIKA_VERSION as HUB_VERSION } from '@brika/version';

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
