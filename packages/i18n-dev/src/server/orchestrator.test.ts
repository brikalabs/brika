import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useBunMock } from '@brika/testing';
import { runScan } from './orchestrator';

// ─── Helpers ────────────────────────────────────────────────────────────────

const bun = useBunMock();

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface RemoteBundles {
  readonly locales: readonly string[];
  readonly bundles: Readonly<Record<string, Record<string, Record<string, unknown>>>>;
}

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function mockRemote(remote: RemoteBundles): void {
  bun.fetch((input) => {
    const url = urlOf(input);
    if (url.endsWith('/locales')) {
      return Promise.resolve(jsonResponse({ locales: remote.locales }));
    }
    const bundleMatch = /\/bundle\/([^/?#]+)$/.exec(url);
    if (bundleMatch) {
      const locale = bundleMatch[1] ?? '';
      const body = remote.bundles[locale] ?? {};
      return Promise.resolve(jsonResponse(body));
    }
    return Promise.resolve(jsonResponse({}, 404));
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('runScan coverage', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'orchestrator-coverage-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  test('emits coverage for translations served only by the hub (no localesDir)', async () => {
    mockRemote({
      locales: ['en', 'fr'],
      bundles: {
        en: { common: { hello: 'Hello', bye: 'Goodbye' } },
        fr: { common: { hello: 'Bonjour' } },
      },
    });

    const result = await runScan({
      localesDir: null,
      apiUrl: 'http://test.local/api/i18n',
      referenceLocale: 'en',
      sources: [],
      cacheDir: join(workDir, '.cache'),
    });

    expect(result.validation.coverage).toHaveLength(2);
    const en = result.validation.coverage.find((c) => c.locale === 'en');
    const fr = result.validation.coverage.find((c) => c.locale === 'fr');
    expect(en?.totalKeys).toBe(2);
    expect(en?.percentage).toBe(100);
    expect(fr?.totalKeys).toBe(2);
    expect(fr?.translatedKeys).toBe(1);
    expect(fr?.percentage).toBe(50);

    const missing = result.validation.issues.filter((i) => i.type === 'missing-key');
    expect(missing).toHaveLength(1);
    expect(missing[0]?.locale).toBe('fr');
    expect(missing[0]?.key).toBe('bye');
  });

  test('coverage union spans localesDir + workspace source + hub data', async () => {
    const localesDir = join(workDir, 'locales');
    await writeJson(join(localesDir, 'en', 'common.json'), { hello: 'Hello' });
    await writeJson(join(localesDir, 'fr', 'common.json'), { hello: 'Bonjour' });

    const pkgLocalesDir = join(workDir, 'pkg', 'locales');
    await writeJson(join(pkgLocalesDir, 'en', 'main.json'), { title: 'Title' });
    await writeJson(join(pkgLocalesDir, 'fr', 'main.json'), { title: 'Titre' });

    mockRemote({
      locales: ['en', 'fr'],
      bundles: {
        en: { dashboard: { stats: 'Stats' } },
        fr: { dashboard: { stats: 'Statistiques' } },
      },
    });

    const result = await runScan({
      localesDir,
      apiUrl: 'http://test.local/api/i18n',
      referenceLocale: 'en',
      sources: [{ dir: join(workDir, 'pkg', 'src'), namespace: 'pkg', localesDir: pkgLocalesDir }],
      cacheDir: join(workDir, '.cache'),
    });

    const namespacesCovered = new Set(result.validation.coverage.map((c) => c.namespace));
    expect(namespacesCovered).toEqual(new Set(['common', 'pkg', 'dashboard']));

    // Every covered (locale, ns) pair should report a totalKeys > 0.
    for (const entry of result.validation.coverage) {
      expect(entry.totalKeys).toBeGreaterThan(0);
    }
  });

  test('returns empty coverage when neither localesDir nor apiUrl is available', async () => {
    const result = await runScan({
      localesDir: null,
      apiUrl: null,
      referenceLocale: 'en',
      sources: [],
      cacheDir: join(workDir, '.cache'),
    });
    expect(result.validation.coverage).toEqual([]);
    expect(result.validation.issues).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test('source without `namespace` exposes each JSON file as its own namespace', async () => {
    const hubLocales = join(workDir, 'hub', 'locales');
    await writeJson(join(hubLocales, 'en', 'auth.json'), { profile: 'Profile' });
    await writeJson(join(hubLocales, 'en', 'nav.json'), { help: 'Help' });
    await writeJson(join(hubLocales, 'fr', 'auth.json'), { profile: 'Profil' });
    await writeJson(join(hubLocales, 'fr', 'nav.json'), { help: 'Aide' });

    const result = await runScan({
      localesDir: null,
      apiUrl: null,
      referenceLocale: 'en',
      sources: [{ dir: join(workDir, 'hub'), localesDir: hubLocales }],
      cacheDir: join(workDir, '.cache'),
    });

    const namespaces = new Set(result.validation.coverage.map((c) => c.namespace));
    expect(namespaces).toEqual(new Set(['auth', 'nav']));

    const enAuth = result.coreTranslations.get('en')?.get('auth');
    const frNav = result.coreTranslations.get('fr')?.get('nav');
    expect(enAuth).toEqual({ profile: 'Profile' });
    expect(frNav).toEqual({ help: 'Aide' });
  });

  test('surfaces remote-fetch failures as warnings instead of swallowing them', async () => {
    bun.fetch(() => Promise.reject(new Error('ECONNREFUSED 127.0.0.1:3001')));

    const result = await runScan({
      localesDir: null,
      apiUrl: 'http://127.0.0.1:3001/api/i18n',
      referenceLocale: 'en',
      sources: [],
      cacheDir: join(workDir, '.cache'),
    });

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.join(' ')).toContain('ECONNREFUSED');
  });

  test('reports HTTP error status from remote endpoints in warnings', async () => {
    bun.fetch(() => Promise.resolve(jsonResponse({}, 503)));

    const result = await runScan({
      localesDir: null,
      apiUrl: 'http://hub.local/api/i18n',
      referenceLocale: 'en',
      sources: [],
      cacheDir: join(workDir, '.cache'),
    });

    expect(result.warnings.some((w) => w.includes('HTTP 503'))).toBe(true);
  });
});
