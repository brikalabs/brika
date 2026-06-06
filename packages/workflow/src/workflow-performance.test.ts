/**
 * Performance / stability tests for the workflow runtime.
 *
 * These guard the "run a complex workflow forever without lag or crash" goal:
 * a deep relay chain is driven with a high volume of events and we assert that
 * every event propagates, throughput stays within budget, and memory stays
 * bounded (the event bus keeps one buffer per port, never one per event).
 */

import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { type BlockRegistry, WorkflowRuntime } from './engine/workflow-runtime';
import type { BlockInstance, CompiledBlock, PortRef, Workflow } from './types';

/** A block that forwards whatever it receives straight to its output. */
function relayBlock(): CompiledBlock {
  return {
    id: 'relay',
    nameKey: 'blocks.relay',
    descriptionKey: 'blocks.relay.description',
    category: 'test',
    icon: 'box',
    color: '#888888',
    inputs: [{ id: 'input', direction: 'input', nameKey: 'ports.input', schema: z.unknown() }],
    outputs: [{ id: 'output', direction: 'output', nameKey: 'ports.output', schema: z.unknown() }],
    configSchema: z.object({}),
    start: (ctx) => ({
      pushInput: (_portId, data) => ctx.emit('output', data),
      stop: () => undefined,
    }),
  };
}

/** A terminal block that counts everything it receives. */
function sinkBlock(onReceive: () => void): CompiledBlock {
  return {
    id: 'sink',
    nameKey: 'blocks.sink',
    descriptionKey: 'blocks.sink.description',
    category: 'test',
    icon: 'box',
    color: '#888888',
    inputs: [{ id: 'input', direction: 'input', nameKey: 'ports.input', schema: z.unknown() }],
    outputs: [],
    configSchema: z.object({}),
    start: (): BlockInstance => ({
      pushInput: () => onReceive(),
      stop: () => undefined,
    }),
  };
}

/** Build a straight relay chain of `depth` relays terminating in a sink. */
function buildChainWorkflow(depth: number): Workflow {
  const blocks: Workflow['blocks'] = [];
  for (let i = 0; i < depth; i++) {
    const next: PortRef = i === depth - 1 ? 'sink:input' : `relay-${i + 1}:input`;
    blocks.push({
      id: `relay-${i}`,
      type: 'relay',
      config: {},
      position: { x: i * 100, y: 0 },
      inputs: {},
      outputs: { output: next },
    });
  }
  blocks.push({
    id: 'sink',
    type: 'sink',
    config: {},
    position: { x: depth * 100, y: 0 },
    inputs: {},
    outputs: {},
  });
  return {
    version: '1.0',
    workspace: { id: 'perf', name: 'Perf', enabled: true },
    plugins: {},
    blocks,
  };
}

function makeRuntime(depth: number, onReceive: () => void): WorkflowRuntime {
  const registry: BlockRegistry = {
    get: (type) => (type === 'relay' ? relayBlock() : sinkBlock(onReceive)),
  };
  return new WorkflowRuntime(buildChainWorkflow(depth), { blocks: registry });
}

describe('workflow performance', () => {
  test('propagates a high volume of events through a deep chain without loss', async () => {
    const DEPTH = 8;
    const EVENTS = 20_000;
    let received = 0;
    const runtime = makeRuntime(DEPTH, () => {
      received++;
    });
    runtime.start();

    const start = performance.now();
    for (let i = 0; i < EVENTS; i++) {
      await runtime.inject('relay-0', 'output', { n: i });
    }
    const elapsedMs = performance.now() - start;

    expect(received).toBe(EVENTS);
    // Throughput budget: 20k events x 8 hops should clear well under 10s.
    expect(elapsedMs).toBeLessThan(10_000);

    runtime.stop();
    expect(runtime.isRunning).toBe(false);
  });

  test('keeps memory bounded: one buffer per port, never one per event', async () => {
    const DEPTH = 5;
    const runtime = makeRuntime(DEPTH, () => undefined);
    runtime.start();

    for (let i = 0; i < 5_000; i++) {
      await runtime.inject('relay-0', 'output', { n: i });
    }

    // The bus retains the latest value per emitting port, so buffer count is a
    // function of topology (constant), not of the 5000 events pushed through.
    const buffers = runtime.getAllPortBuffers();
    expect(buffers.length).toBeLessThanOrEqual(DEPTH + 1);

    runtime.stop();
  });

  test('survives sustained background bursts and stays running', async () => {
    const runtime = makeRuntime(4, () => undefined);
    runtime.start();

    // Simulate a background workflow ticking in bursts over many rounds.
    for (let round = 0; round < 200; round++) {
      await Promise.all(
        Array.from({ length: 50 }, (_, i) => runtime.inject('relay-0', 'output', { round, i }))
      );
      expect(runtime.isRunning).toBe(true);
    }

    expect(runtime.getBlockState('sink')).toBe('running');
    runtime.stop();
    expect(runtime.isRunning).toBe(false);
  });
});
