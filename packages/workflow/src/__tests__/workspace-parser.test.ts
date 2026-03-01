/**
 * Tests for Workspace Parser
 */

import { describe, expect, test } from 'bun:test';
import type { Workflow } from '../types';
import { parseWorkspace, parseWorkspaceFile, serializeWorkspace } from '../workspace/parser';

describe('parseWorkspace', () => {
  describe('valid YAML', () => {
    test('parses minimal valid workspace', () => {
      const yaml = `
workspace:
  id: test-workspace
  name: Test Workspace
`;
      const result = parseWorkspace(yaml);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.workflow.workspace.id).toBe('test-workspace');
        expect(result.workflow.workspace.name).toBe('Test Workspace');
        expect(result.workflow.workspace.enabled).toBe(true);
      }
    });

    test('parses workspace with version', () => {
      const yaml = `
version: "2"
workspace:
  id: test
  name: Test
`;
      const result = parseWorkspace(yaml);

      expect(result.ok).toBe(true);
    });

    test('parses workspace with description', () => {
      const yaml = `
workspace:
  id: test
  name: Test
  description: A test workspace
`;
      const result = parseWorkspace(yaml);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.workflow.workspace.description).toBe('A test workspace');
      }
    });

    test('parses workspace with enabled flag', () => {
      const yaml = `
workspace:
  id: test
  name: Test
  enabled: false
`;
      const result = parseWorkspace(yaml);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.workflow.workspace.enabled).toBe(false);
      }
    });

    test('parses workspace with plugins', () => {
      const yaml = `
workspace:
  id: test
  name: Test
plugins:
  "@brika/timer": "1.0.0"
  "@brika/http": "2.0.0"
`;
      const result = parseWorkspace(yaml);

      expect(result.ok).toBe(true);
    });

    test('parses workspace with blocks', () => {
      const yaml = `
workspace:
  id: test
  name: Test
blocks:
  - id: block-1
    type: "@brika/timer:interval"
  - id: block-2
    type: "@brika/http:request"
`;
      const result = parseWorkspace(yaml);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.workflow.blocks).toHaveLength(2);
        expect(result.workflow.blocks[0]?.id).toBe('block-1');
        expect(result.workflow.blocks[1]?.id).toBe('block-2');
      }
    });

    test('parses block with config', () => {
      const yaml = `
workspace:
  id: test
  name: Test
blocks:
  - id: timer
    type: "@brika/timer:interval"
    config:
      interval: 1000
      enabled: true
`;
      const result = parseWorkspace(yaml);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.workflow.blocks[0]?.config).toEqual({
          interval: 1000,
          enabled: true,
        });
      }
    });

    test('parses block with position', () => {
      const yaml = `
workspace:
  id: test
  name: Test
blocks:
  - id: block-1
    type: test
    position:
      x: 100
      y: 200
`;
      const result = parseWorkspace(yaml);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.workflow.blocks[0]?.position).toEqual({
          x: 100,
          y: 200,
        });
      }
    });

    test('rounds position coordinates to integers', () => {
      const yaml = `
workspace:
  id: test
  name: Test
blocks:
  - id: block-1
    type: test
    position:
      x: 100.7
      y: 200.3
`;
      const result = parseWorkspace(yaml);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.workflow.blocks[0]?.position).toEqual({
          x: 101,
          y: 200,
        });
      }
    });

    test('parses block with inputs', () => {
      const yaml = `
workspace:
  id: test
  name: Test
blocks:
  - id: block-1
    type: test
    inputs:
      data: "other-block:output"
`;
      const result = parseWorkspace(yaml);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.workflow.blocks[0]?.inputs).toEqual({
          data: 'other-block:output',
        });
      }
    });

    test('parses block with outputs', () => {
      const yaml = `
workspace:
  id: test
  name: Test
blocks:
  - id: block-1
    type: test
    outputs:
      result: "other-block:input"
`;
      const result = parseWorkspace(yaml);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.workflow.blocks[0]?.outputs).toEqual({
          result: 'other-block:input',
        });
      }
    });
  });

  describe('invalid YAML', () => {
    test('returns error for invalid YAML syntax', () => {
      const yaml = `
workspace:
  id: test
  name: Test
  invalid_yaml: [unclosed
`;
      const result = parseWorkspace(yaml);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Parse error');
      }
    });

    test('returns error for missing workspace', () => {
      const yaml = `
version: "1"
blocks: []
`;
      const result = parseWorkspace(yaml);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Validation failed');
      }
    });

    test('returns error for missing workspace id', () => {
      const yaml = `
workspace:
  name: Test
`;
      const result = parseWorkspace(yaml);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Validation failed');
      }
    });

    test('returns error for missing workspace name', () => {
      const yaml = `
workspace:
  id: test
`;
      const result = parseWorkspace(yaml);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Validation failed');
      }
    });

    test('returns error for empty workspace id', () => {
      const yaml = `
workspace:
  id: ""
  name: Test
`;
      const result = parseWorkspace(yaml);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Workspace ID is required');
      }
    });

    test('returns error for empty workspace name', () => {
      const yaml = `
workspace:
  id: test
  name: ""
`;
      const result = parseWorkspace(yaml);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Workspace name is required');
      }
    });

    test('returns error for block without id', () => {
      const yaml = `
workspace:
  id: test
  name: Test
blocks:
  - type: test-type
`;
      const result = parseWorkspace(yaml);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Validation failed');
      }
    });

    test('returns error for block without type', () => {
      const yaml = `
workspace:
  id: test
  name: Test
blocks:
  - id: block-1
`;
      const result = parseWorkspace(yaml);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Validation failed');
      }
    });

    test('returns error for invalid port reference format', () => {
      const yaml = `
workspace:
  id: test
  name: Test
blocks:
  - id: block-1
    type: test
    inputs:
      data: "invalid-no-colon"
`;
      const result = parseWorkspace(yaml);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Port reference must be');
      }
    });
  });

  describe('edge cases', () => {
    test('handles empty YAML', () => {
      const result = parseWorkspace('');

      expect(result.ok).toBe(false);
    });

    test('handles null YAML content', () => {
      const result = parseWorkspace('null');

      expect(result.ok).toBe(false);
    });

    test('handles non-object YAML', () => {
      const result = parseWorkspace('just a string');

      expect(result.ok).toBe(false);
    });
  });
});

describe('parseWorkspaceFile', () => {
  test('returns error for non-existent file', async () => {
    const result = await parseWorkspaceFile('/non/existent/path.yaml');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('File read error');
    }
  });
});

describe('serializeWorkspace', () => {
  test('serializes minimal workflow to YAML', () => {
    const workflow: Workflow = {
      workspace: {
        id: 'test',
        name: 'Test Workflow',
        enabled: true,
      },
      version: '1.0',
      plugins: {},
      blocks: [],
    };

    const yaml = serializeWorkspace(workflow);

    expect(yaml).toContain('workspace:');
    expect(yaml).toContain('id: test');
    expect(yaml).toContain('name: Test Workflow');
  });

  test('serializes workflow with blocks', () => {
    const workflow: Workflow = {
      version: '1.0',
      workspace: {
        id: 'test',
        name: 'Test',
        enabled: true,
      },
      plugins: {},
      blocks: [
        {
          id: 'block-1',
          type: 'timer',
          config: {
            interval: 1000,
          } as Record<string, unknown>,
          position: {
            x: 0,
            y: 0,
          },
          inputs: {},
          outputs: {},
        },
      ],
    };

    const yaml = serializeWorkspace(workflow);

    expect(yaml).toContain('blocks:');
    expect(yaml).toContain('id: block-1');
    expect(yaml).toContain('type: timer');
  });

  test('round-trip: parse after serialize returns same data', () => {
    const original: Workflow = {
      version: '1.0',
      workspace: {
        id: 'roundtrip-test',
        name: 'Round Trip Test',
        description: 'Testing serialization roundtrip',
        enabled: true,
      },
      plugins: {},
      blocks: [
        {
          id: 'timer',
          type: '@brika/timer:interval',
          config: {
            ms: 5000,
          } as Record<string, unknown>,
          position: {
            x: 100,
            y: 200,
          },
          inputs: {},
          outputs: {
            tick: 'logger:input',
          },
        },
        {
          id: 'logger',
          type: '@brika/log:console',
          config: {} as Record<string, unknown>,
          position: {
            x: 300,
            y: 200,
          },
          inputs: {},
          outputs: {},
        },
      ],
    };

    const yaml = serializeWorkspace(original);
    const parsed = parseWorkspace(yaml);

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.workflow.workspace.id).toBe(original.workspace.id);
      expect(parsed.workflow.workspace.name).toBe(original.workspace.name);
      expect(parsed.workflow.blocks).toHaveLength(original.blocks.length);
    }
  });
});
