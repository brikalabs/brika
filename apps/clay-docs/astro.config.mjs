import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import { clayDocgenPlugin } from './src/lib/vite-plugin-clay-docgen.ts';
import { clayHmrPlugin } from './src/lib/vite-plugin-clay-hmr.ts';

const here = dirname(fileURLToPath(import.meta.url));
const clayPackageJson = JSON.parse(
  readFileSync(resolve(here, '../../packages/clay/package.json'), 'utf8')
);

function safeGit(args) {
  try {
    return execSync(`git ${args}`, { cwd: here, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

const buildCommit = safeGit('rev-parse --short HEAD') || 'dev';
const buildDate = safeGit('log -1 --format=%cI') || new Date().toISOString();

const isDev = process.argv.includes('dev');

export default defineConfig({
  site: 'https://clay.brika.dev',
  integrations: [mdx(), react()],
  markdown: {
    shikiConfig: {
      themes: { light: 'catppuccin-latte', dark: 'catppuccin-mocha' },
      defaultColor: false,
    },
  },
  vite: {
    define: {
      __CLAY_VERSION__: JSON.stringify(clayPackageJson.version),
      __BUILD_COMMIT__: JSON.stringify(buildCommit),
      __BUILD_DATE__: JSON.stringify(buildDate),
    },
    plugins: [clayHmrPlugin({ dev: isDev }), clayDocgenPlugin({ dev: isDev }), tailwindcss()],
  },
});
