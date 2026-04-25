import { ProgressDisplay } from '@brika/clay/components/progress-display';
import { useRef } from 'react';

export function ProgressDisplayDefaultDemo() {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  return (
    <div className="w-full max-w-md">
      <ProgressDisplay
        progressValue={66}
        phaseLabel="Uploading…"
        logs={['Connecting to host', 'Negotiating tls', 'Streaming chunks (33/50)']}
        scrollRef={scrollRef}
        error={null}
        success={false}
        isProcessing
      />
    </div>
  );
}
