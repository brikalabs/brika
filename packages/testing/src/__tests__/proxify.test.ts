import { beforeEach, describe, expect, test } from 'bun:test';
import { proxify } from '../proxify';

class Counter {
  value = 0;

  increment() {
    this.value++;
    return this;
  }

  getValue() {
    return this.value;
  }
}

describe('proxify', () => {
  let current: Counter;
  const counter = proxify(() => current);

  beforeEach(() => {
    current = new Counter();
  });

  test('delegates method calls to current instance', () => {
    counter.increment();
    expect(counter.getValue()).toBe(1);
  });

  test('delegates property access to current instance', () => {
    current.value = 42;
    expect(counter.value).toBe(42);
  });

  test('resets with new instance', () => {
    counter.increment().increment();
    expect(counter.value).toBe(2);

    // Simulate beforeEach
    current = new Counter();

    expect(counter.value).toBe(0);
  });

  test('supports method chaining', () => {
    counter.increment().increment().increment();
    expect(counter.value).toBe(3);
  });

  test('binds methods correctly (this context)', () => {
    const { increment, getValue } = counter;
    increment();
    expect(getValue()).toBe(1);
  });
});
