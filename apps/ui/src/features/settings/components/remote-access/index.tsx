import { Badge, Button, Input } from '@brika/clay';
import { ExternalLink, KeyRound, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useLocale } from '@/lib/use-locale';
import {
  type RemoteAccessStatus,
  useRemoteAccessStatus,
  useRevokeRemoteAccessToken,
  useSetRemoteAccessToken,
} from './hooks';

function StatusBadge({ status }: Readonly<{ status: RemoteAccessStatus }>) {
  const { t } = useLocale();
  if (!status.enabled) {
    return <Badge variant="outline">{t('settings:remoteAccess.status.disabled')}</Badge>;
  }
  if (status.state === 'connected') {
    return <Badge variant="default">{t('settings:remoteAccess.status.connected')}</Badge>;
  }
  if (status.state === 'connecting' || status.state === 'reconnecting') {
    return <Badge variant="secondary">{t(`settings:remoteAccess.status.${status.state}`)}</Badge>;
  }
  return <Badge variant="outline">{t('settings:remoteAccess.status.idle')}</Badge>;
}

export function RemoteAccessSection() {
  const { t } = useLocale();
  const { data: status, isLoading } = useRemoteAccessStatus();
  const setToken = useSetRemoteAccessToken();
  const revokeToken = useRevokeRemoteAccessToken();
  const [tokenInput, setTokenInput] = useState('');

  if (isLoading || !status) {
    return <p className="text-muted-foreground text-sm">{t('common:loading')}</p>;
  }

  if (!status.enabled) {
    return (
      <div className="space-y-3">
        <p className="text-muted-foreground text-sm">
          {t('settings:remoteAccess.disabledHelp')}
        </p>
        <pre className="rounded-md bg-foreground/[0.04] px-3 py-2 font-mono text-[12px]">
          BRIKA_REMOTE_ACCESS=1 BRIKA_REMOTE_NAME=myhub
        </pre>
      </div>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = tokenInput.trim();
    if (trimmed.length < 16) {
      return;
    }
    setToken.mutate(trimmed, {
      onSuccess: () => setTokenInput(''),
    });
  };

  return (
    <div className="space-y-5">
      {/* Identity & status */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="font-mono text-[10px] text-muted-foreground/70 uppercase tracking-[0.16em]">
            {t('settings:remoteAccess.fields.name')}
          </p>
          <p className="font-medium text-sm">{status.name || '—'}</p>
        </div>
        <div className="space-y-1">
          <p className="font-mono text-[10px] text-muted-foreground/70 uppercase tracking-[0.16em]">
            {t('settings:remoteAccess.fields.status')}
          </p>
          <StatusBadge status={status} />
        </div>
        {status.publicOrigin && (
          <div className="space-y-1 sm:col-span-2">
            <p className="font-mono text-[10px] text-muted-foreground/70 uppercase tracking-[0.16em]">
              {t('settings:remoteAccess.fields.publicOrigin')}
            </p>
            <a
              href={status.publicOrigin}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 font-mono text-[12.5px] text-primary hover:underline"
            >
              {status.publicOrigin}
              <ExternalLink className="size-3" />
            </a>
          </div>
        )}
        <div className="space-y-1">
          <p className="font-mono text-[10px] text-muted-foreground/70 uppercase tracking-[0.16em]">
            {t('settings:remoteAccess.fields.activeSessions')}
          </p>
          <p className="font-medium text-sm tabular-nums">{status.activeSessions}</p>
        </div>
      </div>

      {/* Token management */}
      <div className="space-y-3 border-border/50 border-t pt-5">
        <div>
          <h3 className="font-medium text-sm">{t('settings:remoteAccess.token.title')}</h3>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            {t('settings:remoteAccess.token.description')}
          </p>
        </div>
        <form onSubmit={submit} className="flex flex-wrap gap-2">
          <Input
            type="password"
            placeholder={t('settings:remoteAccess.token.placeholder')}
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            className="min-w-[280px] flex-1 font-mono text-[12.5px]"
            autoComplete="off"
          />
          <Button
            type="submit"
            size="sm"
            disabled={setToken.isPending || tokenInput.trim().length < 16}
          >
            <KeyRound />
            {status.tokenPresent
              ? t('settings:remoteAccess.token.rotate')
              : t('settings:remoteAccess.token.set')}
          </Button>
          {status.tokenPresent && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => revokeToken.mutate()}
              disabled={revokeToken.isPending}
            >
              <Trash2 />
              {t('settings:remoteAccess.token.revoke')}
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}
