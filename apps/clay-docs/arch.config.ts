import { defineConfig, files } from '@brika/archunit';

/**
 * `@brika/clay-docs` is the public showcase for `@brika/clay` and must stay
 * isolated from Brika's runtime + feature code. It consumes Clay and Clay
 * alone; any leak of hub/auth/feature imports is an arch violation.
 */
const FORBIDDEN_BRIKA_IMPORTS =
  /^@brika\/(hub|auth|events|flow|ipc|permissions|plugin|registry|router|schema|sdk|type-system|workflow)(\/|$)/;

export default defineConfig([
  files('src/**/*.{ts,tsx,astro}')
    .should()
    .notImportFrom(FORBIDDEN_BRIKA_IMPORTS, 'Brika runtime or feature packages')
    .because('clay-docs must only depend on @brika/clay — no hub, auth, or runtime packages'),
]);
