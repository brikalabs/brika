import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { errorMessage, readBrowserModule } from './browser-extract';

const tempDirs: string[] = [];

/**
 * Write `source` to a fresh temp dir inside this package so the bundled `.mjs`
 * (written beside the source) resolves the external `@brika/sdk` exactly as a
 * real plugin would.
 */
async function fixture(name: string, source: string): Promise<string> {
  const dir = await mkdtemp(join(import.meta.dir, '..', '.be-fixture-'));
  tempDirs.push(dir);
  const file = join(dir, name);
  await writeFile(file, source);
  return file;
}

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe('errorMessage', () => {
  it('reads Error.message and stringifies anything else', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('plain string')).toBe('plain string');
    expect(errorMessage(42)).toBe('42');
  });
});

describe('readBrowserModule', () => {
  it('evaluates a view with react/ui-kit/lucide/clsx/cva/node stubbed and sdk external', async () => {
    const file = await fixture(
      'widget.tsx',
      `import { z } from '@brika/sdk';
import { useBrickConfig } from '@brika/sdk/ui-kit/hooks';
import { useState } from 'react';
import { Activity } from 'lucide-react';
import clsx from 'clsx';
import { cva } from 'class-variance-authority';
import { join } from 'node:path';

// cva runs at module top level, so the stub must be a real callable.
const tone = cva('base');

export const config = z.object({ title: z.string().optional() });
export const meta = { name: 'Widget', category: 'info' };
export default function Widget() {
  useState(0);
  useBrickConfig();
  return [Activity, clsx('x'), tone(), join('a', 'b')];
}
`
    );

    const result = await readBrowserModule(file);
    if ('error' in result) {
      throw new Error(`expected the module to evaluate, got error: ${result.error}`);
    }
    expect(result.ns.meta).toEqual({ name: 'Widget', category: 'info' });
  });

  it('returns an error when the module cannot be bundled', async () => {
    const file = await fixture('broken.tsx', 'export const meta = (((');
    const result = await readBrowserModule(file);
    if (!('error' in result)) {
      throw new Error('expected a bundling error');
    }
    expect(result.error.length).toBeGreaterThan(0);
  });

  it('returns an error when the built module fails to import', async () => {
    // Builds fine (@brika/sdk stays external) but the missing named export makes
    // the dynamic import of the bundled module reject.
    const file = await fixture(
      'import-fail.tsx',
      `import { __definitelyNotAnExport } from '@brika/sdk';
export const meta = { name: 'X', value: __definitelyNotAnExport };
`
    );
    const result = await readBrowserModule(file);
    if (!('error' in result)) {
      throw new Error('expected an import error');
    }
    expect(result.error.length).toBeGreaterThan(0);
  });

  it('reports a build that produced no output', async () => {
    const spy = spyOn(Bun, 'build').mockResolvedValue({ outputs: [], success: true, logs: [] });
    try {
      const result = await readBrowserModule('/tmp/never-built.tsx');
      expect(result).toEqual({ error: 'bundling produced no output' });
    } finally {
      spy.mockRestore();
    }
  });
});
