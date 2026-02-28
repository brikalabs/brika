import type { Plugin } from 'vite';

/**
 * Vite plugin that automatically splits vendor chunks by package name.
 * Each node_modules dependency gets its own chunk under `vendor/`,
 * improving caching (only changed packages are re-downloaded) and
 * reducing monolithic bundle sizes.
 */
export function chunkSplitPlugin(): Plugin {
  return {
    name: 'brika-chunk-split',
    config() {
      return {
        build: {
          rollupOptions: {
            output: {
              manualChunks(id) {
                if (!id.includes('node_modules')) return;
                const segments = id.split('node_modules/').pop()!.split('/');
                const pkg = segments[0].startsWith('@')
                  ? `${segments[0]}/${segments[1]}`
                  : segments[0];
                return `vendor/${pkg}`;
              },
            },
          },
        },
      };
    },
  };
}
