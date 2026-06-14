/**
 * `brika create block <id>`: scaffold a new workflow block inside the current
 * plugin: a typed block module, a runBlock test next to it, and the
 * package.json `blocks[]` manifest entry. The file is picked up by the next
 * `brika build` (defineBlock auto-registers on import via the generated entry).
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineCommand } from '@brika/cli';
import pc from 'picocolors';

const BLOCK_ID = /^[a-z][a-z0-9-]*$/;

function titleCase(id: string): string {
  return id
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function camelCase(id: string): string {
  const [first, ...rest] = id.split('-');
  return (first ?? '') + rest.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}

function blockSource(id: string): string {
  const name = titleCase(id);
  const symbol = `${camelCase(id)}Block`;
  return `import { defineBlock, input, output, z } from '@brika/sdk';

export const ${symbol} = defineBlock({
  id: '${id}',
  meta: {
    name: '${name}',
    description: 'TODO: one-line description',
    category: 'action',
    icon: 'box',
    color: '#6366f1',
  },
  inputs: {
    in: input(z.generic(), { name: 'Input' }),
  },
  outputs: {
    out: output(z.string(), { name: 'Output' }),
    error: output(z.object({ message: z.string() }), { name: 'Error' }),
  },
  config: z.object({
    // Add config fields here; they become the editor form.
  }),
  run: ({ inputs, outputs, log }) => {
    inputs.in.on(async (data) => {
      try {
        log.info('received input', { data: JSON.stringify(data).slice(0, 200) });
        outputs.out.emit(String(data));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        outputs.error.emit({ message });
      }
    });
  },
});
`;
}

function testSource(id: string): string {
  const symbol = `${camelCase(id)}Block`;
  return `import { describe, expect, test } from 'bun:test';
import { runBlock } from '@brika/sdk/testing';
import { ${symbol} } from './${id}';

describe('${id}', () => {
  test('emits on input', () => {
    using h = runBlock(${symbol});
    h.inputs.in?.push('hello');
    expect(h.outputs.out?.emitted).toEqual(['hello']);
  });
});
`;
}

interface ManifestBlockEntry {
  id: string;
  [key: string]: unknown;
}

function readBlocksField(manifest: Record<string, unknown>): ManifestBlockEntry[] {
  const value = manifest.blocks;
  if (!Array.isArray(value)) {
    return [];
  }
  const entries: ManifestBlockEntry[] = [];
  for (const entry of value) {
    if (typeof entry === 'object' && entry !== null && 'id' in entry) {
      const id = Reflect.get(entry, 'id');
      if (typeof id === 'string') {
        entries.push({ ...entry, id });
      }
    }
  }
  return entries;
}

export default defineCommand({
  name: 'create',
  description: 'Scaffold plugin pieces (currently: block)',
  details:
    '`brika create block <id>` writes src/blocks/<id>.ts with a typed defineBlock skeleton, ' +
    'a runBlock test beside it, and adds the manifest entry to package.json `blocks[]`. ' +
    'Run from the plugin root. The next `brika build` wires it into the generated entry.',
  examples: ['brika create block fetch-weather'],
  async handler({ positionals }) {
    const [kind, id] = positionals;
    if (kind !== 'block') {
      process.stderr.write(`Unknown subject "${kind ?? ''}". Usage: brika create block <id>\n`);
      process.exitCode = 1;
      return;
    }
    if (!id || !BLOCK_ID.test(id)) {
      process.stderr.write(
        'Block id must be kebab-case (letters, digits, dashes), e.g. fetch-weather\n'
      );
      process.exitCode = 1;
      return;
    }

    const root = process.cwd();
    const manifestPath = join(root, 'package.json');
    if (!existsSync(manifestPath)) {
      process.stderr.write('No package.json here. Run from the plugin root.\n');
      process.exitCode = 1;
      return;
    }

    const manifestRaw = await readFile(manifestPath, 'utf8');
    const parsed: unknown = JSON.parse(manifestRaw);
    if (typeof parsed !== 'object' || parsed === null) {
      process.stderr.write('package.json is not an object.\n');
      process.exitCode = 1;
      return;
    }
    const manifest: Record<string, unknown> = { ...parsed };

    const blockPath = join(root, 'src', 'blocks', `${id}.ts`);
    const testPath = join(root, 'src', 'blocks', `${id}.test.ts`);
    if (existsSync(blockPath)) {
      process.stderr.write(`${blockPath} already exists.\n`);
      process.exitCode = 1;
      return;
    }

    const blocks = readBlocksField(manifest);
    if (blocks.some((b) => b.id === id)) {
      process.stderr.write(`Block "${id}" is already declared in package.json blocks[].\n`);
      process.exitCode = 1;
      return;
    }

    await mkdir(join(root, 'src', 'blocks'), { recursive: true });
    await writeFile(blockPath, blockSource(id));
    await writeFile(testPath, testSource(id));

    blocks.push({
      id,
      name: titleCase(id),
      description: 'TODO: one-line description',
      category: 'action',
      icon: 'box',
      color: '#6366f1',
    });
    manifest.blocks = blocks;
    // Preserve the file's existing 2-space formatting.
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    process.stdout.write(
      `${pc.green('created')} src/blocks/${id}.ts\n` +
        `${pc.green('created')} src/blocks/${id}.test.ts\n` +
        `${pc.green('updated')} package.json (blocks[])\n\n` +
        `Next: ${pc.bold('brika build')} regenerates the entry, ${pc.bold('bun test')} runs the scaffolded test.\n`
    );
  },
});
