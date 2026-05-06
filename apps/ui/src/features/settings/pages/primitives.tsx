import { cn } from '@brika/clay';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

// ─── Page header ────────────────────────────────────────────────────────────

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
}

export function PageHeader({ eyebrow, title, description }: Readonly<PageHeaderProps>) {
  return (
    <header className="mb-8 space-y-2">
      {eyebrow && (
        <span className="font-mono text-[10px] text-muted-foreground/70 uppercase tracking-[0.18em]">
          {eyebrow}
        </span>
      )}
      <h1 className="font-semibold text-[26px] text-foreground leading-[1.1] tracking-tight">
        {title}
      </h1>
      {description && (
        <p className="max-w-prose text-[14px] text-muted-foreground leading-relaxed">
          {description}
        </p>
      )}
    </header>
  );
}

// ─── Settings section card (uniform across all settings pages) ──────────────

interface SettingsSectionProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** Right-aligned content in the section header (badge, secondary action…). */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SettingsSection({
  title,
  description,
  icon: Icon,
  actions,
  children,
  className,
}: Readonly<SettingsSectionProps>) {
  return (
    <section
      className={cn(
        'rounded-xl border border-border/50 bg-foreground/[0.015] p-6 lg:p-7',
        className
      )}
    >
      <header className="mb-5 flex items-start gap-3">
        {Icon && (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-foreground/[0.05] text-muted-foreground">
            <Icon className="size-4" />
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-0.5">
          <h2 className="font-medium text-[15px] text-foreground tracking-tight">{title}</h2>
          {description && (
            <p className="text-[12.5px] text-muted-foreground leading-relaxed">{description}</p>
          )}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
