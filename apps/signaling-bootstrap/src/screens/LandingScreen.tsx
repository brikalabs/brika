import type React from 'react';
import { LandingCard } from '@/components/LandingCard';
import { Mark } from '@/components/Mark';

export function LandingScreen(): React.ReactElement {
  return (
    <main className="fixed inset-0 grid place-items-center p-6">
      <div className="flex flex-col items-center">
        <Mark phase="landing" />
        <LandingCard />
      </div>
    </main>
  );
}
