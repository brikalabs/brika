import 'reflect-metadata';
import { describe, expect, mock, spyOn, test } from 'bun:test';
import { injectable, singleton } from 'tsyringe';
import { get, provide, reset, stub, trackSpy, useTestBed } from '../index';

@injectable()
class Logger {
  info(msg: string) {
    return `info: ${msg}`;
  }
  error(msg: string) {
    return `error: ${msg}`;
  }
}

@singleton()
class ConfigService {
  readonly port = 3000;
  readonly host = 'localhost';
}

@injectable()
class UserService {
  constructor(
    private logger: Logger,
    private config: ConfigService
  ) {}

  getUser(id: string) {
    this.logger.info(`Getting user ${id}`);
    return { id, name: 'Test User', port: this.config.port };
  }
}

describe('useTestBed', () => {
  // Disable autoStub - these tests verify DI resolution with specific dependencies
  useTestBed({ autoStub: false });

  test('stub() creates deep stub', () => {
    stub(Logger);

    const logger = get(Logger);
    // Methods are auto-stubbed (no-op)
    expect(() => logger.info('test')).not.toThrow();
    expect(() => logger.error('test')).not.toThrow();
  });

  test('stub() accepts overrides', () => {
    const infoSpy = mock().mockReturnValue('mocked');
    stub(Logger, { info: infoSpy });

    const logger = get(Logger);
    expect(logger.info('test')).toBe('mocked');
    expect(infoSpy).toHaveBeenCalledWith('test');
  });

  test('provide() registers mock value', () => {
    provide(ConfigService, { port: 8080, host: 'example.com' });

    const config = get(ConfigService);
    expect(config.port).toBe(8080);
    expect(config.host).toBe('example.com');
  });

  test('get() resolves with mocked dependencies', () => {
    stub(Logger);
    provide(ConfigService, { port: 4000, host: 'mock' });

    const service = get(UserService);
    const user = service.getUser('123');

    expect(user.id).toBe('123');
    expect(user.port).toBe(4000);
  });

  test('auto-resets between tests', () => {
    // This test verifies that previous test's mocks don't persist
    // If reset didn't work, ConfigService would still have port: 4000
    provide(ConfigService, { port: 7000, host: 'fresh' });
    stub(Logger);

    const service = get(UserService);
    expect(service.getUser('1').port).toBe(7000);
  });
});

// Test object for spy tests
const testObj = {
  getValue: () => 'original',
  multiply: (a: number, b: number) => a * b,
};

describe('trackSpy', () => {
  useTestBed({ autoStub: false });

  test('returns the spy for chaining', () => {
    const spy = trackSpy(spyOn(testObj, 'getValue'));
    expect(spy).toBeDefined();
    expect(typeof spy.mockRestore).toBe('function');
  });

  test('spy is active after tracking', () => {
    trackSpy(spyOn(testObj, 'getValue').mockReturnValue('mocked'));

    expect(testObj.getValue()).toBe('mocked');
  });

  test('spy is restored after reset', () => {
    trackSpy(spyOn(testObj, 'getValue').mockReturnValue('mocked'));
    expect(testObj.getValue()).toBe('mocked');

    reset();

    expect(testObj.getValue()).toBe('original');
  });

  test('multiple spies are tracked and restored', () => {
    trackSpy(spyOn(testObj, 'getValue').mockReturnValue('mocked'));
    trackSpy(spyOn(testObj, 'multiply').mockReturnValue(999));

    expect(testObj.getValue()).toBe('mocked');
    expect(testObj.multiply(2, 3)).toBe(999);

    reset();

    expect(testObj.getValue()).toBe('original');
    expect(testObj.multiply(2, 3)).toBe(6);
  });

  test('auto-restores spies between tests via useTestBed', () => {
    // Previous test's spies should be restored
    // If not, getValue would return 'mocked' from previous test
    expect(testObj.getValue()).toBe('original');
    expect(testObj.multiply(4, 5)).toBe(20);
  });
});
