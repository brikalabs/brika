import { describe, expect, test } from 'bun:test';
import {
  useBlockConfig,
  useBlockData,
  useBlockId,
  useBlockType,
  useBlockVariables,
  useUpdateBlockConfig,
} from './block-views';

// These hooks are stubs replaced at build time by the host bridge; outside a
// client-rendered block view they must throw rather than return bogus data.
describe('block-views (outside client context)', () => {
  test('useBlockConfig() throws', () => {
    expect(() => useBlockConfig()).toThrow(
      'useBlockConfig() is only available in client-rendered block views'
    );
  });

  test('useUpdateBlockConfig() throws', () => {
    expect(() => useUpdateBlockConfig()).toThrow(
      'useUpdateBlockConfig() is only available in client-rendered block views'
    );
  });

  test('useBlockId() throws', () => {
    expect(() => useBlockId()).toThrow(
      'useBlockId() is only available in client-rendered block views'
    );
  });

  test('useBlockType() throws', () => {
    expect(() => useBlockType()).toThrow(
      'useBlockType() is only available in client-rendered block views'
    );
  });

  test('useBlockData() throws', () => {
    expect(() => useBlockData()).toThrow(
      'useBlockData() is only available in client-rendered block views'
    );
  });

  test('useBlockVariables() throws', () => {
    expect(() => useBlockVariables()).toThrow(
      'useBlockVariables() is only available in client-rendered block views'
    );
  });
});
