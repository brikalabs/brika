/**
 * Virtual module provided by the production build (`apps/build/src/plugins/
 * embed-cli.ts`): the author CLI bundled to a single JS string. Unresolvable
 * in dev and in the lean bin (marked external there); only imported when the
 * toolchain runs inside a compiled binary.
 */
declare module 'brika:embedded-cli' {
  const source: string;
  export default source;
}
