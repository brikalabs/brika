import { useParams } from '@tanstack/react-router';
import type React from 'react';
import { ConnectingCard } from '@/components/ConnectingCard';
import { ErrorCard } from '@/components/ErrorCard';
import { Mark } from '@/components/Mark';
import { useBootstrap } from '@/hooks/useBootstrap';
import { isValidHubName } from '@/lib/hub-name';

export function LoaderScreen(): React.ReactElement {
  const params = useParams({ strict: false }) as { hubName?: string };
  const hubName = isValidHubName(params.hubName) ? params.hubName : null;
  const { phase, status, detail, error, retry } = useBootstrap(hubName);

  return (
    <main className="fixed inset-0 grid place-items-center p-6">
      <div className="flex flex-col items-center">
        <Mark phase={phase} />
        {(phase === 'connecting' || phase === 'fetching' || phase === 'loading') && (
          <ConnectingCard status={status} detail={detail} />
        )}
        {phase === 'error' && error && <ErrorCard error={error} onRetry={retry} />}
      </div>
    </main>
  );
}
