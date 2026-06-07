import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanBoundary } from './check';

describe('scanBoundary', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'brika-check-'));
    await mkdir(join(root, 'src', 'bricks'), { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('flags a server-only @brika/sdk subpath imported into a brick', async () => {
    await writeFile(
      join(root, 'src', 'bricks', 'bad.tsx'),
      "import { onStop } from '@brika/sdk/lifecycle';\nexport default function B() { return null; }\n"
    );

    const violations = await scanBoundary(root);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.specifier).toBe('@brika/sdk/lifecycle');
  });

  test('allows bridged specifiers (brick-views, ui-kit, react, lucide)', async () => {
    await writeFile(
      join(root, 'src', 'bricks', 'good.tsx'),
      [
        "import { z } from '@brika/sdk';",
        "import { useBrickConfig } from '@brika/sdk/brick-views';",
        "import { Card } from '@brika/sdk/ui-kit';",
        "import { Timer } from 'lucide-react';",
        'export default function G() { return null; }',
      ].join('\n')
    );

    expect(await scanBoundary(root)).toEqual([]);
  });
});
