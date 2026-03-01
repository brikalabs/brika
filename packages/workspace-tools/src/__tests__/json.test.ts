import { describe, expect, test } from 'bun:test';
import { updateJsonField, updateJsonObject } from '../json';

describe('updateJsonField', () => {
  test('updates an existing field without changing surrounding style', () => {
    const initial = '{\n\t"name":"my-pkg",\n\t"version":"1.0.0",\n\t"private":true\n}\n';
    const updated = updateJsonField(
      initial,
      [
        'version',
      ],
      '2.0.0'
    );

    expect(updated).toBe('{\n\t"name":"my-pkg",\n\t"version":"2.0.0",\n\t"private":true\n}\n');
  });

  test('preserves CRLF line endings when updating values', () => {
    const initial = '{\r\n  "version": "1.0.0"\r\n}\r\n';
    const updated = updateJsonField(
      initial,
      [
        'version',
      ],
      '2.0.0'
    );

    expect(updated).toBe('{\r\n  "version": "2.0.0"\r\n}\r\n');
  });
});

describe('updateJsonObject', () => {
  test('applies a partial top-level patch', () => {
    const initial = '{\n  "name": "my-pkg",\n  "version": "1.0.0",\n  "private": false\n}\n';
    const updated = updateJsonObject(initial, {
      version: '2.0.0',
      private: true,
    });

    expect(updated).toBe('{\n  "name": "my-pkg",\n  "version": "2.0.0",\n  "private": true\n}\n');
  });

  test('returns unchanged content for an empty patch', () => {
    const initial = '{\n  "name": "my-pkg",\n  "version": "1.0.0"\n}\n';
    const updated = updateJsonObject(initial, {});

    expect(updated).toBe(initial);
  });
});
