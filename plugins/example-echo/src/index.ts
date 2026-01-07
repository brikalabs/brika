/**
 * Echo Plugin - Example plugin demonstrating reactive blocks
 */

import { defineReactiveBlock, input, log, onStop, output, z } from '@brika/sdk';

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
  ({ inputs, outputs, config, log }) => {
    inputs.in.on((data) => {
      // If data is a string and we have prefix/suffix, apply them
      if (typeof data === 'string' && (config.prefix || config.suffix)) {
        const prefix = config.prefix ?? '';
        const suffix = config.suffix ?? '';
        const result = `${prefix}${data}${suffix}`;
        log('info', `Echo: ${result}`);
        outputs.out.emit(result);
      } else {
        log('info', `Echo: ${JSON.stringify(data)}`);
        outputs.out.emit(data);
      }
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

onStop(() => {
  log('info', 'Echo plugin stopping');
});

log('info', 'Echo plugin loaded');
