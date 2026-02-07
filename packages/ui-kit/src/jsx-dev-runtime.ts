// Dev mode re-export — Bun resolves jsx-dev-runtime in development
// Dev mode uses jsxDEV instead of jsx/jsxs
import { Fragment, jsx, type JSX } from './jsx-runtime';

export { Fragment, type JSX };
export { jsx as jsxDEV };
