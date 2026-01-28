/**
 * Tests for HTTP resource helpers
 */
import { describe, expect, it } from 'bun:test';
import { NotFound } from '@brika/router';
import { getOrThrow } from '@/runtime/http/utils/resource-helpers';

describe('getOrThrow', () => {
  it('should return the resource if it exists', () => {
    const resource = { id: 1, name: 'Test' };
    const result = getOrThrow(resource, 'Resource not found');
    expect(result).toEqual(resource);
  });

  it('should throw NotFound if resource is null', () => {
    expect(() => getOrThrow(null, 'Resource not found')).toThrow(NotFound);
  });

  it('should throw NotFound if resource is undefined', () => {
    expect(() => getOrThrow(undefined, 'Resource not found')).toThrow(NotFound);
  });

  it('should throw NotFound with custom message', () => {
    try {
      getOrThrow(null, 'Custom error message');
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(NotFound);
      expect((error as NotFound).message).toBe('Custom error message');
    }
  });

  it('should handle falsy values correctly', () => {
    // 0 is a valid value
    const zero = 0;
    expect(getOrThrow(zero, 'Not found')).toBe(0);

    // Empty string is valid
    const emptyString = '';
    expect(getOrThrow(emptyString, 'Not found')).toBe('');

    // false is valid
    const falseBool = false;
    expect(getOrThrow(falseBool, 'Not found')).toBe(false);

    // Empty array is valid
    const emptyArray: unknown[] = [];
    expect(getOrThrow(emptyArray, 'Not found')).toEqual([]);

    // Empty object is valid
    const emptyObject = {};
    expect(getOrThrow(emptyObject, 'Not found')).toEqual({});
  });

  it('should preserve type information', () => {
    interface User {
      id: number;
      name: string;
      email: string;
    }

    const user: User = { id: 1, name: 'Alice', email: 'alice@example.com' };
    const result = getOrThrow(user, 'User not found');

    // TypeScript should infer this as User
    expect(result.id).toBe(1);
    expect(result.name).toBe('Alice');
    expect(result.email).toBe('alice@example.com');
  });

  it('should work with complex objects', () => {
    const complexResource = {
      id: 'workflow-123',
      nested: {
        data: [1, 2, 3],
        metadata: { created: Date.now() },
      },
      methods: {
        execute: () => 'executed',
      },
    };

    const result = getOrThrow(complexResource, 'Complex resource not found');
    expect(result).toEqual(complexResource);
    expect(result.methods.execute()).toBe('executed');
  });

  it('should handle arrays', () => {
    const items = [1, 2, 3];
    const result = getOrThrow(items, 'Items not found');
    expect(result).toEqual([1, 2, 3]);
  });

  it('should work with promises result', () => {
    // Simulating a resolved promise value
    const promiseValue = { data: 'resolved' };
    const result = getOrThrow(promiseValue, 'Promise value not found');
    expect(result).toEqual({ data: 'resolved' });
  });
});

describe('getOrThrow - Real-world usage patterns', () => {
  interface Plugin {
    uid: string;
    name: string;
    version: string;
  }

  const mockPluginManager = {
    plugins: new Map<string, Plugin>([
      ['plugin-1', { uid: 'plugin-1', name: 'Test Plugin', version: '1.0.0' }],
      ['plugin-2', { uid: 'plugin-2', name: 'Another Plugin', version: '2.0.0' }],
    ]),

    get(uid: string): Plugin | undefined {
      return this.plugins.get(uid);
    },
  };

  it('should work in typical route handler pattern', () => {
    // Typical usage: get plugin or throw 404
    const plugin = getOrThrow(mockPluginManager.get('plugin-1'), 'Plugin not found');
    expect(plugin.uid).toBe('plugin-1');
    expect(plugin.name).toBe('Test Plugin');
  });

  it('should throw when resource does not exist', () => {
    expect(() => {
      getOrThrow(mockPluginManager.get('non-existent'), 'Plugin not found');
    }).toThrow(NotFound);
  });

  it('should handle chained lookups', () => {
    interface Workflow {
      id: string;
      blocks: Array<{ id: string; type: string }>;
    }

    const workflows = new Map<string, Workflow>([
      [
        'wf-1',
        {
          id: 'wf-1',
          blocks: [{ id: 'block-1', type: 'timer' }],
        },
      ],
    ]);

    const workflow = getOrThrow(workflows.get('wf-1'), 'Workflow not found');
    expect(workflow.blocks.length).toBe(1);

    const block = getOrThrow(
      workflow.blocks.find((b) => b.id === 'block-1'),
      'Block not found'
    );
    expect(block.type).toBe('timer');
  });
});
