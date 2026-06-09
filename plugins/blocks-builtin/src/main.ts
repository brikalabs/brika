/**
 * Built-in Blocks Plugin
 *
 * Provides core workflow blocks for BRIKA automations.
 * All blocks use the defineBlock API.
 */

import {
  combine,
  defineBlock,
  delay as delayOp,
  input,
  interval,
  log,
  map,
  output,
  subscribeSpark,
  z,
} from '@brika/sdk';

// ─────────────────────────────────────────────────────────────────────────────
// Action Block - Call a tool with arguments
// ─────────────────────────────────────────────────────────────────────────────

// HTTP Response schema
const HttpResponseSchema = z.object({
  status: z.number(),
  statusText: z.string(),
  headers: z.record(z.string(), z.string()),
  body: z.any(),
});

export const httpRequest = defineBlock({
  id: 'http-request',
  inputs: {
    trigger: input(z.generic(), { name: 'Trigger' }),
  },
  outputs: {
    response: output(HttpResponseSchema, { name: 'Response' }),
    error: output(z.object({ message: z.string() }), { name: 'Error' }),
  },
  config: z.object({
    url: z.string().describe('Request URL'),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional().describe('HTTP method'),
    headers: z.record(z.string(), z.string()).optional().describe('Request headers'),
    body: z.string().optional().describe('Request body (for POST/PUT/PATCH)'),
    timeoutMs: z.number().optional().default(30000).describe('Request timeout in milliseconds'),
  }),
  run: ({ inputs, outputs, config }) => {
    inputs.trigger.on(async () => {
      log.debug(`HTTP ${config.method ?? 'GET'} ${config.url}`);
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), config.timeoutMs ?? 30000);
      try {
        const res = await fetch(config.url, {
          method: config.method ?? 'GET',
          headers: config.headers,
          body: config.body,
          signal: ac.signal,
        });

        // Read body as text first, then try to parse as JSON
        const text = await res.text();
        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }

        outputs.response.emit({
          status: res.status,
          statusText: res.statusText,
          headers: Object.fromEntries(res.headers.entries()),
          body,
        });
      } catch (err) {
        log.error(`HTTP request failed: ${err instanceof Error ? err.message : String(err)}`);
        outputs.error.emit({ message: String(err) });
      } finally {
        clearTimeout(timer);
      }
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Condition Block - Branch based on a condition
// ─────────────────────────────────────────────────────────────────────────────

export const condition = defineBlock({
  id: 'condition',
  inputs: {
    in: input(z.generic(), { name: 'Input' }),
  },
  outputs: {
    pass: output(z.passthrough('in'), { name: 'Then' }),
    fail: output(z.passthrough('in'), { name: 'Else' }),
  },
  config: z.object({
    field: z.string().describe('Field path to check (e.g., "value", "data.status")'),
    operator: z
      .enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'exists'])
      .describe('Comparison operator'),
    value: z.any().optional().describe('Value to compare against'),
  }),
  run: ({ inputs, outputs, config }) => {
    inputs.in.on((data) => {
      const fieldValue = getFieldValue(data, config.field);
      const result = evaluate(fieldValue, config.operator, config.value);
      log.debug(
        `Condition: ${config.field} ${config.operator} ${JSON.stringify(config.value)} = ${result}`
      );

      if (result) {
        outputs.pass.emit(data);
      } else {
        outputs.fail.emit(data);
      }
    });
  },
});

function getFieldValue(data: unknown, path: string): unknown {
  if (data === null || data === undefined) {
    return undefined;
  }
  const parts = path.split('.');
  let current: unknown = data;
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function evaluate(fieldValue: unknown, operator: string, compareValue: unknown): boolean {
  switch (operator) {
    case 'eq':
      return fieldValue === compareValue;
    case 'neq':
      return fieldValue !== compareValue;
    case 'gt':
      return Number(fieldValue) > Number(compareValue);
    case 'gte':
      return Number(fieldValue) >= Number(compareValue);
    case 'lt':
      return Number(fieldValue) < Number(compareValue);
    case 'lte':
      return Number(fieldValue) <= Number(compareValue);
    case 'contains':
      return String(fieldValue).includes(String(compareValue));
    case 'exists':
      return fieldValue !== undefined && fieldValue !== null;
    default:
      return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Switch Block - Multi-way branch
// ─────────────────────────────────────────────────────────────────────────────

export const switchBlock = defineBlock({
  id: 'switch',
  inputs: {
    in: input(z.generic(), { name: 'Input' }),
  },
  outputs: {
    // `case` is a template: the editor renders one output per configured case
    // (`case-0`, `case-1`, ...). The block emits to them with the raw `emit`.
    case: output(z.passthrough('in'), { name: 'Case', repeat: 'cases' }),
    default: output(z.passthrough('in'), { name: 'Default' }),
  },
  config: z.object({
    field: z.string().describe('Field path to check'),
    cases: z
      .array(z.object({ value: z.string(), id: z.string() }))
      .default([])
      .describe('Values to match, in order; each adds its own output port'),
  }),
  run: ({ inputs, config, emit }) => {
    inputs.in.on((data) => {
      const value = String(getFieldValue(data, config.field));
      const index = (config.cases ?? []).findIndex((c) => c.value === value);
      const target = index >= 0 ? `case-${index}` : 'default';
      log.debug(`Switch value: ${value} -> ${target}`);
      emit(target, data);
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Delay Block - Wait for a duration
// ─────────────────────────────────────────────────────────────────────────────

export const delay = defineBlock({
  id: 'delay',
  inputs: {
    in: input(z.generic(), { name: 'Input' }),
  },
  outputs: {
    out: output(z.passthrough('in'), { name: 'Output' }),
  },
  config: z.object({
    duration: z.duration(undefined, 'Duration to wait'),
  }),
  run: ({ inputs, outputs, config }) => {
    log.debug(`Delay configured: ${config.duration}ms`);

    // Use delay operator to wait before emitting
    inputs.in.pipe(delayOp(config.duration)).to(outputs.out);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Emit Block - Emit an event
// ─────────────────────────────────────────────────────────────────────────────

export const clock = defineBlock({
  id: 'clock',
  inputs: {},
  outputs: {
    tick: output(z.object({ count: z.number(), ts: z.number() }), { name: 'Tick' }),
  },
  config: z.object({
    interval: z.duration(undefined, 'Interval between ticks'),
  }),
  run: ({ outputs, config, start }) => {
    start(interval(config.interval))
      .pipe(
        map((count) => {
          return { count: count + 1, ts: Date.now() };
        })
      )
      .to(outputs.tick);
    log.info(`Clock started with interval: ${config.interval}ms`);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Transform Block - Transform data
// ─────────────────────────────────────────────────────────────────────────────

export const transform = defineBlock({
  id: 'transform',
  inputs: {
    in: input(z.generic(), { name: 'Input' }),
  },
  outputs: {
    out: output(z.any(), { name: 'Output' }),
  },
  config: z.object({
    field: z.string().optional().describe('Field to extract (empty for passthrough)'),
    template: z.record(z.string(), z.string()).optional().describe('Template to build output'),
  }),
  run: ({ inputs, outputs, config }) => {
    inputs.in
      .pipe(
        map((data) => {
          // If template is provided, build object
          if (config.template) {
            const result: Record<string, unknown> = {};
            for (const [key, path] of Object.entries(config.template)) {
              result[key] = getFieldValue(data, path);
            }
            log.debug(`Transformed with template: ${JSON.stringify(result)}`);
            return result;
          }

          // If field is provided, extract it
          if (config.field) {
            const value = getFieldValue(data, config.field);
            log.debug(`Extracted field ${config.field}: ${JSON.stringify(value)}`);
            return value;
          }

          // Passthrough
          return data;
        })
      )
      .to(outputs.out);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Log Block - Log a message
// ─────────────────────────────────────────────────────────────────────────────

export const logBlock = defineBlock({
  id: 'log',
  inputs: {
    in: input(z.generic(), { name: 'Input' }),
  },
  outputs: {
    out: output(z.passthrough('in'), { name: 'Output' }),
  },
  config: z.object({
    message: z
      .string()
      .optional()
      .describe('Message template with {{inputs.in.field}} expressions'),
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info').describe('Log level'),
  }),
  run: ({ inputs, outputs, config }) => {
    inputs.in.on((data) => {
      // `config.message` is resolved by the SDK runtime: any `{{ inputs.in.field }}`
      // expression is already substituted by the time we read it here.
      const message = config.message;
      log[config.level](message || JSON.stringify(data));
      outputs.out.emit(data);
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Merge Block - Wait for multiple inputs (combine)
// ─────────────────────────────────────────────────────────────────────────────

export const merge = defineBlock({
  id: 'merge',
  inputs: {
    a: input(z.generic(), { name: 'Input A' }),
    b: input(z.generic(), { name: 'Input B' }),
  },
  outputs: {
    out: output(
      z.object({
        a: z.generic(),
        b: z.generic(),
      }),
      { name: 'Output' }
    ),
  },
  config: z.object({}),
  run: ({ inputs, outputs }) => {
    // Combine waits for both inputs to have values
    combine(inputs.a, inputs.b)
      .pipe(
        map(([a, b]) => {
          log.debug('Merged inputs');
          return { a, b };
        })
      )
      .to(outputs.out);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Split Block - Send to multiple outputs
// ─────────────────────────────────────────────────────────────────────────────

export const split = defineBlock({
  id: 'split',
  inputs: {
    in: input(z.generic(), { name: 'Input' }),
  },
  outputs: {
    a: output(z.passthrough('in'), { name: 'Branch A' }),
    b: output(z.passthrough('in'), { name: 'Branch B' }),
  },
  config: z.object({}),
  run: ({ inputs, outputs }) => {
    inputs.in.on((data) => {
      log.debug('Splitting to parallel branches');
      outputs.a.emit(data);
      outputs.b.emit(data);
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// End Block - Terminal block
// ─────────────────────────────────────────────────────────────────────────────

export const end = defineBlock({
  id: 'end',
  inputs: {
    in: input(z.generic(), { name: 'Input' }),
  },
  outputs: {},
  config: z.object({
    status: z.enum(['success', 'failure']).default('success').describe('End status'),
  }),
  run: ({ inputs, config }) => {
    inputs.in.on((data) => {
      log.info(`Workflow ended with status: ${config.status}`);
      log.debug(`Final data: ${JSON.stringify(data)}`);
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Spark Receiver Block - Receive typed events
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Spark Receiver Block
 *
 * This is a trigger block that receives typed spark events from the hub.
 * The hub subscribes to the configured spark type and emits data directly
 * to the output port via blockEmit IPC.
 *
 * Configuration:
 * - sparkType: Full spark type to listen for (e.g., "timer:timer-started")
 *
 * The output type is resolved dynamically from the selected spark's schema
 * using the z.resolved() type marker.
 */
export const sparkReceiver = defineBlock({
  id: 'spark-receiver',
  inputs: {},
  outputs: {
    // Output type is resolved from spark's schema via config.sparkType
    out: output(z.resolved('spark', 'sparkType'), { name: 'Payload' }),
  },
  config: z.object({
    sparkType: z.sparkType('Spark type to listen for'),
  }),
  run: ({ config, outputs, start }) => {
    if (!config.sparkType) {
      log.warn('No spark type configured');
      return;
    }

    log.info(`Subscribing to spark: ${config.sparkType}`);

    // Subscribe to sparks and emit payload to output
    // Cleanup is automatic when block stops (via flow system)
    start(subscribeSpark(config.sparkType))
      .pipe(map((event) => event.payload))
      .to(outputs.out);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Button Block - Manual trigger (custom node view with a button)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Button: a manual trigger. The node-body view renders a button that POSTs to
 * `/api/workflows/inject` for this block's `press` port, so a click fires the
 * workflow (the inject opens a recorded run). The `press` input also accepts a
 * wired upstream signal, so the same block doubles as a programmable trigger.
 */
export const button = defineBlock({
  id: 'button',
  inputs: {
    press: input(z.generic(), { name: 'Press' }),
  },
  outputs: {
    out: output(z.object({ ts: z.number() }), { name: 'Out' }),
  },
  config: z.object({
    label: z.string().default('Trigger').describe('Button label shown on the node'),
  }),
  run: ({ inputs, outputs }) => {
    inputs.press.on(() => {
      outputs.out.emit({ ts: Date.now() });
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Text Block - Display text / annotate the canvas (custom node view)
// ─────────────────────────────────────────────────────────────────────────────

export const text = defineBlock({
  id: 'text',
  inputs: {
    in: input(z.generic(), { name: 'Input' }),
  },
  outputs: {
    out: output(z.passthrough('in'), { name: 'Output' }),
  },
  config: z.object({
    content: z.string().optional().describe('Markdown text to display on the node'),
  }),
  run: ({ inputs, outputs }) => {
    // Pure passthrough: the value is displayed by the node view, not transformed.
    inputs.in.on((data) => outputs.out.emit(data));
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Image Block - Display an image (custom node view)
// ─────────────────────────────────────────────────────────────────────────────

export const image = defineBlock({
  id: 'image',
  inputs: {
    in: input(z.generic(), { name: 'Input' }),
  },
  outputs: {
    out: output(z.passthrough('in'), { name: 'Output' }),
  },
  config: z.object({
    url: z.string().optional().describe('Image URL to display'),
    alt: z.string().optional().describe('Alternative text'),
  }),
  run: ({ inputs, outputs }) => {
    inputs.in.on((data) => outputs.out.emit(data));
  },
});

// ─────────────────────────────────────────────────────────────────────────────

log.info('Built-in blocks plugin loaded');
