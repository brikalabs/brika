/**
 * Echo reactive block + `echoed` spark.
 *
 * Passes input through to output. For string payloads, an optional
 * `prefix`/`suffix` from the block config is concatenated; non-string
 * payloads are forwarded unchanged. Every emit is reported on the
 * `echoed` spark for downstream observers.
 */

import { defineReactiveBlock, defineSpark, input, log, output, z } from '@brika/sdk';

export const echoed = defineSpark({
  id: 'echoed',
  schema: z.object({
    original: z.any(),
    result: z.any(),
    timestamp: z.number(),
  }),
});

function transform(data: unknown, prefix: string, suffix: string): unknown {
  if (typeof data !== 'string' || (!prefix && !suffix)) {
    return data;
  }
  return `${prefix}${data}${suffix}`;
}

export const echo = defineReactiveBlock(
  {
    id: 'echo',
    inputs: {
      in: input(z.generic(), { name: 'Input' }),
    },
    outputs: {
      out: output(z.passthrough('in'), { name: 'Output' }),
    },
    config: z.object({
      prefix: z.string().optional().describe('Optional prefix to add to string messages'),
      suffix: z.string().optional().describe('Optional suffix to add to string messages'),
    }),
  },
  ({ inputs, outputs, config }) => {
    inputs.in.on((data) => {
      const result = transform(data, config.prefix ?? '', config.suffix ?? '');
      log.info(typeof result === 'string' ? `Echo: ${result}` : `Echo: ${JSON.stringify(result)}`);
      echoed.emit({ original: data, result, timestamp: Date.now() });
      outputs.out.emit(result);
    });
  }
);
