/// <reference types="astro/client" />

declare module 'virtual:clay-docgen' {
  import type { ClayComponentDoc } from '~/lib/vite-plugin-clay-docgen';
  const docs: Record<string, ClayComponentDoc>;
  export default docs;
}
