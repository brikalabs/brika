// Import the BUILT, self-contained v8 artifact (what ships as @brika/compiler/v8),
// so the harness exercises exactly what a Worker consumes. `test:cf` builds first.
import { compilePluginGate } from '../dist/v8/index.js';

const rt = () => (typeof Bun === 'undefined' ? 'workerd' : 'bun');

interface Body {
  sources: Record<string, string>;
  entrypoints: string[];
  version?: string;
}

export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method !== 'POST') {
      return Response.json({ runtime: rt() });
    }
    const body = (await req.json()) as Body;
    const logs: Array<{ event: string; meta?: unknown }> = [];
    const r = await compilePluginGate({
      sources: new Map(Object.entries(body.sources)),
      entrypoints: body.entrypoints,
      version: body.version ?? 'cf-real-test',
      // Logs go to wrangler tail / CF logs AND back in the response.
      log: (event, meta) => {
        logs.push({ event, meta });
        console.log('[gate]', event, JSON.stringify(meta ?? {}));
      },
    });
    return Response.json({
      runtime: rt(),
      result: r.ok
        ? {
            ok: true,
            entries: r.entries.length,
            chunks: r.chunks.length,
            stamp: r.entries[0]?.js.split('\n')[0],
            bridged: [...r.entries, ...r.chunks].some((x) => x.js.includes('globalThis.__brika.')),
            manifest: {
              bricks: r.report.manifest.bricks.length,
              blocks: r.report.manifest.blocks.length,
              pages: r.report.manifest.pages.length,
              sparks: r.report.manifest.sparks.length,
              tools: r.report.manifest.tools.length,
            },
            actions: r.report.actions.map((a) => `${a.name}@${a.actionId}`),
          }
        : { ok: false, error: r.error },
      logs,
    });
  },
};
