/**
 * Tests for create-brika utility functions
 */

import { describe, expect, test } from 'bun:test';
import { getGitUser, runCommand, toCamelCase, toPascalCase } from '../utils';

describe('utils', () => {
  describe('toPascalCase', () => {
    test('converts simple kebab-case', () => {
      expect(toPascalCase('my-plugin')).toBe('MyPlugin');
    });

    test('handles single word', () => {
      expect(toPascalCase('plugin')).toBe('Plugin');
    });

    test('handles multiple hyphens', () => {
      expect(toPascalCase('my-awesome-plugin')).toBe('MyAwesomePlugin');
    });

    test('handles empty string', () => {
      expect(toPascalCase('')).toBe('');
    });
  });

  describe('toCamelCase', () => {
    test('converts simple kebab-case', () => {
      expect(toCamelCase('my-plugin')).toBe('myPlugin');
    });

    test('handles single word', () => {
      expect(toCamelCase('plugin')).toBe('plugin');
    });

    test('handles multiple hyphens', () => {
      expect(toCamelCase('my-awesome-plugin')).toBe('myAwesomePlugin');
    });

    test('handles empty string', () => {
      expect(toCamelCase('')).toBe('');
    });
  });

  describe('getGitUser', () => {
    test('returns git user name when available', async () => {
      // This depends on actual git config, so we just verify it returns a string
      const result = await getGitUser();
      expect(typeof result).toBe('string');
    });
  });

  describe('runCommand', () => {
    test('returns true for successful command', async () => {
      const result = await runCommand(['echo', 'test'], process.cwd());
      expect(result).toBe(true);
    });

    test('returns false for failed command', async () => {
      const result = await runCommand(['false'], process.cwd());
      expect(result).toBe(false);
    });

    test('returns false for non-existent command', async () => {
      const result = await runCommand(['nonexistent-command-xyz'], process.cwd());
      expect(result).toBe(false);
    });
  });
});
