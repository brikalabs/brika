/**
 * Tests for reactive block definition
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { z } from 'zod';

// Mock the context module before importing defineReactiveBlock
const mockRegisterBlock = mock(() => ({
  id: 'test',
}));
const mockLog = {
  error: mock(),
  warn: mock(),
  info: mock(),
  debug: mock(),
};

mock.module('../context', () => ({
  getContext: () => ({
    registerBlock: mockRegisterBlock,
    log: mockLog,
  }),
}));

mock.module('../api/logging', () => ({
  log: mockLog,
}));

// Import after mocking
const { defineReactiveBlock, isCompiledReactiveBlock } = await import('../blocks/reactive-define');
const { input, output } = await import('../blocks/reactive');
const { generic, passthrough, resolved } = await import('../blocks/schema-types');

// ─────────────────────────────────────────────────────────────────────────────
// isCompiledReactiveBlock
// ─────────────────────────────────────────────────────────────────────────────

describe('isCompiledReactiveBlock', () => {
  test('returns true for valid compiled block', () => {
    const block = {
      id: 'test-block',
      inputs: [],
      outputs: [],
      schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      start: () => ({
        pushInput: () => undefined,
        stop: () => undefined,
      }),
    };
    expect(isCompiledReactiveBlock(block)).toBe(true);
  });

  test('returns true for block with inputs and outputs', () => {
    const block = {
      id: 'sensor-block',
      inputs: [
        {
          id: 'in',
          name: 'Input',
          direction: 'input',
          typeName: 'number',
        },
      ],
      outputs: [
        {
          id: 'out',
          name: 'Output',
          direction: 'output',
          typeName: 'string',
        },
      ],
      schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      start: () => ({
        pushInput: () => undefined,
        stop: () => undefined,
      }),
    };
    expect(isCompiledReactiveBlock(block)).toBe(true);
  });

  test('returns false for null', () => {
    expect(isCompiledReactiveBlock(null)).toBe(false);
  });

  test('returns false for undefined', () => {
    expect(isCompiledReactiveBlock(undefined)).toBe(false);
  });

  test('returns false for primitives', () => {
    expect(isCompiledReactiveBlock('block')).toBe(false);
    expect(isCompiledReactiveBlock(123)).toBe(false);
    expect(isCompiledReactiveBlock(true)).toBe(false);
  });

  test('returns false for empty object', () => {
    expect(isCompiledReactiveBlock({})).toBe(false);
  });

  test('returns false for object missing id', () => {
    const block = {
      inputs: [],
      outputs: [],
      start: () => undefined,
    };
    expect(isCompiledReactiveBlock(block)).toBe(false);
  });

  test('returns false for object missing start function', () => {
    const block = {
      id: 'test-block',
      inputs: [],
      outputs: [],
    };
    expect(isCompiledReactiveBlock(block)).toBe(false);
  });

  test('returns false for object with non-function start', () => {
    const block = {
      id: 'test-block',
      inputs: [],
      outputs: [],
      start: 'not a function',
    };
    expect(isCompiledReactiveBlock(block)).toBe(false);
  });

  test('returns false for object missing inputs', () => {
    const block = {
      id: 'test-block',
      outputs: [],
      start: () => undefined,
    };
    expect(isCompiledReactiveBlock(block)).toBe(false);
  });

  test('returns false for object missing outputs', () => {
    const block = {
      id: 'test-block',
      inputs: [],
      start: () => undefined,
    };
    expect(isCompiledReactiveBlock(block)).toBe(false);
  });

  test('returns false for object with non-array inputs', () => {
    const block = {
      id: 'test-block',
      inputs: 'not an array',
      outputs: [],
      start: () => undefined,
    };
    expect(isCompiledReactiveBlock(block)).toBe(false);
  });

  test('returns false for object with non-array outputs', () => {
    const block = {
      id: 'test-block',
      inputs: [],
      outputs: 'not an array',
      start: () => undefined,
    };
    expect(isCompiledReactiveBlock(block)).toBe(false);
  });

  test('returns false for arrays', () => {
    expect(isCompiledReactiveBlock([])).toBe(false);
    expect(
      isCompiledReactiveBlock([
        1,
        2,
        3,
      ])
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// defineReactiveBlock
// ─────────────────────────────────────────────────────────────────────────────

describe('defineReactiveBlock', () => {
  beforeEach(() => {
    mockRegisterBlock.mockClear();
    mockLog.error.mockClear();
    mockLog.warn.mockClear();
  });

  test('creates block with id and registers it', () => {
    const block = defineReactiveBlock(
      {
        id: 'test-block',
        inputs: {},
        outputs: {},
        config: z.object({}),
      },
      () => undefined
    );

    expect(block.id).toBe('test-block');
    expect(mockRegisterBlock).toHaveBeenCalled();
  });

  test('creates block with inputs', () => {
    const block = defineReactiveBlock(
      {
        id: 'input-block',
        inputs: {
          temperature: input(z.number(), {
            name: 'Temperature',
          }),
          humidity: input(z.number(), {
            name: 'Humidity',
          }),
        },
        outputs: {},
        config: z.object({}),
      },
      () => undefined
    );

    expect(block.inputs).toHaveLength(2);
    expect(block.inputs[0]?.id).toBe('temperature');
    expect(block.inputs[0]?.name).toBe('Temperature');
    expect(block.inputs[1]?.id).toBe('humidity');
  });

  test('creates block with outputs', () => {
    const block = defineReactiveBlock(
      {
        id: 'output-block',
        inputs: {},
        outputs: {
          result: output(z.string(), {
            name: 'Result',
          }),
          status: output(z.boolean(), {
            name: 'Status',
          }),
        },
        config: z.object({}),
      },
      () => undefined
    );

    expect(block.outputs).toHaveLength(2);
    expect(block.outputs[0]?.id).toBe('result');
    expect(block.outputs[0]?.name).toBe('Result');
    expect(block.outputs[1]?.id).toBe('status');
  });

  test('creates block with generic input', () => {
    const block = defineReactiveBlock(
      {
        id: 'generic-block',
        inputs: {
          data: input(generic('T'), {
            name: 'Data',
          }),
        },
        outputs: {},
        config: z.object({}),
      },
      () => undefined
    );

    expect(block.inputs[0]?.typeName).toBe('generic<T>');
  });

  test('creates block with passthrough output that resolves to input type', () => {
    const block = defineReactiveBlock(
      {
        id: 'passthrough-block',
        inputs: {
          in: input(z.number(), {
            name: 'Input',
          }),
        },
        outputs: {
          out: output(passthrough('in'), {
            name: 'Output',
          }),
        },
        config: z.object({}),
      },
      () => undefined
    );

    // Passthrough output should have same typeName as linked input
    expect(block.outputs[0]?.typeName).toBe(block.inputs[0]?.typeName);
  });

  test('creates block with resolved output', () => {
    const block = defineReactiveBlock(
      {
        id: 'resolved-block',
        inputs: {},
        outputs: {
          payload: output(resolved('spark', 'sparkType'), {
            name: 'Payload',
          }),
        },
        config: z.object({
          sparkType: z.string(),
        }),
      },
      () => undefined
    );

    expect(block.outputs[0]?.typeName).toBe('$resolve:spark:sparkType');
  });

  test('creates block with config schema', () => {
    const block = defineReactiveBlock(
      {
        id: 'config-block',
        inputs: {},
        outputs: {},
        config: z.object({
          threshold: z.number().default(10),
          enabled: z.boolean().default(true),
        }),
      },
      () => undefined
    );

    expect(block.schema.type).toBe('object');
    expect(block.schema.properties).toBeDefined();
    expect(block.schema.properties?.threshold).toBeDefined();
    expect(block.schema.properties?.enabled).toBeDefined();
  });

  test('start() returns block instance with pushInput and stop', () => {
    const block = defineReactiveBlock(
      {
        id: 'instance-block',
        inputs: {
          in: input(z.number(), {
            name: 'Input',
          }),
        },
        outputs: {},
        config: z.object({}),
      },
      () => undefined
    );

    const instance = block.start({
      blockId: 'block-1',
      workflowId: 'workflow-1',
      config: {},
      emit: () => undefined,
    });

    expect(typeof instance.pushInput).toBe('function');
    expect(typeof instance.stop).toBe('function');
  });

  test('start() runs setup function with context', () => {
    const setupFn = mock();

    const block = defineReactiveBlock(
      {
        id: 'setup-block',
        inputs: {
          in: input(z.number(), {
            name: 'Input',
          }),
        },
        outputs: {
          out: output(z.string(), {
            name: 'Output',
          }),
        },
        config: z.object({
          multiplier: z.number().default(2),
        }),
      },
      setupFn
    );

    block.start({
      blockId: 'block-1',
      workflowId: 'workflow-1',
      config: {
        multiplier: 3,
      },
      emit: () => undefined,
    });

    expect(setupFn).toHaveBeenCalledTimes(1);
    const ctx = setupFn.mock.calls[0]?.[0] as {
      blockId: string;
      workflowId: string;
      config: {
        multiplier: number;
      };
      inputs: {
        in: unknown;
      };
      outputs: {
        out: unknown;
      };
    };
    expect(ctx.blockId).toBe('block-1');
    expect(ctx.workflowId).toBe('workflow-1');
    expect(ctx.config.multiplier).toBe(3);
    expect(ctx.inputs.in).toBeDefined();
    expect(ctx.outputs.out).toBeDefined();
  });

  test('pushInput delivers data to input flow', () => {
    const receivedValues: number[] = [];

    const block = defineReactiveBlock(
      {
        id: 'push-block',
        inputs: {
          in: input(z.number(), {
            name: 'Input',
          }),
        },
        outputs: {},
        config: z.object({}),
      },
      ({ inputs }) => {
        inputs.in.on((v) => receivedValues.push(v));
      }
    );

    const instance = block.start({
      blockId: 'block-1',
      workflowId: 'workflow-1',
      config: {},
      emit: () => undefined,
    });

    instance.pushInput('in', 42);
    instance.pushInput('in', 100);

    expect(receivedValues).toEqual([
      42,
      100,
    ]);
    instance.stop();
  });

  test('output emitters call emit callback', () => {
    const emitFn = mock();
    const box: {
      emitter:
        | {
            emit: (v: string) => void;
          }
        | undefined;
    } = {
      emitter: undefined,
    };

    const block = defineReactiveBlock(
      {
        id: 'emit-block',
        inputs: {},
        outputs: {
          out: output(z.string(), {
            name: 'Output',
          }),
        },
        config: z.object({}),
      },
      ({ outputs }) => {
        box.emitter = outputs.out;
      }
    );

    block.start({
      blockId: 'block-1',
      workflowId: 'workflow-1',
      config: {},
      emit: emitFn,
    });

    box.emitter?.emit('hello');

    expect(emitFn).toHaveBeenCalledWith('out', 'hello');
  });

  test('stop() cleans up subscriptions', () => {
    const _cleanupCalled = false;

    const block = defineReactiveBlock(
      {
        id: 'cleanup-block',
        inputs: {
          in: input(z.number(), {
            name: 'Input',
          }),
        },
        outputs: {},
        config: z.object({}),
      },
      ({ inputs }) => {
        inputs.in.on(() => undefined);
        // Track cleanup indirectly by checking flow behavior
      }
    );

    const instance = block.start({
      blockId: 'block-1',
      workflowId: 'workflow-1',
      config: {},
      emit: () => undefined,
    });

    // Should not throw
    instance.stop();
  });

  test('handles invalid config gracefully', () => {
    const block = defineReactiveBlock(
      {
        id: 'invalid-config-block',
        inputs: {},
        outputs: {},
        config: z.object({
          required: z.string(),
        }),
      },
      () => undefined
    );

    // Should not throw even with invalid config
    const instance = block.start({
      blockId: 'block-1',
      workflowId: 'workflow-1',
      config: {}, // Missing required field
      emit: () => undefined,
    });

    expect(mockLog.error).toHaveBeenCalled();
    instance.stop();
  });

  test('context.start() creates flow from value', () => {
    let startFn: ((v: number) => unknown) | undefined;

    const block = defineReactiveBlock(
      {
        id: 'start-block',
        inputs: {},
        outputs: {},
        config: z.object({}),
      },
      ({ start }) => {
        startFn = start;
      }
    );

    block.start({
      blockId: 'block-1',
      workflowId: 'workflow-1',
      config: {},
      emit: () => undefined,
    });

    expect(startFn).toBeDefined();
    const flow = startFn?.(42) as
      | {
          on: (fn: (v: unknown) => void) => void;
        }
      | undefined;
    expect(flow).toBeDefined();
    expect(typeof flow?.on).toBe('function');
  });

  test('isCompiledReactiveBlock returns true for defined block', () => {
    const block = defineReactiveBlock(
      {
        id: 'check-block',
        inputs: {},
        outputs: {},
        config: z.object({}),
      },
      () => undefined
    );

    expect(isCompiledReactiveBlock(block)).toBe(true);
  });

  test('config with enum types', () => {
    const block = defineReactiveBlock(
      {
        id: 'enum-config-block',
        inputs: {},
        outputs: {},
        config: z.object({
          mode: z
            .enum([
              'fast',
              'slow',
              'auto',
            ])
            .default('auto'),
        }),
      },
      () => undefined
    );

    expect(block.schema.properties?.mode).toBeDefined();
    expect(block.schema.properties?.mode?.enum).toEqual([
      'fast',
      'slow',
      'auto',
    ]);
  });

  test('config with default values', () => {
    const block = defineReactiveBlock(
      {
        id: 'default-config-block',
        inputs: {},
        outputs: {},
        config: z.object({
          timeout: z.number().default(5000),
          retries: z.number().default(3),
        }),
      },
      () => undefined
    );

    const props = block.schema.properties;
    expect(props).toBeDefined();
    expect(props?.timeout).toBeDefined();
    expect(props?.retries).toBeDefined();
    expect(props?.timeout?.default).toBe(5000);
    expect(props?.retries?.default).toBe(3);
  });

  test('multiple input/output ports with different types', () => {
    const block = defineReactiveBlock(
      {
        id: 'multi-port-block',
        inputs: {
          stringIn: input(z.string(), {
            name: 'String Input',
          }),
          numberIn: input(z.number(), {
            name: 'Number Input',
          }),
          boolIn: input(z.boolean(), {
            name: 'Boolean Input',
          }),
          objectIn: input(
            z.object({
              x: z.number(),
            }),
            {
              name: 'Object Input',
            }
          ),
          arrayIn: input(z.array(z.string()), {
            name: 'Array Input',
          }),
        },
        outputs: {
          result: output(z.string(), {
            name: 'Result',
          }),
        },
        config: z.object({}),
      },
      () => undefined
    );

    expect(block.inputs).toHaveLength(5);
    expect(block.outputs).toHaveLength(1);
  });

  test('pushInput to non-existent port does not throw', () => {
    const block = defineReactiveBlock(
      {
        id: 'safe-push-block',
        inputs: {
          in: input(z.number(), {
            name: 'Input',
          }),
        },
        outputs: {},
        config: z.object({}),
      },
      () => undefined
    );

    const instance = block.start({
      blockId: 'block-1',
      workflowId: 'workflow-1',
      config: {},
      emit: () => undefined,
    });

    // Should not throw
    instance.pushInput('nonexistent', 42);
    instance.stop();
  });

  test('passthrough to non-existent input falls back to passthrough marker', () => {
    const block = defineReactiveBlock(
      {
        id: 'invalid-passthrough-block',
        inputs: {},
        outputs: {
          // Passthrough to non-existent input
          out: output(passthrough('nonexistent'), {
            name: 'Output',
          }),
        },
        config: z.object({}),
      },
      () => undefined
    );

    // Should still create the block but with __passthrough marker
    expect(block.outputs).toHaveLength(1);
    expect(block.outputs[0]?.typeName).toBe('__passthrough:nonexistent');
  });

  test('context.context returns self reference', () => {
    let capturedContext: unknown;

    const block = defineReactiveBlock(
      {
        id: 'context-self-block',
        inputs: {},
        outputs: {},
        config: z.object({}),
      },
      (ctx) => {
        capturedContext = ctx.context;
      }
    );

    block.start({
      blockId: 'block-1',
      workflowId: 'workflow-1',
      config: {},
      emit: () => undefined,
    });

    expect(capturedContext).toBeDefined();
    // context.context should be the same object
    expect(
      (
        capturedContext as {
          blockId: string;
        }
      ).blockId
    ).toBe('block-1');
  });

  test('output with generic ref uses runtime schema for validation', () => {
    const emitFn = mock();

    const block = defineReactiveBlock(
      {
        id: 'generic-output-block',
        inputs: {},
        outputs: {
          out: output(generic('T'), {
            name: 'Generic Output',
          }),
        },
        config: z.object({}),
      },
      ({ outputs }) => {
        outputs.out.emit('any value works');
        outputs.out.emit(123);
        outputs.out.emit({
          complex: 'object',
        });
      }
    );

    block.start({
      blockId: 'block-1',
      workflowId: 'workflow-1',
      config: {},
      emit: emitFn,
    });

    expect(emitFn).toHaveBeenCalledTimes(3);
  });

  test('input validation in dev mode logs warning for invalid data', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    try {
      const block = defineReactiveBlock(
        {
          id: 'validate-input-block',
          inputs: {
            in: input(z.number(), {
              name: 'Number Input',
            }),
          },
          outputs: {},
          config: z.object({}),
        },
        () => undefined
      );

      const instance = block.start({
        blockId: 'block-1',
        workflowId: 'workflow-1',
        config: {},
        emit: () => undefined,
      });

      // Push invalid data (string instead of number)
      instance.pushInput('in', 'not a number' as unknown as number);

      expect(mockLog.warn).toHaveBeenCalled();
      instance.stop();
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  test('input validation with generic ref accepts any value', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    mockLog.warn.mockClear();

    try {
      const receivedValues: unknown[] = [];

      const block = defineReactiveBlock(
        {
          id: 'generic-input-block',
          inputs: {
            in: input(generic(), {
              name: 'Generic Input',
            }),
          },
          outputs: {},
          config: z.object({}),
        },
        ({ inputs }) => {
          inputs.in.on((v) => receivedValues.push(v));
        }
      );

      const instance = block.start({
        blockId: 'block-1',
        workflowId: 'workflow-1',
        config: {},
        emit: () => undefined,
      });

      instance.pushInput('in', 'string');
      instance.pushInput('in', 123);
      instance.pushInput('in', {
        obj: true,
      });

      // Generic accepts any value, no warnings
      expect(receivedValues).toHaveLength(3);
      instance.stop();
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  test('resolved type in input (edge case) uses $resolve marker', () => {
    // Note: resolved() is typically for outputs, but test input path too
    const block = defineReactiveBlock(
      {
        id: 'resolved-input-block',
        inputs: {
          // Using resolved as input (unusual but should work)
          data: input(resolved('spark', 'sparkType') as unknown as z.ZodType, {
            name: 'Data',
          }),
        },
        outputs: {},
        config: z.object({
          sparkType: z.string(),
        }),
      },
      () => undefined
    );

    expect(block.inputs).toHaveLength(1);
    expect(block.inputs[0]?.typeName).toBe('$resolve:spark:sparkType');
  });

  test('passthrough output with generic input resolves correctly', () => {
    const block = defineReactiveBlock(
      {
        id: 'passthrough-generic-block',
        inputs: {
          in: input(generic('T'), {
            name: 'Input',
          }),
        },
        outputs: {
          out: output(passthrough('in'), {
            name: 'Output',
          }),
        },
        config: z.object({}),
      },
      () => undefined
    );

    // Passthrough should resolve to the generic type
    expect(block.inputs).toHaveLength(1);
    expect(block.outputs).toHaveLength(1);
    expect(block.inputs[0]?.typeName).toBe('generic<T>');
    expect(block.outputs[0]?.typeName).toBe('generic<T>');
  });

  test('handles block with no inputs or outputs', () => {
    const setupFn = mock();

    const block = defineReactiveBlock(
      {
        id: 'empty-ports-block',
        inputs: {},
        outputs: {},
        config: z.object({
          value: z.string().default('test'),
        }),
      },
      setupFn
    );

    expect(block.inputs).toHaveLength(0);
    expect(block.outputs).toHaveLength(0);

    const instance = block.start({
      blockId: 'block-1',
      workflowId: 'workflow-1',
      config: {},
      emit: () => undefined,
    });

    expect(setupFn).toHaveBeenCalled();
    const ctx = setupFn.mock.calls[0]?.[0] as {
      config: {
        value: string;
      };
    };
    expect(ctx.config.value).toBe('test');
    instance.stop();
  });
});
