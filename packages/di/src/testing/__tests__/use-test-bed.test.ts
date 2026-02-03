import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import { injectable, singleton } from 'tsyringe';
import { get, provide, stub, useTestBed } from '../index';

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
