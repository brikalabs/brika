/**
 * Read-only detail dialog for a single session: ID, browser, OS, IP,
 * timestamps, and the raw User-Agent.
 */

import {
  Badge,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Separator,
} from '@brika/clay';
import { useLocale } from '@/lib/use-locale';
import { getOsIcon } from './os-icons';
import { parseUserAgent, type SessionInfo } from './user-agent';

interface SessionDetailDialogProps {
  session: SessionInfo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SessionDetailDialog({
  session,
  open,
  onOpenChange,
}: Readonly<SessionDetailDialogProps>) {
  const { t, formatDateTime } = useLocale();
  const parsed = parseUserAgent(session.userAgent);
  const OsIcon = getOsIcon(parsed.os);

  const rows = [
    { label: t('auth:sessions.sessionId'), value: session.id },
    { label: t('auth:sessions.browser'), value: parsed.browser },
    { label: t('auth:sessions.os'), value: parsed.os },
    { label: t('auth:sessions.ip'), value: session.ip ?? '—' },
    { label: t('auth:sessions.created'), value: formatDateTime(session.createdAt) },
    { label: t('auth:sessions.lastActive'), value: formatDateTime(session.lastSeenAt) },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <OsIcon className="size-5" />
            {parsed.browser} · {parsed.os}
          </DialogTitle>
          <DialogDescription>
            {session.current && (
              <Badge variant="default" className="text-[10px]">
                {t('auth:sessions.currentSession')}
              </Badge>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {rows.map(({ label, value }) => (
            <div key={label} className="flex items-start justify-between gap-4">
              <span className="shrink-0 text-muted-foreground text-sm">{label}</span>
              <span className="break-all text-right font-mono text-sm">{value}</span>
            </div>
          ))}
          <Separator />
          <div className="space-y-1">
            <span className="text-muted-foreground text-sm">{t('auth:sessions.userAgent')}</span>
            <p className="break-all rounded-md bg-muted p-2.5 font-mono text-muted-foreground text-xs">
              {session.userAgent ?? '—'}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
