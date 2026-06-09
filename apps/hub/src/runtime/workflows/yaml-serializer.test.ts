import { describe, expect, test } from 'bun:test';
import type { BlockConnection, Workflow } from './types';
import { YAMLSerializer } from './yaml-serializer';

const key = (c: BlockConnection): string => `${c.from}:${c.fromPort}->${c.to}:${c.toPort}`;
const sortedKeys = (conns: BlockConnection[]): string[] => conns.map(key).sort();

describe('YAMLSerializer multi-connection', () => {
  test('round-trips fan-out and fan-in connections', () => {
    const workflow: Workflow = {
      id: 'wf',
      name: 'Fan',
      enabled: true,
      blocks: [
        { id: 'src', type: 'p:clock' },
        { id: 'a', type: 'p:log' },
        { id: 'b', type: 'p:log' },
        { id: 'merge', type: 'p:log' },
      ],
      connections: [
        // fan-out: one output port -> two targets
        { from: 'src', fromPort: 'tick', to: 'a', toPort: 'in' },
        { from: 'src', fromPort: 'tick', to: 'b', toPort: 'in' },
        // fan-in: two outputs -> one input port
        { from: 'a', fromPort: 'out', to: 'merge', toPort: 'in' },
        { from: 'b', fromPort: 'out', to: 'merge', toPort: 'in' },
      ],
    };

    const yaml = YAMLSerializer.toYAML(workflow, () => null);

    // Fan-out is serialized as a YAML array under the shared output port.
    expect(yaml).toContain('- a:in');
    expect(yaml).toContain('- b:in');

    const parsed = YAMLSerializer.fromYAML(yaml);
    expect(parsed).not.toBeNull();
    expect(sortedKeys(parsed?.connections ?? [])).toEqual(sortedKeys(workflow.connections ?? []));
  });

  test('keeps a single connection as a plain string', () => {
    const workflow: Workflow = {
      id: 'wf',
      name: 'Single',
      enabled: true,
      blocks: [
        { id: 'src', type: 'p:clock' },
        { id: 'sink', type: 'p:log' },
      ],
      connections: [{ from: 'src', fromPort: 'tick', to: 'sink', toPort: 'in' }],
    };

    const yaml = YAMLSerializer.toYAML(workflow, () => null);
    // A lone connection stays terse: "tick: sink:in", not a one-item list.
    expect(yaml).toContain('tick: sink:in');
    expect(yaml).not.toContain('- sink:in');

    const parsed = YAMLSerializer.fromYAML(yaml);
    expect(sortedKeys(parsed?.connections ?? [])).toEqual(sortedKeys(workflow.connections ?? []));
  });
});
