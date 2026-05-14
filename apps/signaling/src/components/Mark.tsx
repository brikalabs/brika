import { BrikaMark, type BrikaMarkState } from '@brika/components/brika-mark';
import type React from 'react';
import type { BootstrapPhase } from '@/hooks/useBootstrap';

interface MarkProps {
  readonly phase: BootstrapPhase;
}

function stateForPhase(phase: BootstrapPhase): BrikaMarkState {
  if (phase === 'error') {
    return 'error';
  }
  if (phase === 'landing' || phase === 'done') {
    return 'idle';
  }
  return 'loading';
}

export function Mark({ phase }: Readonly<MarkProps>): React.ReactElement {
  return <BrikaMark state={stateForPhase(phase)} className="mx-auto mb-6" />;
}
