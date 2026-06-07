/**
 * {{pascal}} Block
 */

import { defineBlock, input, log, output, z } from '@brika/sdk';

export const {{camel}} = defineBlock({
  id: '{{id}}',
  meta: { name: '{{pascal}}', category: 'transform' },
  inputs: { in: input(z.generic()) },
  outputs: { out: output(z.passthrough('in')) },
  config: z.object({
    enabled: z.boolean().default(true).describe('Enable processing'),
  }),
  run({ inputs, outputs, config }) {
    inputs.in.on((data) => {
      if (!config.enabled) {
        log.debug('Processing disabled, skipping');
        return;
      }
      log.info('Processing data', { data });
      outputs.out.emit(data);
    });
  },
});
