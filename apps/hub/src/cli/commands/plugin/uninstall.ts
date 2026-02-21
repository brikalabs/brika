import pc from 'picocolors';
import type { Command } from '../../command';
import { hubFetch, hubFetchOk } from '../../utils/hub-client';

/** Resolve a package name to its plugin UID via the running hub. */
async function resolvePluginUid(name: string): Promise<string | null> {
  const res = await hubFetch('/api/plugins');
  if (!res.ok) return null;

  const plugins = (await res.json()) as { uid: string; name: string }[];
  const match = plugins.find((p) => p.name === name);
  return match?.uid ?? null;
}

export default {
  name: 'uninstall',
  aliases: ['remove'],
  description: 'Uninstall a plugin',
  examples: ['brika plugin uninstall @brika/plugin-timer'],
  async handler({ positionals }) {
    const name = positionals[0];
    if (!name) {
      console.error(`${pc.red('Missing package name.')} Usage: brika plugin uninstall <name>`);
      process.exit(1);
    }

    console.log(`${pc.cyan('Uninstalling')} ${pc.bold(name)} …`);

    const uid = await resolvePluginUid(name);
    // Full cleanup via plugins endpoint if loaded, otherwise registry-only removal
    const endpoint = uid
      ? `/api/plugins/${encodeURIComponent(uid)}`
      : `/api/registry/packages/${encodeURIComponent(name)}`;
    await hubFetchOk(endpoint, { method: 'DELETE' });

    console.log(`  ${pc.green('✓')} ${name} uninstalled`);
  },
} satisfies Command;
