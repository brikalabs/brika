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
