import { describe, expect, test } from 'bun:test';

import { Button, buttonVariants } from './button';

describe('Button', () => {
  test('exports the component and its cva helper', () => {
    expect(typeof Button).toBe('function');
    expect(typeof buttonVariants).toBe('function');
  });

  test('buttonVariants applies the default variant classes', () => {
    const cls = buttonVariants({});
    expect(cls).toContain('bg-primary');
    expect(cls).toContain('rounded-md');
  });

  test('buttonVariants respects the variant prop', () => {
    const cls = buttonVariants({ variant: 'destructive' });
    expect(cls).toContain('bg-destructive');
  });
});
