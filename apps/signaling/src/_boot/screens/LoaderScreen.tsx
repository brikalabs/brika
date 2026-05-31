import type React from 'react';
import { ConnectingCard } from '@/components/ConnectingCard';
import { ErrorCard } from '@/components/ErrorCard';
import { LandingCard } from '@/components/LandingCard';
import { Mark } from '@/components/Mark';
import { useBootstrap } from '@/hooks/useBootstrap';
import { loadHubName } from '@/lib/hub-storage';

/**
 * Root screen. Reads the hub name from `localStorage` (or `?hub=`)
 * and either runs the connection loop or shows the landing card so
 * the user can pick a hub.
 */
export function LoaderScreen(): React.ReactElement {
  const hubName = loadHubName();
  const { phase, status, detail, progress, error, retry } = useBootstrap(hubName);
  const busy = phase === 'connecting' || phase === 'fetching' || phase === 'loading';

  return (
    <main className="fixed inset-0 grid place-items-center p-6" aria-busy={busy || undefined}>
      <div className="flex flex-col items-center">
        <Mark phase={phase} />
        {phase === 'landing' && <LandingCard />}
        {busy && <ConnectingCard status={status} detail={detail} progress={progress} />}
        {phase === 'error' && error && <ErrorCard error={error} onRetry={retry} />}
      </div>
    </main>
  );
}
