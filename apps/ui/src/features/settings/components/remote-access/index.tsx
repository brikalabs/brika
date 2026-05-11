import { Badge, Button, Input } from '@brika/clay';
import { ExternalLink, Globe, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useLocale } from '@/lib/use-locale';
import {
  type RemoteAccessStatus,
  useClaimRemoteAccessName,
  useForgetRemoteAccess,
  useRemoteAccessStatus,
} from './hooks';

function StatusBadge({ status }: Readonly<{ status: RemoteAccessStatus }>) {
  const { t } = useLocale();
  if (status.state === 'connected') {
    return <Badge variant="default">{t('settings:remoteAccess.status.connected')}</Badge>;
  }
  if (status.state === 'connecting' || status.state === 'reconnecting') {
    return <Badge variant="secondary">{t(`settings:remoteAccess.status.${status.state}`)}</Badge>;
  }
  return <Badge variant="outline">{t('settings:remoteAccess.status.idle')}</Badge>;
}

function ClaimForm() {
  const { t } = useLocale();
  const claim = useClaimRemoteAccessName();
  const [name, setName] = useState('');

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = name.trim().toLowerCase();
    if (trimmed.length < 4) {
      return;
    }
    claim.mutate(trimmed);
  };

  // Pull the error message out of the rejection so the user can see it.
  const errorMessage = claim.error instanceof Error ? claim.error.message : null;

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">{t('settings:remoteAccess.claim.help')}</p>
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <Input
          type="text"
          placeholder={t('settings:remoteAccess.claim.placeholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-[240px] flex-1 font-mono text-[12.5px]"
          autoComplete="off"
          pattern="[a-z][a-z0-9-]{2,30}[a-z0-9]"
          maxLength={32}
        />
        <span className="font-mono text-[12.5px] text-muted-foreground">.brika.dev</span>
        <Button type="submit" size="sm" disabled={claim.isPending || name.trim().length < 4}>
          <Globe />
          {t('settings:remoteAccess.claim.submit')}
        </Button>
      </form>
      {errorMessage && (
        <p className="text-[12.5px] text-destructive">{errorMessage}</p>
      )}
    </div>
  );
}

export function RemoteAccessSection() {
  const { t } = useLocale();
  const { data: status, isLoading } = useRemoteAccessStatus();
  const forget = useForgetRemoteAccess();

  if (isLoading || !status) {
    return <p className="text-muted-foreground text-sm">{t('common:loading')}</p>;
  }

  // No claim yet — show the claim form.
  if (!status.claimed) {
    return <ClaimForm />;
  }

  return (
    <div className="space-y-5">
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

      <div className="space-y-3 border-border/50 border-t pt-5">
        <div>
          <h3 className="font-medium text-sm">{t('settings:remoteAccess.forget.title')}</h3>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            {t('settings:remoteAccess.forget.description')}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => forget.mutate()}
          disabled={forget.isPending}
        >
          <Trash2 />
          {t('settings:remoteAccess.forget.action')}
        </Button>
      </div>
    </div>
  );
}
