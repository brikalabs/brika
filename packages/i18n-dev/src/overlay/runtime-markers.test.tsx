import { describe, expect, test } from 'bun:test';
import { renderToString } from 'react-dom/server';
import type { RuntimeMarker } from './runtime-markers';
import { RuntimeMarkersOverlay } from './runtime-markers';

function mockRect(x: number, y: number, w: number, h: number): DOMRect {
  return {
    x,
    y,
    width: w,
    height: h,
    top: y,
    left: x,
    right: x + w,
    bottom: y + h,
    toJSON() {
      return this;
    },
  } as DOMRect;
}

const sampleMarkers: RuntimeMarker[] = [
  {
    key: 'hello',
    namespace: 'common',
    rect: mockRect(50, 100, 200, 24),
    componentName: 'Header',
    source: 'src/Header.tsx:15',
  },
  {
    key: 'bye',
    namespace: 'common',
    rect: mockRect(50, 150, 200, 24),
    componentName: null,
    source: null,
  },
];

describe('RuntimeMarkersOverlay', () => {
  test('renders nothing when no markers', () => {
    const html = renderToString(<RuntimeMarkersOverlay markers={[]} />);
    // Should render nothing (null)
    expect(html).toBe('');
  });

  test('renders marker badges', () => {
    const html = renderToString(<RuntimeMarkersOverlay markers={sampleMarkers} />);
    // React inserts <!-- --> between JSX expressions in "ns:key" text
    expect(html).toContain('common');
    expect(html).toContain('hello');
    expect(html).toContain('bye');
  });

  test('renders component name badge', () => {
    const html = renderToString(<RuntimeMarkersOverlay markers={sampleMarkers} />);
    expect(html).toContain('Header');
    expect(html).toContain('&lt;');
    expect(html).toContain('&gt;');
  });

  test('renders source location', () => {
    const html = renderToString(<RuntimeMarkersOverlay markers={sampleMarkers} />);
    expect(html).toContain('src/Header.tsx:15');
  });

  test('renders dashed border outline', () => {
    const html = renderToString(<RuntimeMarkersOverlay markers={sampleMarkers} />);
    expect(html).toContain('dashed');
  });

  test('renders marker without source as non-interactive', () => {
    const noSourceMarker: RuntimeMarker[] = [
      {
        key: 'test',
        namespace: 'ns',
        rect: mockRect(0, 0, 100, 20),
        componentName: null,
        source: null,
      },
    ];
    const html = renderToString(<RuntimeMarkersOverlay markers={noSourceMarker} />);
    expect(html).toContain('pointer-events-none');
    expect(html).toContain('>ns<');
    expect(html).toContain('>test<');
  });
});
