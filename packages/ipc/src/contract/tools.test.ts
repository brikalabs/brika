import { describe, expect, test } from 'bun:test';
import { ToolInputSchema } from './tools';

describe('ToolInputSchema accepts zod-derived JSON Schemas', () => {
  test('integer types and numeric bounds survive the contract', () => {
    const schema = ToolInputSchema.safeParse({
      type: 'object',
      properties: {
        days: { type: 'integer', minimum: 1, maximum: 7, default: 3, description: 'Days' },
        city: { type: 'string', description: 'City' },
      },
      required: ['city'],
    });
    expect(schema.success).toBeTrue();
    if (schema.success) {
      const days = schema.data.properties?.days;
      expect(days?.type).toBe('integer');
      expect(days?.minimum).toBe(1);
      expect(days?.maximum).toBe(7);
    }
  });

  test('unknown property types are still rejected', () => {
    const schema = ToolInputSchema.safeParse({
      type: 'object',
      properties: {
        bad: { type: 'function' },
      },
    });
    expect(schema.success).toBeFalse();
  });
});
