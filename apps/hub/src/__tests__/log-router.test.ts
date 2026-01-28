/**
 * Tests for Logger and ScopedLogger
 */

import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { useTestBed } from '@brika/di/testing';
import type { LogEvent, LogSource } from '@brika/shared';
import { Logger, ScopedLogger } from '@/runtime/logs/log-router';

const di = useTestBed();

describe('Logger', () => {
  let logger: Logger;

  beforeEach(() => {
    di.reset();
    logger = di.inject(Logger);
  });

  describe('setSource', () => {
    test('sets default source', () => {
      const events: LogEvent[] = [];
      logger.subscribe((e) => events.push(e));

      logger.setSource('plugin');
      logger.info('test message');

      expect(events[0]?.source).toBe('plugin');
    });
  });

  describe('setStore', () => {
    test('inserts events into store', () => {
      const insertedEvents: LogEvent[] = [];
      const mockStore = {
        insert: (e: LogEvent) => insertedEvents.push(e),
      };

      logger.setStore(mockStore as never);
      logger.info('test');

      expect(insertedEvents).toHaveLength(1);
    });
  });

  describe('subscribe', () => {
    test('notifies subscribers on log', () => {
      const events: LogEvent[] = [];
      logger.subscribe((e) => events.push(e));

      logger.info('test');

      expect(events).toHaveLength(1);
      expect(events[0]?.message).toBe('test');
    });

    test('returns unsubscribe function', () => {
      const events: LogEvent[] = [];
      const unsub = logger.subscribe((e) => events.push(e));

      logger.info('first');
      unsub();
      logger.info('second');

      expect(events).toHaveLength(1);
    });
  });

  describe('addTransport', () => {
    test('adds transport and writes to it', () => {
      const events: LogEvent[] = [];
      const transport = {
        write: (e: LogEvent) => events.push(e),
      };

      logger.addTransport(transport as never);
      logger.info('test');

      // Events should be written (may include console transport too)
      expect(events.some((e) => e.message === 'test')).toBe(true);
    });
  });

  describe('emit', () => {
    test('emits event to subscribers', () => {
      const events: LogEvent[] = [];
      logger.subscribe((e) => events.push(e));

      const event: LogEvent = {
        ts: Date.now(),
        level: 'info',
        source: 'hub' as LogSource,
        message: 'direct emit',
      };
      logger.emit(event);

      expect(events).toHaveLength(1);
      expect(events[0]?.message).toBe('direct emit');
    });
  });

  describe('query', () => {
    test('returns recent events from ring buffer', () => {
      logger.info('first');
      logger.info('second');

      const events = logger.query();

      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(events.some((e) => e.message === 'first')).toBe(true);
      expect(events.some((e) => e.message === 'second')).toBe(true);
    });
  });

  describe('log levels', () => {
    test('logs debug messages', () => {
      const events: LogEvent[] = [];
      logger.subscribe((e) => events.push(e));

      logger.debug('debug message');

      expect(events[0]?.level).toBe('debug');
    });

    test('logs info messages', () => {
      const events: LogEvent[] = [];
      logger.subscribe((e) => events.push(e));

      logger.info('info message');

      expect(events[0]?.level).toBe('info');
    });

    test('logs warn messages', () => {
      const events: LogEvent[] = [];
      logger.subscribe((e) => events.push(e));

      logger.warn('warn message');

      expect(events[0]?.level).toBe('warn');
    });

    test('logs error messages', () => {
      const events: LogEvent[] = [];
      logger.subscribe((e) => events.push(e));

      logger.error('error message');

      expect(events[0]?.level).toBe('error');
    });
  });

  describe('metadata', () => {
    test('includes metadata in log', () => {
      const events: LogEvent[] = [];
      logger.subscribe((e) => events.push(e));

      logger.info('test', { key: 'value' });

      expect(events[0]?.meta?.key).toBe('value');
    });

    test('merges options meta with regular meta', () => {
      const events: LogEvent[] = [];
      logger.subscribe((e) => events.push(e));

      logger.info('test', { a: 1 }, { meta: { b: 2 } });

      expect(events[0]?.meta?.a).toBe(1);
      expect(events[0]?.meta?.b).toBe(2);
    });
  });

  describe('error handling', () => {
    test('extracts Error object details', () => {
      const events: LogEvent[] = [];
      logger.subscribe((e) => events.push(e));

      const error = new Error('test error');
      logger.error('failed', undefined, { error });

      expect(events[0]?.error?.name).toBe('Error');
      expect(events[0]?.error?.message).toBe('test error');
      expect(events[0]?.error?.stack).toBeDefined();
    });

    test('handles Error with cause', () => {
      const events: LogEvent[] = [];
      logger.subscribe((e) => events.push(e));

      const cause = new Error('root cause');
      const error = new Error('wrapper', { cause });
      logger.error('failed', undefined, { error });

      expect(events[0]?.error?.cause).toContain('root cause');
    });

    test('handles non-Error objects', () => {
      const events: LogEvent[] = [];
      logger.subscribe((e) => events.push(e));

      logger.error('failed', undefined, { error: 'string error' });

      expect(events[0]?.error?.name).toBe('Error');
      expect(events[0]?.error?.message).toBe('string error');
    });

    test('handles object errors', () => {
      const events: LogEvent[] = [];
      logger.subscribe((e) => events.push(e));

      logger.error('failed', undefined, { error: { code: 'E001' } });

      expect(events[0]?.error?.message).toContain('E001');
    });
  });

  describe('withSource', () => {
    test('creates ScopedLogger with source', () => {
      const scoped = logger.withSource('plugin');
      expect(scoped).toBeInstanceOf(ScopedLogger);
    });
  });
});

describe('ScopedLogger', () => {
  let logger: Logger;
  let scoped: ScopedLogger;

  beforeEach(() => {
    di.reset();
    logger = di.inject(Logger);
    scoped = logger.withSource('hub');
  });

  test('uses configured source for logs', () => {
    const events: LogEvent[] = [];
    logger.subscribe((e) => events.push(e));

    scoped.info('test');

    expect(events[0]?.source).toBe('hub');
  });

  test('allows source override in options', () => {
    const events: LogEvent[] = [];
    logger.subscribe((e) => events.push(e));

    scoped.info('test', undefined, { source: 'events' });

    expect(events[0]?.source).toBe('events');
  });

  describe('log levels', () => {
    test('logs debug', () => {
      const events: LogEvent[] = [];
      logger.subscribe((e) => events.push(e));

      scoped.debug('debug');

      expect(events[0]?.level).toBe('debug');
      expect(events[0]?.source).toBe('hub');
    });

    test('logs info', () => {
      const events: LogEvent[] = [];
      logger.subscribe((e) => events.push(e));

      scoped.info('info');

      expect(events[0]?.level).toBe('info');
    });

    test('logs warn', () => {
      const events: LogEvent[] = [];
      logger.subscribe((e) => events.push(e));

      scoped.warn('warn');

      expect(events[0]?.level).toBe('warn');
    });

    test('logs error', () => {
      const events: LogEvent[] = [];
      logger.subscribe((e) => events.push(e));

      scoped.error('error');

      expect(events[0]?.level).toBe('error');
    });
  });

  test('emit passes through to logger', () => {
    const events: LogEvent[] = [];
    logger.subscribe((e) => events.push(e));

    const event: LogEvent = {
      ts: Date.now(),
      level: 'info',
      source: 'state',
      message: 'emit test',
    };
    scoped.emit(event);

    expect(events[0]?.source).toBe('state');
  });

  test('withSource creates new ScopedLogger', () => {
    const events: LogEvent[] = [];
    logger.subscribe((e) => events.push(e));

    const newScoped = scoped.withSource('registry');
    newScoped.info('test');

    expect(events[0]?.source).toBe('registry');
  });
});
