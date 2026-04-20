/**
 * Lightweight bootstrap for CLI commands.
 * Runs the same BootstrapPlugin lifecycle as the hub, without HTTP/loggers/config.
 */

import 'reflect-metadata';
import { join } from 'node:path';
import { configureDatabases } from '@brika/db';
import pc from 'picocolors';
import type { BootstrapPlugin } from '@/runtime/bootstrap/plugin';
import { dataDir } from './utils/runtime';

export async function bootstrapCLI(...plugins: BootstrapPlugin[]) {
  configureDatabases(dataDir);
  for (const p of plugins) {
    p.setup?.({} as never);
  }
  for (const p of plugins) {
    await p.onInit?.();
  }
  for (const p of plugins) {
    await p.onStart?.();
  }

  return {
    stop() {
      for (const p of plugins.toReversed()) {
        p.onStop?.();
      }
    },
  };
}

export function printDatabaseInfo(): void {
  console.log(`\n${pc.dim('Database:')} ${join(dataDir, 'auth.db')}`);
}
