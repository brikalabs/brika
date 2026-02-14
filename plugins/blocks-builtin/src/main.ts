/**
 * Built-in Blocks Plugin
 *
 * Provides core workflow blocks for BRIKA automations.
 * All blocks use the reactive defineReactiveBlock API.
 */

import {
  combine,
  defineReactiveBlock,
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

export const httpRequest = defineReactiveBlock(
  {
    id: 'http-request',
    name: 'HTTP Request',
    description: 'Make HTTP requests to external APIs',
    category: 'action',
    icon: 'globe',
    color: '#3b82f6',
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
    }),
  },
  ({ inputs, outputs, config }) => {
    inputs.trigger.on(async () => {
      log.debug(`HTTP ${config.method ?? 'GET'} ${config.url}`);
      try {
        const res = await fetch(config.url, {
          method: config.method ?? 'GET',
          headers: config.headers,
          body: config.body,
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
      }
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Condition Block - Branch based on a condition
// ─────────────────────────────────────────────────────────────────────────────

export const condition = defineReactiveBlock(
  {
    id: 'condition',
    name: 'Condition',
    description: 'Branch based on a condition',
    category: 'flow',
    icon: 'git-branch',
    color: '#f59e0b',
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
  },
  ({ inputs, outputs, config }) => {
    inputs.in.on((data) => {
      const fieldValue = getFieldValue(data, config.field);
      const result = evaluate(fieldValue, config.operator, config.value);
      log.debug(`Condition: ${config.field} ${config.operator} ${JSON.stringify(config.value)} = ${result}`);

      if (result) {
        outputs.pass.emit(data);
      } else {
        outputs.fail.emit(data);
      }
    });
  }
);

function getFieldValue(data: unknown, path: string): unknown {
  if (data === null || data === undefined) return undefined;
  const parts = path.split('.');
  let current: unknown = data;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
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

export const switchBlock = defineReactiveBlock(
  {
    id: 'switch',
    name: 'Switch',
    description: 'Multi-way branch based on a value',
    category: 'flow',
    icon: 'shuffle',
    color: '#8b5cf6',
    inputs: {
      in: input(z.generic(), { name: 'Input' }),
    },
    outputs: {
      case1: output(z.passthrough('in'), { name: 'Case 1' }),
      case2: output(z.passthrough('in'), { name: 'Case 2' }),
      case3: output(z.passthrough('in'), { name: 'Case 3' }),
      default: output(z.passthrough('in'), { name: 'Default' }),
    },
    config: z.object({
      field: z.string().describe('Field path to check'),
      case1: z.any().optional().describe('Value for case 1'),
      case2: z.any().optional().describe('Value for case 2'),
      case3: z.any().optional().describe('Value for case 3'),
    }),
  },
  ({ inputs, outputs, config }) => {
    inputs.in.on((data) => {
      const value = getFieldValue(data, config.field);
      log.debug(`Switch value: ${JSON.stringify(value)}`);

      if (value === config.case1) {
        outputs.case1.emit(data);
      } else if (value === config.case2) {
        outputs.case2.emit(data);
      } else if (value === config.case3) {
        outputs.case3.emit(data);
      } else {
        outputs.default.emit(data);
      }
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Delay Block - Wait for a duration
// ─────────────────────────────────────────────────────────────────────────────

export const delay = defineReactiveBlock(
  {
    id: 'delay',
    name: 'Delay',
    description: 'Wait for a duration before continuing',
    category: 'flow',
    icon: 'timer',
    color: '#6b7280',
    inputs: {
      in: input(z.generic(), { name: 'Input' }),
    },
    outputs: {
      out: output(z.passthrough('in'), { name: 'Output' }),
    },
    config: z.object({
      duration: z.duration(undefined, 'Duration to wait'),
    }),
  },
  ({ inputs, outputs, config }) => {
    log.debug(`Delay configured: ${config.duration}ms`);

    // Use delay operator to wait before emitting
    inputs.in.pipe(delayOp(config.duration)).to(outputs.out);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Emit Block - Emit an event
// ─────────────────────────────────────────────────────────────────────────────

export const clock = defineReactiveBlock(
  {
    id: 'clock',
    name: 'Clock',
    description: 'Emit periodic ticks on an interval',
    category: 'trigger',
    icon: 'clock',
    color: '#22c55e',
    inputs: {},
    outputs: {
      tick: output(z.object({ count: z.number(), ts: z.number() }), { name: 'Tick' }),
    },
    config: z.object({
      interval: z.duration(undefined, 'Interval between ticks'),
    }),
  },
  ({ outputs, config, start }) => {
    start(interval(config.interval))
      .pipe(
        map((count) => {
          return { count: count + 1, ts: Date.now() };
        })
      )
      .to(outputs.tick);
    log.info(`Clock started with interval: ${config.interval}ms`);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Transform Block - Transform data
// ─────────────────────────────────────────────────────────────────────────────

export const transform = defineReactiveBlock(
  {
    id: 'transform',
    name: 'Transform',
    description: 'Transform or extract data',
    category: 'transform',
    icon: 'edit',
    color: '#ec4899',
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
  },
  ({ inputs, outputs, config }) => {
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
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Expression Interpolation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Interpolate {{inputs.portId.field}} expressions in a template string.
 *
 * @param template Template string with {{...}} placeholders
 * @param context Object containing available data: { inputs: { portId: data }, config: {...} }
 */
function interpolate(
  template: string,
  context: { inputs: Record<string, unknown>; config: Record<string, unknown> }
): string {
  return template.replaceAll(/\{\{([^{}]+)}}/g, (_, expr: string) => {
    const path = expr.trim().split('.');
    let value: unknown = context;

    for (const key of path) {
      if (value === null || value === undefined) return '';
      if (typeof value !== 'object') return '';
      value = (value as Record<string, unknown>)[key];
    }

    if (value === undefined || value === null) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Log Block - Log a message
// ─────────────────────────────────────────────────────────────────────────────

export const logBlock = defineReactiveBlock(
  {
    id: 'log',
    name: 'Log',
    description: 'Log a message with variable interpolation',
    category: 'action',
    icon: 'file-text',
    color: '#78716c',
    inputs: {
      in: input(z.generic(), { name: 'Input' }),
    },
    outputs: {
      out: output(z.passthrough('in'), { name: 'Output' }),
    },
    config: z.object({
      message: z.string().optional().describe('Message template with {{inputs.in.field}} expressions'),
      level: z.enum(['debug', 'info', 'warn', 'error']).default('info').describe('Log level'),
    }),
  },
  ({ inputs, outputs, config }) => {
    inputs.in.on((data) => {
      const c = {
        inputs: { in: data },
        config,
      };

      const message = config.message
        ? interpolate(config.message, c)
        : JSON.stringify(data);

      log[config.level](message);
      outputs.out.emit(data);
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Merge Block - Wait for multiple inputs (combine)
// ─────────────────────────────────────────────────────────────────────────────

export const merge = defineReactiveBlock(
  {
    id: 'merge',
    name: 'Merge',
    description: 'Wait for both inputs before continuing',
    category: 'flow',
    icon: 'git-merge',
    color: '#06b6d4',
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
  },
  ({ inputs, outputs }) => {
    // Combine waits for both inputs to have values
    combine(inputs.a, inputs.b)
      .pipe(
        map(([a, b]) => {
          log.debug('Merged inputs');
          return { a, b };
        })
      )
      .to(outputs.out);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Split Block - Send to multiple outputs
// ─────────────────────────────────────────────────────────────────────────────

export const split = defineReactiveBlock(
  {
    id: 'split',
    name: 'Split',
    description: 'Send data to multiple branches',
    category: 'flow',
    icon: 'git-fork',
    color: '#a855f7',
    inputs: {
      in: input(z.generic(), { name: 'Input' }),
    },
    outputs: {
      a: output(z.passthrough('in'), { name: 'Branch A' }),
      b: output(z.passthrough('in'), { name: 'Branch B' }),
    },
    config: z.object({}),
  },
  ({ inputs, outputs }) => {
    inputs.in.on((data) => {
      log.debug('Splitting to parallel branches');
      outputs.a.emit(data);
      outputs.b.emit(data);
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// End Block - Terminal block
// ─────────────────────────────────────────────────────────────────────────────

export const end = defineReactiveBlock(
  {
    id: 'end',
    name: 'End',
    description: 'End the workflow branch',
    category: 'flow',
    icon: 'square',
    color: '#dc2626',
    inputs: {
      in: input(z.generic(), { name: 'Input' }),
    },
    outputs: {},
    config: z.object({
      status: z.enum(['success', 'failure']).default('success').describe('End status'),
    }),
  },
  ({ inputs, config }) => {
    inputs.in.on((data) => {
      log.info(`Workflow ended with status: ${config.status}`);
      log.debug(`Final data: ${JSON.stringify(data)}`);
    });
  }
);

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
export const sparkReceiver = defineReactiveBlock(
  {
    id: 'spark-receiver',
    name: 'Spark Receiver',
    description: 'Receives typed spark events',
    category: 'trigger',
    icon: 'zap',
    color: '#f59e0b',
    inputs: {},
    outputs: {
      // Output type is resolved from spark's schema via config.sparkType
      out: output(z.resolved('spark', 'sparkType'), { name: 'Payload' }),
    },
    config: z.object({
      sparkType: z.sparkType('Spark type to listen for'),
    }),
  },
  ({ config, outputs, start }) => {
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
  }
);

// ─────────────────────────────────────────────────────────────────────────────

log.info('Built-in blocks plugin loaded');
