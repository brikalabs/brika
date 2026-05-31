console.log('[brika-bootstrap] entry module loaded', {
  url: location.href,
  scripts: Array.from(document.scripts).map((s) => s.src || '(inline)'),
});

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from '@/App';
import '@/index.css';

// `__brikaBootstrapRoot` is declared in `lib/sw-proxy-bridge.ts` (the
// consumer) with the minimal structural shape it needs. ReactDOM.Root
// is assignment-compatible since it exposes `unmount(): void`.

/**
 * Vite HMR re-evaluates this module whenever any of its transitively-
 * imported modules (App, useBootstrap, LoaderScreen, …) changes. After
 * `injectGraph` has handed the page off to the hub UI, re-running this
 * module would:
 *   1. Look up `#root` — which is now the hub UI's own root div.
 *   2. Call `createRoot` on that div, racing the hub UI's React.
 *   3. Render `<LoaderScreen>` with a stale React dispatcher → throws
 *      `Cannot read properties of null (reading 'useState')`.
 *
 * `globalThis.__brikaHandoffDone` is the canonical handoff signal:
 * `injectGraph` flips it to `true` once it stamps the hub meta + swaps
 * #root + appends hub scripts. It survives module re-eval within the
 * same page session (window-scoped) and resets on a real page reload
 * (which is what we want — that's the bootstrap's job again). Don't
 * use the `<meta name="brika:hub">` tag for this: a real reload of
 * `/monhub` re-enters this module BEFORE injectGraph stamps the meta,
 * but a stale meta from a prior in-page boot would still be in the
 * DOM and gate us out incorrectly.
 */
if (globalThis.__brikaHandoffDone) {
  console.log('[brika-bootstrap] handoff already done — skipping re-render');
  import.meta.hot?.decline();
} else {
  const rootEl = document.getElementById('root');
  if (!rootEl) {
    throw new Error('Root element not found');
  }

  const root = ReactDOM.createRoot(rootEl);
  // Hand the root to the SW-proxy handoff so it can `.unmount()` cleanly
  // once the hub UI takes over. Without this the bootstrap's React keeps
  // a fiber pointing at a now-detached `#root`; any later state push
  // would re-enter `useState` on a null dispatcher and throw.
  globalThis.__brikaBootstrapRoot = root;
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );

  // Even in the first-load case, decline HMR for this module. Any
  // import-graph change reaches up here and there's no safe re-execution
  // path — a full reload is correct.
  import.meta.hot?.decline();
}
