/**
 * Unit tests for the check-i18n verify check. Exercised through runChecks()
 * after importing the module to trigger registration; assertions use
 * containment so other registered checks' diagnostics don't interfere.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PluginPackageSchema } from '@brika/schema/plugin';

// Import the check to trigger registerCheck() side-effect.
import './check-i18n';
import { runChecks } from './registry';

function makePkg(extra: Record<string, unknown> = {}): PluginPackageSchema {
  return PluginPackageSchema.parse({
    name: 'test-plugin',
    version: '1.0.0',
    main: './src/index.ts',
    engines: { brika: '^0.4.0' },
    ...extra,
  });
}

let tmpDir = '';

async function setup(locales: Record<string, Record<string, unknown>>): Promise<string> {
  tmpDir = await mkdtemp(join(tmpdir(), 'brika-i18n-'));
  for (const [locale, bundle] of Object.entries(locales)) {
    const dir = join(tmpDir, 'locales', locale);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'plugin.json'), JSON.stringify(bundle));
  }
  return tmpDir;
}

afterEach(async () => {
  if (tmpDir) {
    await rm(tmpDir, { recursive: true, force: true });
    tmpDir = '';
  }
});

// runChecks runs EVERY check registered in this process (other test files may
// have registered theirs), so keep only messages this check emits.
const i18nMessages = (list: string[]) =>
  list.filter(
    (m) =>
      m.includes('locales/') || m.includes('must be localized') || m.includes('no locale fully')
  );

async function run(pkg: PluginPackageSchema, dir: string) {
  const { errors, warnings } = await runChecks({ pkg, pluginDir: dir, sdkVersion: '0.4.0' });
  return { errors: i18nMessages(errors), warnings: i18nMessages(warnings) };
}

describe('check-i18n', () => {
  test('no locales at all is an error when the plugin has localizable metadata', async () => {
    const dir = await setup({});
    const pkg = makePkg({ blocks: [{ id: 'play', name: 'Play', category: 'action' }] });

    const { errors } = await run(pkg, dir);

    expect(errors.some((e) => e.includes('must be localized'))).toBe(true);
  });

  test('no locales is fine when nothing is localizable', async () => {
    const dir = await setup({});

    const { errors, warnings } = await run(makePkg(), dir);

    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  test('any single language may be the covering locale (no hardcoded base)', async () => {
    const dir = await setup({
      de: { blocks: { play: { name: 'Abspielen', description: 'Startet die Wiedergabe' } } },
    });
    const pkg = makePkg({
      blocks: [{ id: 'play', name: 'Play', description: 'Starts playback', category: 'action' }],
    });

    const { errors, warnings } = await run(pkg, dir);

    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  test('errors when no locale fully covers the metadata, naming the closest', async () => {
    const dir = await setup({
      de: { blocks: { play: { name: 'Abspielen' } } },
      fr: {},
    });
    const pkg = makePkg({
      blocks: [{ id: 'play', name: 'Play', description: 'Starts playback', category: 'action' }],
    });

    const { errors } = await run(pkg, dir);

    expect(
      errors.some(
        (e) =>
          e.includes('no locale fully covers') &&
          e.includes('locales/de') &&
          e.includes('blocks.play.description')
      )
    ).toBe(true);
  });

  test('warns per locale about translations other locales have (union diff)', async () => {
    const dir = await setup({
      en: { blocks: { play: { name: 'Play' } }, ui: { hello: 'Hello', bye: 'Bye' } },
      fr: { blocks: { play: { name: 'Lire' } }, ui: { hello: 'Bonjour', extra: 'Extra' } },
    });
    const pkg = makePkg({ blocks: [{ id: 'play', name: 'Play', category: 'action' }] });

    const { errors, warnings } = await run(pkg, dir);

    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.includes('locales/fr') && w.includes('ui.bye'))).toBe(true);
    expect(warnings.some((w) => w.includes('locales/en') && w.includes('ui.extra'))).toBe(true);
  });

  test('requires preference titles, dropdown option labels and brick config labels', async () => {
    const dir = await setup({
      en: {
        name: 'Test',
        preferences: { mode: { title: 'Mode', options: { fast: 'Fast' } } },
        bricks: { gauge: { name: 'Gauge', config: { unit: { label: 'Unit' } } } },
      },
    });
    const pkg = makePkg({
      displayName: 'Test',
      preferences: [
        { name: 'mode', type: 'dropdown', options: [{ value: 'fast' }, { value: 'slow' }] },
      ],
      bricks: [
        {
          id: 'gauge',
          name: 'Gauge',
          config: [
            { name: 'unit', type: 'text' },
            { name: 'refresh', type: 'number' },
          ],
        },
      ],
    });

    const { errors } = await run(pkg, dir);

    expect(
      errors.some(
        (e) =>
          e.includes('preferences.mode.options.slow') &&
          e.includes('bricks.gauge.config.refresh.label')
      )
    ).toBe(true);
  });

  test('an empty-string value does not count as a translation', async () => {
    const dir = await setup({
      en: { blocks: { play: { name: '  ' } } },
    });
    const pkg = makePkg({ blocks: [{ id: 'play', name: 'Play', category: 'action' }] });

    const { errors } = await run(pkg, dir);

    expect(errors.some((e) => e.includes('blocks.play.name'))).toBe(true);
  });
});
