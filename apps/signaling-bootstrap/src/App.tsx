import type React from 'react';
import { ConnectingCard } from '@/components/ConnectingCard';
import { ErrorCard } from '@/components/ErrorCard';
import { LandingCard } from '@/components/LandingCard';
import { Mark } from '@/components/Mark';
import { useBootstrap } from '@/hooks/useBootstrap';

export function App(): React.ReactElement {
  const { phase, status, error, retry } = useBootstrap();

  return (
    <main className="fixed inset-0 grid place-items-center p-6">
      <div className="flex flex-col items-center">
        <Mark phase={phase} />
        {phase === 'landing' && <LandingCard />}
        {(phase === 'connecting' || phase === 'fetching' || phase === 'loading') && (
          <ConnectingCard status={status} />
        )}
        {phase === 'error' && error && <ErrorCard error={error} onRetry={retry} />}
      </div>
    </main>
  );
}
