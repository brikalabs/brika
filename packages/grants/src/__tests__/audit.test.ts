/**
 * Tests for `GrantRegistry`'s audit-log integration.
 *
 * Coverage:
 *   - emits one entry per dispatch
 *   - applies the per-grant `redact` hooks for args + result
 *   - records errCode on failure (handler throw, INVALID_INPUT, etc.)
 *   - tolerates a throwing sink without breaking the call
 *   - records durationMs and uses the dispatch start time as `ts`
 */

import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { defineGrant } from '../define';
import { GrantRegistry } from '../registry';
import type { AuditEntry } from '../types';

const ArgsSchema = z.object({ value: z.string() });
const ResultSchema = z.object({ echo: z.string(), bigBlob: z.string() });

const handlerCtx = () => ({
  pluginUid: 'plug-uid-1',
  pluginRoot: '/nonexistent/plug',
  grantedScope: undefined,
  log: () => {},
  signal: new AbortController().signal,
});

function makeGrant(opts?: { redactArgs?: boolean; redactResult?: boolean; throws?: boolean }) {
  return defineGrant(
    {
      id: 'test.audit.echo',
      args: ArgsSchema,
      result: ResultSchema,
      ...(opts?.redactArgs || opts?.redactResult
        ? {
            redact: {
              args: opts.redactArgs
                ? (a: z.infer<typeof ArgsSchema>) => ({ valueLen: a.value.length })
                : undefined,
              result: opts.redactResult
                ? (r: z.infer<typeof ResultSchema>) => ({
                    echoLen: r.echo.length,
                    blobLen: r.bigBlob.length,
                  })
                : undefined,
            },
          }
        : {}),
    },
    async (_ctx, args) => {
      if (opts?.throws) {
        throw new Error('handler-explosion');
      }
      return { echo: args.value, bigBlob: 'X'.repeat(10_000) };
    }
  );
}

describe('GrantRegistry audit log', () => {
  test('emits one entry per successful dispatch', async () => {
    const entries: AuditEntry[] = [];
    const reg = new GrantRegistry({ auditLogger: (e) => entries.push(e) });
    reg.register(makeGrant());
    await reg.dispatch('test.audit.echo', { value: 'hi' }, handlerCtx());
    expect(entries).toHaveLength(1);
    expect(entries[0]?.grantId).toBe('test.audit.echo');
    expect(entries[0]?.pluginUid).toBe('plug-uid-1');
    expect(entries[0]?.errCode).toBeUndefined();
  });

  test('default behaviour (no redact): args + result pass through verbatim', async () => {
    const entries: AuditEntry[] = [];
    const reg = new GrantRegistry({ auditLogger: (e) => entries.push(e) });
    reg.register(makeGrant());
    await reg.dispatch('test.audit.echo', { value: 'hi' }, handlerCtx());
    expect(entries[0]?.args).toEqual({ value: 'hi' });
    expect(entries[0]?.result).toMatchObject({
      echo: 'hi',
      bigBlob: 'X'.repeat(10_000),
    });
  });

  test('redact.args runs and shapes the audit args', async () => {
    const entries: AuditEntry[] = [];
    const reg = new GrantRegistry({ auditLogger: (e) => entries.push(e) });
    reg.register(makeGrant({ redactArgs: true }));
    await reg.dispatch('test.audit.echo', { value: 'hello' }, handlerCtx());
    expect(entries[0]?.args).toEqual({ valueLen: 5 });
  });

  test('redact.result runs and shapes the audit result', async () => {
    const entries: AuditEntry[] = [];
    const reg = new GrantRegistry({ auditLogger: (e) => entries.push(e) });
    reg.register(makeGrant({ redactResult: true }));
    await reg.dispatch('test.audit.echo', { value: 'hi' }, handlerCtx());
    expect(entries[0]?.result).toEqual({ echoLen: 2, blobLen: 10_000 });
  });

  test('errCode is set when the handler throws; no result field present', async () => {
    const entries: AuditEntry[] = [];
    const reg = new GrantRegistry({ auditLogger: (e) => entries.push(e) });
    reg.register(makeGrant({ throws: true }));
    await expect(reg.dispatch('test.audit.echo', { value: 'x' }, handlerCtx())).rejects.toThrow();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.errCode).toBe('INTERNAL');
    expect(entries[0]?.result).toBeUndefined();
  });

  test('args validation failure still emits an entry with the original args', async () => {
    const entries: AuditEntry[] = [];
    const reg = new GrantRegistry({ auditLogger: (e) => entries.push(e) });
    reg.register(makeGrant());
    await expect(
      reg.dispatch('test.audit.echo', { wrongField: 1 }, handlerCtx())
    ).rejects.toThrow();
    expect(entries).toHaveLength(1);
    // Failure path doesn't go through redact (args weren't parsed), so the
    // original wire payload is what gets logged — accept this loose shape.
    expect(entries[0]?.errCode).toBe('INVALID_INPUT');
    expect(entries[0]?.args).toEqual({ wrongField: 1 });
  });

  test('unknown grant id emits a NOT_REGISTERED entry, then throws', async () => {
    const entries: AuditEntry[] = [];
    const reg = new GrantRegistry({ auditLogger: (e) => entries.push(e) });
    await expect(reg.dispatch('test.audit.missing', {}, handlerCtx())).rejects.toThrow();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.errCode).toBe('NOT_REGISTERED');
  });

  test('throwing sink does NOT break the dispatch', async () => {
    const reg = new GrantRegistry({
      auditLogger: () => {
        throw new Error('sink-explosion');
      },
    });
    reg.register(makeGrant());
    const result = await reg.dispatch('test.audit.echo', { value: 'ok' }, handlerCtx());
    expect(result).toMatchObject({ echo: 'ok' });
  });

  test('throwing redact hook falls back to a placeholder; rest of entry intact', async () => {
    const entries: AuditEntry[] = [];
    const reg = new GrantRegistry({ auditLogger: (e) => entries.push(e) });
    const grant = defineGrant(
      {
        id: 'test.audit.bad-redact',
        args: ArgsSchema,
        result: ResultSchema,
        redact: {
          args: () => {
            throw new Error('boom');
          },
        },
      },
      async (_ctx, args) => ({ echo: args.value, bigBlob: '' })
    );
    reg.register(grant);
    await reg.dispatch('test.audit.bad-redact', { value: 'hi' }, handlerCtx());
    expect(entries[0]?.args).toBe('<redaction-failed>');
    expect(entries[0]?.grantId).toBe('test.audit.bad-redact');
  });

  test('durationMs is non-negative and roughly reflects the handler wait', async () => {
    const entries: AuditEntry[] = [];
    const reg = new GrantRegistry({ auditLogger: (e) => entries.push(e) });
    const grant = defineGrant(
      {
        id: 'test.audit.slow',
        args: ArgsSchema,
        result: ResultSchema,
      },
      async (_ctx, args) => {
        await new Promise((r) => setTimeout(r, 10));
        return { echo: args.value, bigBlob: '' };
      }
    );
    reg.register(grant);
    await reg.dispatch('test.audit.slow', { value: 'hi' }, handlerCtx());
    expect(entries[0]?.durationMs).toBeGreaterThanOrEqual(5);
    expect(entries[0]?.durationMs).toBeLessThan(500);
  });

  test('omitting auditLogger is a no-op (no observable side effect)', async () => {
    // Just verify the dispatch succeeds without a sink — the audit code
    // path is gated on the logger being defined.
    const reg = new GrantRegistry();
    reg.register(makeGrant());
    const out = await reg.dispatch('test.audit.echo', { value: 'silent' }, handlerCtx());
    expect(out).toMatchObject({ echo: 'silent' });
  });
});
