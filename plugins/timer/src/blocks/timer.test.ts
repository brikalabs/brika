import { expect, test } from 'bun:test';
import { runBlock } from '@brika/sdk/testing';
import { timerCompleted, timerStarted } from '../sparks';
import { timer } from './timer';

test('emits started immediately and completed after the duration', async () => {
  using h = runBlock(timer, { config: { name: 'tea', duration: 5000 } });

  h.inputs.trigger.emit();
  expect(h.sparks.last(timerStarted)?.name).toBe('tea');
  expect(h.outputs.completed.emitted).toHaveLength(0);

  await h.clock.advance(5000);
  expect(h.outputs.completed.emitted).toHaveLength(1);
  expect(h.sparks.last(timerCompleted)?.duration).toBe(5000);
});

test('restarting the timer before it fires only completes once', async () => {
  using h = runBlock(timer, { config: { duration: 1000 } });

  h.inputs.trigger.emit();
  await h.clock.advance(500);
  h.inputs.trigger.emit(); // restart resets the pending timeout
  await h.clock.advance(500);
  expect(h.outputs.completed.emitted).toHaveLength(0); // first timer was cancelled

  await h.clock.advance(500);
  expect(h.outputs.completed.emitted).toHaveLength(1);
});
