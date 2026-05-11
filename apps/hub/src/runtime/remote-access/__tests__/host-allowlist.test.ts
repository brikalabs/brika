import { describe, expect, it } from 'bun:test';
import { hostAllowlist } from '../../http/middleware/host-allowlist';

function call(host: string | undefined, allowed: string[] = []): Promise<Response> {
  const mw = hostAllowlist({ allowed });
  // Minimal Hono-like context surface.
  let response: Response | undefined;
  const ctx = {
    req: { header: (name: string) => (name.toLowerCase() === 'host' ? host : undefined) },
    json: (body: unknown, status: number) => {
      response = Response.json(body, { status });
      return response;
    },
  };
  return Promise.resolve(mw(ctx as never, async () => {})).then(() => {
    return response ?? new Response(null, { status: 200 });
  });
}

describe('hostAllowlist', () => {
  it('rejects requests without a Host header', async () => {
    const res = await call(undefined);
    expect(res.status).toBe(421);
  });

  it('accepts loopback hosts unconditionally', async () => {
    expect((await call('127.0.0.1:3001')).status).toBe(200);
    expect((await call('localhost')).status).toBe(200);
    expect((await call('[::1]:3001')).status).toBe(200);
  });

  it('accepts private-network hosts by default', async () => {
    expect((await call('192.168.1.42')).status).toBe(200);
    expect((await call('10.0.0.5:3001')).status).toBe(200);
    expect((await call('172.20.0.1')).status).toBe(200);
    expect((await call('hub.local')).status).toBe(200);
  });

  it('rejects unknown public hosts', async () => {
    expect((await call('evil.example.com')).status).toBe(421);
    expect((await call('attacker.brika.dev')).status).toBe(421);
  });

  it('accepts explicitly-allowlisted hosts', async () => {
    expect((await call('maxime.brika.dev', ['maxime.brika.dev'])).status).toBe(200);
    expect((await call('maxime.brika.dev:443', ['maxime.brika.dev'])).status).toBe(200);
  });

  it('is case-insensitive', async () => {
    expect((await call('Maxime.Brika.Dev', ['maxime.brika.dev'])).status).toBe(200);
  });
});
