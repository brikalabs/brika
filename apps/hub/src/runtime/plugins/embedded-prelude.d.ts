/**
 * Virtual module provided by the production build (`apps/build/src/plugins/
 * embed-prelude.ts`): the plugin-runtime prelude bundled to a single JS
 * string. Unresolvable in dev -- only imported when the prelude source is
 * absent from disk (compiled binary / Docker bundle).
 */
declare module 'brika:embedded-prelude' {
  const source: string;
  export default source;
}
