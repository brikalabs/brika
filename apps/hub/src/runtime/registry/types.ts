/**
 * Plugin Registry Types
 */

import type { BrikaErrorWire } from '@brika/errors';

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
  /**
   * Human-readable failure message. Kept a plain string for backwards
   * compatibility: every CLI client reads `progress.error ?? progress.message`
   * as a string, so a version-skewed lean bin must never see an object here.
   */
  error?: string;
  /** Machine-readable code, present only when the failure was a typed BrikaError. */
  errorCode?: string;
  /** Full structured error envelope, for rich client rendering (hint, cause, data). */
  errorDetail?: BrikaErrorWire;
}

export interface UpdateInfo {
  name: string;
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
}
