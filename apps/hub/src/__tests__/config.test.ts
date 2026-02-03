/**
 * Tests for HubConfig and PluginManagerConfig
 */

import 'reflect-metadata';
import { afterEach, describe, expect, test } from 'bun:test';
import { get, provide, useTestBed } from '@brika/di/testing';
import { HubConfig, PluginManagerConfig } from '@/runtime/config/config';
import { ConfigLoader } from '@/runtime/config/config-loader';

// autoStub: false because these tests verify real config behavior
useTestBed({ autoStub: false });

describe('HubConfig', () => {
  afterEach(() => {
    delete process.env.BRIKA_HOST;
    delete process.env.BRIKA_PORT;
    delete process.env.BRIKA_HOME;
    delete process.env.BRIKA_STATIC_DIR;
  });

  test('uses defaults when ConfigLoader not available', () => {
    const config = get(HubConfig);

    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(3001);
    expect(config.homeDir).toBe('.brika');
    expect(config.staticDir).toBe('');
  });

  test('uses environment variables over defaults', () => {
    process.env.BRIKA_HOST = '0.0.0.0';
    process.env.BRIKA_PORT = '8080';
    process.env.BRIKA_HOME = '/custom/home';
    process.env.BRIKA_STATIC_DIR = '/static';

    const config = get(HubConfig);

    expect(config.host).toBe('0.0.0.0');
    expect(config.port).toBe(8080);
    expect(config.homeDir).toBe('/custom/home');
    expect(config.staticDir).toBe('/static');
  });

  test('uses ConfigLoader values when available', () => {
    const mockConfig = {
      hub: {
        host: '192.168.1.1',
        port: 4000,
        plugins: { installDir: '', heartbeatInterval: 5000, heartbeatTimeout: 15000 },
      },
      plugins: [],
      rules: [],
      schedules: [],
    };

    provide(ConfigLoader, {
      get: () => mockConfig,
      getBrikaDir: () => '/from/loader',
    });

    const config = get(HubConfig);

    expect(config.host).toBe('192.168.1.1');
    expect(config.port).toBe(4000);
    expect(config.homeDir).toBe('/from/loader');
  });
});

describe('PluginManagerConfig', () => {
  test('has default values when ConfigLoader not available', () => {
    const config = get(PluginManagerConfig);

    expect(config.callTimeoutMs).toBe(5000);
    expect(config.heartbeatEveryMs).toBe(5000);
    expect(config.heartbeatTimeoutMs).toBe(15000);
    expect(config.killTimeoutMs).toBe(3000);
    expect(config.autoRestartEnabled).toBe(true);
    expect(config.restartBaseDelayMs).toBe(1000);
    expect(config.restartMaxDelayMs).toBe(60000);
    expect(config.restartMaxCrashes).toBe(5);
    expect(config.restartCrashWindowMs).toBe(60000);
    expect(config.restartStabilityMs).toBe(30000);
  });

  test('uses ConfigLoader values when available', () => {
    const mockConfig = {
      hub: {
        host: '127.0.0.1',
        port: 3001,
        plugins: {
          installDir: '',
          heartbeatInterval: 10000,
          heartbeatTimeout: 30000,
        },
      },
      plugins: [],
      rules: [],
      schedules: [],
    };

    provide(ConfigLoader, {
      get: () => mockConfig,
    });

    const config = get(PluginManagerConfig);

    expect(config.heartbeatEveryMs).toBe(10000);
    expect(config.heartbeatTimeoutMs).toBe(30000);
  });
});
