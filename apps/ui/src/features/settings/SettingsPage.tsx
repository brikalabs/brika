/**
 * Settings Page
 *
 * Application preferences including language selection.
 */

import type { LucideIcon } from 'lucide-react';
import {
  Blocks,
  Calendar,
  Check,
  Clock,
  Copy,
  FileText,
  FolderOpen,
  GitBranch,
  GitCommit,
  Github,
  Laptop,
  Loader2,
  Plug,
  Server,
  Tag,
  Workflow,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import { ThemeSelector } from '@/components/theme-selector';
import { Uptime } from '@/components/Uptime';
import {
  Card,
  CardContent,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';
import { useAvailableLocales, useSystem } from './hooks';

// ─────────────────────────────────────────────────────────────────────────────
// Shared Components
// ─────────────────────────────────────────────────────────────────────────────

function LoadingState({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      <span>{message}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Language Selector
// ─────────────────────────────────────────────────────────────────────────────

function LanguageSelector() {
  const { locale, changeLocale, getLanguageName, t } = useLocale();
  const { data: locales, isLoading } = useAvailableLocales();

  if (isLoading) {
    return <LoadingState message={t('common:messages.loading')} />;
  }

  return (
    <div className="space-y-3">
      <div>
        <Label className="font-medium text-base">{t('settings:language.title')}</Label>
        <p className="text-muted-foreground text-sm">{t('settings:language.description')}</p>
      </div>

      <Select value={locale} onValueChange={changeLocale}>
        <SelectTrigger className="w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {locales?.map((loc) => (
            <SelectItem key={loc} value={loc}>
              <span className="flex items-center gap-2">
                <span className="font-medium">{getLanguageName(loc)}</span>
                <span className="text-muted-foreground text-xs uppercase">({loc})</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// System Information
// ─────────────────────────────────────────────────────────────────────────────

interface InfoItemProps {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  copyable?: boolean;
  href?: string;
  mono?: boolean;
  secondary?: string;
}

function InfoItem({
  icon: Icon,
  label,
  value,
  copyable,
  href,
  mono = true,
  secondary,
}: InfoItemProps) {
  const [copied, setCopied] = useState(false);
  const canCopy = copyable && typeof value === 'string';

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canCopy) return;

    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const className = cn(
    'group relative flex items-center gap-3 rounded-lg border p-3 transition-colors',
    href && 'cursor-pointer hover:bg-accent/50'
  );

  const content = (
    <>
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="shrink-0 text-muted-foreground text-sm">{label}</span>
      <span className={cn('ml-auto min-w-0 truncate text-sm', mono && 'font-mono')}>{value}</span>
      {secondary && <span className="shrink-0 text-muted-foreground text-xs">({secondary})</span>}
      {canCopy && (
        <button
          type="button"
          onClick={handleCopy}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md border bg-background p-1.5 text-muted-foreground opacity-0 shadow-sm transition-all hover:bg-accent hover:text-foreground group-hover:opacity-100"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </button>
      )}
    </>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {content}
      </a>
    );
  }

  return <div className={className}>{content}</div>;
}

function SystemInfo() {
  const { t } = useLocale();
  const { data: system, isLoading } = useSystem();

  if (isLoading) {
    return <LoadingState message={t('common:messages.loading')} />;
  }

  const repo = system?.repository;
  const commitUrl =
    repo && system.build.commit ? `${repo}/commit/${system.build.commit}` : undefined;
  const branchUrl = repo && system.build.branch ? `${repo}/tree/${system.build.branch}` : undefined;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-base">{t('settings:system.title')}</h3>
        <p className="text-muted-foreground text-sm">{t('settings:system.description')}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <InfoItem
          icon={Tag}
          label={t('settings:system.version')}
          value={system?.version ?? '-'}
          copyable
        />
        <InfoItem
          icon={Server}
          label={t('settings:system.runtime')}
          value={system?.runtime ?? '-'}
          copyable
        />
        <InfoItem
          icon={Laptop}
          label={t('settings:system.os')}
          value={system?.os ?? '-'}
          copyable
        />
        <InfoItem
          icon={Clock}
          label={t('settings:system.uptime')}
          value={
            <Uptime startedAt={system?.startedAt ? new Date(system.startedAt).getTime() : null} />
          }
        />

        {system?.build.commit && (
          <InfoItem
            icon={GitCommit}
            label={t('settings:system.commit')}
            value={system.build.commit}
            href={commitUrl}
            copyable
          />
        )}
        {system?.build.branch && (
          <InfoItem
            icon={GitBranch}
            label={t('settings:system.branch')}
            value={system.build.branch}
            href={branchUrl}
            copyable
          />
        )}
        {system?.build.date && (
          <InfoItem
            icon={Calendar}
            label={t('settings:system.buildDate')}
            value={new Date(system.build.date).toLocaleString()}
          />
        )}
        {repo && (
          <InfoItem
            icon={Github}
            label={t('settings:system.repository')}
            value={repo.replace('https://github.com/', '')}
            href={repo}
          />
        )}

        {system?.paths && (
          <>
            <InfoItem
              icon={FileText}
              label={t('settings:system.configPath')}
              value={system.paths.config}
              copyable
            />
            <InfoItem
              icon={FolderOpen}
              label={t('settings:system.dataPath')}
              value={system.paths.data}
              copyable
            />
            <InfoItem
              icon={FolderOpen}
              label={t('settings:system.pluginsPath')}
              value={system.paths.plugins}
              copyable
            />
          </>
        )}

        <InfoItem
          icon={Plug}
          label={t('settings:system.plugins')}
          value={system?.stats.plugins.total ?? 0}
          secondary={
            system?.stats.plugins.total
              ? t('settings:system.pluginsRunning', system.stats.plugins)
              : undefined
          }
          mono={false}
        />
        <InfoItem
          icon={Blocks}
          label={t('settings:system.blocks')}
          value={system?.stats.blocks.total ?? 0}
          mono={false}
        />
        <InfoItem
          icon={Workflow}
          label={t('settings:system.workflows')}
          value={system?.stats.workflows.total ?? 0}
          secondary={
            system?.stats.workflows.total
              ? t('settings:system.workflowsEnabled', system.stats.workflows)
              : undefined
          }
          mono={false}
        />
        <InfoItem
          icon={Zap}
          label={t('settings:system.sparks')}
          value={system?.stats.sparks.total ?? 0}
          mono={false}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings Page
// ─────────────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { t } = useLocale();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">{t('settings:title')}</h1>
        <p className="mt-1 text-muted-foreground">{t('settings:subtitle')}</p>
      </div>

      {/* Appearance */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <div>
            <h3 className="font-semibold text-base">{t('settings:appearance.title')}</h3>
            <p className="text-muted-foreground text-sm">{t('settings:appearance.description')}</p>
          </div>
          <ThemeSelector />
        </CardContent>
      </Card>

      {/* Language */}
      <Card>
        <CardContent className="p-6">
          <LanguageSelector />
        </CardContent>
      </Card>

      {/* System Information */}
      <Card>
        <CardContent className="p-6">
          <SystemInfo />
        </CardContent>
      </Card>
    </div>
  );
}
