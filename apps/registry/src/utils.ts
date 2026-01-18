import registryData from '../verified-plugins.json';
import type { VerifiedPluginsList } from './types';

/**
 * Get the verified plugins registry data.
 * In development, this reads from the local file.
 * In production, the file is bundled with the worker.
 */
export function getRegistryData(): VerifiedPluginsList {
  return registryData as VerifiedPluginsList;
}
