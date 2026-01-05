/**
 * Plugin Registry Types
 */

export interface InstalledPackage {
  name: string;
  version: string;
  path: string;
}

export interface OperationProgress {
  phase: 'resolving' | 'downloading' | 'linking' | 'complete' | 'error';
  operation: 'install' | 'update' | 'uninstall';
  package: string;
  targetVersion?: string;
  message?: string;
  error?: string;
}

export interface UpdateInfo {
  name: string;
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
}
