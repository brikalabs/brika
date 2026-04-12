'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

function TrafficLights() {
  return (
    <div className="flex items-center gap-2" aria-hidden>
      <span className="size-3 rounded-full bg-[#ff5f57]" />
      <span className="size-3 rounded-full bg-[#febc2e]" />
      <span className="size-3 rounded-full bg-[#28c840]" />
    </div>
  );
}

export function Terminal({
  actions,
  children,
  className,
}: Readonly<{
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}>) {
  return (
    <div
      className={cn(
        'terminal-glow overflow-hidden rounded-xl border border-code-border bg-code-bg',
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-code-border px-3 py-2.5 sm:px-4">
        <TrafficLights />
        {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="overflow-x-auto px-4 py-4 font-mono text-sm leading-relaxed sm:px-5 sm:py-5">
        {children}
      </div>
    </div>
  );
}

export function Line({
  prompt = '$',
  children,
}: Readonly<{
  prompt?: string;
  children: ReactNode;
}>) {
  return (
    <div className="flex items-start gap-2">
      <span className="select-none text-muted-foreground">{prompt}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

export function Comment({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <div
      className="select-none"
      style={{
        color: 'var(--comment)',
      }}
    >
      {children}
    </div>
  );
}

export function Cmd({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <span
      style={{
        color: 'var(--cmd)',
      }}
    >
      {children}
    </span>
  );
}

export function Flag({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return <span className="text-muted-foreground">{children}</span>;
}

export function Cursor() {
  return <span className="terminal-cursor" aria-hidden />;
}
