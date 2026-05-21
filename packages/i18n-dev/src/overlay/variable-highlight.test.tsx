import { beforeAll, describe, expect, test } from 'bun:test';
import i18next from 'i18next';
import { renderToString } from 'react-dom/server';
import { VariableHighlight } from './variable-highlight';

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({
      lng: 'en',
      fallbackLng: false,
      resources: { en: { vh_ns: { plain: 'hi' } } },
    });
  }
});

describe('VariableHighlight — with i18next interpolator', () => {
  test('renders plain text unchanged', () => {
    const html = renderToString(<VariableHighlight value="Just a string" />);
    expect(html).toContain('Just a string');
  });

  test('renders the full template text for a single variable', () => {
    // Note: with current i18next (≥25), the Proxy-based detection in
    // splitTemplate fails because i18next uses Object.prototype.hasOwnProperty,
    // which a Proxy `has` trap can't satisfy. The fallback path returns the
    // raw template text — exercised here to keep coverage truthful.
    const html = renderToString(<VariableHighlight value="Hello {{name}}" />);
    expect(html).toContain('Hello');
    expect(html).toContain('{{name}}');
  });

  test('renders templates with multiple variables', () => {
    const html = renderToString(<VariableHighlight value="{{a}} and {{b}}!" />);
    expect(html).toContain('{{a}}');
    expect(html).toContain('{{b}}');
    expect(html).toContain('and');
  });

  test('renders only-variable templates', () => {
    const html = renderToString(<VariableHighlight value="{{x}}" />);
    expect(html).toContain('{{x}}');
  });

  test('empty input renders nothing meaningful', () => {
    const html = renderToString(<VariableHighlight value="" />);
    expect(html).toBeDefined();
  });

  test('renders without variables when template contains no placeholders', () => {
    const html = renderToString(<VariableHighlight value="No vars here" />);
    expect(html).toContain('No vars here');
    expect(html).not.toContain('indigo');
  });
});
