import { Status, StatusIndicator, StatusLabel } from '@brika/clay';
import { Loader2 } from 'lucide-react';
import { useLocale } from '@/lib/use-locale';
import type { CompileTimeline } from '../use-plugin-compile';

type StatusVariant = 'success' | 'info' | 'destructive';

function variantFor(status: CompileTimeline['status']): StatusVariant {
  if (status === 'error') {
    return 'destructive';
  }
  return status === 'done' ? 'success' : 'info';
}

interface CompileTraceProps {
  timeline: CompileTimeline;
  /** `expanded` appends the module/chunk summary once a build settles. */
  variant?: 'compact' | 'expanded';
}

/**
 * The plugin's live build, shown as a single status pill matching the health
 * badge it stands in for. The label steps through the build ("Compiling bricks"
 * -> "Compiling server" -> "Compiled in 52ms"), paced by
 * `usePluginCompileTimeline` so it reads rather than blinking.
 */
export function CompileTrace({ timeline, variant = 'compact' }: Readonly<CompileTraceProps>) {
  const { t } = useLocale();
  const active = timeline.steps.find((s) => s.state === 'active');

  let label: string;
  if (timeline.status === 'done') {
    label = t('common:compile.done', { ms: timeline.durationMs ?? 0 });
    if (variant === 'expanded' && timeline.modules) {
      label = `${label} · ${t('common:compile.modules', { count: timeline.modules })}`;
    }
  } else if (timeline.status === 'error') {
    label = t('common:compile.failed');
  } else {
    label = active
      ? `${t('common:compile.compiling')} ${t(`common:compile.step.${active.key}`, { defaultValue: active.key })}`
      : t('common:compile.compiling');
  }

  return (
    <Status
      variant={variantFor(timeline.status)}
      className={variant === 'expanded' ? 'text-xs' : 'shrink-0 text-[11px]'}
    >
      {timeline.status === 'building' ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <StatusIndicator />
      )}
      <StatusLabel>{label}</StatusLabel>
    </Status>
  );
}
