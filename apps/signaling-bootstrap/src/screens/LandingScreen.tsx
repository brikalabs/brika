import type React from 'react';
import { LandingCard } from '@/components/LandingCard';

export function LandingScreen(): React.ReactElement {
  return (
    <main className="fixed inset-0 grid place-items-center p-6">
      <LandingCard />
    </main>
  );
}
