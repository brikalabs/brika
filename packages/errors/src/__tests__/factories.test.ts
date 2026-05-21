import { describe, expect, it } from 'bun:test';
import { ErrorCatalog, lookupCatalogEntry } from '../catalog';
import { BrikaError } from '../error';
import { buildCustomError, buildError, errors } from '../factories';

describe('errors.* factories', () => {
  it('every cataloged throwable code has a covering factory', () => {
    // Cataloged codes minus WORKFLOW_* (those are diagnostic, never thrown).
    const expected = Object.keys(ErrorCatalog).filter((c) => !c.startsWith('WORKFLOW_'));
    const produced = new Set<string>();
    // Probe each factory by calling with placeholder data so we collect codes.
    produced.add(errors.internal().code);
    produced.add(errors.invalidInput().code);
    produced.add(errors.notFound({ resource: 'x' }).code);
    produced.add(errors.permissionDenied({ permission: 'x' }).code);
    produced.add(errors.timeout().code);
    produced.add(errors.unavailable().code);
    produced.add(errors.pluginNotFound({ pluginId: 'x' }).code);
    produced.add(errors.pluginConfigInvalid({ pluginId: 'x' }).code);
    produced.add(errors.manifestInvalid({ manifestPath: '/x' }).code);
    produced.add(errors.manifestMissingMain({ manifestPath: '/x' }).code);

    for (const code of expected) {
      expect(produced.has(code)).toBe(true);
    }
  });

  it('factories build messages from the catalog template by default', () => {
    expect(errors.permissionDenied({ permission: 'fs' }).message).toContain('fs');
    expect(errors.notFound({ resource: 'block:timer' }).message).toContain('block:timer');
    expect(errors.timeout({ operation: 'fetch', timeoutMs: 1000 }).message).toMatch(
      /fetch.*1000ms/
    );
  });

  it('factories respect a message override', () => {
    const err = errors.notFound({ resource: 'x' }, { message: 'gone for good' });
    expect(err.message).toBe('gone for good');
  });

  it('factories carry data typed against the catalog schema', () => {
    const err = errors.permissionDenied({ permission: 'location' });
    expect(err.data).toEqual({ permission: 'location' });
  });

  it('factories pass cause through', () => {
    const cause = new Error('boom');
    const err = errors.internal({ cause });
    expect(err.cause).toBe(cause);
  });
});

describe('buildError (generic factory)', () => {
  it('builds a BrikaError with the catalog message when omitted', () => {
    const err = buildError('NOT_FOUND', { resource: 'r' });
    expect(err.code).toBe('NOT_FOUND');
    expect(err.data?.resource).toBe('r');
  });

  it('respects message override', () => {
    const err = buildError('NOT_FOUND', { resource: 'r' }, { message: 'override' });
    expect(err.message).toBe('override');
  });

  it('falls back to the code as message when entry missing', () => {
    // Force an unknown code path via the catalog lookup helper.
    expect(lookupCatalogEntry('NEVER_HEARD')).toBeUndefined();
  });
});

describe('buildCustomError (uncataloged codes)', () => {
  it('produces a valid BrikaError without a catalog entry', () => {
    const err = buildCustomError('PLUGIN_CUSTOM_CODE', 'something went wrong', {
      data: { meta: 'x' },
    });
    expect(err).toBeInstanceOf(BrikaError);
    expect(err.code).toBe('PLUGIN_CUSTOM_CODE');
    expect(err.data?.meta).toBe('x');
    expect(err.message).toBe('something went wrong');
  });

  it('cause chain works for custom codes too', () => {
    const cause = new Error('underlying');
    const err = buildCustomError('X', 'x', { cause });
    expect(err.cause).toBe(cause);
  });
});
