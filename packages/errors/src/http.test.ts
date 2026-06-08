/**
 * Tests for `brikaErrorToResponse` — the RFC 9457 (Problem Details) HTTP
 * boundary. Focus: the `publicDataShape` redaction, which decides what of a
 * BrikaError's `data` is allowed to cross to API consumers.
 */

import { describe, expect, test } from 'bun:test';
import { errors } from './factories';
import { brikaErrorToResponse } from './http';

describe('brikaErrorToResponse', () => {
  test('passes data through the catalog publicDataShape when it parses', async () => {
    // FS_SYMLINK_ESCAPE declares `publicDataShape: { path }`, so a well-shaped
    // `data` survives to the wire intact.
    const res = brikaErrorToResponse(errors.fsSymlinkEscape({ path: '/data/evil' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({
      code: 'FS_SYMLINK_ESCAPE',
      data: { path: '/data/evil' },
    });
  });

  test('non-BrikaError values collapse to a 500 INTERNAL problem document', async () => {
    const res = brikaErrorToResponse(new Error('boom'));
    expect(res.status).toBe(500);
    expect(res.headers.get('content-type')).toBe('application/problem+json');
    const body = await res.json();
    expect(body).toMatchObject({ status: 500, code: 'INTERNAL' });
  });

  test('attaches the optional instance and traceId when supplied', async () => {
    const res = brikaErrorToResponse(errors.fsSymlinkEscape({ path: '/p' }), {
      instance: '/api/plugins/x/actions/y',
      traceId: 'trace-123',
    });
    const body = await res.json();
    expect(body).toMatchObject({ instance: '/api/plugins/x/actions/y', traceId: 'trace-123' });
  });
});
