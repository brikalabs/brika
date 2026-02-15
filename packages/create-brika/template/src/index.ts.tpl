/**
 * {{pascal}} Plugin for BRIKA
 *
 * {{description}}
 */

import { log, onStop } from '@brika/sdk';

{{#blocks}}
export { {{camel}} } from './blocks/{{id}}';
{{/blocks}}
{{#bricks}}
export { {{camel}}Brick } from './bricks/board';
{{/bricks}}
{{#sparks}}
export { {{camel}}Spark } from './sparks/{{id}}';
{{/sparks}}

// Lifecycle
onStop(() => log.info('{{pascal}} plugin stopping'));
log.info('{{pascal}} plugin loaded');
