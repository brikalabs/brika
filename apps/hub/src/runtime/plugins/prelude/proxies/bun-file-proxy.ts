/**
 * `Bun.file(path)` proxy on top of `ctx.fs` grants.
 *
 * Bun's real `Bun.file` returns a `BunFile` object with async `.text()`
 * / `.bytes()` / `.arrayBuffer()` / `.json()` / `.exists()` methods.
 * Our proxy returns a structurally-compatible object whose methods
 * route through `globalThis.__brika_fs` (installed by `fs-runtime.ts`).
 *
 * Not implemented in v1:
 *   - `.size` (sync getter — would need an eager stat at `Bun.file()`
 *     call time; deferred)
 *   - `.writer()` (streaming writer)
 *   - `.stream()` (streaming reader)
 * These throw when called with a clear message pointing at the
 * underlying limitation.
 */

import type { BrikaFsRuntime } from './fs-runtime';

export interface BunFileProxy {
  readonly name: string;
  text(): Promise<string>;
  bytes(): Promise<Uint8Array>;
  arrayBuffer(): Promise<ArrayBuffer>;
  json(): Promise<unknown>;
  exists(): Promise<boolean>;
}

export type BunFileFactory = (path: string) => BunFileProxy;

/**
 * Build a `Bun.file`-shaped factory backed by the runtime the prelude
 * installed on `globalThis.__brika_fs`. The factory keeps no state
 * itself; each returned BunFile-like dispatches lazily.
 */
export function buildBunFileProxy(): BunFileFactory {
  return (path: string): BunFileProxy => {
    return {
      name: path,
      text: () => readAsText(path),
      bytes: () => readAsBytes(path),
      arrayBuffer: () => readAsBytes(path).then((u) => copyToArrayBuffer(u)),
      json: () => readAsText(path).then((s) => JSON.parse(s) as unknown),
      exists: () => probeExists(path),
    };
  };
}

function getRuntime(): BrikaFsRuntime {
  const r = globalThis.__brika_fs;
  if (!r) {
    throw new Error(
      'Bun.file: the Brika prelude has not installed the fs runtime. This usually means the plugin ran fs code before the prelude finished setup.'
    );
  }
  return r;
}

async function readAsText(path: string): Promise<string> {
  const out = await getRuntime().readFile({ path, encoding: 'utf-8' });
  if (out.encoding !== 'utf-8') {
    // Defensive — the runtime is supposed to honour the encoding flag.
    return new TextDecoder().decode(out.content);
  }
  return out.content;
}

async function readAsBytes(path: string): Promise<Uint8Array> {
  const out = await getRuntime().readFile({ path, encoding: 'binary' });
  if (out.encoding === 'utf-8') {
    return new TextEncoder().encode(out.content);
  }
  return out.content;
}

async function probeExists(path: string): Promise<boolean> {
  const out = await getRuntime().exists({ path });
  return out.exists;
}

/**
 * Copy a `Uint8Array` into a freshly-allocated `ArrayBuffer`. We do
 * NOT return `view.buffer` directly: the underlying buffer may be
 * shared (it's just an ArrayBufferLike), and exposing it to the
 * plugin would leak whatever else lives in the same allocation.
 */
function copyToArrayBuffer(view: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(view.byteLength);
  new Uint8Array(out).set(view);
  return out;
}
