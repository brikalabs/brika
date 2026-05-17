import type { BunPlugin } from 'bun';

/**
 * Strip every `*.mock.ts` file from the compiled production binary.
 *
 * Convention across the monorepo: any file named `*.mock.ts` is a
 * dev-only mock layer (fake data, scripted streams, test seams) that
 * should never reach end-user binaries. The dev runtime resolves these
 * normally — only the compiled binary sees the stub below.
 *
 * The stub throws at module-evaluation time. If any (mis)configured
 * runtime tries to `import()` a `.mock` module from the binary, the
 * import promise rejects cleanly; the caller's try/catch falls back to
 * the real implementation with a logged warning. See
 * `runtime/bootstrap/plugins/updates.ts` for the canonical pattern.
 */
export function stubMockFiles(): BunPlugin {
  return {
    name: 'stub-mock-files',
    setup(build) {
      build.onResolve({ filter: /\.mock(\.ts)?$/ }, (args) => ({
        path: args.path,
        namespace: 'mock-stub',
      }));
      build.onLoad({ filter: /.*/, namespace: 'mock-stub' }, () => ({
        contents:
          'throw new Error("Mock module (*.mock.ts) is stripped from production builds. ' +
          'If you see this in a prod hub, unset BRIKA_DEV_FAKE_UPDATE.");',
        loader: 'ts',
      }));
    },
  };
}
