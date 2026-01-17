import type { VerifiedPluginsList } from './types';
import registryData from '../verified-plugins.json';

/**
 * Get the verified plugins registry data.
 * In development, this reads from the local file.
 * In production, the file is bundled with the worker.
 */
export async function getRegistryData(): Promise<VerifiedPluginsList> {
  return registryData as VerifiedPluginsList;
}
