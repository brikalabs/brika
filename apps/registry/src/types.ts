export interface Env {
  CACHE_MAX_AGE: number;
  REGISTRY_FILE: string;
}

export interface VerifiedPlugin {
  name: string;
  verifiedAt: string;
  verifiedBy: string;
  minVersion?: string;
  featured?: boolean;
  category?: string;
}

export interface VerifiedPluginsList {
  $schema?: string;
  version: string;
  lastUpdated: string;
  plugins: VerifiedPlugin[];
}
