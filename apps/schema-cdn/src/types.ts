export interface Env {
  NPM_PACKAGE: string;
  SCHEMAS_PATH: string;
  CDN_PROVIDER: 'unpkg' | 'jsdelivr';
  CACHE_MAX_AGE: number;
}

export interface PackageMetadata {
  name: string;
  versions: Record<string, { dist?: unknown }>;
  'dist-tags': { latest: string };
}
