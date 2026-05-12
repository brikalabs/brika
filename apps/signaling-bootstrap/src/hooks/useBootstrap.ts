import { useCallback, useEffect, useRef, useState } from 'react';
import { buildAssetGraph, ensureServiceWorker, injectGraph } from '@/lib/asset-graph';
import { classifyError, type ErrorClassification } from '@/lib/classify-error';
import { readHubNameFromDocument, resolveCoordinator } from '@/lib/hub-name';
import { mintTicket, openPeer, type PeerHandle } from '@/lib/peer';

export type BootstrapPhase = 'landing' | 'connecting' | 'fetching' | 'loading' | 'error' | 'done';

export interface BootstrapState {
  phase: BootstrapPhase;
  hubName: string | null;
  /** Free-text status under the mark while a phase is in progress. */
  status: string;
  /** Populated when phase === 'error'. */
  error: ErrorClassification | null;
  /** Retry the failed attempt. No-op if no error is set. */
  retry: () => void;
}

/**
 * Top-level orchestrator. Reads the hub name from the document, opens the
 * peer, primes the asset graph, injects the entry, and surfaces any failure
 * as a classified error. The React tree above just renders whatever phase
 * this hook reports.
 */
export function useBootstrap(): BootstrapState {
  const [phase, setPhase] = useState<BootstrapPhase>('connecting');
  const [status, setStatus] = useState('Connecting to your hub…');
  const [error, setError] = useState<ErrorClassification | null>(null);
  const hubNameRef = useRef<string | null>(null);
  if (hubNameRef.current === null && typeof document !== 'undefined') {
    hubNameRef.current = readHubNameFromDocument();
  }
  const hubName = hubNameRef.current;

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
    hubName,
    status,
    error,
    retry: () => void attempt(),
  };
}
