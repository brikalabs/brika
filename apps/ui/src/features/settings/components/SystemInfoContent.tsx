/**
 * SystemInfoContent Component
 *
 * The content section of system info with all info items.
 */

import {
  Calendar,
  Clock,
  FileText,
  FolderOpen,
  GitBranch,
  GitCommit,
  Github,
  Laptop,
  Server,
  Tag,
} from 'lucide-react';
import { Uptime } from '@/components/Uptime';
import { useLocale } from '@/lib/use-locale';
import { InfoItem } from './InfoItem';
import { SystemInfoStats } from './SystemInfoStats';

interface SystemData {
  version: string;
  runtime: string;
  os: string;
  startedAt: string;
  repository: string | null;
  build: {
    commit: string | null;
    branch: string | null;
    date: string | null;
  };
  paths: {
    root: string;
    config: string;
    data: string;
    plugins: string;
  };
  stats: {
    plugins: { total: number; running: number };
    blocks: { total: number };
    workflows: { total: number; enabled: number };
    sparks: { total: number };
  };
}

interface SystemInfoContentProps {
  system: SystemData;
}

export function SystemInfoContent({ system }: Readonly<SystemInfoContentProps>) {
  const { t } = useLocale();

  const repo = system.repository;
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
        <InfoItem icon={Tag} label={t('settings:system.version')} value={system.version} copyable />
        <InfoItem
          icon={Server}
          label={t('settings:system.runtime')}
          value={system.runtime}
          copyable
        />
        <InfoItem icon={Laptop} label={t('settings:system.os')} value={system.os} copyable />
        <InfoItem
          icon={Clock}
          label={t('settings:system.uptime')}
          value={
            <Uptime startedAt={system.startedAt ? new Date(system.startedAt).getTime() : null} />
          }
        />

        {system.build.commit && (
          <InfoItem
            icon={GitCommit}
            label={t('settings:system.commit')}
            value={system.build.commit}
            href={commitUrl}
            copyable
          />
        )}
        {system.build.branch && (
          <InfoItem
            icon={GitBranch}
            label={t('settings:system.branch')}
            value={system.build.branch}
            href={branchUrl}
            copyable
          />
        )}
        {system.build.date && (
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

        {system.paths && (
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

        <SystemInfoStats stats={system.stats} />
      </div>
    </div>
  );
}
