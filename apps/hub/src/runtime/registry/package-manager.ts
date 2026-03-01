import { join } from 'node:path';
import type { BunRunner } from '@/runtime/config';
import type { OperationProgress } from './types';

/**
 * High-level package manager backed by BunRunner.
 *
 * Instantiate with the working directory (e.g. pluginsDir). BunRunner handles
 * binary path resolution and BUN_BE_BUN=1 — callers never touch Bun.spawn or
 * env vars directly.
 *
 * @example
 * const pm = new PackageManager(inject(BunRunner), pluginsDir);
 * for await (const p of pm.install('@brika/my-plugin', '1.2.0')) { ... }
 * await pm.remove('@brika/my-plugin');
 */
export class PackageManager {
  readonly #runner: BunRunner;
  readonly #cwd: string;
  readonly #cacheDir: string;

  constructor(runner: BunRunner, cwd: string) {
    this.#runner = runner;
    this.#cwd = cwd;
    this.#cacheDir = join(cwd, '.cache');
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  async *install(name: string, version?: string): AsyncGenerator<OperationProgress> {
    const spec = version ? `${name}@${version}` : name;
    yield* this.#stream('install', name, [
      'install',
      spec,
    ]);
  }

  async remove(name: string): Promise<void> {
    await this.#run([
      'remove',
      name,
    ]);
  }

  async *update(name?: string): AsyncGenerator<OperationProgress> {
    const args = name
      ? [
          'update',
          name,
        ]
      : [
          'update',
        ];
    yield* this.#stream('update', name ?? 'all', args);
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  #spawn(args: string[], stdio: 'ignore' | 'pipe') {
    return this.#runner.spawn(args, {
      cwd: this.#cwd,
      stdout: stdio,
      stderr: stdio,
      env: {
        BUN_INSTALL_CACHE_DIR: this.#cacheDir,
      },
    });
  }

  async #run(args: string[]): Promise<void> {
    const code = await this.#spawn(args, 'ignore').exited;
    if (code !== 0) {
      throw new Error(`bun ${args.join(' ')} failed with exit code ${code}`);
    }
  }

  async *#stream(
    operation: OperationProgress['operation'],
    packageName: string,
    args: string[]
  ): AsyncGenerator<OperationProgress> {
    const proc = this.#spawn(args, 'pipe');

    if (proc.stderr instanceof ReadableStream) {
      const decoder = new TextDecoder();
      let buffer = '';

      for await (const chunk of proc.stderr) {
        buffer += decoder.decode(chunk, {
          stream: true,
        });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            continue;
          }
          yield {
            phase: detectPhase(trimmed),
            operation,
            package: packageName,
            message: trimmed,
          };
        }
      }

      const remaining = buffer.trim();
      if (remaining) {
        yield {
          phase: detectPhase(remaining),
          operation,
          package: packageName,
          message: remaining,
        };
      }
    }

    const code = await proc.exited;
    if (code !== 0) {
      throw new Error(`bun ${args.join(' ')} failed with exit code ${code}`);
    }
  }
}

function detectPhase(line: string): OperationProgress['phase'] {
  const l = line.toLowerCase();
  if (l.includes('resolving')) {
    return 'resolving';
  }
  if (l.includes('downloading') || l.includes('get ') || l.includes('fetch')) {
    return 'downloading';
  }
  if (l.includes('linking') || l.includes('installed') || l.includes('saved')) {
    return 'linking';
  }
  return 'downloading';
}
