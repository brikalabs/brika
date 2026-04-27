import { Card, cn } from '@brika/clay';
import { BrikaLogo } from '@brika/clay/components/brika-logo';
import type { ReactNode } from 'react';

/** Centered card layout shared by LoginPage and setup wizard. */
export function AuthLayout({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-background p-4">
      <div className="flex flex-1 items-center" />

      <Card className={cn('w-full', className)}>{children}</Card>

      <div className="flex flex-1" />
      <footer className="flex items-center gap-2 pt-8 text-muted-foreground text-sm">
        <BrikaLogo className="size-4" />
        <span>&copy; {new Date().getFullYear()} Brika Labs</span>
      </footer>
    </div>
  );
}
