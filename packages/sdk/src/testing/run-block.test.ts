import { describe, expect, test } from 'bun:test';
import { defineSpark } from '../api/sparks';
import { defineReactiveBlock, input, output, z } from '../blocks';
import { runBlock } from './run-block';

const fired = defineSpark({
  id: 'delay-fired',
  meta: { name: 'Delay Fired' },
  schema: z.object({ at: z.number() }),
});

// A time-based block: on trigger, after config.ms, emit a spark + output. Uses
// the global setTimeout + Date.now() that the fake clock replaces.
const delay = defineReactiveBlock(
  {
    id: 'delay',
    meta: { name: 'Delay', category: 'flow' },
    inputs: { trigger: input(z.generic(), { name: 'Trigger' }) },
    outputs: { done: output(z.object({ at: z.number() }), { name: 'Done' }) },
    config: z.object({ ms: z.number().default(1000) }),
  },
  ({ inputs, outputs, config }) => {
    inputs.trigger.on(() => {
      setTimeout(() => {
        const at = Date.now();
        fired.emit({ at });
        outputs.done.emit({ at });
      }, config.ms);
    });
  }
);

// A pure transform: doubles each number pushed to `in` onto `out`.
const double = defineReactiveBlock(
  {
    id: 'double',
    meta: { name: 'Double', category: 'transform' },
    inputs: { in: input(z.number(), { name: 'In' }) },
    outputs: { out: output(z.number(), { name: 'Out' }) },
    config: z.object({}),
  },
  ({ inputs, outputs }) => {
    inputs.in.on((value) => outputs.out.emit(value * 2));
  }
);

describe('runBlock', () => {
  test('fires output + spark after the configured delay, deterministically', async () => {
    using h = runBlock(delay, { config: { ms: 5000 } });
    h.inputs.trigger?.emit();

    expect(h.outputs.done?.emitted).toHaveLength(0); // nothing before time advances
    await h.clock.advance(5000);

    expect(h.outputs.done?.emitted).toEqual([{ at: 5000 }]); // Date.now() is the fake clock
    expect(h.sparks.last(fired)).toEqual({ at: 5000 });
    expect(h.sparks.emitted(fired)).toHaveLength(1);
  });

  test('applies the zod config default when none is given', async () => {
    using h = runBlock(delay);
    h.inputs.trigger?.emit();
    await h.clock.advance(999);
    expect(h.outputs.done?.emitted).toHaveLength(0);
    await h.clock.advance(1);
    expect(h.outputs.done?.emitted).toEqual([{ at: 1000 }]); // default ms = 1000
  });

  test('drives a pure transform with pushed input values', () => {
    using h = runBlock(double);
    const seen: unknown[] = [];
    h.outputs.out?.on((v) => seen.push(v));
    h.inputs.in?.push(21);
    expect(h.outputs.out?.emitted).toEqual([42]);
    expect(seen).toEqual([42]);
  });
});
