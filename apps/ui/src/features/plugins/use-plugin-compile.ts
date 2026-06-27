import { type PluginCompilePayload, pluginCompilePayloadSchema } from '@brika/plugin';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { getStreamUrl } from '@/lib/query';
import { subscribeSharedEvents } from '@/lib/shared-event-source';

/** Envelope of a `plugin.compile` event as it arrives over `/api/stream/events`. */
const compileEventSchema = z.object({
  type: z.literal('plugin.compile'),
  payload: pluginCompilePayloadSchema,
});

/** A fully-parsed `plugin.compile` event payload (uid/name + the step fields). */
export type PluginCompileEvent = PluginCompilePayload;

/** Parse a raw SSE frame into a compile event, or null if it is not one. */
export function parsePluginCompileEvent(data: string): PluginCompileEvent | null {
  try {
    const result = compileEventSchema.safeParse(JSON.parse(data));
    return result.success ? result.data.payload : null;
  } catch {
    return null; // Malformed SSE frame: ignore.
  }
}

export type CompileStepState = 'active' | 'done' | 'error';

/** One build step in the trace (a module kind or the server entry). */
export interface CompileStep {
  /** Module-kind name (`brick`, `page`, `blockView`, `blockNode`) or `server`. */
  key: string;
  state: CompileStepState;
}

export type CompileStatus = 'building' | 'done' | 'error';

/** A paced view of a plugin's build, suitable for an in-context progress trace. */
export interface CompileTimeline {
  status: CompileStatus;
  steps: CompileStep[];
  /** Summary, populated once the build settles. */
  modules?: number;
  chunks?: number;
  durationMs?: number;
  /** Failure message when `status === 'error'`. */
  message?: string;
}

/**
 * Minimum time each step is shown. Builds are often near-instant (cached
 * reloads compile in a few ms), so events arrive in a burst. Playing them out
 * no faster than this makes the trace readable: the eye tracks "bricks ->
 * server -> done" instead of seeing a single blink. It never SLOWS a real build
 * past its own pace; it only spaces out a burst.
 */
const MIN_DWELL_MS = 450;
/** How long the settled "done" trace lingers before clearing. */
const DONE_LINGER_MS = 2400;

type Frame =
  | { kind: 'start' }
  | { kind: 'step'; key: string; modules?: number; chunks?: number }
  | { kind: 'done'; durationMs?: number }
  | { kind: 'error'; message?: string };

function reduce(prev: CompileTimeline | null, frame: Frame): CompileTimeline {
  const base: CompileTimeline = prev ?? { status: 'building', steps: [] };
  switch (frame.kind) {
    case 'start':
      return { status: 'building', steps: [] };
    case 'step': {
      const settled = base.steps.map((s) => ({ ...s, state: 'done' as const }));
      const existing = settled.find((s) => s.key === frame.key);
      const steps = existing
        ? settled.map((s) => (s.key === frame.key ? { ...s, state: 'active' as const } : s))
        : [...settled, { key: frame.key, state: 'active' as const }];
      return {
        status: 'building',
        steps,
        modules: (base.modules ?? 0) + (frame.modules ?? 0),
        chunks: (base.chunks ?? 0) + (frame.chunks ?? 0),
      };
    }
    case 'done':
      return {
        ...base,
        status: 'done',
        steps: base.steps.map((s) => ({ ...s, state: 'done' as const })),
        durationMs: frame.durationMs,
      };
    case 'error':
      return {
        ...base,
        status: 'error',
        steps: base.steps.map((s, i) =>
          i === base.steps.length - 1 ? { ...s, state: 'error' as const } : s
        ),
        message: frame.message,
      };
  }
}

function toFrame(event: PluginCompileEvent): Frame | null {
  if (event.phase === 'start') {
    return { kind: 'start' };
  }
  if (event.phase === 'progress') {
    return event.step
      ? { kind: 'step', key: event.step, modules: event.modules, chunks: event.chunks }
      : null;
  }
  if (event.phase === 'done') {
    return { kind: 'done', durationMs: event.durationMs };
  }
  return { kind: 'error', message: event.message };
}

/**
 * A plugin's live build, paced for display. Subscribes to `plugin.compile` events over the shared SSE
 * and plays the steps out with a minimum dwell each ({@link MIN_DWELL_MS}) so a fast build still reads
 * step by step. Returns null when nothing is building; a settled build lingers briefly then clears, an
 * error stays until the next run. Drives the in-context build pill on a plugin card / detail header.
 */
export function usePluginCompileTimeline(uid: string): CompileTimeline | null {
  const [timeline, setTimeline] = useState<CompileTimeline | null>(null);
  const queue = useRef<Frame[]>([]);
  const pumpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTimeline(null);
    queue.current = [];
    const clearTimers = () => {
      for (const ref of [pumpTimer, clearTimer]) {
        if (ref.current) {
          clearTimeout(ref.current);
          ref.current = null;
        }
      }
    };

    const pump = () => {
      const frame = queue.current.shift();
      if (!frame) {
        pumpTimer.current = null;
        return;
      }
      setTimeline((prev) => reduce(prev, frame));
      if (frame.kind === 'done' || frame.kind === 'error') {
        pumpTimer.current = null;
        if (frame.kind === 'done') {
          clearTimer.current = setTimeout(() => setTimeline(null), DONE_LINGER_MS);
        }
        return;
      }
      pumpTimer.current = setTimeout(pump, MIN_DWELL_MS);
    };

    const enqueue = (frame: Frame) => {
      if (frame.kind === 'start') {
        queue.current = [];
        if (clearTimer.current) {
          clearTimeout(clearTimer.current);
          clearTimer.current = null;
        }
      }
      queue.current.push(frame);
      if (!pumpTimer.current) {
        pump();
      }
    };

    const unsub = subscribeSharedEvents(getStreamUrl('/api/stream/events'), (ev) => {
      const event = parsePluginCompileEvent(ev.data);
      if (event?.uid !== uid) {
        return;
      }
      const frame = toFrame(event);
      if (frame) {
        enqueue(frame);
      }
    });

    return () => {
      clearTimers();
      unsub();
    };
  }, [uid]);

  return timeline;
}

// ─── Build steps as log lines (for install/update dialogs) ───────────────────

/** Display name for a build step (a module kind, or the server entry). */
const STEP_LABELS: Record<string, string> = {
  brick: 'bricks',
  page: 'pages',
  blockView: 'block views',
  blockNode: 'block nodes',
  server: 'server',
};

/** Format one compile event as a single log line, or null for events not worth a line (`start`). */
function compileLogLine(event: PluginCompileEvent): string | null {
  if (event.phase === 'progress' && event.step) {
    const label = STEP_LABELS[event.step] ?? event.step;
    const count = event.modules ?? 0;
    const modules = count > 0 ? ` (${count} ${count === 1 ? 'module' : 'modules'})` : '';
    return `Compiling ${label}${modules}${event.cached ? ' [cached]' : ''}`;
  }
  if (event.phase === 'done') {
    return `Compiled in ${event.durationMs ?? 0}ms`;
  }
  if (event.phase === 'error') {
    return `Build failed: ${event.message ?? ''}`;
  }
  return null;
}

/**
 * Build steps as plain log lines, to interleave with an install/update log rather than show a badge.
 * With a `name` it follows that one plugin (unprefixed lines); without, it follows every plugin and
 * prefixes each line with the plugin it belongs to (for a bulk "Update all" log). Resets on each run.
 */
export function usePluginCompileLogs(name?: string): string[] {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    setLines([]);
    return subscribeSharedEvents(getStreamUrl('/api/stream/events'), (ev) => {
      const event = parsePluginCompileEvent(ev.data);
      if (!event || (name !== undefined && event.name !== name)) {
        return;
      }
      // A fresh `start` replaces this plugin's prior build lines: a dev file-watcher can trigger a
      // redundant recompile right after install, and only the latest run is worth showing.
      if (event.phase === 'start') {
        setLines((prev) =>
          name === undefined ? prev.filter((l) => !l.startsWith(`${event.name}: `)) : []
        );
        return;
      }
      const line = compileLogLine(event);
      if (line) {
        setLines((prev) => [...prev, name === undefined ? `${event.name}: ${line}` : line]);
      }
    });
  }, [name]);

  return lines;
}
