import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { container, inject, injectable, singleton } from '@brika/di';
import { useTestBed } from '@brika/di/testing';

const di = useTestBed();

describe('DI Container', () => {
  beforeEach(() => {
    container.reset();
  });

  container.reset();

  it('should resolve singleton services', () => {
    @singleton()
    class Counter {
      count = 0;

      increment() {
        this.count++;
      }
    }

    const c1 = container.resolve(Counter);
    c1.increment();

    const c2 = container.resolve(Counter);
    expect(c2.count).toBe(1);
    expect(c1).toBe(c2);
  });

  it('should resolve injectable services (non-singleton)', () => {
    @injectable()
    class Counter {
      count = 0;
    }

    const c1 = container.resolve(Counter);
    const c2 = container.resolve(Counter);

    expect(c1).not.toBe(c2);
  });

  it('should inject dependencies via inject()', () => {
    @singleton()
    class Logger {
      log(msg: string) {
        return `LOG: ${msg}`;
      }
    }

    @singleton()
    class Service {
      private readonly logger = inject(Logger);

      doWork() {
        return this.logger.log('working');
      }
    }

    const service = container.resolve(Service);
    expect(service.doWork()).toBe('LOG: working');
  });
});

describe('inject() function', () => {
  beforeEach(() => {
    container.reset();
  });

  container.reset();

  it('should work as property initializer', () => {
    @singleton()
    class Logger {
      log(msg: string) {
        return `LOG: ${msg}`;
      }
    }

    @singleton()
    class Service {
      readonly logger = inject(Logger);

      doWork() {
        return this.logger.log('working');
      }
    }

    const service = container.resolve(Service);
    expect(service.doWork()).toBe('LOG: working');
  });

  it('should return same singleton via inject()', () => {
    @singleton()
    class Config {
      value = 42;
    }

    @singleton()
    class ServiceA {
      readonly config = inject(Config);
    }

    @singleton()
    class ServiceB {
      readonly config = inject(Config);
    }

    const a = container.resolve(ServiceA);
    const b = container.resolve(ServiceB);

    expect(a.config).toBe(b.config);
  });
});

describe('TestBed', () => {
  it('should allow mocking services', () => {
    @singleton()
    class RealLogger {
      log(msg: string) {
        return `REAL: ${msg}`;
      }
    }

    @singleton()
    class Service {
      readonly logger = inject(RealLogger);

      doWork() {
        return this.logger.log('test');
      }
    }

    const mockLogger = { log: () => 'MOCKED' };
    di.provide(RealLogger, mockLogger);

    const service = di.get(Service);
    expect(service.doWork()).toBe('MOCKED');
  });

  it('should isolate tests', () => {
    @singleton()
    class Counter {
      count = 0;

      increment() {
        this.count++;
      }
    }

    // Test 1
    const c1 = di.get(Counter);
    c1.increment();
    c1.increment();
    expect(c1.count).toBe(2);

    // Reset between tests
    di.reset();

    // Test 2 - fresh counter
    const c2 = di.get(Counter);
    expect(c2.count).toBe(0);
  });
});
