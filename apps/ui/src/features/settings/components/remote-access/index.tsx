import { Badge, Button, Input } from '@brika/clay';
import {
  CheckCircle2,
  ExternalLink,
  Globe,
  Loader2,
  Pencil,
  Plug,
  RotateCw,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocale } from '@/lib/use-locale';
import {
  type RemoteAccessStatus,
  type SignalingState,
  useClaimRemoteAccessName,
  useForgetRemoteAccess,
  useRemoteAccessStatus,
  useSetCoordinatorOrigin,
  useTestCoordinator,
} from './hooks';

// ─── Helpers ────────────────────────────────────────────────────────────────

function stateVariant(state: SignalingState): 'default' | 'secondary' | 'outline' {
  if (state === 'connected') {
    return 'default';
  }
  if (state === 'connecting' || state === 'reconnecting') {
    return 'secondary';
  }
  return 'outline';
}

function StatusBadge({ status }: Readonly<{ status: RemoteAccessStatus }>) {
  const { t } = useLocale();
  return (
    <Badge variant={stateVariant(status.state)}>
      {t(`settings:remoteAccess.status.${status.state}`)}
    </Badge>
  );
}

// ─── Coordinator URL editor (shared by claim form + connected view) ─────────

function CoordinatorEditor({
  coordinatorOrigin,
  onSaved,
}: Readonly<{ coordinatorOrigin: string; onSaved?: () => void }>) {
  const { t } = useLocale();
  const set = useSetCoordinatorOrigin();
  const test = useTestCoordinator();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(coordinatorOrigin);

  // When the live value changes (e.g. PATCH succeeded), sync the draft.
  useEffect(() => {
    setDraft(coordinatorOrigin);
  }, [coordinatorOrigin]);

  const save = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || trimmed === coordinatorOrigin) {
      setEditing(false);
      return;
    }
    set.mutate(trimmed, {
      onSuccess: (res) => {
        setDraft(res.coordinatorOrigin);
        setEditing(false);
        onSaved?.();
      },
    });
  };

  const renderResult = () => {
    if (test.isPending) {
      return (
        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          {t('settings:remoteAccess.coordinator.testing')}
        </span>
      );
    }
    if (test.data?.ok) {
      return (
        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-emerald-500">
          <CheckCircle2 className="size-3.5" />
          {t('settings:remoteAccess.coordinator.testOk')}
        </span>
      );
    }
    if (test.data && !test.data.ok) {
      return (
        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-destructive">
          <XCircle className="size-3.5" />
          {test.data.error ??
            t('settings:remoteAccess.coordinator.testFailed', { status: test.data.status })}
        </span>
      );
    }
    return null;
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-[10px] text-muted-foreground/70 uppercase tracking-[0.16em]">
          {t('settings:remoteAccess.fields.coordinator')}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => test.mutate()}
            disabled={test.isPending || editing}
          >
            <Plug />
            {t('settings:remoteAccess.coordinator.test')}
          </Button>
          {!editing && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
              <Pencil />
              {t('settings:remoteAccess.coordinator.edit')}
            </Button>
          )}
        </div>
      </div>

      {editing ? (
        <form onSubmit={save} className="flex flex-wrap items-center gap-2">
          <Input
            type="url"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="https://api.brika.dev"
            className="min-w-72 flex-1 font-mono text-[12.5px]"
            autoComplete="off"
          />
          <Button type="submit" size="sm" disabled={set.isPending}>
            {t('common:actions.save')}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
            {t('common:actions.cancel')}
          </Button>
        </form>
      ) : (
        <p className="font-mono text-[12.5px] text-foreground">{coordinatorOrigin}</p>
      )}

      {set.error instanceof Error && (
        <p className="text-[12.5px] text-destructive">{set.error.message}</p>
      )}
      {renderResult()}
    </div>
  );
}

// ─── Claim form ─────────────────────────────────────────────────────────────

function ClaimForm({ coordinatorOrigin }: Readonly<{ coordinatorOrigin: string }>) {
  const { t } = useLocale();
  const claim = useClaimRemoteAccessName();
  const [name, setName] = useState('');

  const submit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = name.trim().toLowerCase();
    if (trimmed.length < 4) {
      return;
    }
    claim.mutate(trimmed);
  };

  const errorMessage = claim.error instanceof Error ? claim.error.message : null;

  return (
    <div className="space-y-5">
      <CoordinatorEditor coordinatorOrigin={coordinatorOrigin} />

      <div className="space-y-3 border-border/50 border-t pt-5">
        <p className="text-muted-foreground text-sm">{t('settings:remoteAccess.claim.help')}</p>
        <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
          <Input
            type="text"
            placeholder={t('settings:remoteAccess.claim.placeholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-w-60 flex-1 font-mono text-[12.5px]"
            autoComplete="off"
            pattern="[a-z][a-z0-9-]{2,30}[a-z0-9]"
            maxLength={32}
          />
          <span className="font-mono text-[12.5px] text-muted-foreground">.hubs.brika.dev</span>
          <Button type="submit" size="sm" disabled={claim.isPending || name.trim().length < 4}>
            <Globe />
            {t('settings:remoteAccess.claim.submit')}
          </Button>
        </form>
        {errorMessage && <p className="text-[12.5px] text-destructive">{errorMessage}</p>}
      </div>
    </div>
  );
}

// ─── Connected view ─────────────────────────────────────────────────────────

function StateDescription({ state }: Readonly<{ state: SignalingState }>) {
  const { t } = useLocale();
  if (state === 'connected') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12.5px] text-emerald-500">
        <CheckCircle2 className="size-3.5" />
        {t('settings:remoteAccess.stateDescription.connected')}
      </span>
    );
  }
  if (state === 'connecting') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        {t('settings:remoteAccess.stateDescription.connecting')}
      </span>
    );
  }
  if (state === 'reconnecting') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12.5px] text-amber-500">
        <RotateCw className="size-3.5 animate-spin" />
        {t('settings:remoteAccess.stateDescription.reconnecting')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
      <XCircle className="size-3.5" />
      {t(`settings:remoteAccess.stateDescription.${state}`)}
    </span>
  );
}

function ConnectedView({ status }: Readonly<{ status: RemoteAccessStatus }>) {
  const { t } = useLocale();
  const forget = useForgetRemoteAccess();

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="font-mono text-[10px] text-muted-foreground/70 uppercase tracking-[0.16em]">
            {t('settings:remoteAccess.fields.name')}
          </p>
          <p className="font-medium text-sm">{status.name}</p>
        </div>
        <div className="space-y-1">
          <p className="font-mono text-[10px] text-muted-foreground/70 uppercase tracking-[0.16em]">
            {t('settings:remoteAccess.fields.status')}
          </p>
          <div className="flex items-center gap-2">
            <StatusBadge status={status} />
            <StateDescription state={status.state} />
          </div>
        </div>
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
        <div className="space-y-1">
          <p className="font-mono text-[10px] text-muted-foreground/70 uppercase tracking-[0.16em]">
            {t('settings:remoteAccess.fields.activeSessions')}
          </p>
          <p className="font-medium text-sm tabular-nums">{status.activeSessions}</p>
        </div>
      </div>

      <div className="space-y-3 border-border/50 border-t pt-5">
        <CoordinatorEditor coordinatorOrigin={status.coordinatorOrigin} />
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

// ─── Top-level section ──────────────────────────────────────────────────────

export function RemoteAccessSection() {
  const { t } = useLocale();
  const { data: status, isLoading } = useRemoteAccessStatus();

  if (isLoading || !status) {
    return <p className="text-muted-foreground text-sm">{t('common:loading')}</p>;
  }
  return status.claimed ? (
    <ConnectedView status={status} />
  ) : (
    <ClaimForm coordinatorOrigin={status.coordinatorOrigin} />
  );
}
