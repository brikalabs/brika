/**
 * Migration scope registry — single source of truth for the ordered
 * list of scopes the bootstrap chain hands to {@link MigrationRunner}.
 *
 * Order matters: a later scope can rely on earlier scopes having
 * already migrated. Today the ordering is conservative — plugin-data
 * (filesystem) before secrets (filesystem-adjacent, may eventually
 * write to plugins-data).
 */

import type { MigrationScope } from '../types';
import { pluginDataScope } from './plugin-data';
import { secretsScope } from './secrets';

export const allScopes: readonly MigrationScope[] = [pluginDataScope, secretsScope];
