/**
 * Registry types — re-exported from the Zod schema module for backwards compat.
 */
export type { VerifiedPlugin, VerifiedPluginsList } from './schema';

export interface Env {
	CACHE_MAX_AGE: number;
	REGISTRY_FILE: string;
}
