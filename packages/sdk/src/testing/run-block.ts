/**
 * `runBlock` — a hermetic test harness for reactive blocks.
 *
 * Instantiates a block's `start()` seam with a captured `emit`, an in-memory
 * spark sink, and a deterministic fake clock, so a test can push inputs, advance
 * time, and assert on emitted outputs and sparks without a running hub.
 *
 * ```ts
 * using h = runBlock(timer, { config: { duration: 5000 } });
 * h.inputs.trigger.emit();
 * await h.clock.advance(5000);
 * expect(h.outputs.completed.emitted).toHaveLength(1);
 * expect(h.sparks.last(timerCompleted)?.duration).toBe(5000);
 * ```
 */

import { mock } from 'bun:test';
import type { Serializable } from '@brika/serializable';
import type { z } from 'zod';
import type { CompiledSpark } from '../api/sparks';
import type { CompiledReactiveBlock } from '../blocks/reactive-define';
import { installFakeClock, type TestClock } from './clock';

interface CapturedSpark {
  id: string;
  payload: unknown;
}

// The block runtime resolves sparks/logging through getContext(). We swap the
// active sink per runBlock so concurrent harnesses never cross-pollute.
let activeSparkSink: CapturedSpark[] | null = null;

// A complete stand-in context so the block runtime's getContext() calls
// (emitSpark, registerSpark/Block, subscribeSpark, log) all resolve.
const harnessContext = {
  registerBlock: () => ({ id: 'test-block' }),
  registerSpark: () => ({ id: 'test-spark' }),
  emitSpark: (id: string, payload: unknown) => {
    activeSparkSink?.push({ id: String(id), payload });
  },
  subscribeSpark: () => () => {},
  log: () => {},
  emit: () => {},
  capture: () => {},
};

/**
 * Point `getContext()` at the harness stand-in.
 *
 * This runs at `runBlock()` call time (not module load), so it is the last
 * `mock.module('../context')` in the process and wins over any sibling test
 * file's top-level context mock. That is essential inside the SDK's own suite,
 * where Bun's process-wide `mock.module` bleed (Bun #12823) would otherwise
 * leave `getContext()` pointing at a sibling's emitSpark-less stub. For plugin
 * authors there is no sibling mock, so this is simply the harness context.
 */
function ensureContext(): void {
  if (typeof process.send !== 'function') {
    process.send = () => true;
  }
  mock.module('../context', () => ({ getContext: () => harnessContext }));
}

/** A single output port's captured emissions. */
interface OutputProbe {
  /** Every value emitted on this port, in order. */
  readonly emitted: ReadonlyArray<unknown>;
  /** Subscribe to future emissions on this port. */
  on(listener: (value: unknown) => void): void;
}

/** A single input port driver. */
interface InputDriver {
  /** Push a value to this input port. */
  push(value: Serializable): void;
  /** Push `null` (for trigger-style ports that carry no payload). */
  emit(): void;
}

export interface BlockHarness {
  readonly inputs: Record<string, InputDriver>;
  readonly outputs: Record<string, OutputProbe>;
  readonly sparks: {
    /** Every spark emitted during the run, in order. */
    readonly all: ReadonlyArray<CapturedSpark>;
    /** Payloads emitted for one spark, typed by its schema. */
    emitted<S extends z.ZodType>(spark: CompiledSpark<S>): Array<z.infer<S>>;
    /** The most recent payload for one spark, typed by its schema. */
    last<S extends z.ZodType>(spark: CompiledSpark<S>): z.infer<S> | undefined;
  };
  readonly clock: TestClock;
  /** Run the block's cleanup and restore real timers. */
  stop(): void;
  [Symbol.dispose](): void;
}

export interface RunBlockOptions {
  config?: Record<string, unknown>;
}

/** Instantiate a block in a hermetic harness. See the module doc for usage. */
export function runBlock(
  block: CompiledReactiveBlock,
  options: RunBlockOptions = {}
): BlockHarness {
  ensureContext();

  const sink: CapturedSpark[] = [];
  activeSparkSink = sink;
  const clock = installFakeClock();

  const probes = new Map<string, { emitted: unknown[]; listeners: Array<(v: unknown) => void> }>();
  for (const port of block.outputs) {
    probes.set(port.id, { emitted: [], listeners: [] });
  }

  const emit = (portId: string, data: Serializable): void => {
    const probe = probes.get(portId);
    if (probe) {
      probe.emitted.push(data);
      for (const listener of probe.listeners) {
        listener(data);
      }
    }
  };

  const instance = block.start({
    blockId: 'test-block',
    workflowId: 'test-workflow',
    config: options.config ?? {},
    emit,
  });

  const inputs: Record<string, InputDriver> = {};
  for (const port of block.inputs) {
    inputs[port.id] = {
      push: (value) => instance.pushInput(port.id, value),
      emit: () => instance.pushInput(port.id, null),
    };
  }

  const outputs: Record<string, OutputProbe> = {};
  for (const [id, probe] of probes) {
    outputs[id] = {
      get emitted() {
        return probe.emitted;
      },
      on: (listener) => {
        probe.listeners.push(listener);
      },
    };
  }

  let stopped = false;
  const stop = (): void => {
    if (stopped) {
      return;
    }
    stopped = true;
    instance.stop();
    clock.uninstall();
    if (activeSparkSink === sink) {
      activeSparkSink = null;
    }
  };

  return {
    inputs,
    outputs,
    sparks: {
      get all() {
        return sink;
      },
      // Parse through the spark's own schema: types the payload and validates
      // that what the block emitted matches the spark's contract.
      emitted: (spark) =>
        sink.filter((e) => e.id === spark.id).map((e) => spark.schema.parse(e.payload)),
      last: (spark) => {
        const matches = sink.filter((e) => e.id === spark.id);
        const lastMatch = matches[matches.length - 1];
        return lastMatch === undefined ? undefined : spark.schema.parse(lastMatch.payload);
      },
    },
    clock,
    stop,
    [Symbol.dispose]: stop,
  };
}
