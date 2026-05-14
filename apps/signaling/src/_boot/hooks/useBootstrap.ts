import { useEffect, useState } from 'react';
import { buildAssetGraph, injectGraph } from '@/lib/asset-graph';
import { classifyError, type ErrorClassification } from '@/lib/classify-error';
import { BootstrapTimeoutError } from '@/lib/errors';
import { resolveCoordinator } from '@/lib/hub-name';
import { storeHubName } from '@/lib/hub-storage';
import { mintTicket, openPeer, type PeerHandle } from '@/lib/peer';
import { ensureServiceWorker } from '@/lib/service-worker';

export type BootstrapPhase = 'landing' | 'connecting' | 'fetching' | 'loading' | 'error' | 'done';

export interface BootstrapState {
  phase: BootstrapPhase;
  status: string;
  /** Free-form technical detail (last fetched URL, count, …). */
  detail: string | null;
  error: ErrorClassification | null;
  retry: () => void;
}

interface AttemptCallbacks {
  setPhase: (phase: BootstrapPhase) => void;
  setStatus: (status: string) => void;
  setDetail: (detail: string | null) => void;
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
  const [error, setError] = useState<ErrorClassification | null>(null);
  const [attemptNonce, setAttemptNonce] = useState(0);

  useEffect(() => {
    if (!hubName) {
      setPhase('landing');
      setStatus('Choose a hub');
      setDetail(null);
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

    void runAttempt(hubName, ac.signal, peerRef, { setPhase, setStatus, setDetail })
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
    expiresIn: `${ticket.expiresAt - Math.floor(Date.now() / 1000)}s`,
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
    if (!signal.aborted) {
      cb.setDetail(`${event.fetched} modules · ${shortenUrl(event.url)}`);
    }
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
const MAX_URL_LENGTH = 56;
function shortenUrl(url: string): string {
  if (url.length <= MAX_URL_LENGTH) {
    return url;
  }
  const tailLen = MAX_URL_LENGTH - 4;
  return `…${url.slice(-tailLen)}`;
}
