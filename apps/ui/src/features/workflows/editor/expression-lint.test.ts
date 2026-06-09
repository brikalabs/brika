import { describe, expect, test } from 'bun:test';
import { lintExpressions } from './expression-lint';

const PORTS = ['in', 'trigger'];
const KEYS = ['prompt', 'model'];

describe('lintExpressions', () => {
  test('valid references produce no warnings', () => {
    expect(lintExpressions('Hello {{ inputs.in.user }} ({{ config.model }})', PORTS, KEYS)).toEqual(
      []
    );
  });

  test('unknown input port is flagged', () => {
    const warnings = lintExpressions('{{ inputs.body }}', PORTS, KEYS);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain('unknown input port "body"');
  });

  test('unknown config key and unknown root are flagged', () => {
    expect(lintExpressions('{{ config.nope }}', PORTS, KEYS)[0]?.message).toContain(
      'unknown config key'
    );
    expect(lintExpressions('{{ data.x }}', PORTS, KEYS)[0]?.message).toContain('unknown root');
  });

  test('malformed expressions are flagged as invalid', () => {
    expect(lintExpressions('{{ inputs.items[ }}', PORTS, KEYS)[0]?.message).toBe('invalid');
  });

  test('fallback literals are fine; only path operands are checked', () => {
    expect(lintExpressions('{{ inputs.in ?? "anon" }}', PORTS, KEYS)).toEqual([]);
    expect(lintExpressions('{{ inputs.gone ?? "anon" }}', PORTS, KEYS)).toHaveLength(1);
  });

  test('plain strings without templates produce nothing', () => {
    expect(lintExpressions('no templates here', PORTS, KEYS)).toEqual([]);
  });
});
