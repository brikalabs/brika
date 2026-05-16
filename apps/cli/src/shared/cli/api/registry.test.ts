/**
 * Unit tests for the registry HTTP client — search, README, and the
 * SSE-backed install generator.
 */
import { describe, expect, test } from 'bun:test';
import { useBunMock } from '@brika/testing';
import {
  fetchRegistryReadme,
  type InstallProgress,
  installFromRegistry,
  searchRegistry,
} from './registry';

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function sseResponse(events: ReadonlyArray<unknown>): Response {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

describe('fetchRegistryReadme', () => {
  const bun = useBunMock();

  test('returns the readme markdown', async () => {
    bun.fetch(async () => new Response(JSON.stringify({ readme: '# r' }), { status: 200 }));
    expect(await fetchRegistryReadme('pkg')).toBe('# r');
  });

  test('returns an empty string when readme is null', async () => {
    bun.fetch(async () => new Response(JSON.stringify({ readme: null }), { status: 200 }));
    expect(await fetchRegistryReadme('pkg')).toBe('');
  });

  test('url-encodes the package name', async () => {
    let url = '';
    bun.fetch(async (input) => {
      url = urlOf(input);
      return new Response(JSON.stringify({ readme: '' }), { status: 200 });
    });
    await fetchRegistryReadme('@scope/name');
    expect(url).toContain('/api/registry/plugins/%40scope%2Fname/readme');
  });

  test('throws on non-ok', () => {
    bun.fetch(async () => new Response('', { status: 404 }));
    expect(fetchRegistryReadme('x')).rejects.toThrow(/404/);
  });
});

describe('searchRegistry', () => {
  const bun = useBunMock();

  test('maps the hub response into RegistrySearchResult[]', async () => {
    bun.fetch(
      async () =>
        new Response(
          JSON.stringify({
            plugins: [
              {
                package: {
                  name: 'pkg',
                  version: '1.0.0',
                  displayName: 'Pkg',
                  description: 'desc',
                },
                installVersion: '1.0.1',
                installed: true,
                installedVersion: '1.0.0',
                compatible: true,
                compatibilityReason: undefined,
                downloadCount: 10,
                source: 'npm',
              },
            ],
          }),
          { status: 200 }
        )
    );
    const result = await searchRegistry('pkg');
    expect(result).toEqual([
      {
        name: 'pkg',
        version: '1.0.1',
        displayName: 'Pkg',
        description: 'desc',
        installed: true,
        installedVersion: '1.0.0',
        compatible: true,
        compatibilityReason: undefined,
        downloadCount: 10,
        source: 'npm',
      },
    ]);
  });

  test('falls back to package.version when installVersion is empty', async () => {
    bun.fetch(
      async () =>
        new Response(
          JSON.stringify({
            plugins: [
              {
                package: { name: 'p', version: '2.0.0' },
                installVersion: '',
                installed: false,
                compatible: true,
                downloadCount: 0,
                source: 'npm',
              },
            ],
          }),
          { status: 200 }
        )
    );
    const result = await searchRegistry('p');
    expect(result[0]?.version).toBe('2.0.0');
  });

  test('sends `q` when the query has content', async () => {
    let url = '';
    bun.fetch(async (input) => {
      url = urlOf(input);
      return new Response(JSON.stringify({ plugins: [] }), { status: 200 });
    });
    await searchRegistry('  hello  ');
    const qs = new URL(url).searchParams;
    expect(qs.get('q')).toBe('hello');
    expect(qs.get('limit')).toBe('25');
  });

  test('omits `q` when the query is empty/whitespace', async () => {
    let url = '';
    bun.fetch(async (input) => {
      url = urlOf(input);
      return new Response(JSON.stringify({ plugins: [] }), { status: 200 });
    });
    await searchRegistry('   ');
    const qs = new URL(url).searchParams;
    expect(qs.has('q')).toBe(false);
    expect(qs.get('limit')).toBe('25');
  });

  test('returns an empty array when plugins is missing', async () => {
    bun.fetch(async () => new Response(JSON.stringify({}), { status: 200 }));
    expect(await searchRegistry('x')).toEqual([]);
  });

  test('throws on non-ok', () => {
    bun.fetch(async () => new Response('', { status: 500 }));
    expect(searchRegistry('x')).rejects.toThrow(/500/);
  });
});

describe('installFromRegistry', () => {
  const bun = useBunMock();

  test('yields progress events and stops on `complete`', async () => {
    bun.fetch(async () =>
      sseResponse([
        { phase: 'resolving', message: 'looking up' },
        { phase: 'downloading', progress: 0.5 },
        { phase: 'complete', message: 'done' },
        { phase: 'extra', message: 'should-not-yield' },
      ])
    );

    const events: InstallProgress[] = [];
    for await (const ev of installFromRegistry('pkg', '1.0.0')) {
      events.push(ev);
    }

    expect(events.map((e) => e.phase)).toEqual(['resolving', 'downloading', 'complete']);
  });

  test('stops on `error`', async () => {
    bun.fetch(async () =>
      sseResponse([
        { phase: 'resolving' },
        { phase: 'error', message: 'kaboom' },
        { phase: 'never' },
      ])
    );

    const events: InstallProgress[] = [];
    for await (const ev of installFromRegistry('pkg')) {
      events.push(ev);
    }

    expect(events).toHaveLength(2);
    expect(events.at(-1)?.phase).toBe('error');
  });

  test('throws when the install request fails to start', () => {
    bun.fetch(async () => new Response('nope', { status: 400 }));
    const run = async () => {
      for await (const _ of installFromRegistry('pkg')) {
        // unreachable
      }
    };
    expect(run()).rejects.toThrow(/install failed to start: 400 nope/);
  });

  test('sends the package and version in the JSON body', async () => {
    let bodyText = '';
    bun.fetch(async (_input, init) => {
      bodyText = typeof init?.body === 'string' ? init.body : '';
      return sseResponse([{ phase: 'complete' }]);
    });
    for await (const _ of installFromRegistry('pkg', '1.2.3')) {
      // drain
    }
    expect(JSON.parse(bodyText)).toEqual({ package: 'pkg', version: '1.2.3' });
  });
});
