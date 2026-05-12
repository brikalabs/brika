import { useEffect, useState } from 'react';
import { buildAssetGraph, ensureServiceWorker, injectGraph } from '@/lib/asset-graph';
import { classifyError, type ErrorClassification } from '@/lib/classify-error';
import { resolveCoordinator } from '@/lib/hub-name';
import { mintTicket, openPeer, type PeerHandle } from '@/lib/peer';

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

    void runAttempt(hubName, ac.signal, peerRef, { setPhase, setStatus, setDetail }).catch(
      (err) => {
        if (peerRef.current) {
          peerRef.current.close();
          peerRef.current = null;
        }
        if (ac.signal.aborted) {
          return;
        }
        setError(classifyError(err, hubName));
        setPhase('error');
      }
    );

    return () => {
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

async function runAttempt(
  hubName: string,
  signal: AbortSignal,
  peerRef: { current: PeerHandle | null },
  cb: AttemptCallbacks
): Promise<void> {
  const coordinator = resolveCoordinator();
  const swPromise = ensureServiceWorker();

  const ticket = await mintTicket(hubName, coordinator);
  if (signal.aborted) {
    return;
  }

  peerRef.current = await openPeer(hubName, ticket, coordinator);
  if (signal.aborted) {
    peerRef.current.close();
    peerRef.current = null;
    return;
  }

  cb.setPhase('fetching');
  cb.setStatus('Loading app from your hub…');
  const hasServiceWorker = await swPromise;
  if (signal.aborted) {
    return;
  }

  const graph = await buildAssetGraph(peerRef.current, hubName, hasServiceWorker, (event) => {
    if (!signal.aborted) {
      cb.setDetail(`${event.fetched} modules · ${shortenUrl(event.url)}`);
    }
  });
  if (signal.aborted) {
    return;
  }

  cb.setPhase('loading');
  cb.setStatus('Starting app…');
  cb.setDetail(`${graph.scripts.length} scripts · ${graph.cssLinks.length} stylesheets`);
  await injectGraph(graph, 'root');
  if (signal.aborted) {
    return;
  }

  cb.setPhase('done');
}

function stripHubPrefixFromUrl(hubName: string): void {
  if (typeof globalThis.location === 'undefined' || typeof globalThis.history === 'undefined') {
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
