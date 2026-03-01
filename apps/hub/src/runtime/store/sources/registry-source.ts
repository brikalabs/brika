import type { PluginPackageData } from '../types';

/** Raw plugin from any registry source — no enrichment (installed, compatible) */
export interface RawRegistryPlugin {
  package: PluginPackageData;
  downloadCount: number;
  source: string;
  installVersion: string;
}

/** Common contract all registry sources must implement */
export interface RegistrySource {
  search(
    query?: string,
    limit?: number,
    offset?: number
  ): Promise<{
    plugins: RawRegistryPlugin[];
    total: number;
  }>;
}
