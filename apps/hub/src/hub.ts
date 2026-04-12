/**
 * Hub Metadata
 *
 * Centralized module for hub identity and metadata.
 * Loads package.json once at module initialization.
 */

import pkg from '../package.json';

/**
 * Hub metadata loaded from package.json.
 */
export const hub = pkg;

/**
 * Hub version string (shorthand for hub.version).
 */
export const HUB_VERSION = hub.version;

/**
 * Hub name string (shorthand for hub.name).
 */
export const HUB_NAME = hub.name;

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
 * GitHub API URL for the latest release.
 */
export const HUB_GITHUB_RELEASES_API = `https://api.github.com/repos/${HUB_REPO}/releases/latest`;
