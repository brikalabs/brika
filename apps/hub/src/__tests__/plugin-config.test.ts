/**
 * Tests for PluginConfigService
 */

import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { get, provide, useTestBed } from '@brika/di/testing';
import type { PreferenceDefinition } from '@brika/shared';
import { ConfigLoader } from '@/runtime/config';
import { PluginConfigService } from '@/runtime/plugins/plugin-config';
import { StateStore } from '@/runtime/state/state-store';

useTestBed({ autoStub: false });

describe('PluginConfigService', () => {
  let service: PluginConfigService;
  let mockConfigLoader: {
    getPluginConfig: ReturnType<typeof mock>;
    setPluginConfig: ReturnType<typeof mock>;
  };
  let mockStateStore: {
    getMetadata: ReturnType<typeof mock>;
  };

  const textPreference: PreferenceDefinition = {
    name: 'apiKey',
    type: 'text',
    required: true,
    default: '',
  };

  const numberPreference: PreferenceDefinition = {
    name: 'timeout',
    type: 'number',
    required: false,
    default: 5000,
    min: 1000,
    max: 30000,
  };

  const checkboxPreference: PreferenceDefinition = {
    name: 'enabled',
    type: 'checkbox',
    required: false,
    default: true,
  };

  const dropdownPreference: PreferenceDefinition = {
    name: 'mode',
    type: 'dropdown',
    required: true,
    default: 'auto',
    options: [{ value: 'auto' }, { value: 'manual' }, { value: 'disabled' }],
  };

  beforeEach(() => {
    mockConfigLoader = {
      getPluginConfig: mock(),
      setPluginConfig: mock().mockResolvedValue(undefined),
    };

    mockStateStore = {
      getMetadata: mock(),
    };

    provide(ConfigLoader, mockConfigLoader);
    provide(StateStore, mockStateStore);

    service = get(PluginConfigService);
  });

  describe('getSchema', () => {
    test('returns preferences from metadata', () => {
      mockStateStore.getMetadata.mockReturnValue({
        preferences: [textPreference],
      });

      const schema = service.getSchema('@test/plugin');

      expect(schema).toEqual([textPreference]);
    });

    test('returns empty array when no metadata', () => {
      mockStateStore.getMetadata.mockReturnValue(undefined);

      const schema = service.getSchema('@test/plugin');

      expect(schema).toEqual([]);
    });

    test('returns empty array when no preferences', () => {
      mockStateStore.getMetadata.mockReturnValue({});

      const schema = service.getSchema('@test/plugin');

      expect(schema).toEqual([]);
    });
  });

  describe('getConfig', () => {
    test('merges user config with defaults', () => {
      mockStateStore.getMetadata.mockReturnValue({
        preferences: [textPreference, numberPreference],
      });
      mockConfigLoader.getPluginConfig.mockReturnValue({
        apiKey: 'user-key',
      });

      const config = service.getConfig('@test/plugin');

      expect(config.apiKey).toBe('user-key');
      expect(config.timeout).toBe(5000); // Default
    });

    test('uses all defaults when no user config', () => {
      mockStateStore.getMetadata.mockReturnValue({
        preferences: [numberPreference, checkboxPreference],
      });
      mockConfigLoader.getPluginConfig.mockReturnValue(undefined);

      const config = service.getConfig('@test/plugin');

      expect(config.timeout).toBe(5000);
      expect(config.enabled).toBe(true);
    });
  });

  describe('validate', () => {
    test('validates valid config', () => {
      mockStateStore.getMetadata.mockReturnValue({
        preferences: [textPreference],
      });

      const result = service.validate('@test/plugin', { apiKey: 'valid-key' });

      expect(result.success).toBe(true);
    });

    test('validates required text field', () => {
      mockStateStore.getMetadata.mockReturnValue({
        preferences: [textPreference],
      });

      const result = service.validate('@test/plugin', { apiKey: '' });

      expect(result.success).toBe(false);
    });

    test('validates number range', () => {
      mockStateStore.getMetadata.mockReturnValue({
        preferences: [numberPreference],
      });

      const valid = service.validate('@test/plugin', { timeout: 5000 });
      expect(valid.success).toBe(true);

      const tooLow = service.validate('@test/plugin', { timeout: 100 });
      expect(tooLow.success).toBe(false);

      const tooHigh = service.validate('@test/plugin', { timeout: 100000 });
      expect(tooHigh.success).toBe(false);
    });

    test('validates checkbox as boolean', () => {
      mockStateStore.getMetadata.mockReturnValue({
        preferences: [checkboxPreference],
      });

      const valid = service.validate('@test/plugin', { enabled: false });
      expect(valid.success).toBe(true);

      const invalid = service.validate('@test/plugin', { enabled: 'yes' });
      expect(invalid.success).toBe(false);
    });

    test('validates dropdown options', () => {
      mockStateStore.getMetadata.mockReturnValue({
        preferences: [dropdownPreference],
      });

      const valid = service.validate('@test/plugin', { mode: 'auto' });
      expect(valid.success).toBe(true);

      const invalid = service.validate('@test/plugin', { mode: 'invalid' });
      expect(invalid.success).toBe(false);
    });

    test('allows optional fields to be omitted', () => {
      mockStateStore.getMetadata.mockReturnValue({
        preferences: [numberPreference], // optional
      });

      const result = service.validate('@test/plugin', {});
      expect(result.success).toBe(true);
    });
  });

  describe('setConfig', () => {
    test('saves valid config', async () => {
      mockStateStore.getMetadata.mockReturnValue({
        preferences: [textPreference],
      });

      const result = await service.setConfig('@test/plugin', { apiKey: 'new-key' });

      expect(result.success).toBe(true);
      expect(mockConfigLoader.setPluginConfig.mock.calls.length > 0).toBe(true);
    });

    test('does not save invalid config', async () => {
      mockStateStore.getMetadata.mockReturnValue({
        preferences: [textPreference], // required
      });

      const result = await service.setConfig('@test/plugin', { apiKey: '' });

      expect(result.success).toBe(false);
      expect(mockConfigLoader.setPluginConfig.mock.calls.length > 0).toBe(false);
    });
  });
});
