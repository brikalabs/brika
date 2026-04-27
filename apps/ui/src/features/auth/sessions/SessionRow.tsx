/**
 * Row in the sessions list: OS icon + browser/OS label + IP + last-seen
 * timestamp + details/revoke buttons.
 */

import { Badge, Button, cn } from '@brika/clay';
import { Clock, Info, Loader2, MapPin, Trash2 } from 'lucide-react';
import { useLocale } from '@/lib/use-locale';
import { getOsIcon } from './os-icons';
import { formatTimeAgo, parseUserAgent, type SessionInfo } from './user-agent';

interface SessionRowProps {
  session: SessionInfo;
  revokingId: string | null;
  onRevoke: () => void;
  onDetails: () => void;
}

export function SessionRow({
  session,
  revokingId,
  onRevoke,
  onDetails,
}: Readonly<SessionRowProps>) {
  const { t, formatRelativeTime } = useLocale();
  const parsed = parseUserAgent(session.userAgent);
  const OsIcon = getOsIcon(parsed.os);
  const lastActive = formatTimeAgo(
    session.lastSeenAt,
    formatRelativeTime,
    t('auth:sessions.justNow')
  );

  return (
    <div
      className={cn(
        'flex items-center gap-4 rounded-lg border p-4 transition-colors',
        session.current && 'border-primary/30 bg-primary/5'
      )}
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
        <OsIcon className="size-5 text-muted-foreground" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-sm">
            {parsed.browser} · {parsed.os}
          </span>
          {session.current && (
            <Badge variant="default" className="shrink-0 text-[10px]">
              {t('auth:sessions.currentSession')}
            </Badge>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3" />
            {session.ip ?? 'localhost'}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" />
            {lastActive}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground"
          onClick={onDetails}
        >
          <Info className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-destructive"
          onClick={onRevoke}
          disabled={revokingId === session.id}
        >
          {revokingId === session.id ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Trash2 className="size-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
}
