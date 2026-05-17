import type { BunPlugin } from 'bun';

/**
 * Stub `react-devtools-core` from the compiled binary.
 *
 * `ink` (the React-for-terminal renderer) imports `react-devtools-core`
 * unconditionally at the top of `devtools.js`, but the real package is
 * an optional peer that only matters when the TUI is launched with
 * React DevTools enabled. The compiled binary never opts in.
 *
 * Without this plugin Bun would try to follow the import and either
 * pull in the 600 KB devtools bridge or fail at runtime (there's no
 * `node_modules` inside the compiled binary, so `external` won't save
 * us). We intercept the resolve and serve a harmless empty module.
 */
export function stubReactDevtoolsCore(): BunPlugin {
  return {
    name: 'stub-react-devtools-core',
    setup(build) {
      build.onResolve({ filter: /^react-devtools-core$/ }, () => ({
        path: 'react-devtools-core',
        namespace: 'devtools-stub',
      }));
      build.onLoad({ filter: /.*/, namespace: 'devtools-stub' }, () => ({
        contents: 'export default {}; export const connectToDevTools = () => {};',
        loader: 'js',
      }));
    },
  };
}
