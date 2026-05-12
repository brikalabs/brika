import { useCallback, useEffect, useState } from 'react';
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

/**
 * Open a peer to {@link hubName}, prime the asset graph, inject the entry.
 * Pass `null` to render the landing state instead.
 */
export function useBootstrap(hubName: string | null): BootstrapState {
  const [phase, setPhase] = useState<BootstrapPhase>(hubName ? 'connecting' : 'landing');
  const [status, setStatus] = useState(hubName ? `Connecting to ${hubName}…` : 'Choose a hub');
  const [detail, setDetail] = useState<string | null>(null);
  const [error, setError] = useState<ErrorClassification | null>(null);

  const attempt = useCallback(async () => {
    if (!hubName) {
      setPhase('landing');
      setDetail(null);
      return;
    }
    setPhase('connecting');
    setStatus(`Connecting to ${hubName}…`);
    setDetail(null);
    setError(null);

    const coordinator = resolveCoordinator();
    const swPromise = ensureServiceWorker();
    let peer: PeerHandle | null = null;
    try {
      const ticket = await mintTicket(hubName, coordinator);
      peer = await openPeer(hubName, ticket, coordinator);
      setPhase('fetching');
      setStatus('Loading app from your hub…');
      const hasServiceWorker = await swPromise;
      const graph = await buildAssetGraph(peer, hubName, hasServiceWorker, (event) => {
        setDetail(`${event.fetched} modules · ${shortenUrl(event.url)}`);
      });
      setPhase('loading');
      setStatus('Starting app…');
      setDetail(`${graph.scripts.length} scripts · ${graph.cssLinks.length} stylesheets`);
      await injectGraph(graph, 'root');
      setPhase('done');
    } catch (err) {
      if (peer) {
        peer.close();
      }
      setError(classifyError(err, hubName));
      setPhase('error');
    }
  }, [hubName]);

  useEffect(() => {
    void attempt();
  }, [attempt]);

  return {
    phase,
    status,
    detail,
    error,
    retry: () => void attempt(),
  };
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
