import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import { clayHmrPlugin } from './src/lib/vite-plugin-clay-hmr.ts';

const isDev = process.argv.includes('dev');

export default defineConfig({
  site: 'https://clay.brika.dev',
  integrations: [mdx(), react()],
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'vesper' },
      defaultColor: false,
    },
  },
  vite: {
    plugins: [clayHmrPlugin({ dev: isDev }), tailwindcss()],
  },
});
