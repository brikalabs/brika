import { describe, expect, test } from 'bun:test';

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cardVariants,
} from './card';

describe('Card', () => {
  test('exports all subcomponents and cva helper', () => {
    expect(typeof Card).toBe('function');
    expect(typeof CardHeader).toBe('function');
    expect(typeof CardTitle).toBe('function');
    expect(typeof CardDescription).toBe('function');
    expect(typeof CardContent).toBe('function');
    expect(typeof CardFooter).toBe('function');
    expect(typeof cardVariants).toBe('function');
  });

  test('cardVariants applies the default class list', () => {
    const cls = cardVariants({});
    expect(cls).toContain('rounded-xl');
    expect(cls).toContain('bg-card');
  });
});
