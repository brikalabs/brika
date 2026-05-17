/**
 * First-run helper. Writes a sensible default `mortar.yml` and tells
 * the user where it landed. No nested prompts — the user edits the
 * YAML directly to customize services, dependencies, or ports.
 *
 * Keeping the wizard one step deep is intentional: the config file is
 * the source of truth; anything we'd ask here just delays the user
 * from seeing the actual schema. The footer message points at the
 * file so they know what to open.
 */

import * as p from '@brika/cli/prompts';
import pc from 'picocolors';
import { saveDefaultConfig } from './load';

/** Write the default YAML and announce it. Throws on filesystem errors. */
export async function writeDefaultAndAnnounce(): Promise<void> {
  p.intro(`${pc.bgCyan(pc.black(' mortar '))} first-run setup`);
  const path = await saveDefaultConfig();
  p.note(
    `Wrote ${pc.cyan(path)}\n\nEdit it to add services, change ports, or wire deps.\nRe-run \`mortar\` whenever you change it.`,
    'Default stack ready'
  );
  p.outro('Starting…');
}
