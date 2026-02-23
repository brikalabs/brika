/** Installation progress phases */
export type InstallPhase = 'resolving' | 'downloading' | 'linking' | 'complete' | 'error';

/** Installation progress event */
export interface InstallProgress {
  phase: InstallPhase;
  message?: string;
}
