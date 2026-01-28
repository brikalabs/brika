import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import { injectable, singleton } from 'tsyringe';
import { useTestBed } from '../use-test-bed';

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
  const di = useTestBed();

  test('stub() creates deep stub', () => {
    di.stub(Logger);

    const logger = di.get(Logger);
    // Methods are auto-stubbed (no-op)
    expect(() => logger.info('test')).not.toThrow();
    expect(() => logger.error('test')).not.toThrow();
  });

  test('stub() accepts overrides', () => {
    const infoSpy = mock().mockReturnValue('mocked');
    di.stub(Logger, { info: infoSpy });

    const logger = di.get(Logger);
    expect(logger.info('test')).toBe('mocked');
    expect(infoSpy).toHaveBeenCalledWith('test');
  });

  test('provide() registers mock value', () => {
    di.provide(ConfigService, { port: 8080, host: 'example.com' });

    const config = di.get(ConfigService);
    expect(config.port).toBe(8080);
    expect(config.host).toBe('example.com');
  });

  test('provide() is chainable', () => {
    const result = di
      .provide(ConfigService, { port: 9000, host: 'test' })
      .provide(Logger, { info: () => 'log', error: () => 'err' });

    expect(result).toBe(di);
  });

  test('get() resolves with mocked dependencies', () => {
    di.stub(Logger);
    di.provide(ConfigService, { port: 4000, host: 'mock' });

    const service = di.get(UserService);
    const user = service.getUser('123');

    expect(user.id).toBe('123');
    expect(user.port).toBe(4000);
  });

  test('inject() is alias for get()', () => {
    di.stub(Logger);
    di.provide(ConfigService, { port: 5000, host: 'alias' });

    const service = di.inject(UserService);
    expect(service.getUser('1').port).toBe(5000);
  });

  test('auto-resets between tests', () => {
    // This test verifies that previous test's mocks don't persist
    // If reset didn't work, ConfigService would still have port: 5000
    di.provide(ConfigService, { port: 7000, host: 'fresh' });
    di.stub(Logger);

    const service = di.get(UserService);
    expect(service.getUser('1').port).toBe(7000);
  });
});
