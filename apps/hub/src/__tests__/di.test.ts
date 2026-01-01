import 'reflect-metadata'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  container,
  createMock,
  createSpyFn,
  inject,
  injectable,
  mock as mock1,
  mock,
  singleton,
  TestBed
} from '@elia/shared'

describe("DI Container", () => {
  beforeEach(() => {
    container.reset();
  });

  afterEach(() => {
    container.reset();
  });

  it("should resolve singleton services", () => {
    @singleton()
    class Counter {
      count = 0;
      increment() { this.count++; }
    }

    const c1 = container.resolve(Counter);
    c1.increment();

    const c2 = container.resolve(Counter);
    expect(c2.count).toBe(1);
    expect(c1).toBe(c2);
  });

  it("should resolve injectable services (non-singleton)", () => {
    @injectable()
    class Counter {
      count = 0;
    }

    const c1 = container.resolve(Counter);
    const c2 = container.resolve(Counter);

    expect(c1).not.toBe(c2);
  });

  it("should inject dependencies via inject()", () => {
    @singleton()
    class Logger {
      log(msg: string) { return `LOG: ${msg}`; }
    }

    @singleton()
    class Service {
      private readonly logger = inject(Logger);
      doWork() { return this.logger.log("working"); }
    }

    const service = container.resolve(Service);
    expect(service.doWork()).toBe("LOG: working");
  });
});

describe("inject() function", () => {
  beforeEach(() => {
    container.reset();
  });

  afterEach(() => {
    container.reset();
  });

  it("should work as property initializer", () => {
    @singleton()
    class Logger {
      log(msg: string) { return `LOG: ${msg}`; }
    }

    @singleton()
    class Service {
      readonly logger = inject(Logger);
      doWork() { return this.logger.log("working"); }
    }

    const service = container.resolve(Service);
    expect(service.doWork()).toBe("LOG: working");
  });

  it("should return same singleton via inject()", () => {
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

describe("TestBed", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it("should allow mocking services", () => {
    @singleton()
    class RealLogger {
      log(msg: string) { return `REAL: ${msg}`; }
    }

    @singleton()
    class Service {
      readonly logger = inject(RealLogger);
      doWork() { return this.logger.log("test"); }
    }

    const mockLogger = mock<RealLogger>({
      log: () => "MOCKED",
    });

    TestBed
      .configureTestingModule()
      .provide(RealLogger, mockLogger);

    const service = TestBed.inject(Service);
    expect(service.doWork()).toBe("MOCKED");
  });

  it("should isolate tests", () => {
    @singleton()
    class Counter {
      count = 0;
      increment() { this.count++; }
    }

    // Test 1
    TestBed.configureTestingModule();
    const c1 = TestBed.inject(Counter);
    c1.increment();
    c1.increment();
    expect(c1.count).toBe(2);

    // Reset between tests
    TestBed.resetTestingModule();

    // Test 2 - fresh counter
    TestBed.configureTestingModule();
    const c2 = TestBed.inject(Counter);
    expect(c2.count).toBe(0);
  });
});

describe("createSpyFn", () => {
  it("should track calls", () => {
    const fn = createSpyFn<[number, string]>();

    fn(1, "a");
    fn(2, "b");
    fn(3, "c");

    expect(fn.callCount).toBe(3);
    expect(fn.calls[0]).toEqual([1, "a"]);
    expect(fn.calls[1]).toEqual([2, "b"]);
    expect(fn.lastCall).toEqual([3, "c"]); // lastCall is now a property, not a function
  });

  it("should return configured value", () => {
    const spy = createSpyFn<[], string>("hello");
    expect(spy()).toBe("hello");
  });

  it("should reset calls", () => {
    const spy = createSpyFn();
    spy();
    spy();
    expect(spy.callCount).toBe(2);

    spy.reset();
    expect(spy.callCount).toBe(0);
  });
});

describe("createMock", () => {
  it("should create partial mock", () => {
    interface Service {
      methodA(): string;
      methodB(): number;
    }

    const mock = mock1<Service>({
      methodA: () => "mocked",
    });

    expect(mock.methodA()).toBe("mocked");
    expect(mock.methodB).toBeUndefined();
  });
});
