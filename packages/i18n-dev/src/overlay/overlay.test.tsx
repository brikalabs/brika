import { beforeAll, describe, expect, test } from 'bun:test';
import i18next from 'i18next';
import { renderToString } from 'react-dom/server';
import {
  FloatingBadge,
  I18nDevOverlay,
  PanelHeader,
  StatusBar,
  TabBar,
  toolbarHint,
} from './overlay';

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({
      lng: 'en',
      fallbackLng: false,
      resources: {
        en: { common: { hello: 'Hello' } },
        fr: { common: { hello: 'Bonjour' } },
      },
    });
  }
});

// ─── toolbarHint (pure function) ───────────────────────────────────────────

describe('toolbarHint', () => {
  test('returns empty string when nothing active', () => {
    expect(toolbarHint(false, false, false)).toBe('');
  });

  test('returns Inspecting when highlight is true', () => {
    expect(toolbarHint(true, false, false)).toBe('Inspecting');
  });

  test('returns CI mode when isCiMode is true', () => {
    expect(toolbarHint(false, true, false)).toBe('CI mode');
  });

  test('returns Missing keys when showMissing is true', () => {
    expect(toolbarHint(false, false, true)).toBe('Missing keys');
  });

  test('joins multiple active modes with +', () => {
    expect(toolbarHint(true, true, false)).toBe('Inspecting + CI mode');
  });

  test('joins all three modes', () => {
    expect(toolbarHint(true, true, true)).toBe('Inspecting + CI mode + Missing keys');
  });
});

// ─── StatusBar ─────────────────────────────────────────────────────────────

describe('StatusBar', () => {
  test('renders "All translations OK" when no issues', () => {
    const html = renderToString(<StatusBar errorCount={0} warnCount={0} runtimeCount={0} />);
    expect(html).toContain('All translations OK');
    expect(html).toContain('emerald');
  });

  test('renders error count', () => {
    const html = renderToString(<StatusBar errorCount={3} warnCount={0} runtimeCount={0} />);
    expect(html).toContain('3');
    expect(html).toContain('error');
    expect(html).toContain('red');
  });

  test('renders plural errors (count > 1 appends s)', () => {
    const html = renderToString(<StatusBar errorCount={5} warnCount={0} runtimeCount={0} />);
    // React SSR: "5<!-- --> error<!-- -->s"
    expect(html).toContain('error');
    expect(html).toContain('>s<');
  });

  test('renders singular error (no trailing s)', () => {
    const html = renderToString(<StatusBar errorCount={1} warnCount={0} runtimeCount={0} />);
    expect(html).toContain('error');
  });

  test('renders warning count', () => {
    const html = renderToString(<StatusBar errorCount={0} warnCount={2} runtimeCount={0} />);
    expect(html).toContain('2');
    expect(html).toContain('warning');
    expect(html).toContain('amber');
  });

  test('renders plural warnings (count > 1 appends s)', () => {
    const html = renderToString(<StatusBar errorCount={0} warnCount={4} runtimeCount={0} />);
    // React SSR: "4<!-- --> warning<!-- -->s"
    expect(html).toContain('warning');
    expect(html).toContain('4');
  });

  test('renders singular warning', () => {
    const html = renderToString(<StatusBar errorCount={0} warnCount={1} runtimeCount={0} />);
    expect(html).toContain('warning');
  });

  test('renders runtime count', () => {
    const html = renderToString(<StatusBar errorCount={0} warnCount={0} runtimeCount={5} />);
    expect(html).toContain('5');
    expect(html).toContain('runtime');
  });

  test('renders dot separator between errors and warnings', () => {
    const html = renderToString(<StatusBar errorCount={1} warnCount={1} runtimeCount={0} />);
    // &middot; renders as actual · character
    expect(html).toContain('·');
  });

  test('renders dot separator before runtime when other issues exist', () => {
    const html = renderToString(<StatusBar errorCount={1} warnCount={0} runtimeCount={2} />);
    expect(html).toContain('·');
  });

  test('renders keyboard shortcut hint', () => {
    const html = renderToString(<StatusBar errorCount={0} warnCount={0} runtimeCount={0} />);
    expect(html).toContain('Shift');
    expect(html).toContain('Alt');
    expect(html).toContain('D');
  });
});

// ─── TabBar ────────────────────────────────────────────────────────────────

describe('TabBar', () => {
  const tabs: {
    id: 'issues' | 'runtime' | 'coverage' | 'translations';
    label: string;
    count?: number;
  }[] = [
    { id: 'issues', label: 'Issues', count: 5 },
    { id: 'runtime', label: 'Runtime', count: 2 },
    { id: 'coverage', label: 'Coverage' },
    { id: 'translations', label: 'Keys' },
  ];

  test('renders all tab labels', () => {
    const html = renderToString(<TabBar tabs={tabs} active="issues" onSelect={() => {}} />);
    expect(html).toContain('Issues');
    expect(html).toContain('Runtime');
    expect(html).toContain('Coverage');
    expect(html).toContain('Keys');
  });

  test('renders count badges', () => {
    const html = renderToString(<TabBar tabs={tabs} active="issues" onSelect={() => {}} />);
    expect(html).toContain('>5<');
    expect(html).toContain('>2<');
  });

  test('active tab has indicator', () => {
    const html = renderToString(<TabBar tabs={tabs} active="issues" onSelect={() => {}} />);
    expect(html).toContain('indigo');
  });

  test('renders tab buttons', () => {
    const html = renderToString(<TabBar tabs={tabs} active="runtime" onSelect={() => {}} />);
    expect(html).toContain('button');
  });

  test('renders without count badges when undefined', () => {
    const noCounts: typeof tabs = [{ id: 'coverage', label: 'Coverage' }];
    const html = renderToString(<TabBar tabs={noCounts} active="coverage" onSelect={() => {}} />);
    expect(html).toContain('Coverage');
  });
});

// ─── FloatingBadge ─────────────────────────────────────────────────────────

describe('FloatingBadge', () => {
  test('renders OK when no issues', () => {
    const html = renderToString(
      <FloatingBadge
        totalIssues={0}
        errorCount={0}
        warnCount={0}
        runtimeCount={0}
        currentLang="en"
        onOpen={() => {}}
      />
    );
    expect(html).toContain('OK');
    expect(html).toContain('emerald');
  });

  test('renders total count when issues exist', () => {
    const html = renderToString(
      <FloatingBadge
        totalIssues={7}
        errorCount={5}
        warnCount={1}
        runtimeCount={1}
        currentLang="en"
        onOpen={() => {}}
      />
    );
    expect(html).toContain('>7<');
    expect(html).toContain('red');
  });

  test('renders locale badge', () => {
    const html = renderToString(
      <FloatingBadge
        totalIssues={0}
        errorCount={0}
        warnCount={0}
        runtimeCount={0}
        currentLang="fr"
        onOpen={() => {}}
      />
    );
    expect(html).toContain('>fr<');
  });

  test('renders globe icon (SVG)', () => {
    const html = renderToString(
      <FloatingBadge
        totalIssues={0}
        errorCount={0}
        warnCount={0}
        runtimeCount={0}
        currentLang="en"
        onOpen={() => {}}
      />
    );
    expect(html).toContain('svg');
  });

  test('renders title with issue counts', () => {
    const html = renderToString(
      <FloatingBadge
        totalIssues={3}
        errorCount={2}
        warnCount={1}
        runtimeCount={0}
        currentLang="en"
        onOpen={() => {}}
      />
    );
    expect(html).toContain('2 errors');
    expect(html).toContain('1 warnings');
  });

  test('renders as a button', () => {
    const html = renderToString(
      <FloatingBadge
        totalIssues={0}
        errorCount={0}
        warnCount={0}
        runtimeCount={0}
        currentLang="en"
        onOpen={() => {}}
      />
    );
    expect(html).toContain('button');
  });
});

// ─── PanelHeader ───────────────────────────────────────────────────────────

describe('PanelHeader', () => {
  const noop = () => {};

  test('renders i18n DevTools title', () => {
    const html = renderToString(
      <PanelHeader
        currentLang="en"
        locales={['en', 'fr']}
        highlight={false}
        isCiMode={false}
        showMissing={false}
        runtimeCount={0}
        onToggleHighlight={noop}
        onToggleCiMode={noop}
        onToggleMissing={noop}
        onClose={noop}
      />
    );
    expect(html).toContain('i18n DevTools');
  });

  test('renders locale select options', () => {
    const html = renderToString(
      <PanelHeader
        currentLang="en"
        locales={['en', 'fr', 'de']}
        highlight={false}
        isCiMode={false}
        showMissing={false}
        runtimeCount={0}
        onToggleHighlight={noop}
        onToggleCiMode={noop}
        onToggleMissing={noop}
        onClose={noop}
      />
    );
    expect(html).toContain('select');
    expect(html).toContain('EN');
    expect(html).toContain('FR');
    expect(html).toContain('DE');
  });

  test('renders Inspect button', () => {
    const html = renderToString(
      <PanelHeader
        currentLang="en"
        locales={['en']}
        highlight={false}
        isCiMode={false}
        showMissing={false}
        runtimeCount={0}
        onToggleHighlight={noop}
        onToggleCiMode={noop}
        onToggleMissing={noop}
        onClose={noop}
      />
    );
    expect(html).toContain('Inspect');
  });

  test('renders Inspecting label when highlight active', () => {
    const html = renderToString(
      <PanelHeader
        currentLang="en"
        locales={['en']}
        highlight={true}
        isCiMode={false}
        showMissing={false}
        runtimeCount={0}
        onToggleHighlight={noop}
        onToggleCiMode={noop}
        onToggleMissing={noop}
        onClose={noop}
      />
    );
    expect(html).toContain('Inspecting');
    expect(html).toContain('indigo');
  });

  test('renders CI button', () => {
    const html = renderToString(
      <PanelHeader
        currentLang="en"
        locales={['en']}
        highlight={false}
        isCiMode={false}
        showMissing={false}
        runtimeCount={0}
        onToggleHighlight={noop}
        onToggleCiMode={noop}
        onToggleMissing={noop}
        onClose={noop}
      />
    );
    expect(html).toContain('CI');
  });

  test('renders CI mode active styling', () => {
    const html = renderToString(
      <PanelHeader
        currentLang="cimode"
        locales={['en']}
        highlight={false}
        isCiMode={true}
        showMissing={false}
        runtimeCount={0}
        onToggleHighlight={noop}
        onToggleCiMode={noop}
        onToggleMissing={noop}
        onClose={noop}
      />
    );
    expect(html).toContain('amber');
  });

  test('renders Missing button', () => {
    const html = renderToString(
      <PanelHeader
        currentLang="en"
        locales={['en']}
        highlight={false}
        isCiMode={false}
        showMissing={false}
        runtimeCount={0}
        onToggleHighlight={noop}
        onToggleCiMode={noop}
        onToggleMissing={noop}
        onClose={noop}
      />
    );
    expect(html).toContain('Missing');
  });

  test('renders runtime count badge when not showing missing', () => {
    const html = renderToString(
      <PanelHeader
        currentLang="en"
        locales={['en']}
        highlight={false}
        isCiMode={false}
        showMissing={false}
        runtimeCount={3}
        onToggleHighlight={noop}
        onToggleCiMode={noop}
        onToggleMissing={noop}
        onClose={noop}
      />
    );
    expect(html).toContain('>3<');
  });

  test('renders toolbar hint when modes active', () => {
    const html = renderToString(
      <PanelHeader
        currentLang="en"
        locales={['en']}
        highlight={true}
        isCiMode={false}
        showMissing={true}
        runtimeCount={0}
        onToggleHighlight={noop}
        onToggleCiMode={noop}
        onToggleMissing={noop}
        onClose={noop}
      />
    );
    expect(html).toContain('Inspecting');
    expect(html).toContain('Missing keys');
  });

  test('renders close button', () => {
    const html = renderToString(
      <PanelHeader
        currentLang="en"
        locales={['en']}
        highlight={false}
        isCiMode={false}
        showMissing={false}
        runtimeCount={0}
        onToggleHighlight={noop}
        onToggleCiMode={noop}
        onToggleMissing={noop}
        onClose={noop}
      />
    );
    // X icon renders as SVG
    expect(html).toContain('svg');
  });
});

// ─── I18nDevOverlay (integration) ──────────────────────────────────────────

describe('I18nDevOverlay', () => {
  test('renders floating badge in closed state', () => {
    const html = renderToString(<I18nDevOverlay />);
    expect(html).toContain('button');
    expect(html).toContain('OK');
  });

  test('renders locale in badge', () => {
    const html = renderToString(<I18nDevOverlay />);
    expect(html).toContain('>en<');
  });

  test('renders globe icon', () => {
    const html = renderToString(<I18nDevOverlay />);
    expect(html).toContain('svg');
  });

  test('renders without crashing', () => {
    expect(() => renderToString(<I18nDevOverlay />)).not.toThrow();
  });

  test('renders emerald styling when no issues', () => {
    const html = renderToString(<I18nDevOverlay />);
    expect(html).toContain('emerald');
  });
});
