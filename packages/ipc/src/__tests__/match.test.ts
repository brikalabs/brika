import { describe, expect, it } from 'bun:test';
import { BrikaError } from '../errors';
import { errors } from '../factories';
import { matchBrikaError } from '../match';

describe('matchBrikaError', () => {
  it('routes to the per-code handler with typed data', () => {
    const view = matchBrikaError<string>(errors.permissionDenied({ permission: 'fs' }), {
      PERMISSION_DENIED: ({ permission }) => `denied: ${permission}`,
      _: () => 'other',
    });
    expect(view).toBe('denied: fs');
  });

  it('passes the BrikaError instance as the second handler arg', () => {
    const cause = new Error('db down');
    const result = matchBrikaError<string>(errors.notFound({ resource: 'r' }, { cause }), {
      NOT_FOUND: (_data, err) => (err.cause instanceof Error ? err.cause.message : 'no cause'),
      _: () => 'other',
    });
    expect(result).toBe('db down');
  });

  it('falls through to _ for unmatched cataloged codes', () => {
    const view = matchBrikaError<string>(errors.timeout(), {
      PERMISSION_DENIED: () => 'denied',
      _: () => 'fallback',
    });
    expect(view).toBe('fallback');
  });

  it('falls through to _ for plain Error throws', () => {
    const view = matchBrikaError<string>(new Error('plain'), {
      _: (err) => (err instanceof Error ? err.message : 'unknown'),
    });
    expect(view).toBe('plain');
  });

  it('falls through to _ for non-Error values', () => {
    const view = matchBrikaError<string>('string thrown', {
      _: (err) => `typeof: ${typeof err}`,
    });
    expect(view).toBe('typeof: string');
  });

  it('falls through to _ for uncataloged BrikaError codes', () => {
    const err = new BrikaError('PLUGIN_DEFINED', 'custom');
    const view = matchBrikaError<string>(err, {
      _: (e) => (e instanceof BrikaError ? e.code : 'unknown'),
    });
    expect(view).toBe('PLUGIN_DEFINED');
  });

  it('handler returning typed data narrows correctly', () => {
    // Compile-time check: ensure the handler's `data` arg is the catalog type.
    const view = matchBrikaError<{ kind: 'denied'; permission: string } | { kind: 'other' }>(
      errors.permissionDenied({ permission: 'a' }),
      {
        PERMISSION_DENIED: ({ permission }) => ({ kind: 'denied', permission }),
        _: () => ({ kind: 'other' }),
      }
    );
    if (view.kind === 'denied') {
      expect(view.permission).toBe('a');
    } else {
      throw new Error('expected denied branch');
    }
  });
});
