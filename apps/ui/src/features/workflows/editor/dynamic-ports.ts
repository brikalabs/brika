/**
 * Dynamic (templated) port expansion.
 *
 * A block output port may declare `dynamic: '<configKey>'`, marking it a template
 * that repeats once per item of that config array. The editor expands it into
 * concrete ports `<id>-<index>` so handles, type inference, and connection
 * validation all see real ports. Blocks emit to them with the raw `emit` context
 * method (e.g. the Switch block emits `case-0`, `case-1`, ...).
 */

import type { BlockPort } from './BlockNode';

/** Shape of a dynamic config-array item; all fields optional. */
interface DynamicItem {
  value?: unknown;
  label?: unknown;
}

function itemLabel(item: unknown, baseName: string, index: number): string {
  if (item && typeof item === 'object') {
    const { label, value } = item as DynamicItem;
    if (typeof label === 'string' && label.trim()) {
      return label;
    }
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return `${baseName} ${index + 1}`;
}

/**
 * Expand any templated ports against the given config, leaving static ports
 * untouched. A template whose config array is missing/empty yields no ports.
 */
export function expandDynamicPorts(
  ports: readonly BlockPort[],
  config: Record<string, unknown>
): BlockPort[] {
  return ports.flatMap((port) => {
    if (!port.dynamic) {
      return [port];
    }
    const items = config[port.dynamic];
    if (!Array.isArray(items)) {
      return [];
    }
    return items.map((item, index) => ({
      ...port,
      id: `${port.id}-${index}`,
      name: itemLabel(item, port.name, index),
      dynamic: undefined,
    }));
  });
}
