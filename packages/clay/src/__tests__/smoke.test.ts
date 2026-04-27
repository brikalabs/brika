import { describe, expect, test } from 'bun:test';

import * as clay from '../index';

describe('@brika/clay barrel', () => {
  test('exports the cn primitive', () => {
    expect(typeof clay.cn).toBe('function');
  });

  test('exports the useIsMobile primitive', () => {
    expect(typeof clay.useIsMobile).toBe('function');
  });

  test('exports the Button component', () => {
    expect('Button' in clay).toBe(true);
  });

  test('exports the Input component', () => {
    expect('Input' in clay).toBe(true);
  });

  test('exports the Card surface and its subcomponents', () => {
    expect('Card' in clay).toBe(true);
    expect('CardHeader' in clay).toBe(true);
    expect('CardTitle' in clay).toBe(true);
    expect('CardContent' in clay).toBe(true);
    expect('CardFooter' in clay).toBe(true);
  });
});
