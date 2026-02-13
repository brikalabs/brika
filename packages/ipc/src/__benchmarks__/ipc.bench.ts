/**
 * IPC Benchmark Tests
 *
 * Measure Bun native IPC performance for various message types.
 *
 * Run with: bun run bench
 */

// External imports
import { dirname, join } from 'node:path';
import { bench, group, run } from 'mitata';
import { z } from 'zod';

// Internal imports
import { message, rpc } from '../define';
import { spawnPlugin } from '../host';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const STARTUP_TIMEOUT_MS = 5000;
const BINARY_SIZE = 10_000;
const MEDIUM_ITEMS = 100;
const LARGE_NODES = 50;

// ─────────────────────────────────────────────────────────────────────────────
// Message Definitions
// ─────────────────────────────────────────────────────────────────────────────

const ping = rpc('ping', z.object({ ts: z.number() }), z.object({ ts: z.number() }));
const echo = rpc('echo', z.object({ data: z.unknown() }), z.object({ data: z.unknown() }));
const hello = message(
  'hello',
  z.object({ plugin: z.object({ id: z.string(), version: z.string() }) })
);

// ─────────────────────────────────────────────────────────────────────────────
// Test Data
// ─────────────────────────────────────────────────────────────────────────────

const SMALL_DATA = { id: 1, name: 'test' };

const MEDIUM_DATA = {
  items: Array.from({ length: MEDIUM_ITEMS }, (_, i) => ({
    id: i,
    name: `item-${i}`,
    value: Math.random() * 1000,
    active: i % 2 === 0,
    tags: ['tag1', 'tag2', 'tag3'],
  })),
};

const BINARY_DATA = new Uint8Array(BINARY_SIZE).fill(42);

const LARGE_DATA = {
  nodes: Array.from({ length: LARGE_NODES }, (_, i) => ({
    id: `node-${i}`,
    type: 'block',
    position: { x: i * 100, y: i * 50 },
    data: {
      inputs: { trigger: null, data: null },
      outputs: { result: null, error: null },
      config: {
        name: `Node ${i}`,
        description: `This is node number ${i} with a longer description`,
        timeout: 5000,
        retries: 3,
      },
    },
  })),
};

// ─────────────────────────────────────────────────────────────────────────────
// Benchmark Runner
// ─────────────────────────────────────────────────────────────────────────────

try {
  console.info('Starting IPC Benchmarks...\n');
  console.info('Using Bun native IPC with advanced serialization\n');

  const pluginPath = join(dirname(import.meta.path), 'fixtures/echo-plugin.ts');

  const plugin = spawnPlugin('bun', ['run', pluginPath], {
    onStderr: (line) => console.error('[plugin]', line),
  });

  // Wait for plugin to be ready
  const ready = await Promise.race([
    new Promise<boolean>((resolve) => {
      plugin.on(hello, () => resolve(true));
    }),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), STARTUP_TIMEOUT_MS)),
  ]);

  if (!ready) {
    console.error('Plugin failed to start within timeout');
    plugin.kill();
    process.exit(1);
  }

  console.info('Plugin ready\n');

  // Benchmarks
  group('Ping/Pong Round-trip', () => {
    bench('ping latency', async () => {
      await plugin.call(ping, { ts: Date.now() });
    });
  });

  group('Echo: Small data (~50 bytes)', () => {
    bench('small JSON object', async () => {
      await plugin.call(echo, { data: SMALL_DATA });
    });
  });

  group('Echo: Medium data (~5KB)', () => {
    bench('100 items array', async () => {
      await plugin.call(echo, { data: MEDIUM_DATA });
    });
  });

  group('Echo: Large data (~20KB)', () => {
    bench('50 node graph', async () => {
      await plugin.call(echo, { data: LARGE_DATA });
    });
  });

  group('Echo: Binary data (10KB)', () => {
    bench('Uint8Array (native)', async () => {
      await plugin.call(echo, { data: BINARY_DATA });
    });
  });

  group('Echo: Complex types', () => {
    bench('Date object', async () => {
      await plugin.call(echo, { data: new Date() });
    });

    bench('Map', async () => {
      await plugin.call(echo, {
        data: new Map([
          ['key1', 'value1'],
          ['key2', 'value2'],
        ]),
      });
    });

    bench('Set', async () => {
      await plugin.call(echo, { data: new Set([1, 2, 3, 4, 5]) });
    });

    bench('Mixed (Date + Uint8Array + Map)', async () => {
      await plugin.call(echo, {
        data: {
          timestamp: new Date(),
          buffer: new Uint8Array(100).fill(1),
          metadata: new Map([['version', '1.0.0']]),
        },
      });
    });
  });

  await run();

  plugin.kill();
  console.info('\nBenchmarks complete');
} catch (err: unknown) {
  console.error('Benchmark error:', err);
  process.exit(1);
}
