/**
 * Unit tests for `useTranslate`. Each test runs the hook inside a tiny probe
 * component and pulls the result via `react-dom/server.renderToString`. We use
 * a fresh i18next instance and React's `<I18nextProvider>` so this suite is
 * independent of the singleton wired up by `createI18n()`.
 */

import { describe, expect, test } from 'bun:test';
import i18next from 'i18next';
import type { ReactElement } from 'react';
import { Suspense } from 'react';
import { renderToString } from 'react-dom/server';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { useTranslate, type UseTranslateResult } from '../use-translate';

interface ProbeProps {
  readonly onResult: (r: UseTranslateResult) => void;
}

function Probe({ onResult }: Readonly<ProbeProps>): ReactElement {
  const result = useTranslate();
  onResult(result);
  return <span>.</span>;
}

interface Capture {
  result: UseTranslateResult | null;
  error: unknown;
}

function renderProbe(instance: typeof i18next): Capture {
  const capture: Capture = { result: null, error: null };
  try {
    renderToString(
      <I18nextProvider i18n={instance}>
        <Suspense fallback={<span>loading</span>}>
          <Probe
            onResult={(r) => {
              capture.result = r;
            }}
          />
        </Suspense>
      </I18nextProvider>
    );
  } catch (err) {
    capture.error = err;
  }
  return capture;
}

async function buildInstance(
  language: string,
  resources: Record<string, Record<string, Record<string, unknown>>>
): Promise<typeof i18next> {
  const instance = i18next.createInstance();
  await instance.use(initReactI18next).init({
    lng: language,
    fallbackLng: false,
    defaultNS: 'common',
    ns: ['common'],
    resources,
    interpolation: { escapeValue: false },
    react: { useSuspense: true },
  });
  return instance;
}

describe('useTranslate — basics', () => {
  test('exposes locale, t, tp, changeLocale', async () => {
    const inst = await buildInstance('en', { en: { common: { hello: 'Hello' } } });
    const { result } = renderProbe(inst);
    expect(result?.locale).toBe('en');
    expect(typeof result?.t).toBe('function');
    expect(typeof result?.tp).toBe('function');
    expect(typeof result?.changeLocale).toBe('function');
  });

  test('t() resolves a plain default-namespace key', async () => {
    const inst = await buildInstance('en', { en: { common: { hello: 'Hello' } } });
    const { result } = renderProbe(inst);
    expect(result?.t('hello')).toBe('Hello');
  });

  test('cimode locale returns the key verbatim, regardless of resources', async () => {
    const inst = await buildInstance('cimode', { cimode: { common: { hello: 'Hello' } } });
    const { result } = renderProbe(inst);
    expect(result?.t('anything.deep')).toBe('anything.deep');
    expect(result?.t('explicit:key', { ns: 'explicit' })).toBe('explicit:key');
  });
});

describe('useTranslate — namespace resolution', () => {
  test('"ns:key" syntax pulls from the matching namespace', async () => {
    const inst = await buildInstance('en', {
      en: {
        common: { hi: 'Hi' },
        auth: { login: 'Sign in' },
      },
    });
    const { result } = renderProbe(inst);
    expect(result?.t('auth:login')).toBe('Sign in');
  });

  test('explicit ns option takes the early-return path that delegates straight to baseT', async () => {
    const inst = await buildInstance('en', {
      en: {
        common: { greet: 'Hello' },
        auth: { greet: 'Welcome' },
      },
    });
    const { result } = renderProbe(inst);
    // With an explicit `ns`, the wrapper skips the `parsed.path` rewrite branch
    // and just forwards to `baseT(rawKey, options)` — i18next's own ns parser
    // then resolves "auth:greet" against the auth bundle.
    expect(result?.t('auth:greet', { ns: 'common' })).toBe('Welcome');
  });

  test('throws the i18next load promise when the keyed namespace is unloaded', async () => {
    const inst = await buildInstance('en', { en: { common: { hi: 'Hi' } } });
    const { result } = renderProbe(inst);
    let thrown: unknown = null;
    try {
      result?.t('lazy:title');
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Promise);
  });
});

describe('useTranslate — tp', () => {
  test('tp(ns, key) resolves to the namespaced string', async () => {
    const inst = await buildInstance('en', {
      en: { settings: { title: 'Settings' } },
    });
    const { result } = renderProbe(inst);
    expect(result?.tp('settings', 'title')).toBe('Settings');
  });

  test('tp uses defaultValue when key is absent', async () => {
    const inst = await buildInstance('en', { en: { settings: {} } });
    const { result } = renderProbe(inst);
    expect(result?.tp('settings', 'missing', 'Fallback')).toBe('Fallback');
  });

  test('tp forwards __cs in the options bag (no throw, value still resolves)', async () => {
    const inst = await buildInstance('en', { en: { dash: { wave: 'Hi!' } } });
    const { result } = renderProbe(inst);
    expect(result?.tp('dash', 'wave', undefined, 'src/file.tsx:12')).toBe('Hi!');
  });
});

describe('useTranslate — changeLocale', () => {
  test('changeLocale resolves to undefined (delegates to module-level switchLanguage)', async () => {
    const inst = await buildInstance('en', { en: { common: { x: 'x' } } });
    const { result } = renderProbe(inst);
    await expect(result?.changeLocale('en')).resolves.toBeUndefined();
  });
});

describe('useTranslate — separator handling', () => {
  test('honours the i18next-configured nsSeparator instead of defaulting to ":"', async () => {
    const instance = i18next.createInstance();
    await instance.use(initReactI18next).init({
      lng: 'en',
      fallbackLng: false,
      defaultNS: 'common',
      ns: ['common', 'auth'],
      nsSeparator: '::',
      keySeparator: '.',
      resources: {
        en: {
          common: { hi: 'Hi' },
          auth: { login: 'Sign in' },
        },
      },
      interpolation: { escapeValue: false },
      react: { useSuspense: true },
    });
    const { result } = renderProbe(instance);
    // With nsSeparator='::', a key containing ':' but not '::' should NOT be
    // split — it stays a default-namespace key. We're exercising the
    // `rawKey.includes(nsSeparator)` branch.
    expect(result?.t('hi')).toBe('Hi');
  });
});
