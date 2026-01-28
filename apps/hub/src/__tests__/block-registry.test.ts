/**
 * Tests for BlockRegistry
 * Testing block registration, validation, and plugin management
 */
import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { TestBed } from '@brika/shared';
import { BlockRegistry } from '@/runtime/blocks/block-registry';
import { Logger } from '@/runtime/logs/log-router';
import type { BlockDefinition } from '@brika/sdk';
import type { PluginInfo } from '@/runtime/blocks/block-registry';

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const createBasicBlock = (id = 'test-block'): BlockDefinition => ({
  id,
  category: 'utility',
  name: `Block ${id}`,
  description: `A ${id}`,
  inputs: [],
  outputs: [],
  configSchema: {},
});

const createPlugin = (id = 'test-plugin'): PluginInfo => ({
  id,
  version: '1.0.0',
  name: `Plugin ${id}`,
});

describe('BlockRegistry - Registration', () => {
  let registry: BlockRegistry;

  beforeEach(() => {
    TestBed.create()
      .provide(Logger, {
        withSource: () => ({
          info: () => {},
          warn: () => {},
          error: () => {},
        }),
      })
      .compile();

    registry = TestBed.inject(BlockRegistry);
  });

  afterEach(() => {
    TestBed.reset();
  });

  test('should register a block successfully', () => {
    const block = createBasicBlock();
    const plugin = createPlugin();

    registry.register(block, plugin);

    expect(registry.size).toBe(1);
    expect(registry.has('test-plugin:test-block')).toBeTrue();
  });

  test('should create qualified type name from plugin and block', () => {
    const block: BlockDefinition = {
      id: 'timer',
      category: 'input',
      name: 'Timer',
      description: 'Timer block',
      inputs: [],
      outputs: [],
      configSchema: {},
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

    const block: BlockDefinition = {
      id: 'same-id',
      category: 'utility',
      name: 'Same ID Block',
      inputs: [],
      outputs: [],
      configSchema: {},
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

  beforeEach(() => {
    TestBed.create()
      .provide(Logger, {
        withSource: () => ({
          info: () => {},
          warn: () => {},
          error: () => {},
        }),
      })
      .compile();

    registry = TestBed.inject(BlockRegistry);
  });

  afterEach(() => {
    TestBed.reset();
  });

  test('should unregister all blocks from a plugin', () => {
    const plugin: PluginInfo = {
      id: 'test-plugin',
      version: '1.0.0',
    };

    const block1: BlockDefinition = {
      id: 'block-1',
      category: 'utility',
      name: 'Block 1',
      inputs: [],
      outputs: [],
      configSchema: {},
    };

    const block2: BlockDefinition = {
      id: 'block-2',
      category: 'utility',
      name: 'Block 2',
      inputs: [],
      outputs: [],
      configSchema: {},
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

    const block: BlockDefinition = {
      id: 'block',
      category: 'utility',
      name: 'Block',
      inputs: [],
      outputs: [],
      configSchema: {},
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

  beforeEach(() => {
    TestBed.create()
      .provide(Logger, {
        withSource: () => ({
          info: () => {},
          warn: () => {},
          error: () => {},
        }),
      })
      .compile();

    registry = TestBed.inject(BlockRegistry);
  });

  afterEach(() => {
    TestBed.reset();
  });

  test('should get registered block by type', () => {
    const block: BlockDefinition = {
      id: 'test-block',
      category: 'utility',
      name: 'Test Block',
      inputs: [],
      outputs: [],
      configSchema: {},
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
    const block: BlockDefinition = {
      id: 'exists',
      category: 'utility',
      name: 'Exists Block',
      inputs: [],
      outputs: [],
      configSchema: {},
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

    const block1: BlockDefinition = {
      id: 'block-a',
      category: 'utility',
      name: 'Block A',
      inputs: [],
      outputs: [],
      configSchema: {},
    };

    const block2: BlockDefinition = {
      id: 'block-z',
      category: 'utility',
      name: 'Block Z',
      inputs: [],
      outputs: [],
      configSchema: {},
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

    const block: BlockDefinition = {
      id: 'block',
      category: 'utility',
      name: 'Block',
      inputs: [],
      outputs: [],
      configSchema: {},
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

    const inputBlock: BlockDefinition = {
      id: 'input',
      category: 'input',
      name: 'Input Block',
      inputs: [],
      outputs: [],
      configSchema: {},
    };

    const outputBlock: BlockDefinition = {
      id: 'output',
      category: 'output',
      name: 'Output Block',
      inputs: [],
      outputs: [],
      configSchema: {},
    };

    const utilityBlock: BlockDefinition = {
      id: 'utility',
      category: 'utility',
      name: 'Utility Block',
      inputs: [],
      outputs: [],
      configSchema: {},
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

  beforeEach(() => {
    TestBed.create()
      .provide(Logger, {
        withSource: () => ({
          info: () => {},
          warn: () => {},
          error: () => {},
        }),
      })
      .compile();

    registry = TestBed.inject(BlockRegistry);
  });

  afterEach(() => {
    TestBed.reset();
  });

  test('should get plugin info for registered block', () => {
    const block: BlockDefinition = {
      id: 'test-block',
      category: 'utility',
      name: 'Test Block',
      inputs: [],
      outputs: [],
      configSchema: {},
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

  beforeEach(() => {
    TestBed.create()
      .provide(Logger, {
        withSource: () => ({
          info: () => {},
          warn: () => {},
          error: () => {},
        }),
      })
      .compile();

    registry = TestBed.inject(BlockRegistry);
  });

  afterEach(() => {
    TestBed.reset();
  });

  test('should notify listeners when block is registered', () => {
    const registeredTypes: string[] = [];

    registry.onBlockRegistered((type) => {
      registeredTypes.push(type);
    });

    const block: BlockDefinition = {
      id: 'test-block',
      category: 'utility',
      name: 'Test Block',
      inputs: [],
      outputs: [],
      configSchema: {},
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

    const block: BlockDefinition = {
      id: 'test-block',
      category: 'utility',
      name: 'Test Block',
      inputs: [],
      outputs: [],
      configSchema: {},
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

    const block1: BlockDefinition = {
      id: 'block-1',
      category: 'utility',
      name: 'Block 1',
      inputs: [],
      outputs: [],
      configSchema: {},
    };

    registry.register(block1, plugin);
    expect(registeredTypes.length).toBe(1);

    unsubscribe();

    const block2: BlockDefinition = {
      id: 'block-2',
      category: 'utility',
      name: 'Block 2',
      inputs: [],
      outputs: [],
      configSchema: {},
    };

    registry.register(block2, plugin);

    // Should still be 1 (not notified after unsubscribe)
    expect(registeredTypes.length).toBe(1);
  });
});

describe('BlockRegistry - Size', () => {
  let registry: BlockRegistry;

  beforeEach(() => {
    TestBed.create()
      .provide(Logger, {
        withSource: () => ({
          info: () => {},
          warn: () => {},
          error: () => {},
        }),
      })
      .compile();

    registry = TestBed.inject(BlockRegistry);
  });

  afterEach(() => {
    TestBed.reset();
  });

  test('should report correct size', () => {
    expect(registry.size).toBe(0);

    const plugin: PluginInfo = {
      id: 'test-plugin',
      version: '1.0.0',
    };

    const block: BlockDefinition = {
      id: 'block',
      category: 'utility',
      name: 'Block',
      inputs: [],
      outputs: [],
      configSchema: {},
    };

    registry.register(block, plugin);
    expect(registry.size).toBe(1);

    registry.register(block, plugin);
    expect(registry.size).toBe(1); // Still 1 (duplicate)

    registry.unregisterPlugin('test-plugin');
    expect(registry.size).toBe(0);
  });
});
