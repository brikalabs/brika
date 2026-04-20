import { describe, expect, test } from 'bun:test';
import { renderToString } from 'react-dom/server';
import {
  CopyButton,
  coverageColor,
  EmptyState,
  FilterPill,
  groupBy,
  Kbd,
  KbdGroup,
  NamespaceGroup,
  pctColor,
  StatCard,
} from './primitives';

// ─── groupBy ───────────────────────────────────────────────────────────────

describe('groupBy', () => {
  test('groups items by key function', () => {
    const items = [
      { name: 'a', cat: 'x' },
      { name: 'b', cat: 'y' },
      { name: 'c', cat: 'x' },
    ];
    const result = groupBy(items, (i) => i.cat);
    expect(result).toHaveLength(2);
    expect(result[0]?.[0]).toBe('x');
    expect(result[0]?.[1]).toHaveLength(2);
    expect(result[1]?.[0]).toBe('y');
    expect(result[1]?.[1]).toHaveLength(1);
  });

  test('sorts groups alphabetically', () => {
    const items = [
      { k: 'z', v: 1 },
      { k: 'a', v: 2 },
      { k: 'm', v: 3 },
    ];
    const result = groupBy(items, (i) => i.k);
    expect(result.map(([key]) => key)).toEqual(['a', 'm', 'z']);
  });

  test('returns empty array for empty input', () => {
    expect(groupBy([], () => 'key')).toEqual([]);
  });
});

// ─── coverageColor / pctColor ──────────────────────────────────────────────

describe('coverageColor', () => {
  test('returns emerald for 100%', () => {
    expect(coverageColor(100)).toBe('emerald');
  });

  test('returns amber for > 80%', () => {
    expect(coverageColor(90)).toBe('amber');
    expect(coverageColor(81)).toBe('amber');
  });

  test('returns red for <= 80%', () => {
    expect(coverageColor(80)).toBe('red');
    expect(coverageColor(50)).toBe('red');
    expect(coverageColor(0)).toBe('red');
  });
});

describe('pctColor', () => {
  test('returns bar and text classes for emerald', () => {
    const c = pctColor(100);
    expect(c.bar).toContain('emerald');
    expect(c.text).toContain('emerald');
  });

  test('returns bar and text classes for red', () => {
    const c = pctColor(50);
    expect(c.bar).toContain('red');
    expect(c.text).toContain('red');
  });
});

// ─── Component render tests ────────────────────────────────────────────────

describe('FilterPill', () => {
  test('renders active state', () => {
    const html = renderToString(
      <FilterPill active={true} onClick={() => {}}>
        All
      </FilterPill>
    );
    expect(html).toContain('All');
    expect(html).toContain('button');
  });

  test('renders inactive state', () => {
    const html = renderToString(
      <FilterPill active={false} onClick={() => {}}>
        All
      </FilterPill>
    );
    expect(html).toContain('All');
  });

  test('renders error variant', () => {
    const html = renderToString(
      <FilterPill active={true} onClick={() => {}} variant="error">
        Errors
      </FilterPill>
    );
    expect(html).toContain('Errors');
    expect(html).toContain('red');
  });

  test('renders warning variant', () => {
    const html = renderToString(
      <FilterPill active={true} onClick={() => {}} variant="warning">
        Warnings
      </FilterPill>
    );
    expect(html).toContain('Warnings');
    expect(html).toContain('amber');
  });
});

describe('EmptyState', () => {
  test('renders title and description', () => {
    const html = renderToString(<EmptyState title="No data" description="Nothing to show" />);
    expect(html).toContain('No data');
    expect(html).toContain('Nothing to show');
  });

  test('renders without description', () => {
    const html = renderToString(<EmptyState title="Empty" />);
    expect(html).toContain('Empty');
  });

  test('renders with icon', () => {
    const html = renderToString(
      <EmptyState icon={<span data-testid="icon">!</span>} title="With icon" />
    );
    expect(html).toContain('With icon');
    expect(html).toContain('icon');
  });
});

describe('StatCard', () => {
  test('renders label and value', () => {
    const html = renderToString(<StatCard label="Locales" value={3} />);
    expect(html).toContain('Locales');
    expect(html).toContain('3');
  });

  test('renders with emerald color', () => {
    const html = renderToString(<StatCard label="Coverage" value="100%" color="emerald" />);
    expect(html).toContain('100%');
    expect(html).toContain('emerald');
  });

  test('renders with red color', () => {
    const html = renderToString(<StatCard label="Coverage" value="50%" color="red" />);
    expect(html).toContain('red');
  });

  test('renders with amber color', () => {
    const html = renderToString(<StatCard label="Coverage" value="85%" color="amber" />);
    expect(html).toContain('amber');
  });
});

describe('NamespaceGroup', () => {
  test('renders expanded with children', () => {
    const html = renderToString(
      <NamespaceGroup ns="common" count={5} isCollapsed={false} onToggle={() => {}}>
        <div>child content</div>
      </NamespaceGroup>
    );
    expect(html).toContain('common');
    expect(html).toContain('5');
    expect(html).toContain('child content');
    expect(html).toContain('rotate-90');
  });

  test('renders collapsed without children', () => {
    const html = renderToString(
      <NamespaceGroup ns="auth" count={2} isCollapsed={true} onToggle={() => {}}>
        <div>hidden content</div>
      </NamespaceGroup>
    );
    expect(html).toContain('auth');
    expect(html).toContain('2');
    expect(html).not.toContain('hidden content');
  });
});

describe('Kbd', () => {
  test('renders keyboard shortcut', () => {
    const html = renderToString(<Kbd>Shift</Kbd>);
    expect(html).toContain('Shift');
    expect(html).toContain('kbd');
  });
});

describe('KbdGroup', () => {
  test('renders multiple keys', () => {
    const html = renderToString(<KbdGroup keys={['Shift', 'Alt', 'D']} />);
    expect(html).toContain('Shift');
    expect(html).toContain('Alt');
    expect(html).toContain('D');
  });
});

describe('CopyButton', () => {
  test('renders copy button', () => {
    const html = renderToString(<CopyButton text="test" />);
    expect(html).toContain('button');
    expect(html).toContain('Copy to clipboard');
  });

  test('renders with custom className', () => {
    const html = renderToString(<CopyButton text="test" className="extra-class" />);
    expect(html).toContain('extra-class');
  });
});
