import { describe, expect, test } from 'bun:test';
import { renderToString } from 'react-dom/server';
import { HighlightOverlay, HighlightTooltip, VariableHighlight } from './highlight';
import type { HighlightHover } from './highlight';

function mockRect(x: number, y: number, w: number, h: number): DOMRect {
  return { x, y, width: w, height: h, top: y, left: x, right: x + w, bottom: y + h, toJSON() { return this; } } as DOMRect;
}

// ─── VariableHighlight ─────────────────────────────────────────────────────

describe('VariableHighlight', () => {
  test('renders plain text without variables', () => {
    const html = renderToString(<VariableHighlight value="Hello world" />);
    expect(html).toContain('Hello world');
  });

  test('renders text with variable markers', () => {
    // Without i18next interpolator configured, splitTemplate returns plain text
    const html = renderToString(<VariableHighlight value="Hello {{name}}" />);
    expect(html).toContain('Hello {{name}}');
  });

  test('renders empty string', () => {
    const html = renderToString(<VariableHighlight value="" />);
    expect(html).toBeDefined();
  });
});

// ─── HighlightOverlay ──────────────────────────────────────────────────────

const sampleHover: HighlightHover = {
  isKey: true,
  label: 'common:hello',
  rect: mockRect(100, 200, 150, 30),
  mouseX: 120,
};

describe('HighlightOverlay', () => {
  test('renders highlight box for key hover', () => {
    const html = renderToString(<HighlightOverlay hover={sampleHover} />);
    expect(html).toContain('fixed');
    expect(html).toContain('pointer-events-none');
    // Indigo color for keys
    expect(html).toContain('rgba(99,102,241');
  });

  test('renders highlight box for raw text hover', () => {
    const rawHover: HighlightHover = { ...sampleHover, isKey: false };
    const html = renderToString(<HighlightOverlay hover={rawHover} />);
    // Red color for raw text
    expect(html).toContain('rgba(239,68,68');
  });
});

// ─── HighlightTooltip ──────────────────────────────────────────────────────

describe('HighlightTooltip', () => {
  test('renders tooltip with key label', () => {
    const html = renderToString(<HighlightTooltip hover={sampleHover} />);
    expect(html).toContain('common:hello');
    expect(html).toContain('fixed');
  });

  test('renders tooltip for raw text', () => {
    const rawHover: HighlightHover = {
      ...sampleHover,
      isKey: false,
      label: 'some untranslated text',
    };
    const html = renderToString(<HighlightTooltip hover={rawHover} />);
    expect(html).toContain('some untranslated text');
    // Red indicator for raw text
    expect(html).toContain('#f87171');
  });

  test('renders tooltip for key text', () => {
    const html = renderToString(<HighlightTooltip hover={sampleHover} />);
    // Indigo indicator for keys
    expect(html).toContain('#818cf8');
    expect(html).toContain('#c7d2fe');
  });
});
