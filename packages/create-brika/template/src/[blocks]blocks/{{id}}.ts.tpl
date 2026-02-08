/**
 * {{pascal}} Block
 */

import { defineReactiveBlock, input, log, output, z } from '@brika/sdk';

export const {{camel}} = defineReactiveBlock(
  {
    id: '{{id}}',
    inputs: {
      in: input(z.generic(), { name: 'Input' }),
    },
    outputs: {
      out: output(z.passthrough('in'), { name: 'Output' }),
    },
    config: z.object({
      enabled: z.boolean().default(true).describe('Enable processing'),
    }),
  },
  ({ inputs, outputs, config }) => {
    inputs.in.on((data) => {
      if (!config.enabled) {
        log.debug('Processing disabled, skipping');
        return;
      }
      log.info('Processing data', { data });
      outputs.out.emit(data);
    });
  }
);
