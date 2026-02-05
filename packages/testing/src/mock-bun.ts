/**
 * Clean API for mocking Bun APIs in tests
 *
 * @example
 * ```ts
 * import { BunMock } from '@brika/testing';
 *
 * const bun = new BunMock();
 *
 * beforeEach(() => {
 *   // Directory structure is inferred automatically from file paths
 *   bun.fs({
 *     '/config.json': { port: 3000 },
 *     '/locales/en/common.json': { hello: 'Hello' },
 *     '/locales/fr/common.json': { bonjour: 'Bonjour' },
 *   });
 *
 *   bun.spawn({ exitCode: 0 });
 *   bun.apply();
 * });
 *
 * afterEach(() => bun.restore());
 * ```
 */

import { spyOn } from 'bun:test';
import { proxify } from './proxify';

type SpyInstance = ReturnType<typeof spyOn>;

interface SpawnConfig {
  exitCode?: number;
  stdout?: string;
  stderr?: string;
}

type FileSystemTree = Record<string, unknown | string[]>;

export class BunMock {
  readonly #files = new Map<string, unknown>();
  readonly #directories = new Map<string, string[]>();
  readonly #resolves = new Map<string, string>();
  #spawnConfig: SpawnConfig = { exitCode: 0 };
  #spawnCalls: Array<{ cmd: string[]; options?: unknown }> = [];

  #fileSpy: SpyInstance | null = null;
  #writeSpy: SpyInstance | null = null;
  #spawnSpy: SpyInstance | null = null;
  #resolveSyncSpy: SpyInstance | null = null;

  readonly #originalGlob = Bun.Glob;

  /**
   * Define a virtual filesystem
   *
   * Directory structure is automatically inferred from file paths.
   * You can also explicitly define directories with keys ending in `/`.
   *
   * @example
   * ```ts
   * // Simple - directories inferred automatically
   * bun.fs({
   *   '/config.json': { port: 3000 },
   *   '/locales/en/common.json': { greeting: 'Hello' },
   *   '/locales/fr/common.json': { bonjour: 'Bonjour' },
   * });
   *
   * // Explicit directories (for empty dirs or specific ordering)
   * bun.fs({
   *   '/locales/': ['en/', 'fr/', 'de/'],  // explicit order
   *   '/locales/de/': [],                   // empty directory
   * });
   * ```
   */
  fs(tree: FileSystemTree): this {
    // First pass: collect explicit directories and files
    const explicitDirs = new Map<string, string[]>();

    for (const [path, value] of Object.entries(tree)) {
      if (path.endsWith('/')) {
        explicitDirs.set(path.slice(0, -1), value as string[]);
      } else {
        this.#files.set(path, value);
      }
    }

    // Second pass: infer directory structure from file paths
    for (const filePath of this.#files.keys()) {
      this.#inferDirectoriesFromPath(filePath, explicitDirs);
    }

    // Third pass: infer parent directories from explicit directories
    for (const dirPath of explicitDirs.keys()) {
      this.#inferDirectoriesFromPath(dirPath + '/_', explicitDirs);
    }

    // Apply explicit directories (override inferred ones)
    for (const [dir, entries] of explicitDirs) {
      this.#directories.set(dir, entries);
    }

    return this;
  }

  #inferDirectoriesFromPath(path: string, explicitDirs: Map<string, string[]>): void {
    const parts = path.split('/').filter(Boolean);
    const lastPart = parts.pop()!;

    // Build parent directories
    let currentPath = '';
    for (let i = 0; i < parts.length; i++) {
      const parentPath = currentPath;
      currentPath = currentPath + '/' + parts[i];

      // Add this directory to its parent (if parent exists and not explicit)
      if (parentPath && !explicitDirs.has(parentPath)) {
        const dirEntry = parts[i] + '/';
        const existing = this.#directories.get(parentPath) ?? [];
        if (!existing.includes(dirEntry)) {
          this.#directories.set(parentPath, [...existing, dirEntry]);
        }
      }
    }

    // Add last part to its parent directory (if it's a file, not a placeholder)
    if (currentPath && !explicitDirs.has(currentPath) && !lastPart.startsWith('_')) {
      const existing = this.#directories.get(currentPath) ?? [];
      if (!existing.includes(lastPart)) {
        this.#directories.set(currentPath, [...existing, lastPart]);
      }
    }
  }

  /**
   * Add a single file
   */
  file(path: string, content: unknown): this {
    this.#files.set(path, content);
    return this;
  }

  /**
   * Add a directory with entries
   */
  directory(path: string, entries: string[]): this {
    this.#directories.set(path, entries);
    return this;
  }

  /**
   * Configure spawn mock
   */
  spawn(config: SpawnConfig): this {
    this.#spawnConfig = { ...this.#spawnConfig, ...config };
    return this;
  }

  /**
   * Mock package resolution
   */
  resolve(packageName: string, resolvedPath: string): this {
    this.#resolves.set(packageName, resolvedPath);
    return this;
  }

  /**
   * Get recorded spawn calls
   */
  get spawnCalls(): ReadonlyArray<{ cmd: string[]; options?: unknown }> {
    return this.#spawnCalls;
  }

  /**
   * Clear spawn call history
   */
  clearSpawnCalls(): this {
    this.#spawnCalls.length = 0;
    return this;
  }

  /**
   * Check if a file exists in the virtual fs
   */
  hasFile(path: string): boolean {
    return this.#files.has(path);
  }

  /**
   * Get file content from virtual fs
   */
  getFile<T = unknown>(path: string): T | undefined {
    return this.#files.get(path) as T | undefined;
  }

  /**
   * Apply all mocks
   */
  apply(): this {
    this.#applyFileMock();
    this.#applyWriteMock();
    this.#applySpawnMock();
    this.#applyResolveSyncMock();
    this.#applyGlobMock();
    return this;
  }

  /**
   * Restore all mocks to original
   */
  restore(): this {
    this.#fileSpy?.mockRestore();
    this.#writeSpy?.mockRestore();
    this.#spawnSpy?.mockRestore();
    this.#resolveSyncSpy?.mockRestore();
    Bun.Glob = this.#originalGlob;

    this.#fileSpy = null;
    this.#writeSpy = null;
    this.#spawnSpy = null;
    this.#resolveSyncSpy = null;

    this.#files.clear();
    this.#directories.clear();
    this.#resolves.clear();
    this.#spawnCalls.length = 0;
    this.#spawnConfig = { exitCode: 0 };

    return this;
  }

  #applyFileMock(): void {
    const files = this.#files;

    this.#fileSpy = spyOn(Bun, 'file').mockImplementation(((path: unknown) => {
      const p = String(path);
      return {
        exists: () => Promise.resolve(files.has(p)),
        json: () => {
          if (!files.has(p)) return Promise.reject(new Error(`ENOENT: ${p}`));
          return Promise.resolve(files.get(p));
        },
        text: () => {
          if (!files.has(p)) return Promise.reject(new Error(`ENOENT: ${p}`));
          const content = files.get(p);
          return Promise.resolve(typeof content === 'string' ? content : JSON.stringify(content));
        },
      } as ReturnType<typeof Bun.file>;
    }) as typeof Bun.file);
  }

  #applyWriteMock(): void {
    const files = this.#files;

    this.#writeSpy = spyOn(Bun, 'write').mockImplementation((path, content) => {
      const p = String(path);
      const str = String(content);
      try {
        files.set(p, JSON.parse(str));
      } catch {
        files.set(p, str);
      }
      return Promise.resolve(str.length);
    });
  }

  #applySpawnMock(): void {
    const self = this;

    this.#spawnSpy = spyOn(Bun, 'spawn').mockImplementation(((cmd: unknown, options?: unknown) => {
      const cmdArray = Array.isArray(cmd) ? cmd : [cmd];
      self.#spawnCalls.push({ cmd: cmdArray as string[], options });

      return {
        pid: 12345,
        stdin: null,
        stdout: createStream(self.#spawnConfig.stdout),
        stderr: createStream(self.#spawnConfig.stderr),
        exited: Promise.resolve(self.#spawnConfig.exitCode ?? 0),
        exitCode: null,
        signalCode: null,
        killed: false,
        kill: () => {
          /* noop - mock stub */
        },
        ref: () => {
          /* noop - mock stub */
        },
        unref: () => {
          /* noop - mock stub */
        },
        resourceUsage: () => null,
      } as unknown as ReturnType<typeof Bun.spawn>;
    }) as typeof Bun.spawn);
  }

  #applyResolveSyncMock(): void {
    const resolves = this.#resolves;

    this.#resolveSyncSpy = spyOn(Bun, 'resolveSync').mockImplementation((pkg: string) => {
      const resolved = resolves.get(pkg);
      if (resolved) return resolved;
      throw new Error(`Cannot resolve: ${pkg}`);
    });
  }

  #applyGlobMock(): void {
    const directories = this.#directories;

    Bun.Glob = class MockGlob {
      constructor(private pattern: string) {}

      *scan(options: { cwd: string }) {
        yield* this.#iter(options.cwd);
      }

      *scanSync(options: { cwd: string }) {
        yield* this.#iter(options.cwd);
      }

      match(path: string): boolean {
        return this.#matches(path);
      }

      *#iter(cwd: string) {
        for (const entry of directories.get(cwd) ?? []) {
          if (this.#matches(entry)) yield entry;
        }
      }

      #matches(entry: string): boolean {
        const p = this.pattern;
        if (p === '*/') return entry.endsWith('/');
        if (p.startsWith('*.')) return entry.endsWith(p.slice(1));
        if (p.includes('*')) return entry.includes(p.replace(/\*/g, ''));
        return entry === p;
      }
    } as unknown as typeof Bun.Glob;
  }
}

function createStream(content?: string): ReadableStream {
  return new ReadableStream({
    start(controller) {
      if (content) controller.enqueue(new TextEncoder().encode(content));
      controller.close();
    },
  });
}

/**
 * Create a BunMock instance
 */
export function mockBun(): BunMock {
  return new BunMock();
}

/**
 * Hook-style helper that auto-manages lifecycle
 *
 * Call at describe level - automatically handles beforeEach/afterEach
 *
 * @example
 * ```ts
 * import { useBunMock } from '@brika/testing';
 *
 * describe('MyService', () => {
 *   const bun = useBunMock();
 *
 *   test('reads config', async () => {
 *     bun.fs({ '/config.json': { port: 3000 } }).apply();
 *     // ...
 *   });
 * });
 * ```
 */
export function useBunMock(): BunMock {
  const { beforeEach, afterEach } = require('bun:test');

  let current: BunMock;

  beforeEach(() => {
    current = new BunMock();
  });

  afterEach(() => {
    current?.restore();
  });

  return proxify(() => current);
}
