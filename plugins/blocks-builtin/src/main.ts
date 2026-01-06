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
  log,
  map,
  output,
  type Serializable,
  z,
} from '@brika/sdk';

// ─────────────────────────────────────────────────────────────────────────────
// Action Block - Call a tool with arguments
// ─────────────────────────────────────────────────────────────────────────────

export const action = defineReactiveBlock(
  {
    id: 'action',
    name: 'Action',
    description: 'Call a tool with arguments',
    category: 'action',
    icon: 'zap',
    color: '#3b82f6',
    inputs: {
      in: input(z.unknown(), { name: 'Input' }),
    },
    outputs: {
      out: output(z.unknown(), { name: 'Output' }),
    },
    config: z.object({
      tool: z.string().describe('Tool ID to call'),
      args: z.record(z.string(), z.unknown()).optional().describe('Arguments to pass'),
    }),
  },
  ({ inputs, outputs, config, callTool, log }) => {
    inputs.in.on(async (data) => {
      log('debug', `Calling tool: ${config.tool}`);
      try {
        const args = { ...config.args, input: data } as Record<string, Serializable>;
        const result = await callTool(config.tool, args);
        outputs.out.emit(result);
      } catch (err) {
        log('error', `Tool call failed: ${err}`);
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
      in: input(z.unknown(), { name: 'Input' }),
    },
    outputs: {
      then: output(z.unknown(), { name: 'Then' }),
      else: output(z.unknown(), { name: 'Else' }),
    },
    config: z.object({
      field: z.string().describe('Field path to check (e.g., "value", "data.status")'),
      operator: z
        .enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'exists'])
        .describe('Comparison operator'),
      value: z.unknown().optional().describe('Value to compare against'),
    }),
  },
  ({ inputs, outputs, config, log }) => {
    inputs.in.on((data) => {
      const fieldValue = getFieldValue(data, config.field);
      const result = evaluate(fieldValue, config.operator, config.value);
      log('debug', `Condition: ${config.field} ${config.operator} ${config.value} = ${result}`);

      if (result) {
        outputs.then.emit(data);
      } else {
        outputs.else.emit(data);
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
      in: input(z.unknown(), { name: 'Input' }),
    },
    outputs: {
      case1: output(z.unknown(), { name: 'Case 1' }),
      case2: output(z.unknown(), { name: 'Case 2' }),
      case3: output(z.unknown(), { name: 'Case 3' }),
      default: output(z.unknown(), { name: 'Default' }),
    },
    config: z.object({
      field: z.string().describe('Field path to check'),
      case1: z.unknown().optional().describe('Value for case 1'),
      case2: z.unknown().optional().describe('Value for case 2'),
      case3: z.unknown().optional().describe('Value for case 3'),
    }),
  },
  ({ inputs, outputs, config, log }) => {
    inputs.in.on((data) => {
      const value = getFieldValue(data, config.field);
      log('debug', `Switch value: ${JSON.stringify(value)}`);

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
      in: input(z.unknown(), { name: 'Input' }),
    },
    outputs: {
      out: output(z.unknown(), { name: 'Output' }),
    },
    config: z.object({
      duration: z.number().describe('Duration in milliseconds'),
    }),
  },
  ({ inputs, outputs, config, log }) => {
    log('debug', `Delay configured: ${config.duration}ms`);

    // Use delay operator to wait before emitting
    inputs.in.pipe(delayOp(config.duration)).to(outputs.out);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Emit Block - Emit an event
// ─────────────────────────────────────────────────────────────────────────────

export const emitEvent = defineReactiveBlock(
  {
    id: 'emit',
    name: 'Emit Event',
    description: 'Emit an event to the event bus',
    category: 'action',
    icon: 'send',
    color: '#10b981',
    inputs: {
      in: input(z.unknown(), { name: 'Input' }),
    },
    outputs: {
      out: output(
        z.object({
          event: z.string(),
          payload: z.unknown(),
        }),
        { name: 'Output' }
      ),
    },
    config: z.object({
      event: z.string().describe('Event type to emit'),
    }),
  },
  ({ inputs, outputs, config, log }) => {
    inputs.in.on((data) => {
      log('debug', `Emitting event: ${config.event}`);
      // Note: actual event emission to bus would be handled by hub
      outputs.out.emit({ event: config.event, payload: data });
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Transform Block - Transform data
// ─────────────────────────────────────────────────────────────────────────────

export const transform = defineReactiveBlock(
  {
    id: 'set',
    name: 'Transform',
    description: 'Transform or extract data',
    category: 'transform',
    icon: 'edit',
    color: '#ec4899',
    inputs: {
      in: input(z.unknown(), { name: 'Input' }),
    },
    outputs: {
      out: output(z.unknown(), { name: 'Output' }),
    },
    config: z.object({
      field: z.string().optional().describe('Field to extract (empty for passthrough)'),
      template: z.record(z.string(), z.string()).optional().describe('Template to build output'),
    }),
  },
  ({ inputs, outputs, config, log }) => {
    inputs.in
      .pipe(
        map((data) => {
          // If template is provided, build object
          if (config.template) {
            const result: Record<string, unknown> = {};
            for (const [key, path] of Object.entries(config.template)) {
              result[key] = getFieldValue(data, path);
            }
            log('debug', `Transformed with template: ${JSON.stringify(result)}`);
            return result;
          }

          // If field is provided, extract it
          if (config.field) {
            const value = getFieldValue(data, config.field);
            log('debug', `Extracted field ${config.field}: ${JSON.stringify(value)}`);
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
// Log Block - Log a message
// ─────────────────────────────────────────────────────────────────────────────

export const logBlock = defineReactiveBlock(
  {
    id: 'log',
    name: 'Log',
    description: 'Log a message',
    category: 'action',
    icon: 'file-text',
    color: '#78716c',
    inputs: {
      in: input(z.unknown(), { name: 'Input' }),
    },
    outputs: {
      out: output(z.unknown(), { name: 'Output' }),
    },
    config: z.object({
      message: z.string().optional().describe('Custom message (uses data if empty)'),
      level: z.enum(['debug', 'info', 'warn', 'error']).default('info').describe('Log level'),
    }),
  },
  ({ inputs, outputs, config, log }) => {
    inputs.in.on((data) => {
      const message = config.message ?? JSON.stringify(data);
      log(config.level, message);
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
      a: input(z.unknown(), { name: 'Input A' }),
      b: input(z.unknown(), { name: 'Input B' }),
    },
    outputs: {
      out: output(
        z.object({
          a: z.unknown(),
          b: z.unknown(),
        }),
        { name: 'Output' }
      ),
    },
    config: z.object({}),
  },
  ({ inputs, outputs, log }) => {
    // Combine waits for both inputs to have values
    combine(inputs.a, inputs.b)
      .pipe(
        map(([a, b]) => {
          log('debug', 'Merged inputs');
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
    id: 'parallel',
    name: 'Split',
    description: 'Send data to multiple branches',
    category: 'flow',
    icon: 'git-fork',
    color: '#a855f7',
    inputs: {
      in: input(z.unknown(), { name: 'Input' }),
    },
    outputs: {
      a: output(z.unknown(), { name: 'Branch A' }),
      b: output(z.unknown(), { name: 'Branch B' }),
    },
    config: z.object({}),
  },
  ({ inputs, outputs, log }) => {
    inputs.in.on((data) => {
      log('debug', 'Splitting to parallel branches');
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
      in: input(z.unknown(), { name: 'Input' }),
    },
    outputs: {},
    config: z.object({
      status: z.enum(['success', 'failure']).default('success').describe('End status'),
    }),
  },
  ({ inputs, config, log }) => {
    inputs.in.on((data) => {
      log('info', `Workflow ended with status: ${config.status}`);
      log('debug', `Final data: ${JSON.stringify(data)}`);
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────

log('info', 'Built-in blocks plugin loaded');
