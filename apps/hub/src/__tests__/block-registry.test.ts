/**
 * Tests for BlockRegistry
 * Testing block registration, validation, and plugin management
 */
import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import { get, stub, useTestBed } from '@brika/di/testing';
import type { BlockDefinition } from '@brika/sdk';
import type { PluginInfo } from '@/runtime/blocks/block-registry';
import { BlockRegistry } from '@/runtime/blocks/block-registry';
import { Logger } from '@/runtime/logs/log-router';

// Test-specific type that includes optional metadata fields
type TestBlockDefinition = BlockDefinition & {
  category?: string;
  name?: string;
  description?: string;
  icon?: string;
  color?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const createBasicBlock = (id = 'test-block'): BlockDefinition => ({
  id,
  inputs: [],
  outputs: [],
  schema: {
    type: 'object',
    properties: {},
  },
});

const createPlugin = (id = 'test-plugin'): PluginInfo => ({
  id,
  version: '1.0.0',
  name: `Plugin ${id}`,
});

describe('BlockRegistry - Registration', () => {
  let registry: BlockRegistry;

  useTestBed(
    {
      autoStub: false,
    },
    () => {
      stub(Logger);
      registry = get(BlockRegistry);
    }
  );

  test('should register a block successfully', () => {
    const block = createBasicBlock();
    const plugin = createPlugin();

    registry.register(block, plugin);

    expect(registry.size).toBe(1);
    expect(registry.has('test-plugin:test-block')).toBeTrue();
  });

  test('should create qualified type name from plugin and block', () => {
    const block: TestBlockDefinition = {
      id: 'timer',
      category: 'input',
      name: 'Timer',
      description: 'Timer block',
      inputs: [],
      outputs: [],
      schema: {
        type: 'object',
        properties: {},
      },
    };

    const plugin: PluginInfo = {
      id: '@brika/blocks-builtin',
      version: '1.0.0',
    };

    registry.register(block, plugin);

    expect(registry.has('@brika/blocks-builtin:timer')).toBeTrue();
  });

  test('should handle duplicate block registration gracefully', () => {
    const block = createBasicBlock('duplicate');
    const plugin = createPlugin();

    registry.register(block, plugin);
    registry.register(block, plugin); // Second registration

    expect(registry.size).toBe(1); // Should still be 1
  });

  test('should register multiple blocks from same plugin', () => {
    const plugin = createPlugin('multi-block-plugin');
    const block1 = createBasicBlock('block-1');
    const block2 = createBasicBlock('block-2');

    registry.register(block1, plugin);
    registry.register(block2, plugin);

    expect(registry.size).toBe(2);
    expect(registry.has('multi-block-plugin:block-1')).toBeTrue();
    expect(registry.has('multi-block-plugin:block-2')).toBeTrue();
  });

  test('should register blocks from different plugins', () => {
    const plugin1: PluginInfo = {
      id: 'plugin-1',
      version: '1.0.0',
    };

    const plugin2: PluginInfo = {
      id: 'plugin-2',
      version: '1.0.0',
    };

    const block: TestBlockDefinition = {
      id: 'same-id',
      category: 'utility',
      name: 'Same ID Block',
      inputs: [],
      outputs: [],
      schema: {
        type: 'object',
        properties: {},
      },
    };

    registry.register(block, plugin1);
    registry.register(block, plugin2);

    expect(registry.size).toBe(2);
    expect(registry.has('plugin-1:same-id')).toBeTrue();
    expect(registry.has('plugin-2:same-id')).toBeTrue();
  });
});

describe('BlockRegistry - Unregistration', () => {
  let registry: BlockRegistry;

  useTestBed(
    {
      autoStub: false,
    },
    () => {
      stub(Logger);
      registry = get(BlockRegistry);
    }
  );

  test('should unregister all blocks from a plugin', () => {
    const plugin: PluginInfo = {
      id: 'test-plugin',
      version: '1.0.0',
    };

    const block1: TestBlockDefinition = {
      id: 'block-1',
      category: 'utility',
      name: 'Block 1',
      inputs: [],
      outputs: [],
      schema: {
        type: 'object',
        properties: {},
      },
    };

    const block2: TestBlockDefinition = {
      id: 'block-2',
      category: 'utility',
      name: 'Block 2',
      inputs: [],
      outputs: [],
      schema: {
        type: 'object',
        properties: {},
      },
    };

    registry.register(block1, plugin);
    registry.register(block2, plugin);

    expect(registry.size).toBe(2);

    const count = registry.unregisterPlugin('test-plugin');

    expect(count).toBe(2);
    expect(registry.size).toBe(0);
  });

  test('should return 0 when unregistering non-existent plugin', () => {
    const count = registry.unregisterPlugin('non-existent');
    expect(count).toBe(0);
  });

  test('should only unregister blocks from specified plugin', () => {
    const plugin1: PluginInfo = {
      id: 'plugin-1',
      version: '1.0.0',
    };

    const plugin2: PluginInfo = {
      id: 'plugin-2',
      version: '1.0.0',
    };

    const block: TestBlockDefinition = {
      id: 'block',
      category: 'utility',
      name: 'Block',
      inputs: [],
      outputs: [],
      schema: {
        type: 'object',
        properties: {},
      },
    };

    registry.register(block, plugin1);
    registry.register(block, plugin2);

    expect(registry.size).toBe(2);

    registry.unregisterPlugin('plugin-1');

    expect(registry.size).toBe(1);
    expect(registry.has('plugin-1:block')).toBeFalse();
    expect(registry.has('plugin-2:block')).toBeTrue();
  });
});

describe('BlockRegistry - Queries', () => {
  let registry: BlockRegistry;

  useTestBed(
    {
      autoStub: false,
    },
    () => {
      stub(Logger);
      registry = get(BlockRegistry);
    }
  );

  test('should get registered block by type', () => {
    const block: TestBlockDefinition = {
      id: 'test-block',
      category: 'utility',
      name: 'Test Block',
      inputs: [],
      outputs: [],
      schema: {
        type: 'object',
        properties: {},
      },
    };

    const plugin: PluginInfo = {
      id: 'test-plugin',
      version: '1.0.0',
    };

    registry.register(block, plugin);

    const retrieved = registry.get('test-plugin:test-block');

    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe('test-block');
    expect(retrieved?.name).toBe('Test Block');
  });

  test('should return undefined for non-existent block', () => {
    const result = registry.get('non-existent:block');
    expect(result).toBeUndefined();
  });

  test('should check if block exists', () => {
    const block: TestBlockDefinition = {
      id: 'exists',
      category: 'utility',
      name: 'Exists Block',
      inputs: [],
      outputs: [],
      schema: {
        type: 'object',
        properties: {},
      },
    };

    const plugin: PluginInfo = {
      id: 'test-plugin',
      version: '1.0.0',
    };

    registry.register(block, plugin);

    expect(registry.has('test-plugin:exists')).toBeTrue();
    expect(registry.has('test-plugin:not-exists')).toBeFalse();
  });

  test('should list all registered blocks', () => {
    const plugin: PluginInfo = {
      id: 'test-plugin',
      version: '1.0.0',
    };

    const block1: TestBlockDefinition = {
      id: 'block-a',
      category: 'utility',
      name: 'Block A',
      inputs: [],
      outputs: [],
      schema: {
        type: 'object',
        properties: {},
      },
    };

    const block2: TestBlockDefinition = {
      id: 'block-z',
      category: 'utility',
      name: 'Block Z',
      inputs: [],
      outputs: [],
      schema: {
        type: 'object',
        properties: {},
      },
    };

    registry.register(block2, plugin);
    registry.register(block1, plugin);

    const list = registry.list();

    expect(list.length).toBe(2);
    // Should be sorted by ID
    expect(list[0].id).toBe('block-a');
    expect(list[1].id).toBe('block-z');
  });

  test('should list blocks by plugin', () => {
    const plugin1: PluginInfo = {
      id: 'plugin-1',
      version: '1.0.0',
    };

    const plugin2: PluginInfo = {
      id: 'plugin-2',
      version: '1.0.0',
    };

    const block: TestBlockDefinition = {
      id: 'block',
      category: 'utility',
      name: 'Block',
      inputs: [],
      outputs: [],
      schema: {
        type: 'object',
        properties: {},
      },
    };

    registry.register(block, plugin1);
    registry.register(block, plugin2);

    const plugin1Blocks = registry.listByPlugin('plugin-1');
    const plugin2Blocks = registry.listByPlugin('plugin-2');

    expect(plugin1Blocks.length).toBe(1);
    expect(plugin2Blocks.length).toBe(1);
    expect(plugin1Blocks[0].id).toBe('block');
  });

  test('should list blocks by category', () => {
    const plugin: PluginInfo = {
      id: 'test-plugin',
      version: '1.0.0',
    };

    const inputBlock: TestBlockDefinition = {
      id: 'input',
      category: 'input',
      name: 'Input Block',
      inputs: [],
      outputs: [],
      schema: {
        type: 'object',
        properties: {},
      },
    };

    const outputBlock: TestBlockDefinition = {
      id: 'output',
      category: 'output',
      name: 'Output Block',
      inputs: [],
      outputs: [],
      schema: {
        type: 'object',
        properties: {},
      },
    };

    const utilityBlock: TestBlockDefinition = {
      id: 'utility',
      category: 'utility',
      name: 'Utility Block',
      inputs: [],
      outputs: [],
      schema: {
        type: 'object',
        properties: {},
      },
    };

    registry.register(inputBlock, plugin);
    registry.register(outputBlock, plugin);
    registry.register(utilityBlock, plugin);

    const byCategory = registry.listByCategory();

    expect(Object.keys(byCategory)).toContain('input');
    expect(Object.keys(byCategory)).toContain('output');
    expect(Object.keys(byCategory)).toContain('utility');
    expect(byCategory.input?.length).toBe(1);
    expect(byCategory.output?.length).toBe(1);
    expect(byCategory.utility?.length).toBe(1);
  });
});

describe('BlockRegistry - Plugin Info', () => {
  let registry: BlockRegistry;

  useTestBed(
    {
      autoStub: false,
    },
    () => {
      stub(Logger);
      registry = get(BlockRegistry);
    }
  );

  test('should get plugin info for registered block', () => {
    const block: TestBlockDefinition = {
      id: 'test-block',
      category: 'utility',
      name: 'Test Block',
      inputs: [],
      outputs: [],
      schema: {
        type: 'object',
        properties: {},
      },
    };

    const plugin: PluginInfo = {
      id: '@brika/test',
      version: '1.2.3',
      name: 'Test Plugin',
      description: 'A test plugin',
    };

    registry.register(block, plugin);

    const info = registry.getPluginInfo('@brika/test:test-block');

    expect(info).toBeDefined();
    expect(info?.id).toBe('@brika/test');
    expect(info?.version).toBe('1.2.3');
    expect(info?.name).toBe('Test Plugin');
  });

  test('should return undefined for non-existent block plugin info', () => {
    const info = registry.getPluginInfo('non-existent:block');
    expect(info).toBeUndefined();
  });
});

describe('BlockRegistry - Listeners', () => {
  let registry: BlockRegistry;

  useTestBed(
    {
      autoStub: false,
    },
    () => {
      stub(Logger);
      registry = get(BlockRegistry);
    }
  );

  test('should notify listeners when block is registered', () => {
    const registeredTypes: string[] = [];

    registry.onBlockRegistered((type) => {
      registeredTypes.push(type);
    });

    const block: TestBlockDefinition = {
      id: 'test-block',
      category: 'utility',
      name: 'Test Block',
      inputs: [],
      outputs: [],
      schema: {
        type: 'object',
        properties: {},
      },
    };

    const plugin: PluginInfo = {
      id: 'test-plugin',
      version: '1.0.0',
    };

    registry.register(block, plugin);

    expect(registeredTypes).toContain('test-plugin:test-block');
  });

  test('should support multiple listeners', () => {
    const types1: string[] = [];
    const types2: string[] = [];

    registry.onBlockRegistered((type) => types1.push(type));
    registry.onBlockRegistered((type) => types2.push(type));

    const block: TestBlockDefinition = {
      id: 'test-block',
      category: 'utility',
      name: 'Test Block',
      inputs: [],
      outputs: [],
      schema: {
        type: 'object',
        properties: {},
      },
    };

    const plugin: PluginInfo = {
      id: 'test-plugin',
      version: '1.0.0',
    };

    registry.register(block, plugin);

    expect(types1.length).toBe(1);
    expect(types2.length).toBe(1);
  });

  test('should allow removing listeners', () => {
    const registeredTypes: string[] = [];

    const unsubscribe = registry.onBlockRegistered((type) => {
      registeredTypes.push(type);
    });

    const plugin: PluginInfo = {
      id: 'test-plugin',
      version: '1.0.0',
    };

    const block1: TestBlockDefinition = {
      id: 'block-1',
      category: 'utility',
      name: 'Block 1',
      inputs: [],
      outputs: [],
      schema: {
        type: 'object',
        properties: {},
      },
    };

    registry.register(block1, plugin);
    expect(registeredTypes.length).toBe(1);

    unsubscribe();

    const block2: TestBlockDefinition = {
      id: 'block-2',
      category: 'utility',
      name: 'Block 2',
      inputs: [],
      outputs: [],
      schema: {
        type: 'object',
        properties: {},
      },
    };

    registry.register(block2, plugin);

    // Should still be 1 (not notified after unsubscribe)
    expect(registeredTypes.length).toBe(1);
  });
});

describe('BlockRegistry - Size', () => {
  let registry: BlockRegistry;

  useTestBed(
    {
      autoStub: false,
    },
    () => {
      stub(Logger);
      registry = get(BlockRegistry);
    }
  );

  test('should report correct size', () => {
    expect(registry.size).toBe(0);

    const plugin: PluginInfo = {
      id: 'test-plugin',
      version: '1.0.0',
    };

    const block: TestBlockDefinition = {
      id: 'block',
      category: 'utility',
      name: 'Block',
      inputs: [],
      outputs: [],
      schema: {
        type: 'object',
        properties: {},
      },
    };

    registry.register(block, plugin);
    expect(registry.size).toBe(1);

    registry.register(block, plugin);
    expect(registry.size).toBe(1); // Still 1 (duplicate)

    registry.unregisterPlugin('test-plugin');
    expect(registry.size).toBe(0);
  });
});

describe('BlockRegistry - Validation', () => {
  let registry: BlockRegistry;

  useTestBed(
    {
      autoStub: false,
    },
    () => {
      stub(Logger);
      registry = get(BlockRegistry);
    }
  );

  test('validateConfig returns error for unknown block type', () => {
    const result = registry.validateConfig('unknown:block', {});

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Unknown block type: unknown:block');
  });

  test('validateConfig validates required fields', () => {
    const block: TestBlockDefinition = {
      id: 'test-block',
      category: 'utility',
      name: 'Test Block',
      inputs: [],
      outputs: [],
      schema: {
        type: 'object',
        required: [
          'name',
          'value',
        ],
        properties: {
          name: {
            type: 'string',
          },
          value: {
            type: 'number',
          },
        },
      },
    };

    const plugin: PluginInfo = {
      id: 'test-plugin',
      version: '1.0.0',
    };

    registry.register(block, plugin);

    const result = registry.validateConfig('test-plugin:test-block', {});

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required field: name');
    expect(result.errors).toContain('Missing required field: value');
  });

  test('validateConfig validates property types', () => {
    const block: TestBlockDefinition = {
      id: 'test-block',
      category: 'utility',
      name: 'Test Block',
      inputs: [],
      outputs: [],
      schema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
          },
          count: {
            type: 'number',
          },
          enabled: {
            type: 'boolean',
          },
          items: {
            type: 'array',
          },
          options: {
            type: 'object',
          },
        },
      },
    };

    const plugin: PluginInfo = {
      id: 'test-plugin',
      version: '1.0.0',
    };

    registry.register(block, plugin);

    const result = registry.validateConfig('test-plugin:test-block', {
      name: 123, // should be string
      count: 'five', // should be number
      enabled: 'yes', // should be boolean
      items: {}, // should be array
      options: [], // should be object
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Field "name" should be string');
    expect(result.errors).toContain('Field "count" should be number');
    expect(result.errors).toContain('Field "enabled" should be boolean');
    expect(result.errors).toContain('Field "items" should be array');
    expect(result.errors).toContain('Field "options" should be object');
  });

  test('validateConfig passes for valid config', () => {
    const block: TestBlockDefinition = {
      id: 'test-block',
      category: 'utility',
      name: 'Test Block',
      inputs: [],
      outputs: [],
      schema: {
        type: 'object',
        required: [
          'name',
        ],
        properties: {
          name: {
            type: 'string',
          },
          count: {
            type: 'number',
          },
        },
      },
    };

    const plugin: PluginInfo = {
      id: 'test-plugin',
      version: '1.0.0',
    };

    registry.register(block, plugin);

    const result = registry.validateConfig('test-plugin:test-block', {
      name: 'test',
      count: 42,
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  test('validateConfig handles unknown type as valid', () => {
    const block: TestBlockDefinition = {
      id: 'test-block',
      category: 'utility',
      name: 'Test Block',
      inputs: [],
      outputs: [],
      schema: {
        type: 'object',
        properties: {
          custom: {
            type: 'custom-type' as 'string',
          },
        },
      },
    };

    const plugin: PluginInfo = {
      id: 'test-plugin',
      version: '1.0.0',
    };

    registry.register(block, plugin);

    const result = registry.validateConfig('test-plugin:test-block', {
      custom: 'anything',
    });

    expect(result.valid).toBe(true);
  });
});

describe('BlockRegistry - Connection Validation', () => {
  let registry: BlockRegistry;

  useTestBed(
    {
      autoStub: false,
    },
    () => {
      stub(Logger);
      registry = get(BlockRegistry);
    }
  );

  test('validateConnections returns error for unknown source block', () => {
    const result = registry.validateConnections(
      [
        {
          id: 'target',
          type: 'plugin:block',
        },
      ],
      [
        {
          from: 'unknown',
          to: 'target',
        },
      ]
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Unknown source block: unknown');
  });

  test('validateConnections returns error for unknown target block', () => {
    const result = registry.validateConnections(
      [
        {
          id: 'source',
          type: 'plugin:block',
        },
      ],
      [
        {
          from: 'source',
          to: 'unknown',
        },
      ]
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Unknown target block: unknown');
  });

  test('validateConnections returns error for unknown block type', () => {
    const result = registry.validateConnections(
      [
        {
          id: 'source',
          type: 'unknown:source',
        },
        {
          id: 'target',
          type: 'unknown:target',
        },
      ],
      [
        {
          from: 'source',
          to: 'target',
        },
      ]
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Unknown block type: unknown:source');
  });

  test('validateConnections returns error for missing output port', () => {
    const sourceBlock: TestBlockDefinition = {
      id: 'source',
      category: 'utility',
      name: 'Source',
      inputs: [],
      outputs: [],
      schema: {
        type: 'object',
        properties: {},
      },
    };

    const targetBlock: TestBlockDefinition = {
      id: 'target',
      category: 'utility',
      name: 'Target',
      inputs: [
        {
          id: 'in',
          name: 'Input',
          direction: 'input' as const,
          typeName: 'string',
        },
      ],
      outputs: [],
      schema: {
        type: 'object',
        properties: {},
      },
    };

    const plugin: PluginInfo = {
      id: 'plugin',
      version: '1.0.0',
    };

    registry.register(sourceBlock, plugin);
    registry.register(targetBlock, plugin);

    const result = registry.validateConnections(
      [
        {
          id: 'source',
          type: 'plugin:source',
        },
        {
          id: 'target',
          type: 'plugin:target',
        },
      ],
      [
        {
          from: 'source',
          fromPort: 'out',
          to: 'target',
          toPort: 'in',
        },
      ]
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Block "source" has no output port "out"');
  });

  test('validateConnections returns error for missing input port', () => {
    const sourceBlock: TestBlockDefinition = {
      id: 'source',
      category: 'utility',
      name: 'Source',
      inputs: [],
      outputs: [
        {
          id: 'out',
          name: 'Output',
          direction: 'output' as const,
          typeName: 'string',
        },
      ],
      schema: {
        type: 'object',
        properties: {},
      },
    };

    const targetBlock: TestBlockDefinition = {
      id: 'target',
      category: 'utility',
      name: 'Target',
      inputs: [],
      outputs: [],
      schema: {
        type: 'object',
        properties: {},
      },
    };

    const plugin: PluginInfo = {
      id: 'plugin',
      version: '1.0.0',
    };

    registry.register(sourceBlock, plugin);
    registry.register(targetBlock, plugin);

    const result = registry.validateConnections(
      [
        {
          id: 'source',
          type: 'plugin:source',
        },
        {
          id: 'target',
          type: 'plugin:target',
        },
      ],
      [
        {
          from: 'source',
          fromPort: 'out',
          to: 'target',
          toPort: 'in',
        },
      ]
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Block "target" has no input port "in"');
  });

  test('validateConnections returns error for type mismatch', () => {
    const sourceBlock: TestBlockDefinition = {
      id: 'source',
      category: 'utility',
      name: 'Source',
      inputs: [],
      outputs: [
        {
          id: 'out',
          name: 'Output',
          direction: 'output' as const,
          typeName: 'array',
        },
      ],
      schema: {
        type: 'object',
        properties: {},
      },
    };

    const targetBlock: TestBlockDefinition = {
      id: 'target',
      category: 'utility',
      name: 'Target',
      inputs: [
        {
          id: 'in',
          name: 'Input',
          direction: 'input' as const,
          typeName: 'boolean',
        },
      ],
      outputs: [],
      schema: {
        type: 'object',
        properties: {},
      },
    };

    const plugin: PluginInfo = {
      id: 'plugin',
      version: '1.0.0',
    };

    registry.register(sourceBlock, plugin);
    registry.register(targetBlock, plugin);

    const result = registry.validateConnections(
      [
        {
          id: 'source',
          type: 'plugin:source',
        },
        {
          id: 'target',
          type: 'plugin:target',
        },
      ],
      [
        {
          from: 'source',
          fromPort: 'out',
          to: 'target',
          toPort: 'in',
        },
      ]
    );

    expect(result.valid).toBe(false);
    expect(result.errors?.[0]).toContain('Type mismatch');
  });

  test('validateConnections passes for valid connections', () => {
    const sourceBlock: TestBlockDefinition = {
      id: 'source',
      category: 'utility',
      name: 'Source',
      inputs: [],
      outputs: [
        {
          id: 'out',
          name: 'Output',
          direction: 'output' as const,
          typeName: 'string',
        },
      ],
      schema: {
        type: 'object',
        properties: {},
      },
    };

    const targetBlock: TestBlockDefinition = {
      id: 'target',
      category: 'utility',
      name: 'Target',
      inputs: [
        {
          id: 'in',
          name: 'Input',
          direction: 'input' as const,
          typeName: 'string',
        },
      ],
      outputs: [],
      schema: {
        type: 'object',
        properties: {},
      },
    };

    const plugin: PluginInfo = {
      id: 'plugin',
      version: '1.0.0',
    };

    registry.register(sourceBlock, plugin);
    registry.register(targetBlock, plugin);

    const result = registry.validateConnections(
      [
        {
          id: 'source',
          type: 'plugin:source',
        },
        {
          id: 'target',
          type: 'plugin:target',
        },
      ],
      [
        {
          from: 'source',
          fromPort: 'out',
          to: 'target',
          toPort: 'in',
        },
      ]
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  test('validateConnections uses default port names', () => {
    const sourceBlock: TestBlockDefinition = {
      id: 'source',
      category: 'utility',
      name: 'Source',
      inputs: [],
      outputs: [
        {
          id: 'out',
          name: 'Output',
          direction: 'output' as const,
          typeName: 'string',
        },
      ],
      schema: {
        type: 'object',
        properties: {},
      },
    };

    const targetBlock: TestBlockDefinition = {
      id: 'target',
      category: 'utility',
      name: 'Target',
      inputs: [
        {
          id: 'in',
          name: 'Input',
          direction: 'input' as const,
          typeName: 'string',
        },
      ],
      outputs: [],
      schema: {
        type: 'object',
        properties: {},
      },
    };

    const plugin: PluginInfo = {
      id: 'plugin',
      version: '1.0.0',
    };

    registry.register(sourceBlock, plugin);
    registry.register(targetBlock, plugin);

    const result = registry.validateConnections(
      [
        {
          id: 'source',
          type: 'plugin:source',
        },
        {
          id: 'target',
          type: 'plugin:target',
        },
      ],
      [
        {
          from: 'source',
          to: 'target',
        },
      ] // No port names specified
    );

    // Should use 'out' and 'in' as defaults
    expect(result.valid).toBe(true);
  });
});

describe('BlockRegistry - Provider and Plugins', () => {
  let registry: BlockRegistry;

  useTestBed(
    {
      autoStub: false,
    },
    () => {
      stub(Logger);
      registry = get(BlockRegistry);
    }
  );

  test('getProvider returns plugin ID for registered block', () => {
    const block = createBasicBlock('test');
    const plugin = createPlugin('my-plugin');

    registry.register(block, plugin);

    expect(registry.getProvider('my-plugin:test')).toBe('my-plugin');
  });

  test('getProvider returns undefined for unknown block', () => {
    expect(registry.getProvider('unknown:block')).toBeUndefined();
  });

  test('getPlugins returns all registered plugins', () => {
    const plugin1 = createPlugin('plugin-1');
    const plugin2 = createPlugin('plugin-2');
    const block = createBasicBlock();

    registry.register(block, plugin1);
    registry.register(block, plugin2);

    const plugins = registry.getPlugins();

    expect(plugins.length).toBe(2);
    expect(plugins.map((p) => p.id)).toContain('plugin-1');
    expect(plugins.map((p) => p.id)).toContain('plugin-2');
  });

  test('getPlugins returns empty array when no plugins registered', () => {
    const plugins = registry.getPlugins();
    expect(plugins).toEqual([]);
  });
});

describe('BlockRegistry - listByOwner', () => {
  let registry: BlockRegistry;

  useTestBed(
    {
      autoStub: false,
    },
    () => {
      stub(Logger);
      registry = get(BlockRegistry);
    }
  );

  test('listByOwner returns block summaries for plugin', () => {
    const block: TestBlockDefinition = {
      id: 'test-block',
      category: 'utility',
      name: 'Test Block',
      description: 'A test block',
      icon: 'test-icon',
      color: '#ff0000',
      inputs: [
        {
          id: 'in',
          name: 'Input',
          direction: 'input' as const,
          typeName: 'string',
        },
      ],
      outputs: [
        {
          id: 'out',
          name: 'Output',
          direction: 'output' as const,
          typeName: 'number',
        },
      ],
      schema: {
        type: 'object',
        properties: {},
      },
    };

    const plugin: PluginInfo = {
      id: 'my-plugin',
      version: '1.0.0',
    };

    registry.register(block, plugin);

    const summaries = registry.listByOwner('my-plugin');

    expect(summaries.length).toBe(1);
    expect(summaries[0].id).toBe('my-plugin:test-block');
    expect(summaries[0].name).toBe('Test Block');
    expect(summaries[0].description).toBe('A test block');
    expect(summaries[0].category as string).toBe('utility');
    expect(summaries[0].icon).toBe('test-icon');
    expect(summaries[0].color).toBe('#ff0000');
    expect(summaries[0].inputs).toHaveLength(1);
    expect(summaries[0].outputs).toHaveLength(1);
  });

  test('listByOwner returns empty array for unknown plugin', () => {
    const summaries = registry.listByOwner('unknown-plugin');
    expect(summaries).toEqual([]);
  });
});

describe('BlockRegistry - Listener Error Handling', () => {
  let registry: BlockRegistry;
  let errorLogs: unknown[];

  useTestBed(
    {
      autoStub: false,
    },
    () => {
      errorLogs = [];
      // Use stub with custom error override to capture error logs
      // Other methods (info, warn, debug, etc.) are auto-stubbed
      stub(Logger, {
        withSource: () => ({
          error: (...args: unknown[]) => errorLogs.push(args),
        }),
      });
      registry = get(BlockRegistry);
    }
  );

  test('continues notifying other listeners when one throws', () => {
    const successfulCalls: string[] = [];

    // First listener throws
    registry.onBlockRegistered(() => {
      throw new Error('Listener error');
    });

    // Second listener should still be called
    registry.onBlockRegistered((type) => {
      successfulCalls.push(type);
    });

    const block = createBasicBlock();
    const plugin = createPlugin();

    registry.register(block, plugin);

    expect(successfulCalls).toContain('test-plugin:test-block');
    expect(errorLogs.length).toBeGreaterThan(0);
  });
});
