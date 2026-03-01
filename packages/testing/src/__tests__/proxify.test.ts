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

  test('set trap delegates property assignment to instance', () => {
    counter.value = 99;
    expect(current.value).toBe(99);
  });

  test('has trap delegates "in" operator to instance', () => {
    expect('value' in counter).toBe(true);
    expect('increment' in counter).toBe(true);
    expect('nonExistent' in counter).toBe(false);
  });

  test('ownKeys trap delegates to instance', () => {
    const keys = Reflect.ownKeys(counter);
    expect(keys).toContain('value');
  });

  test('getOwnPropertyDescriptor trap delegates to instance', () => {
    const desc = Object.getOwnPropertyDescriptor(counter, 'value');
    expect(desc).toBeDefined();
    expect(desc?.value).toBe(0);
  });

  test('getOwnPropertyDescriptor returns undefined for non-existent prop', () => {
    const desc = Object.getOwnPropertyDescriptor(counter, 'nonExistent');
    expect(desc).toBeUndefined();
  });

  test('set trap works with new properties on underlying instance', () => {
    (counter as Record<string, unknown>).newProp = 'hello';
    expect((current as Record<string, unknown>).newProp).toBe('hello');
  });

  test('ownKeys reflects changes after mutation', () => {
    (current as Record<string, unknown>).extra = true;
    const keys = Reflect.ownKeys(counter);
    expect(keys).toContain('extra');
  });
});
