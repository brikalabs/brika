/**
 * {{pascal}} Plugin for BRIKA
 *
 * {{description}}
 */

import { log, onStop } from '@brika/sdk';
{{#bricks}}
import { setBrickData, onInit } from '@brika/sdk';
{{/bricks}}

{{#blocks}}
export { {{camel}} } from './blocks/{{id}}';
{{/blocks}}
{{#sparks}}
export { {{camel}}Spark } from './sparks/{{id}}';
{{/sparks}}
{{#bricks}}

// Push data to client-rendered bricks
let count = 0;
let timer: Timer | null = null;

onInit(() => {
  timer = setInterval(() => {
    count++;
    setBrickData('{{id}}', { count, active: true });
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
