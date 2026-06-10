import { describe, expect, test } from 'bun:test';
import { defineSpark } from '../api/sparks';
import { defineBlock, input, output, z } from '../blocks';
import { runBlock } from './run-block';

const fired = defineSpark({
  id: 'delay-fired',
  meta: { name: 'Delay Fired' },
  schema: z.object({ at: z.number() }),
});

// A time-based block: on trigger, after config.ms, emit a spark + output. Uses
// the global setTimeout + Date.now() that the fake clock replaces. Port display
// names default from the keys ("trigger" -> "Trigger", "done" -> "Done").
const delay = defineBlock({
  id: 'delay',
  meta: { name: 'Delay', category: 'flow' },
  inputs: { trigger: input(z.generic()) },
  outputs: { done: output(z.object({ at: z.number() })) },
  config: z.object({ ms: z.number().default(1000) }),
  run({ inputs, outputs, config }) {
    inputs.trigger.on(() => {
      setTimeout(() => {
        const at = Date.now();
        fired.emit({ at });
        outputs.done.emit({ at });
      }, config.ms);
    });
  },
});

// A pure transform: doubles each number pushed to `in` onto `out`.
const double = defineBlock({
  id: 'double',
  meta: { name: 'Double', category: 'transform' },
  inputs: { in: input(z.number()) },
  outputs: { out: output(z.number()) },
  config: z.object({}),
  run({ inputs, outputs }) {
    inputs.in.on((value) => outputs.out.emit(value * 2));
  },
});

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

  test('exposes the raw spark sink and tolerates a repeated stop', () => {
    const h = runBlock(delay, { config: { ms: 1 } });
    expect(h.sparks.all).toEqual([]); // the unfiltered sink, empty before any emit
    h.stop();
    h.stop(); // idempotent: the second stop is a no-op, not a double-uninstall
    expect(h.sparks.all).toEqual([]);
  });
});

const chatty = defineBlock({
  id: 'chatty',
  inputs: {
    in: input(z.number()),
  },
  outputs: {},
  config: z.object({}),
  run: ({ inputs, log }) => {
    inputs.in.on((value) => {
      log.info('got value', { value });
    });
  },
});

describe('runBlock log capture', () => {
  test('captures ctx.log entries with structured data', () => {
    using h = runBlock(chatty);
    h.inputs.in?.push(7);
    expect(h.logs).toEqual([{ level: 'info', message: 'got value', data: { value: 7 } }]);
  });
});
