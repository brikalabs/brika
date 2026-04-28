import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import clayPackageJson from '../../packages/clay/package.json' with { type: 'json' };
import { clayDocgenPlugin } from './src/lib/vite-plugin-clay-docgen.ts';
import { clayHmrPlugin } from './src/lib/vite-plugin-clay-hmr.ts';

const here = dirname(fileURLToPath(import.meta.url));

function loadDotenv(filename: string): void {
  const path = resolve(here, filename);
  if (!existsSync(path)) {
    return;
  }
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) {
      continue;
    }
    const [, key, raw] = match;
    if (process.env[key] !== undefined) {
      continue;
    }
    process.env[key] = raw.replaceAll(/^['"]|['"]$/g, '');
  }
}

loadDotenv('.env.local');
loadDotenv('.env');

const SITE = process.env.SITE;

function safeGit(args: string): string {
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

if (!SITE) {
  throw new Error('SITE env var is required (set in .env or your deploy environment)');
}

export default defineConfig({
  site: SITE,
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
