import type { ReactNode } from 'react';

/**
 * Atmospheric full-screen canvas used by setup and login screens.
 *
 * - Soft radial glow in the primary tint diffused from top-center
 * - Subtle grid texture, masked with a radial fade so it never reaches the edges
 * - Centered content area (flex column)
 */
export function AmbientCanvas({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="relative isolate flex min-h-svh w-full flex-col items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute top-[-8rem] left-1/2 h-[28rem] w-[42rem] -translate-x-1/2 rounded-full bg-primary/20 opacity-60 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.025] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
      />
      {children}
    </div>
  );
}
