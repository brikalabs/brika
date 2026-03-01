/**
 * Tests for I18nLoader
 * Testing i18n initialization
 */
import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { get, stub, useTestBed } from '@brika/di/testing';
import { I18nLoader } from '@/runtime/bootstrap/i18n-loader';
import type { BrikaConfig } from '@/runtime/config';
import { I18nService } from '@/runtime/i18n';

useTestBed({
  autoStub: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const createMockConfig = (): BrikaConfig => ({
  hub: {
    host: '0.0.0.0',
    port: 3001,
    plugins: {
      installDir: '/tmp',
      heartbeatInterval: 5000,
      heartbeatTimeout: 15000,
    },
  },
  plugins: [],
  rules: [],
  schedules: [],
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('I18nLoader', () => {
  let loader: I18nLoader;
  let i18nInitMock: ReturnType<typeof mock>;

  beforeEach(() => {
    i18nInitMock = mock().mockResolvedValue(undefined);

    stub(I18nService, {
      init: i18nInitMock,
    });

    loader = get(I18nLoader);
  });

  test('has correct name', () => {
    expect(loader.name).toBe('i18n');
  });

  describe('init', () => {
    test('initializes i18n service', async () => {
      await loader.init();
      expect(i18nInitMock).toHaveBeenCalled();
    });
  });

  describe('load', () => {
    test('does not throw when called', async () => {
      const config = createMockConfig();

      // load is a no-op for i18n (initialization happens in init)
      await loader.load(config);

      // No assertions needed - just verify it doesn't throw
    });

    test('i18n is already initialized before load', async () => {
      await loader.init();
      expect(i18nInitMock).toHaveBeenCalled();

      // load should not reinitialize
      i18nInitMock.mockClear();
      await loader.load(createMockConfig());
      expect(i18nInitMock).not.toHaveBeenCalled();
    });
  });
});
