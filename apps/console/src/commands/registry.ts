/**
 * `brika registry`: manage the registries the hub installs and searches from.
 *
 *   brika registry add <scope> <registry-url> [--store <url>]
 *   brika registry list
 *
 * `add` routes installs of `<scope>/*` to `<registry-url>` (npm protocol) and, with `--store`, adds a
 * `/v1` store to the federated search. `list` prints the current config. Both talk to the running hub
 * (started if needed), which persists the change to `brika.yml` and rewrites the install `.npmrc`.
 */

import { defineCommand } from '@brika/cli';
import pc from 'picocolors';
import { CliError } from '../shared/cli/errors';
import { hubFetchOk } from '../shared/cli/hub-client';
import { ensureHub } from '../shared/cli/plugin-install';

interface RegistryEntry {
  id: string;
  name: string;
  pluginUrl?: string;
  search?: { type: string; url?: string };
  install?: { registry?: string };
}

interface Registries {
  defaultRegistry?: string;
  npmRegistries: Record<string, string>;
  searchStores: string[];
  registries?: RegistryEntry[];
}

/** Print the declarative registry catalogue: each registry's name and how it searches/installs. */
function printCatalogue(registries: RegistryEntry[]): void {
  if (registries.length === 0) {
    return;
  }
  process.stdout.write(`\n  ${pc.bold('registries')} ${pc.dim('(declarative catalogue)')}\n`);
  for (const r of registries) {
    const search = r.search?.type === 'v1' ? `search ${r.search.url ?? 'v1'}` : 'search npm';
    const install = r.install?.registry ? `install ${r.install.registry}` : '';
    process.stdout.write(
      `    ${pc.cyan(r.id)} ${pc.dim(r.name)}\n      ${[search, install].filter(Boolean).join('  ')}\n`
    );
    if (r.pluginUrl) {
      process.stdout.write(`      ${pc.dim(r.pluginUrl)}\n`);
    }
  }
}

function printRegistries(r: Registries): void {
  if (r.defaultRegistry) {
    process.stdout.write(
      `\n  ${pc.bold('default registry')} ${pc.dim('(auto-routes any scope it hosts)')}\n    ${r.defaultRegistry}\n`
    );
  }
  const scopes = Object.entries(r.npmRegistries);
  process.stdout.write(
    `\n  ${pc.bold('install registries')} ${pc.dim('(explicit scope overrides)')}\n`
  );
  if (scopes.length === 0) {
    process.stdout.write(`    ${pc.dim('(none: everything resolves from public npm)')}\n`);
  }
  for (const [scope, url] of scopes) {
    process.stdout.write(`    ${pc.cyan(scope)} → ${url}\n`);
  }
  process.stdout.write(`\n  ${pc.bold('search stores')}\n`);
  if (r.searchStores.length === 0) {
    process.stdout.write(`    ${pc.dim('(none)')}\n`);
  }
  for (const store of r.searchStores) {
    process.stdout.write(`    ${store}\n`);
  }
  printCatalogue(r.registries ?? []);
  process.stdout.write('\n');
}

export default defineCommand({
  name: 'registry',
  description: 'Manage the registries the hub installs and searches from',
  details:
    'add <scope> <registry-url> [--store <url>] routes installs of <scope>/* to <registry-url> ' +
    '(npm protocol) and, with --store, adds a /v1 store to federated search. list prints the ' +
    'current configuration. Both talk to the running hub (started if needed).',
  options: {
    store: {
      type: 'string',
      short: 's',
      description: 'Also add this /v1 store URL to federated search',
    },
  },
  examples: [
    'brika registry list',
    'brika registry add @acme https://npm.acme.com',
    'brika registry add @acme https://npm.acme.com --store https://store.acme.com',
  ],
  async handler({ values, positionals }) {
    const [action, scope, registry] = positionals;
    await ensureHub();

    if (action === undefined || action === 'list') {
      const res = await hubFetchOk('/api/registry/registries');
      printRegistries((await res.json()) as Registries);
      return;
    }

    if (action === 'add') {
      if (!scope || !registry) {
        throw new CliError('usage: brika registry add <scope> <registry-url> [--store <url>]');
      }
      const res = await hubFetchOk('/api/registry/registries', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scope, registry, store: values.store }),
      });
      process.stdout.write(`\n  ${pc.green('✓')} registry ${pc.cyan(scope)} → ${registry} added\n`);
      printRegistries((await res.json()) as Registries);
      return;
    }

    throw new CliError('usage: brika registry <add|list> [args] (see `brika registry --help`)');
  },
});
