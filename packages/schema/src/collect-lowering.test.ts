import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { zodToPreferences } from './collect';
import { PreferenceSchema } from './plugin';

/**
 * `PreferenceEntry` (the lowering's output shape in `./collect`) is a hand
 * mirror of `PreferenceSchema` in `./plugin`: the flat construction shape vs
 * the discriminated manifest union. This test pins the relation the types
 * cannot express — every entry `zodToPreferences` produces must parse under
 * the manifest schema, so the two can never drift apart silently.
 */
describe('zodToPreferences output conforms to PreferenceSchema', () => {
  test('every lowered entry parses under the manifest preference union', () => {
    const config = z.object({
      title: z.string().default('Hi').meta({ label: 'Title' }),
      secret: z.string().meta({ format: 'password' }),
      refresh: z.number().min(1).max(10).multipleOf(1).default(5).describe('Refresh rate'),
      enabled: z.boolean().default(true),
      unit: z.enum(['c', 'f']).default('c').meta({ label: 'Unit' }),
      device: z.string().meta({ format: 'dynamic-dropdown' }),
    });

    const { preferences, warnings } = zodToPreferences(config);

    expect(warnings).toEqual([]);
    expect(preferences.length).toBe(6);
    for (const entry of preferences) {
      const parsed = PreferenceSchema.safeParse(entry);
      expect(`${entry.name}: ${parsed.success}`).toBe(`${entry.name}: true`);
    }
  });
});
