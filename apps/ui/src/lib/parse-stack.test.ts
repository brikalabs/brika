/**
 * Tests for the error-overlay stack parser.
 *
 * Covers:
 * - V8 / Chrome frames with and without a function name
 * - cache-busting query stripping (`?v=...`)
 * - vendor detection (node_modules / .vite/deps / node:) vs app frames
 * - the leading message line being ignored
 * - Firefox / Safari `fn@loc` frames
 * - anonymous / location-less frames
 * - empty and missing input
 */

import { describe, expect, test } from 'bun:test';
import { parseStackTrace } from './parse-stack';

describe('parseStackTrace', () => {
  test('parses a Chrome frame with a function name and strips the query', () => {
    const stack = [
      "TypeError: Cannot read properties of null (reading 'useState')",
      '    at exports.useState (http://localhost:3001/node_modules/.vite/deps/react.js?v=f152586a:748:30)',
    ].join('\n');

    const frames = parseStackTrace(stack);

    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual({
      fn: 'exports.useState',
      file: 'http://localhost:3001/node_modules/.vite/deps/react.js',
      location: 'react.js:748:30',
      line: 748,
      column: 30,
      vendor: true,
    });
  });

  test('ignores the leading message line', () => {
    const stack = [
      'Error: boom',
      '    at doThing (http://localhost:3001/src/features/x/Thing.tsx:12:3)',
    ].join('\n');

    const frames = parseStackTrace(stack);

    expect(frames).toHaveLength(1);
    expect(frames[0].fn).toBe('doThing');
  });

  test('parses an anonymous frame without a function name', () => {
    const frames = parseStackTrace('    at http://localhost:3001/src/main.tsx:5:9');

    expect(frames[0]).toMatchObject({
      fn: null,
      location: 'main.tsx:5:9',
      line: 5,
      column: 9,
      vendor: false,
    });
  });

  test('flags app frames as non-vendor and dependency frames as vendor', () => {
    const stack = [
      '    at App (http://localhost:3001/src/App.tsx:1:1)',
      '    at render (http://localhost:3001/node_modules/.vite/deps/react-dom.js:2:2)',
      '    at run (node:internal/process/task_queues:95:5)',
    ].join('\n');

    const frames = parseStackTrace(stack);

    expect(frames.map((frame) => frame.vendor)).toEqual([false, true, true]);
  });

  test('parses Firefox / Safari "fn@loc" frames', () => {
    const stack = [
      'useState@http://localhost:3001/react.js:748:30',
      '@http://localhost:3001/app.js:1:1',
    ].join('\n');

    const frames = parseStackTrace(stack);

    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject({ fn: 'useState', line: 748, column: 30 });
    expect(frames[1]).toMatchObject({ fn: null, line: 1, column: 1 });
  });

  test('keeps a V8 frame whose location has no line:col', () => {
    const frames = parseStackTrace('    at new Promise (<anonymous>)');

    expect(frames[0]).toMatchObject({
      fn: 'new Promise',
      location: '<anonymous>',
      line: null,
      column: null,
    });
  });

  test('returns an empty array for missing or empty stacks', () => {
    expect(parseStackTrace(undefined)).toEqual([]);
    expect(parseStackTrace(null)).toEqual([]);
    expect(parseStackTrace('')).toEqual([]);
  });
});
