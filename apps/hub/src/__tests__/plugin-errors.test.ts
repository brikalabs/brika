/**
 * Tests for PluginErrors factory functions.
 *
 * Each factory returns a PluginError with key, message, and optional params.
 * Uses the real HUB_VERSION to avoid mock.module bleed (Bun #12823).
 */

import { describe, expect, test } from 'bun:test';
import { PluginErrors } from '@/runtime/plugins/plugin-errors';
import { HUB_VERSION } from '@/runtime/plugins/utils';

describe('PluginErrors', () => {
  describe('incompatibleVersion', () => {
    test('returns error with required and current version params', () => {
      const error = PluginErrors.incompatibleVersion('^2.0.0');

      expect(error.key).toBe('plugins:errors.incompatibleVersion');
      expect(error.params).toEqual({
        required: '^2.0.0',
        current: HUB_VERSION,
      });
      expect(error.message).toBe(`Requires Brika ^2.0.0, current version is ${HUB_VERSION}`);
    });

    test('handles wildcard range', () => {
      const error = PluginErrors.incompatibleVersion('*');

      expect(error.params?.required).toBe('*');
      expect(error.message).toContain('*');
    });
  });

  describe('incompatibleUnknown', () => {
    test('returns error with no params', () => {
      const error = PluginErrors.incompatibleUnknown();

      expect(error.key).toBe('plugins:errors.incompatibleUnknown');
      expect(error.params).toBeUndefined();
      expect(error.message).toBe('Missing engines.brika in package.json');
    });
  });

  describe('heartbeatTimeout', () => {
    test('returns error with no params', () => {
      const error = PluginErrors.heartbeatTimeout();

      expect(error.key).toBe('plugins:errors.heartbeatTimeout');
      expect(error.params).toBeUndefined();
      expect(error.message).toBe('heartbeat timeout');
    });
  });

  describe('crashed', () => {
    test('returns error with reason param', () => {
      const error = PluginErrors.crashed('SIGKILL');

      expect(error.key).toBe('plugins:errors.crashed');
      expect(error.params).toEqual({ reason: 'SIGKILL' });
      expect(error.message).toBe('SIGKILL');
    });

    test('handles empty reason', () => {
      const error = PluginErrors.crashed('');

      expect(error.params).toEqual({ reason: '' });
      expect(error.message).toBe('');
    });
  });

  describe('crashLoop', () => {
    test('returns error with reason param and prefixed message', () => {
      const error = PluginErrors.crashLoop('too many restarts');

      expect(error.key).toBe('plugins:errors.crashLoop');
      expect(error.params).toEqual({ reason: 'too many restarts' });
      expect(error.message).toBe('Crash loop: too many restarts');
    });
  });

  describe('restarting', () => {
    test('converts delay from milliseconds to seconds', () => {
      const error = PluginErrors.restarting(5000);

      expect(error.key).toBe('plugins:errors.restarting');
      expect(error.params).toEqual({ seconds: '5' });
      expect(error.message).toBe('Restarting in 5s');
    });

    test('rounds delay to nearest second', () => {
      const error = PluginErrors.restarting(2700);

      expect(error.params).toEqual({ seconds: '3' });
      expect(error.message).toBe('Restarting in 3s');
    });

    test('handles sub-second delay', () => {
      const error = PluginErrors.restarting(400);

      expect(error.params).toEqual({ seconds: '0' });
      expect(error.message).toBe('Restarting in 0s');
    });
  });

  describe('killed', () => {
    test('returns error with no params', () => {
      const error = PluginErrors.killed();

      expect(error.key).toBe('plugins:errors.killed');
      expect(error.params).toBeUndefined();
      expect(error.message).toBe('Plugin was forcefully terminated');
    });
  });

  describe('buildFailed', () => {
    test('joins multiple errors with semicolons', () => {
      const error = PluginErrors.buildFailed(['Type error in foo.ts', 'Missing import in bar.ts']);

      expect(error.key).toBe('plugins:errors.buildFailed');
      expect(error.params).toEqual({ errors: 'Type error in foo.ts; Missing import in bar.ts' });
      expect(error.message).toBe('Build failed: Type error in foo.ts; Missing import in bar.ts');
    });

    test('handles single error', () => {
      const error = PluginErrors.buildFailed(['Syntax error']);

      expect(error.params).toEqual({ errors: 'Syntax error' });
      expect(error.message).toBe('Build failed: Syntax error');
    });

    test('handles empty errors array', () => {
      const error = PluginErrors.buildFailed([]);

      expect(error.params).toEqual({ errors: '' });
      expect(error.message).toBe('Build failed: ');
    });
  });
});
