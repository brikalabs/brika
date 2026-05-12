import { useCallback, useEffect, useState } from 'react';
import { buildAssetGraph, ensureServiceWorker, injectGraph } from '@/lib/asset-graph';
import { classifyError, type ErrorClassification } from '@/lib/classify-error';
import { resolveCoordinator } from '@/lib/hub-name';
import { mintTicket, openPeer, type PeerHandle } from '@/lib/peer';

export type BootstrapPhase = 'landing' | 'connecting' | 'fetching' | 'loading' | 'error' | 'done';

export interface BootstrapState {
  phase: BootstrapPhase;
  status: string;
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
  const [error, setError] = useState<ErrorClassification | null>(null);

  const attempt = useCallback(async () => {
    if (!hubName) {
      setPhase('landing');
      return;
    }
    setPhase('connecting');
    setStatus(`Connecting to ${hubName}…`);
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
      const graph = await buildAssetGraph(peer, hasServiceWorker);
      setPhase('loading');
      setStatus('Starting app…');
      injectGraph(graph, 'root');
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
    error,
    retry: () => void attempt(),
  };
}
