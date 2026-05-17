/**
 * Build script logging utilities
 */
import { stat } from 'node:fs/promises';
import pc from 'picocolors';

const t0 = performance.now();

export const log = (msg: string) => console.log(`  ${msg}`);
export const step = (msg: string) => log(`${pc.cyan('▸')} ${msg}`);
export const done = (msg: string) => log(`${pc.green('✓')} ${msg}`);
export const fail = (msg: string) => log(pc.red(msg));

export function elapsed(): string {
  const ms = performance.now() - t0;
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

export async function fileSize(path: string): Promise<string> {
  const bytes = (
    await stat(path).catch(() => ({
      size: 0,
    }))
  ).size;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
