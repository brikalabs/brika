import { join } from 'node:path';
import type { BunRunner } from '@/runtime/config';
import type { OperationProgress } from './types';

/**
 * High-level package manager backed by BunRunner.
 *
 * Instantiate with the working directory (e.g. pluginsDir). BunRunner handles
 * binary path resolution and BUN_BE_BUN=1; callers never touch Bun.spawn or
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
    // `--ignore-scripts`: never run a dependency's install lifecycle scripts (postinstall, …) in the
    // hub process. A plugin's runtime code only executes once the operator consents (consent-before-
    // code); an unconsented dep's postinstall would be an earlier execute-on-install vector. Plugins
    // ship pre-built, so they need no build step here.
    yield* this.#stream('install', name, ['install', spec, '--ignore-scripts']);
  }

  async remove(name: string): Promise<void> {
    await this.#run(['remove', name]);
  }

  async *update(name?: string): AsyncGenerator<OperationProgress> {
    const args = name ? ['update', name] : ['update'];
    yield* this.#stream('update', name ?? 'all', [...args, '--ignore-scripts']);
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

    // Relay BOTH stdout and stderr. bun prints progress ("Resolving…", "Saved lockfile") to stderr
    // but the resolved packages ("+ name@version", "N packages installed") to stdout, so reading only
    // stderr hid which dependencies were installed. The authoritative phases (resolving -> linking ->
    // complete) still come from PluginRegistry; here we relay bun's raw lines under one coarse phase.
    const streams = [proc.stdout, proc.stderr].filter(
      (s): s is ReadableStream => s instanceof ReadableStream
    );
    for await (const line of mergeStreamLines(streams)) {
      const trimmed = line.trim();
      if (trimmed) {
        yield {
          phase: 'downloading',
          operation,
          package: packageName,
          message: trimmed,
        };
      }
    }

    const code = await proc.exited;
    if (code !== 0) {
      throw new Error(`bun ${args.join(' ')} failed with exit code ${code}`);
    }
  }
}

/**
 * Merge several byte streams into a single line-by-line async iterator, yielding each line from
 * whichever stream produced it first. Used to relay a child process's stdout AND stderr together.
 */
async function* mergeStreamLines(streams: ReadableStream[]): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  const queue: string[] = [];
  let pending = streams.length;
  let notify: (() => void) | null = null;
  const wake = () => {
    notify?.();
    notify = null;
  };

  for (const stream of streams) {
    void (async () => {
      const reader = stream.getReader();
      let buffer = '';
      try {
        for (let r = await reader.read(); !r.done; r = await reader.read()) {
          buffer += decoder.decode(r.value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          queue.push(...lines);
          wake();
        }
        if (buffer) {
          queue.push(buffer);
        }
      } catch {
        // A read error ends this stream's relay (best-effort log mirroring); the `finally` still marks
        // it done so the consumer loop terminates. Swallowing avoids an unhandled promise rejection.
      } finally {
        reader.releaseLock();
        pending -= 1;
        wake();
      }
    })();
  }

  while (pending > 0 || queue.length > 0) {
    if (queue.length === 0) {
      await new Promise<void>((resolve) => {
        notify = resolve;
      });
      continue;
    }
    const line = queue.shift();
    if (line !== undefined) {
      yield line;
    }
  }
}
