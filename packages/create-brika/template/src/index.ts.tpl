/**
 * {{pascal}} Plugin for BRIKA
 *
 * {{description}}
 */

import { log, onStop } from '@brika/sdk';
{{#bricks}}
import { onInit } from '@brika/sdk';
import { {{camel}}Brick } from './bricks/{{id}}.brick';
{{/bricks}}

{{#blocks}}
export { {{camel}} } from './blocks/{{id}}';
{{/blocks}}
{{#sparks}}
export { {{camel}}Spark } from './sparks/{{id}}';
{{/sparks}}
{{#bricks}}

// Push data to the client-rendered brick via its typed data channel.
let count = 0;
let timer: Timer | null = null;

onInit(() => {
  timer = setInterval(() => {
    count++;
    {{camel}}Brick.data.set({ count, active: true });
  }, 1000);
});
{{/bricks}}

// Lifecycle
onStop(() => {
{{#bricks}}
  if (timer) clearInterval(timer);
{{/bricks}}
  log.info('{{pascal}} plugin stopping');
});
log.info('{{pascal}} plugin loaded');
