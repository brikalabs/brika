import { useEffect, useState } from 'react';
import { buildAssetGraph, injectGraph } from '@/lib/asset-graph';
import { classifyError, type ErrorClassification } from '@/lib/classify-error';
import { BootstrapTimeoutError } from '@/lib/errors';
import { resolveCoordinator } from '@/lib/hub-name';
import { storeHubName } from '@/lib/hub-storage';
import { mintTicket, openPeer, type PeerHandle } from '@/lib/peer';
import { ensureServiceWorker } from '@/lib/service-worker';

export type BootstrapPhase = 'landing' | 'connecting' | 'fetching' | 'loading' | 'error' | 'done';

/** BFS progress snapshot for the loading bar. `null` outside the fetching phase. */
export interface BootstrapProgress {
  /** Modules fetched + cached so far. */
  fetched: number;
  /**
   * Modules discovered so far. Climbs as BFS uncovers transitive
   * imports — callers should clamp `fetched / total` for the bar to
   * avoid backward jumps when the denominator grows mid-flight.
   */
  total: number;
}

export interface BootstrapState {
  phase: BootstrapPhase;
  status: string;
  /** Free-form technical detail (last fetched URL, count, …). */
  detail: string | null;
  /** BFS module-count progress while priming the cache. */
  progress: BootstrapProgress | null;
  error: ErrorClassification | null;
  retry: () => void;
}

interface AttemptCallbacks {
  setPhase: (phase: BootstrapPhase) => void;
  setStatus: (status: string) => void;
  setDetail: (detail: string | null) => void;
  setProgress: (progress: BootstrapProgress | null) => void;
}

const OVERALL_TIMEOUT_MS = 45_000;

/**
 * Open a peer to {@link hubName}, prime the asset graph, inject the entry.
 * Pass `null` to render the landing state instead.
 */
export function useBootstrap(hubName: string | null): BootstrapState {
  const [phase, setPhase] = useState<BootstrapPhase>(hubName ? 'connecting' : 'landing');
  const [status, setStatus] = useState(hubName ? `Connecting to ${hubName}…` : 'Choose a hub');
  const [detail, setDetail] = useState<string | null>(null);
  const [progress, setProgress] = useState<BootstrapProgress | null>(null);
  const [error, setError] = useState<ErrorClassification | null>(null);
  const [attemptNonce, setAttemptNonce] = useState(0);

  useEffect(() => {
    if (!hubName) {
      setPhase('landing');
      setStatus('Choose a hub');
      setDetail(null);
      setProgress(null);
      setError(null);
      return;
    }

    // Hub name lives in localStorage now — strip the legacy `/<hubName>`
    // URL prefix so the loaded hub UI starts on a clean path. Deep links
    // (`/<hubName>/plugins`) collapse to their tail (`/plugins`).
    stripHubPrefixFromUrl(hubName);

    const ac = new AbortController();
    const peerRef: { current: PeerHandle | null } = { current: null };

    setPhase('connecting');
    setStatus(`Connecting to ${hubName}…`);
    setDetail(null);
    setProgress(null);
    setError(null);

    // Wall-clock watchdog: WebRTC can sit in "checking" forever on bad NATs.
    // After OVERALL_TIMEOUT_MS without reaching `done`, abort + surface error.
    const watchdog = setTimeout(() => {
      ac.abort();
      if (peerRef.current) {
        peerRef.current.close();
        peerRef.current = null;
      }
      setError(classifyError(new BootstrapTimeoutError(), hubName));
      setPhase('error');
    }, OVERALL_TIMEOUT_MS);

    void runAttempt(hubName, ac.signal, peerRef, { setPhase, setStatus, setDetail, setProgress })
      .then(() => clearTimeout(watchdog))
      .catch((err: unknown) => {
        clearTimeout(watchdog);
        if (peerRef.current) {
          peerRef.current.close();
          peerRef.current = null;
        }
        if (ac.signal.aborted) {
          log('attempt aborted (cleanup), ignoring err', err);
          return;
        }
        console.error('[brika-bootstrap] attempt failed', {
          errorClass: err instanceof Error ? err.constructor.name : typeof err,
          message: err instanceof Error ? err.message : String(err),
          err,
        });
        setError(classifyError(err, hubName));
        setPhase('error');
      });

    return () => {
      clearTimeout(watchdog);
      ac.abort();
      if (peerRef.current) {
        peerRef.current.close();
        peerRef.current = null;
      }
    };
  }, [hubName, attemptNonce]);

  return {
    phase,
    status,
    detail,
    progress,
    error,
    retry: () => setAttemptNonce((n) => n + 1),
  };
}

const log = (...args: unknown[]): void => console.log('[brika-bootstrap]', ...args);

async function runAttempt(
  hubName: string,
  signal: AbortSignal,
  peerRef: { current: PeerHandle | null },
  cb: AttemptCallbacks
): Promise<void> {
  log('attempt start', { hubName });
  const coordinator = resolveCoordinator();
  const swPromise = ensureServiceWorker();

  log('minting ticket', { coordinator });
  const ticket = await mintTicket(hubName, coordinator, signal);
  if (signal.aborted) {
    log('aborted after mintTicket');
    return;
  }
  log('ticket ok', {
    ticket: `${ticket.ticket.slice(0, 12)}…`,
    expiresAt: new Date(ticket.expiresAt * 1000).toISOString(),
  });

  log('opening peer');
  peerRef.current = await openPeer(hubName, ticket, coordinator);
  if (signal.aborted) {
    log('aborted after openPeer');
    peerRef.current.close();
    peerRef.current = null;
    return;
  }
  log('peer open');

  // Handshake succeeded — only now do we persist the hub name. Writing
  // earlier (on landing-card submit) would trap the user on a bad name:
  // every refresh would re-attempt the failing hub. `storeHubName` also
  // purges `brika-*` caches if the prior hub differs, so the BFS below
  // sees a clean slate. Drop `?hub=` from the URL once committed so the
  // address bar stays clean for subsequent navigation.
  await storeHubName(hubName);
  stripHubQueryFromUrl();

  cb.setPhase('fetching');
  cb.setStatus('Loading app from your hub…');
  const hasServiceWorker = await swPromise;
  log('hasServiceWorker', hasServiceWorker);
  if (signal.aborted) {
    log('aborted after swPromise');
    return;
  }

  log('building asset graph');
  const graph = await buildAssetGraph(peerRef.current, hubName, hasServiceWorker, (event) => {
    if (signal.aborted) {
      return;
    }
    cb.setDetail(prettyModuleLabel(event.url));
    cb.setProgress({ fetched: event.fetched, total: event.total });
  });
  if (signal.aborted) {
    log('aborted after buildAssetGraph');
    return;
  }
  log('graph built', {
    scripts: graph.scripts.length,
    cssLinks: graph.cssLinks.length,
  });

  cb.setPhase('loading');
  cb.setStatus('Starting app…');
  cb.setDetail(`${graph.scripts.length} scripts · ${graph.cssLinks.length} stylesheets`);
  log('injecting graph');
  await injectGraph(graph, 'root');
  if (signal.aborted) {
    log('aborted after injectGraph');
    return;
  }
  log('done');

  cb.setPhase('done');
}

function stripHubQueryFromUrl(): void {
  if (globalThis.location === undefined || globalThis.history === undefined) {
    return;
  }
  const url = new URL(globalThis.location.href);
  if (!url.searchParams.has('hub')) {
    return;
  }
  url.searchParams.delete('hub');
  globalThis.history.replaceState(null, '', url.pathname + url.search + url.hash);
}

function stripHubPrefixFromUrl(hubName: string): void {
  if (globalThis.location === undefined || globalThis.history === undefined) {
    return;
  }
  const { pathname, search, hash } = globalThis.location;
  const first = pathname.split('/').find((s) => s.length > 0);
  if (first !== hubName) {
    return;
  }
  const stripped = pathname.slice(`/${hubName}`.length) || '/';
  globalThis.history.replaceState(null, '', `${stripped}${search}${hash}`);
}

/**
 * Trim long URLs to fit a single line. Keeps the rightmost path segment
 * (which is the part a human cares about — file name + query) and elides
 * the middle if the whole thing wouldn't fit.
 */
const MAX_LABEL_LENGTH = 48;

/**
 * Turn a Vite-dev URL into something a human would recognise:
 *
 *   /node_modules/.vite/deps/@brika_clay.js?v=2f6dbe94  →  @brika/clay
 *   /node_modules/.vite/deps/react.js?v=2f6dbe94        →  react
 *   /node_modules/.vite/deps/dot-qdjE6ESa.js            →  dot
 *   /src/features/auth/LoginPage.tsx                    →  features/auth/LoginPage.tsx
 *   /@fs/Users/x/projects/brika/packages/i18n/src/...   →  packages/i18n/src/...
 *
 * The bar already shows the ratio, so this just needs to give the eye
 * a moving signal: "still working, currently on `react`" — not a 200-
 * char Vite cache key.
 */
function prettyModuleLabel(url: string): string {
  let label = url.split('?')[0] ?? url;
  // /node_modules/.vite/deps/X.js → strip prefix, .js suffix, and any
  // 8-char hash dangling on the filename (Vite's optimizer chunk id).
  const depsMatch = /^\/node_modules\/\.vite\/deps\/(.+?)(?:-[A-Za-z0-9_-]{8,})?\.js$/.exec(label);
  if (depsMatch?.[1]) {
    // `@brika_clay` → `@brika/clay`, `lucide-react` → `lucide-react`.
    label = depsMatch[1].replaceAll('_', '/');
  } else if (label.startsWith('/@fs/')) {
    // Pop the long absolute prefix; show only the project-relative tail.
    const tail = label.slice('/@fs/'.length);
    const projectRoot = tail.indexOf('/packages/');
    const appsRoot = tail.indexOf('/apps/');
    const cut = Math.max(projectRoot, appsRoot);
    label = cut >= 0 ? tail.slice(cut + 1) : tail;
  } else if (label.startsWith('/')) {
    label = label.slice(1);
  }
  if (label.length > MAX_LABEL_LENGTH) {
    label = `…${label.slice(-(MAX_LABEL_LENGTH - 1))}`;
  }
  return label;
}
