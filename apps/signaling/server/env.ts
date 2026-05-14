/**
 * Schema-derived `Env` for the signaling Worker.
 *
 * Workers has no startup hook that sees `env` (it arrives per-request), so
 * `checkEnv` parses on the first request and short-circuits thereafter —
 * the warm path is a single boolean read.
 */

import { z } from 'zod';

const binding = <T>(label: string) =>
  z.custom<T>((v) => v != null && typeof v === 'object', `${label} missing`);

export const EnvSchema = z.object({
  HUB_SESSION: binding<DurableObjectNamespace>('HUB_SESSION'),
  DB: binding<D1Database>('DB'),
  ASSETS: binding<Fetcher>('ASSETS'),
  TICKET_SECRET: z.string().min(16, 'TICKET_SECRET must be ≥16 chars (see .dev.vars.example)'),
  ALLOWED_ORIGINS: z.string().optional(),
  CF_REALTIME_APP_ID: z.string().optional(),
  CF_REALTIME_APP_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let validated = false;

/** Parse env once per isolate. Returns a 500 response on failure, `null` on success. */
export function checkEnv(env: unknown): Response | null {
  if (validated) {
    return null;
  }
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
    return Response.json({ error: 'env-misconfigured', detail }, { status: 500 });
  }
  validated = true;
  return null;
}
