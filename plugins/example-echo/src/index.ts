/**
 * Echo Plugin - Example plugin demonstrating reactive blocks and sparks
 */

import { defineReactiveBlock, defineSpark, input, log, onStop, output, z } from '@brika/sdk';

// ─────────────────────────────────────────────────────────────────────────────
// Sparks - Typed Events
// ─────────────────────────────────────────────────────────────────────────────

/** Emitted when a message is echoed */
export const echoed = defineSpark({
  id: 'echoed',
  schema: z.object({
    original: z.any(),
    result: z.any(),
    timestamp: z.number(),
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Echo Block - Echoes input to output with optional transformation
// ─────────────────────────────────────────────────────────────────────────────

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
      let result: unknown;

      // If data is a string and we have prefix/suffix, apply them
      if (typeof data === 'string' && (config.prefix || config.suffix)) {
        const prefix = config.prefix ?? '';
        const suffix = config.suffix ?? '';
        result = `${prefix}${data}${suffix}`;
        log.info(`Echo: ${result}`);
      } else {
        result = data;
        log.info(`Echo: ${JSON.stringify(data)}`);
      }

      // Emit spark when message is echoed
      echoed.emit({
        original: data,
        result,
        timestamp: Date.now(),
      });

      outputs.out.emit(result);
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

onStop(() => {
  log.info('Echo plugin stopping');
});

log.info('Echo plugin loaded');
