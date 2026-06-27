import { inject } from '@brika/di';
import { BrikaInitializer } from '@/runtime/config';
import { Logger } from '@/runtime/logs/log-router';
import { gcPluginStorage } from '@/runtime/plugins/storage-gc';
import type { BootstrapPlugin } from '../plugin';

/** How often the GC sweep runs. The age thresholds live in `storage-gc.ts`. */
const GC_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Bootstrap plugin that periodically ages out each plugin's evictable `/cache`
 * and `/tmp` storage so a long-running hub reclaims the space without an
 * uninstall. The first sweep is fire-and-forget so boot isn't blocked on a disk
 * walk; subsequent sweeps run on an interval.
 */
export function pluginStorageGc(): BootstrapPlugin {
  const init = inject(BrikaInitializer);
  const logs = inject(Logger).withSource('plugin');
  let timer: ReturnType<typeof setInterval> | null = null;

  const sweep = async (): Promise<void> => {
    try {
      const result = await gcPluginStorage(init.systemDir, Date.now());
      if (result.removedFiles > 0) {
        logs.info('Reclaimed plugin cache/tmp storage', {
          freedBytes: result.freedBytes,
          removedFiles: result.removedFiles,
          sweptPlugins: result.sweptPlugins,
        });
      }
    } catch (error) {
      logs.warn('Plugin storage GC failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return {
    name: 'plugin-storage-gc',
    onInit() {
      void sweep();
      timer = setInterval(() => void sweep(), GC_INTERVAL_MS);
    },
    onStop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
