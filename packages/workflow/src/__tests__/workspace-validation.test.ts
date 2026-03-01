/**
 * Tests for Workspace Validation
 * Testing workflow validation including block types, connections, and port references
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { z } from 'zod';
import type { BlockTypeDefinition, Workflow } from '../types';
import type { BlockTypeRegistry, ValidationError } from '../validation/workspace';
import { validateWorkspace } from '../validation/workspace';

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const createSimpleWorkflow = (): Workflow => ({
  version: '1',
  workspace: {
    id: 'test-workflow',
    name: 'Test Workflow',
    enabled: true,
  },
  plugins: {},
  blocks: [],
});

const createBlockType = (
  id: string,
  inputs: Array<{
    id: string;
    schema: z.ZodType;
  }> = [],
  outputs: Array<{
    id: string;
    schema: z.ZodType;
  }> = []
): BlockTypeDefinition => ({
  id,
  type: `plugin:${id}`,
  nameKey: `blocks.${id}`,
  descriptionKey: `blocks.${id}.description`,
  category: 'utility',
  icon: 'box',
  color: '#888888',
  inputs: inputs.map((inp) => ({
    ...inp,
    direction: 'input' as const,
    nameKey: `ports.${inp.id}`,
  })),
  outputs: outputs.map((out) => ({
    ...out,
    direction: 'output' as const,
    nameKey: `ports.${out.id}`,
  })),
  configSchema: z.object({}),
});

const createMockRegistry = (blockTypes: BlockTypeDefinition[]): BlockTypeRegistry => {
  const map = new Map(
    blockTypes.map((bt) => [
      bt.type,
      bt,
    ])
  );
  return {
    get: (type: string) => map.get(type),
  };
};

const stringSchema = z.string();
const numberSchema = z.number();
const _objectSchema = z.object({
  value: z.number(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests - Valid Workflows
// ─────────────────────────────────────────────────────────────────────────────

describe('Workspace Validation - Valid Workflows', () => {
  test('should validate empty workflow successfully', () => {
    const workflow = createSimpleWorkflow();
    const registry = createMockRegistry([]);

    const result = validateWorkspace(workflow, registry);

    expect(result.valid).toBeTrue();
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  test('should validate workflow with single block and no connections', () => {
    const blockType = createBlockType(
      'timer',
      [],
      [
        {
          id: 'tick',
          schema: numberSchema,
        },
      ]
    );
    const registry = createMockRegistry([
      blockType,
    ]);

    const workflow: Workflow = {
      ...createSimpleWorkflow(),
      blocks: [
        {
          id: 'timer-1',
          type: 'plugin:timer',
          config: {},
          inputs: {},
          outputs: {},
        },
      ],
    };

    const result = validateWorkspace(workflow, registry);

    expect(result.valid).toBeTrue();
    expect(result.errors).toHaveLength(0);
  });

  test('should validate workflow with valid connection', () => {
    const timerType = createBlockType(
      'timer',
      [],
      [
        {
          id: 'tick',
          schema: numberSchema,
        },
      ]
    );
    const loggerType = createBlockType(
      'logger',
      [
        {
          id: 'input',
          schema: numberSchema,
        },
      ],
      []
    );
    const registry = createMockRegistry([
      timerType,
      loggerType,
    ]);

    const workflow: Workflow = {
      ...createSimpleWorkflow(),
      blocks: [
        {
          id: 'timer-1',
          type: 'plugin:timer',
          config: {},
          inputs: {},
          outputs: {
            tick: 'logger-1:input',
          },
        },
        {
          id: 'logger-1',
          type: 'plugin:logger',
          config: {},
          inputs: {
            input: 'timer-1:tick',
          },
          outputs: {},
        },
      ],
    };

    const result = validateWorkspace(workflow, registry);

    expect(result.valid).toBeTrue();
    expect(result.errors).toHaveLength(0);
  });

  test('should validate workflow with multiple blocks and connections', () => {
    const timerType = createBlockType(
      'timer',
      [],
      [
        {
          id: 'tick',
          schema: numberSchema,
        },
      ]
    );
    const filterType = createBlockType(
      'filter',
      [
        {
          id: 'in',
          schema: numberSchema,
        },
      ],
      [
        {
          id: 'out',
          schema: numberSchema,
        },
      ]
    );
    const loggerType = createBlockType(
      'logger',
      [
        {
          id: 'input',
          schema: numberSchema,
        },
      ],
      []
    );
    const registry = createMockRegistry([
      timerType,
      filterType,
      loggerType,
    ]);

    const workflow: Workflow = {
      ...createSimpleWorkflow(),
      blocks: [
        {
          id: 'timer-1',
          type: 'plugin:timer',
          config: {},
          inputs: {},
          outputs: {
            tick: 'filter-1:in',
          },
        },
        {
          id: 'filter-1',
          type: 'plugin:filter',
          config: {},
          inputs: {
            in: 'timer-1:tick',
          },
          outputs: {
            out: 'logger-1:input',
          },
        },
        {
          id: 'logger-1',
          type: 'plugin:logger',
          config: {},
          inputs: {
            input: 'filter-1:out',
          },
          outputs: {},
        },
      ],
    };

    const result = validateWorkspace(workflow, registry);

    expect(result.valid).toBeTrue();
    expect(result.errors).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests - Block Type Errors
// ─────────────────────────────────────────────────────────────────────────────

describe('Workspace Validation - Block Type Errors', () => {
  test('should detect unknown block type', () => {
    const registry = createMockRegistry([]);
    const workflow: Workflow = {
      ...createSimpleWorkflow(),
      blocks: [
        {
          id: 'unknown-1',
          type: 'plugin:unknown',
          config: {},
          inputs: {},
          outputs: {},
        },
      ],
    };

    const result = validateWorkspace(workflow, registry);

    expect(result.valid).toBeFalse();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      code: 'UNKNOWN_BLOCK_TYPE',
      message: 'Unknown block type: "plugin:unknown"',
      path: 'blocks[0].type',
    });
  });

  test('should detect multiple unknown block types', () => {
    const registry = createMockRegistry([]);
    const workflow: Workflow = {
      ...createSimpleWorkflow(),
      blocks: [
        {
          id: 'block-1',
          type: 'plugin:unknown1',
          config: {},
          inputs: {},
          outputs: {},
        },
        {
          id: 'block-2',
          type: 'plugin:unknown2',
          config: {},
          inputs: {},
          outputs: {},
        },
      ],
    };

    const result = validateWorkspace(workflow, registry);

    expect(result.valid).toBeFalse();
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]?.code).toBe('UNKNOWN_BLOCK_TYPE');
    expect(result.errors[1]?.code).toBe('UNKNOWN_BLOCK_TYPE');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests - Port Errors
// ─────────────────────────────────────────────────────────────────────────────

describe('Workspace Validation - Port Errors', () => {
  test('should detect unknown output port', () => {
    const blockType = createBlockType(
      'timer',
      [],
      [
        {
          id: 'tick',
          schema: numberSchema,
        },
      ]
    );
    const registry = createMockRegistry([
      blockType,
    ]);

    const workflow: Workflow = {
      ...createSimpleWorkflow(),
      blocks: [
        {
          id: 'timer-1',
          type: 'plugin:timer',
          config: {},
          inputs: {},
          outputs: {
            invalidPort: 'target:input',
          },
        },
      ],
    };

    const result = validateWorkspace(workflow, registry);

    expect(result.valid).toBeFalse();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      code: 'UNKNOWN_OUTPUT_PORT',
      message: 'Unknown output port "invalidPort" on block type "plugin:timer"',
      path: 'blocks[0].outputs.invalidPort',
    });
  });

  test('should detect unknown input port', () => {
    const blockType = createBlockType(
      'logger',
      [
        {
          id: 'input',
          schema: stringSchema,
        },
      ],
      []
    );
    const registry = createMockRegistry([
      blockType,
    ]);

    const workflow: Workflow = {
      ...createSimpleWorkflow(),
      blocks: [
        {
          id: 'logger-1',
          type: 'plugin:logger',
          config: {},
          inputs: {
            invalidPort: 'source:output',
          },
          outputs: {},
        },
      ],
    };

    const result = validateWorkspace(workflow, registry);

    expect(result.valid).toBeFalse();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      code: 'UNKNOWN_INPUT_PORT',
      message: 'Unknown input port "invalidPort" on block type "plugin:logger"',
      path: 'blocks[0].inputs.invalidPort',
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests - Connection Errors
// ─────────────────────────────────────────────────────────────────────────────

describe('Workspace Validation - Connection Errors', () => {
  test('should detect invalid port reference format', () => {
    const blockType = createBlockType(
      'timer',
      [],
      [
        {
          id: 'tick',
          schema: numberSchema,
        },
      ]
    );
    const registry = createMockRegistry([
      blockType,
    ]);

    const workflow: Workflow = {
      ...createSimpleWorkflow(),
      blocks: [
        {
          id: 'timer-1',
          type: 'plugin:timer',
          config: {},
          inputs: {},
          outputs: {
            tick: 'invalid-ref-format' as `${string}:${string}`,
          }, // Missing colon separator (intentionally invalid)
        },
      ],
    };

    const result = validateWorkspace(workflow, registry);

    expect(result.valid).toBeFalse();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      code: 'INVALID_PORT_REF',
      message: 'Invalid port reference: "invalid-ref-format"',
      path: 'blocks[0].outputs.tick',
    });
  });

  test('should detect target block not found', () => {
    const blockType = createBlockType(
      'timer',
      [],
      [
        {
          id: 'tick',
          schema: numberSchema,
        },
      ]
    );
    const registry = createMockRegistry([
      blockType,
    ]);

    const workflow: Workflow = {
      ...createSimpleWorkflow(),
      blocks: [
        {
          id: 'timer-1',
          type: 'plugin:timer',
          config: {},
          inputs: {},
          outputs: {
            tick: 'non-existent:input',
          },
        },
      ],
    };

    const result = validateWorkspace(workflow, registry);

    expect(result.valid).toBeFalse();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      code: 'TARGET_BLOCK_NOT_FOUND',
      message: 'Target block "non-existent" not found',
      path: 'blocks[0].outputs.tick',
    });
  });

  test('should detect source block not found in input connections', () => {
    const blockType = createBlockType(
      'logger',
      [
        {
          id: 'input',
          schema: stringSchema,
        },
      ],
      []
    );
    const registry = createMockRegistry([
      blockType,
    ]);

    const workflow: Workflow = {
      ...createSimpleWorkflow(),
      blocks: [
        {
          id: 'logger-1',
          type: 'plugin:logger',
          config: {},
          inputs: {
            input: 'non-existent:output',
          },
          outputs: {},
        },
      ],
    };

    const result = validateWorkspace(workflow, registry);

    expect(result.valid).toBeFalse();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      code: 'SOURCE_BLOCK_NOT_FOUND',
      message: 'Source block "non-existent" not found',
      path: 'blocks[0].inputs.input',
    });
  });

  test('should detect unknown target block type', () => {
    const timerType = createBlockType(
      'timer',
      [],
      [
        {
          id: 'tick',
          schema: numberSchema,
        },
      ]
    );
    const registry = createMockRegistry([
      timerType,
    ]);

    const workflow: Workflow = {
      ...createSimpleWorkflow(),
      blocks: [
        {
          id: 'timer-1',
          type: 'plugin:timer',
          config: {},
          inputs: {},
          outputs: {
            tick: 'logger-1:input',
          },
        },
        {
          id: 'logger-1',
          type: 'plugin:unknown-logger', // Unknown type
          config: {},
          inputs: {
            input: 'timer-1:tick',
          },
          outputs: {},
        },
      ],
    };

    const result = validateWorkspace(workflow, registry);

    expect(result.valid).toBeFalse();
    expect(result.errors.length).toBeGreaterThan(0);
    const unknownTargetError = result.errors.find((e) => e.code === 'UNKNOWN_TARGET_BLOCK_TYPE');
    expect(unknownTargetError).toBeDefined();
    expect(unknownTargetError?.message).toContain('unknown-logger');
  });

  test('should detect target port not found', () => {
    const timerType = createBlockType(
      'timer',
      [],
      [
        {
          id: 'tick',
          schema: numberSchema,
        },
      ]
    );
    const loggerType = createBlockType(
      'logger',
      [
        {
          id: 'input',
          schema: numberSchema,
        },
      ],
      []
    );
    const registry = createMockRegistry([
      timerType,
      loggerType,
    ]);

    const workflow: Workflow = {
      ...createSimpleWorkflow(),
      blocks: [
        {
          id: 'timer-1',
          type: 'plugin:timer',
          config: {},
          inputs: {},
          outputs: {
            tick: 'logger-1:wrongPort',
          }, // Port doesn't exist
        },
        {
          id: 'logger-1',
          type: 'plugin:logger',
          config: {},
          inputs: {},
          outputs: {},
        },
      ],
    };

    const result = validateWorkspace(workflow, registry);

    expect(result.valid).toBeFalse();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      code: 'TARGET_PORT_NOT_FOUND',
      message: 'Target port "wrongPort" not found on block "logger-1"',
      path: 'blocks[0].outputs.tick',
    });
  });

  test('should detect invalid connection (connecting to wrong direction)', () => {
    // Create a block where the target port has wrong direction (output instead of input)
    const sourceType: BlockTypeDefinition = {
      id: 'source',
      type: 'plugin:source',
      nameKey: 'blocks.source',
      descriptionKey: 'blocks.source.description',
      category: 'utility',
      icon: 'box',
      color: '#888888',
      inputs: [],
      outputs: [
        {
          id: 'out',
          direction: 'output',
          nameKey: 'ports.out',
          schema: numberSchema,
        },
      ],
      configSchema: z.object({}),
    };

    const targetType: BlockTypeDefinition = {
      id: 'target',
      type: 'plugin:target',
      nameKey: 'blocks.target',
      descriptionKey: 'blocks.target.description',
      category: 'utility',
      icon: 'box',
      color: '#888888',
      inputs: [
        // This port is marked as output but should be input - will cause validation error
        {
          id: 'in',
          direction: 'output' as 'input',
          nameKey: 'ports.in',
          schema: numberSchema,
        },
      ],
      outputs: [],
      configSchema: z.object({}),
    };

    const registry = createMockRegistry([
      sourceType,
      targetType,
    ]);

    const workflow: Workflow = {
      ...createSimpleWorkflow(),
      blocks: [
        {
          id: 'source-1',
          type: 'plugin:source',
          config: {},
          inputs: {},
          outputs: {
            out: 'target-1:in',
          },
        },
        {
          id: 'target-1',
          type: 'plugin:target',
          config: {},
          inputs: {
            in: 'source-1:out',
          },
          outputs: {},
        },
      ],
    };

    const result = validateWorkspace(workflow, registry);

    expect(result.valid).toBeFalse();
    // Both output and input connections are validated, so we get 2 errors
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    // Check for direction-related error
    expect(
      result.errors.some(
        (e) =>
          e.code === 'INVALID_CONNECTION' ||
          e.message.toLowerCase().includes('direction') ||
          e.message.toLowerCase().includes('input')
      )
    ).toBeTrue();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests - Warnings
// ─────────────────────────────────────────────────────────────────────────────

describe('Workspace Validation - Warnings', () => {
  test('should warn about missing bidirectional reference', () => {
    const timerType = createBlockType(
      'timer',
      [],
      [
        {
          id: 'tick',
          schema: numberSchema,
        },
      ]
    );
    const loggerType = createBlockType(
      'logger',
      [
        {
          id: 'input',
          schema: numberSchema,
        },
      ],
      []
    );
    const registry = createMockRegistry([
      timerType,
      loggerType,
    ]);

    const workflow: Workflow = {
      ...createSimpleWorkflow(),
      blocks: [
        {
          id: 'timer-1',
          type: 'plugin:timer',
          config: {},
          inputs: {},
          outputs: {
            tick: 'logger-1:input',
          },
        },
        {
          id: 'logger-1',
          type: 'plugin:logger',
          config: {},
          inputs: {}, // Missing bidirectional reference
          outputs: {},
        },
      ],
    };

    const result = validateWorkspace(workflow, registry);

    expect(result.valid).toBeTrue(); // Still valid, just warnings
    expect(result.warnings).toHaveLength(2); // Bidirectional ref + orphan block
    const bidirWarning = result.warnings.find((w) => w.code === 'MISSING_BIDIRECTIONAL_REF');
    expect(bidirWarning).toBeDefined();
    expect(bidirWarning).toMatchObject({
      code: 'MISSING_BIDIRECTIONAL_REF',
      message: 'Target block "logger-1" input "input" does not reference back to "timer-1:tick"',
      path: 'blocks[0].outputs.tick',
    });
  });

  test('should warn about orphan blocks', () => {
    const loggerType = createBlockType(
      'logger',
      [
        {
          id: 'input',
          schema: stringSchema,
        },
      ],
      []
    );
    const registry = createMockRegistry([
      loggerType,
    ]);

    const workflow: Workflow = {
      ...createSimpleWorkflow(),
      blocks: [
        {
          id: 'logger-1',
          type: 'plugin:logger',
          config: {},
          inputs: {}, // Has input ports but no connections
          outputs: {},
        },
      ],
    };

    const result = validateWorkspace(workflow, registry);

    expect(result.valid).toBeTrue(); // Still valid, just a warning
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      code: 'ORPHAN_BLOCK',
      message: 'Block "logger-1" has input ports but no incoming connections',
      path: 'blocks.logger-1',
    });
  });

  test('should not warn about blocks without input ports', () => {
    const timerType = createBlockType(
      'timer',
      [],
      [
        {
          id: 'tick',
          schema: numberSchema,
        },
      ]
    );
    const registry = createMockRegistry([
      timerType,
    ]);

    const workflow: Workflow = {
      ...createSimpleWorkflow(),
      blocks: [
        {
          id: 'timer-1',
          type: 'plugin:timer',
          config: {},
          inputs: {},
          outputs: {},
        },
      ],
    };

    const result = validateWorkspace(workflow, registry);

    expect(result.valid).toBeTrue();
    expect(result.warnings).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests - Edge Cases
// ─────────────────────────────────────────────────────────────────────────────

describe('Workspace Validation - Edge Cases', () => {
  test('should handle empty inputs and outputs objects', () => {
    const blockType = createBlockType(
      'timer',
      [],
      [
        {
          id: 'tick',
          schema: numberSchema,
        },
      ]
    );
    const registry = createMockRegistry([
      blockType,
    ]);

    const workflow: Workflow = {
      ...createSimpleWorkflow(),
      blocks: [
        {
          id: 'timer-1',
          type: 'plugin:timer',
          config: {},
          inputs: {},
          outputs: {},
        },
      ],
    };

    const result = validateWorkspace(workflow, registry);

    expect(result.valid).toBeTrue();
    expect(result.errors).toHaveLength(0);
  });

  test('should handle undefined port references', () => {
    const blockType = createBlockType(
      'timer',
      [],
      [
        {
          id: 'tick',
          schema: numberSchema,
        },
      ]
    );
    const registry = createMockRegistry([
      blockType,
    ]);

    const workflow: Workflow = {
      ...createSimpleWorkflow(),
      blocks: [
        {
          id: 'timer-1',
          type: 'plugin:timer',
          config: {},
          inputs: {},
          outputs: {
            tick: undefined,
          }, // Undefined reference
        },
      ],
    };

    const result = validateWorkspace(workflow, registry);

    expect(result.valid).toBeTrue();
    expect(result.errors).toHaveLength(0);
  });

  test('should accumulate multiple errors across blocks', () => {
    const registry = createMockRegistry([]);
    const workflow: Workflow = {
      ...createSimpleWorkflow(),
      blocks: [
        {
          id: 'block-1',
          type: 'unknown1',
          config: {},
          inputs: {},
          outputs: {},
        },
        {
          id: 'block-2',
          type: 'unknown2',
          config: {},
          inputs: {},
          outputs: {},
        },
        {
          id: 'block-3',
          type: 'unknown3',
          config: {},
          inputs: {},
          outputs: {},
        },
      ],
    };

    const result = validateWorkspace(workflow, registry);

    expect(result.valid).toBeFalse();
    expect(result.errors).toHaveLength(3);
    expect(result.errors.every((e) => e.code === 'UNKNOWN_BLOCK_TYPE')).toBeTrue();
  });
});
