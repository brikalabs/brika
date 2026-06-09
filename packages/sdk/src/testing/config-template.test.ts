/**
 * Integration: `{{ inputs.<port> }}` config templates resolve per input event
 * through the reactive runtime (not just the standalone resolver).
 */

import { describe, expect, test } from 'bun:test';
import { defineBlock, input, output, z } from '../blocks';
import { runBlock } from './run-block';

// Echoes its templated `message` config out on every input event, so the
// emitted value is exactly what the block's handler read from `config`.
const echo = defineBlock({
  id: 'tmpl-echo',
  meta: { name: 'Echo', category: 'transform' },
  inputs: { in: input(z.generic()) },
  outputs: { out: output(z.string()) },
  config: z.object({
    message: z.string().default(''),
  }),
  run: ({ inputs, outputs, config }) => {
    inputs.in.on(() => outputs.out.emit(config.message));
  },
});

describe('config templates through the reactive runtime', () => {
  test('resolves {{ inputs.in.field }} against the live payload', () => {
    using h = runBlock(echo, { config: { message: 'Hi {{ inputs.in.name }}' } });

    h.inputs.in?.push({ name: 'Ada' });
    h.inputs.in?.push({ name: 'Lovelace' });

    expect(h.outputs.out?.emitted).toEqual(['Hi Ada', 'Hi Lovelace']);
  });

  test('a non-templated field is delivered verbatim', () => {
    using h = runBlock(echo, { config: { message: 'static' } });
    h.inputs.in?.emit();
    expect(h.outputs.out?.emitted).toEqual(['static']);
  });

  test('an expression with no matching input renders empty', () => {
    using h = runBlock(echo, { config: { message: '[{{ inputs.in.missing }}]' } });
    h.inputs.in?.push({ other: 1 });
    expect(h.outputs.out?.emitted).toEqual(['[]']);
  });
});
