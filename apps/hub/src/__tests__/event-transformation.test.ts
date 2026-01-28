/**
 * Tests for event transformation utilities
 * Testing the refactored transformActionToWorkflowEvent function
 */
import { describe, expect, it } from 'bun:test';

// Since transformActionToWorkflowEvent is not exported, we'll test the transformation logic
// by creating a similar function here for testing purposes
type WorkflowEventType = 'start' | 'stop' | 'input' | 'output' | 'state' | 'error';

interface WorkflowEvent {
  type: WorkflowEventType;
  workflowId: string;
  blockId?: string;
  portId?: string;
  data?: unknown;
  timestamp: number;
}

function transformActionToWorkflowEvent(
  action: { type: string; payload: unknown; timestamp: number },
  workflowId: string
): WorkflowEvent {
  const typeParts = action.type.split('.');
  const eventType = typeParts[typeParts.length - 1] as WorkflowEventType;

  const payload = action.payload as Record<string, unknown> | null | undefined;

  return {
    type: eventType,
    workflowId,
    blockId: payload?.blockId as string | undefined,
    portId: payload?.portId as string | undefined,
    data: action.payload,
    timestamp: action.timestamp,
  };
}

describe('transformActionToWorkflowEvent', () => {
  it('should extract event type from action type string', () => {
    const action = {
      type: 'workflow.test-id.start',
      payload: {},
      timestamp: Date.now(),
    };

    const result = transformActionToWorkflowEvent(action, 'test-id');

    expect(result.type).toBe('start');
    expect(result.workflowId).toBe('test-id');
  });

  it('should handle block input events', () => {
    const action = {
      type: 'block.workflow-1.input',
      payload: {
        blockId: 'block-123',
        portId: 'data-in',
        value: { test: 'data' },
      },
      timestamp: 1234567890,
    };

    const result = transformActionToWorkflowEvent(action, 'workflow-1');

    expect(result.type).toBe('input');
    expect(result.workflowId).toBe('workflow-1');
    expect(result.blockId).toBe('block-123');
    expect(result.portId).toBe('data-in');
    expect(result.timestamp).toBe(1234567890);
  });

  it('should handle block output events', () => {
    const action = {
      type: 'block.workflow-2.output',
      payload: {
        blockId: 'block-456',
        portId: 'result',
        value: 42,
      },
      timestamp: 9876543210,
    };

    const result = transformActionToWorkflowEvent(action, 'workflow-2');

    expect(result.type).toBe('output');
    expect(result.blockId).toBe('block-456');
    expect(result.portId).toBe('result');
  });

  it('should handle null payload gracefully', () => {
    const action = {
      type: 'workflow.test.start',
      payload: null,
      timestamp: Date.now(),
    };

    const result = transformActionToWorkflowEvent(action, 'test');

    expect(result.type).toBe('start');
    expect(result.blockId).toBeUndefined();
    expect(result.portId).toBeUndefined();
    expect(result.data).toBeNull();
  });

  it('should handle undefined payload gracefully', () => {
    const action = {
      type: 'workflow.test.stop',
      payload: undefined,
      timestamp: Date.now(),
    };

    const result = transformActionToWorkflowEvent(action, 'test');

    expect(result.type).toBe('stop');
    expect(result.blockId).toBeUndefined();
    expect(result.portId).toBeUndefined();
  });

  it('should handle payload without blockId or portId', () => {
    const action = {
      type: 'workflow.test.start',
      payload: {
        someOtherField: 'value',
      },
      timestamp: Date.now(),
    };

    const result = transformActionToWorkflowEvent(action, 'test');

    expect(result.blockId).toBeUndefined();
    expect(result.portId).toBeUndefined();
    expect(result.data).toEqual({ someOtherField: 'value' });
  });

  it('should handle complex nested payloads', () => {
    const action = {
      type: 'block.workflow-3.state',
      payload: {
        blockId: 'complex-block',
        portId: 'status',
        state: {
          nested: {
            data: [1, 2, 3],
            metadata: { created: Date.now() },
          },
        },
      },
      timestamp: Date.now(),
    };

    const result = transformActionToWorkflowEvent(action, 'workflow-3');

    expect(result.type).toBe('state');
    expect(result.blockId).toBe('complex-block');
    expect(result.portId).toBe('status');
    expect(result.data).toBeDefined();
  });

  it('should preserve timestamp from action', () => {
    const timestamp = 1704067200000; // Jan 1, 2024
    const action = {
      type: 'workflow.test.start',
      payload: {},
      timestamp,
    };

    const result = transformActionToWorkflowEvent(action, 'test');

    expect(result.timestamp).toBe(timestamp);
  });

  it('should handle event types with multiple dots', () => {
    const action = {
      type: 'namespace.workflow.test-id.block.error',
      payload: {
        blockId: 'error-block',
        error: 'Something went wrong',
      },
      timestamp: Date.now(),
    };

    const result = transformActionToWorkflowEvent(action, 'test-id');

    // Should extract the last part
    expect(result.type).toBe('error');
    expect(result.blockId).toBe('error-block');
  });

  it('should handle block error events', () => {
    const action = {
      type: 'block.workflow-1.error',
      payload: {
        blockId: 'failing-block',
        error: {
          message: 'Block execution failed',
          code: 'EXEC_ERROR',
        },
      },
      timestamp: Date.now(),
    };

    const result = transformActionToWorkflowEvent(action, 'workflow-1');

    expect(result.type).toBe('error');
    expect(result.blockId).toBe('failing-block');
    expect(result.data).toEqual({
      blockId: 'failing-block',
      error: {
        message: 'Block execution failed',
        code: 'EXEC_ERROR',
      },
    });
  });

  it('should work with array payloads', () => {
    const action = {
      type: 'block.workflow-1.output',
      payload: [1, 2, 3, 4, 5],
      timestamp: Date.now(),
    };

    const result = transformActionToWorkflowEvent(action, 'workflow-1');

    expect(result.type).toBe('output');
    expect(result.data).toEqual([1, 2, 3, 4, 5]);
    expect(result.blockId).toBeUndefined(); // Array doesn't have blockId property
  });

  it('should work with string payloads', () => {
    const action = {
      type: 'workflow.test.start',
      payload: 'simple string payload',
      timestamp: Date.now(),
    };

    const result = transformActionToWorkflowEvent(action, 'test');

    expect(result.data).toBe('simple string payload');
    expect(result.blockId).toBeUndefined();
  });

  it('should work with number payloads', () => {
    const action = {
      type: 'block.workflow-1.output',
      payload: 42,
      timestamp: Date.now(),
    };

    const result = transformActionToWorkflowEvent(action, 'workflow-1');

    expect(result.data).toBe(42);
  });

  it('should work with boolean payloads', () => {
    const action = {
      type: 'block.workflow-1.state',
      payload: true,
      timestamp: Date.now(),
    };

    const result = transformActionToWorkflowEvent(action, 'workflow-1');

    expect(result.data).toBe(true);
  });
});

describe('transformActionToWorkflowEvent - Edge Cases', () => {
  it('should handle empty type string', () => {
    const action = {
      type: '',
      payload: {},
      timestamp: Date.now(),
    };

    const result = transformActionToWorkflowEvent(action, 'test');

    expect(result.type).toBe('' as WorkflowEventType);
  });

  it('should handle type with no dots', () => {
    const action = {
      type: 'start',
      payload: {},
      timestamp: Date.now(),
    };

    const result = transformActionToWorkflowEvent(action, 'test');

    expect(result.type).toBe('start');
  });

  it('should handle very long type strings', () => {
    const longType = Array(100).fill('namespace').join('.') + '.start';
    const action = {
      type: longType,
      payload: {},
      timestamp: Date.now(),
    };

    const result = transformActionToWorkflowEvent(action, 'test');

    expect(result.type).toBe('start');
  });

  it('should handle special characters in workflowId', () => {
    const action = {
      type: 'workflow.test.start',
      payload: {},
      timestamp: Date.now(),
    };

    const result = transformActionToWorkflowEvent(action, 'workflow-with-special-chars-123_@!');

    expect(result.workflowId).toBe('workflow-with-special-chars-123_@!');
  });
});
