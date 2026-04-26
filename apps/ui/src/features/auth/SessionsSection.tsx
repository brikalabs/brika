import { useAuth } from '@brika/auth/react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Section,
  SectionContent,
  SectionDescription,
  SectionHeader,
  SectionIcon,
  SectionInfo,
  SectionTitle,
  Separator,
  Skeleton,
} from '@brika/clay';
import { Clock, Globe, Info, Loader2, LogOut, MapPin, Monitor, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '@/lib/use-locale';

interface SessionInfo {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: number;
  lastSeenAt: number;
  current: boolean;
}

// ─── OS Icons (inline SVGs for brand logos) ───────────

function AppleIcon({
  className,
}: Readonly<{
  className?: string;
}>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function WindowsIcon({
  className,
}: Readonly<{
  className?: string;
}>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M3 12V6.5l8-1.1V12H3zm0 .5h8v6.6l-8-1.1V12.5zM11.5 5.3l9.5-1.3v8.5h-9.5V5.3zM21 12.5v8.5l-9.5-1.3v-7.2H21z" />
    </svg>
  );
}

function LinuxIcon({
  className,
}: Readonly<{
  className?: string;
}>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M20.581 19.049c-.55-.446-.336-1.431-.907-1.917.553-3.365-.997-6.331-2.845-8.232-1.551-1.595-1.639-3.743-1.165-5.745-.091-.514-.207-.958-.389-1.288C14.87.905 14.116.447 13.196.156 12.274-.138 10.846.122 10.138.554c-.543.33-.936.779-1.26 1.429-.593 1.19-.728 3.263.09 4.983-1.674 1.863-3.131 4.586-2.717 7.633-.696.56-.386 1.554-.971 2.031C4.592 17.203 2 17.744 2 20.217c0 1.277 1.218 2.2 2.852 2.2h14.297c1.633 0 2.851-.923 2.851-2.2 0-2.473-2.592-3.014-1.419-1.168zM7.387 4.658c.209-.652.603-1.248 1.133-1.571.291-.178.672-.248 1.092-.248.587 0 1.226.152 1.723.425.226.123.426.272.577.465.175.224.297.516.376.904.162.792.112 1.793-.155 2.63-.186.581-.473 1.093-.818 1.473-.349.384-.766.63-1.245.742-.408.095-.874.079-1.349-.028-.465-.104-.923-.297-1.284-.602-.292-.247-.497-.564-.59-.943-.265-1.078.085-2.32.54-3.247zm-.048 12.31c-.038.086-.1.186-.169.3-.133.221-.295.478-.381.726-.068.194-.089.39-.022.587.085.249.28.384.577.384.327 0 .682-.173.994-.384.157-.106.306-.226.404-.35.055-.068.09-.135.105-.176.009-.025.009-.04 0-.047L7.34 16.97zm9.494.11l-1.576 1.09c.009.008.009.023 0 .047.014.041.049.107.104.176.098.124.248.244.404.35.312.21.668.384.994.384.297 0 .492-.135.577-.384.068-.196.046-.393-.022-.587-.086-.248-.248-.505-.381-.726-.068-.114-.13-.214-.169-.3z" />
    </svg>
  );
}

function AndroidIcon({
  className,
}: Readonly<{
  className?: string;
}>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M6 18c0 .55.45 1 1 1h1v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h2v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h1c.55 0 1-.45 1-1V8H6v10zM3.5 8C2.67 8 2 8.67 2 9.5v7c0 .83.67 1.5 1.5 1.5S5 17.33 5 16.5v-7C5 8.67 4.33 8 3.5 8zm17 0c-.83 0-1.5.67-1.5 1.5v7c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-7c0-.83-.67-1.5-1.5-1.5zm-4.97-5.84l1.3-1.3c.2-.2.2-.51 0-.71-.2-.2-.51-.2-.71 0l-1.48 1.48A5.84 5.84 0 0 0 12 1c-.96 0-1.86.23-2.66.63L7.85.15c-.2-.2-.51-.2-.71 0-.2.2-.2.51 0 .71l1.31 1.31A5.98 5.98 0 0 0 6 7h12c0-2.12-1.1-3.98-2.47-4.84zM10 5H9V4h1v1zm5 0h-1V4h1v1z" />
    </svg>
  );
}

function getOsIcon(os: string): React.ComponentType<{
  className?: string;
}> {
  switch (os) {
    case 'macOS':
    case 'iOS':
      return AppleIcon;
    case 'Windows':
      return WindowsIcon;
    case 'Linux':
      return LinuxIcon;
    case 'Android':
      return AndroidIcon;
    default:
      return Monitor;
  }
}

// ─── User-Agent Parser ────────────────────────────────

interface ParsedAgent {
  browser: string;
  os: string;
  isMobile: boolean;
}

function parseUserAgent(ua: string | null): ParsedAgent {
  if (!ua) {
    return {
      browser: 'Unknown',
      os: 'Unknown',
      isMobile: false,
    };
  }

  const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua);

  let browser = 'Unknown';
  if (/Edg\//i.test(ua)) {
    browser = 'Edge';
  } else if (/OPR\//i.test(ua)) {
    browser = 'Opera';
  } else if (/Chrome\//i.test(ua)) {
    browser = 'Chrome';
  } else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) {
    browser = 'Safari';
  } else if (/Firefox\//i.test(ua)) {
    browser = 'Firefox';
  }

  let os = 'Unknown';
  if (/Windows/i.test(ua)) {
    os = 'Windows';
  } else if (/Mac OS X|macOS/i.test(ua)) {
    os = 'macOS';
  } else if (/Android/i.test(ua)) {
    os = 'Android';
  } else if (/iPhone|iPad/i.test(ua)) {
    os = 'iOS';
  } else if (/Linux/i.test(ua)) {
    os = 'Linux';
  }

  return {
    browser,
    os,
    isMobile,
  };
}

// ─── Relative Time Helper ─────────────────────────────

function formatTimeAgo(
  timestamp: number,
  formatRelativeTime: (value: number, unit: Intl.RelativeTimeFormatUnit) => string,
  nowLabel: string
): string {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) {
    return nowLabel;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return formatRelativeTime(-minutes, 'minute');
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return formatRelativeTime(-hours, 'hour');
  }
  const days = Math.round(hours / 24);
  return formatRelativeTime(-days, 'day');
}

// ─── Skeleton ─────────────────────────────────────────

function SessionsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from(
        {
          length: 3,
        },
        (_, i) => (
          <div key={`skeleton-${i}`} className="flex items-center gap-4 rounded-lg border p-4">
            <Skeleton className="size-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="h-8 w-20 rounded-md" />
          </div>
        )
      )}
    </div>
  );
}

// ─── Session Detail Dialog ────────────────────────────

function SessionDetailDialog({
  session,
  open,
  onOpenChange,
}: Readonly<{
  session: SessionInfo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const { t, formatDateTime } = useLocale();
  const parsed = parseUserAgent(session.userAgent);
  const OsIcon = getOsIcon(parsed.os);

  const rows = [
    {
      label: t('auth:sessions.sessionId'),
      value: session.id,
    },
    {
      label: t('auth:sessions.browser'),
      value: parsed.browser,
    },
    {
      label: t('auth:sessions.os'),
      value: parsed.os,
    },
    {
      label: t('auth:sessions.ip'),
      value: session.ip ?? '—',
    },
    {
      label: t('auth:sessions.created'),
      value: formatDateTime(session.createdAt),
    },
    {
      label: t('auth:sessions.lastActive'),
      value: formatDateTime(session.lastSeenAt),
    },
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

// ─── Session Row ──────────────────────────────────────

function SessionRow({
  session,
  revokingId,
  onRevoke,
  onDetails,
}: Readonly<{
  session: SessionInfo;
  revokingId: string | null;
  onRevoke: () => void;
  onDetails: () => void;
}>) {
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

// ─── Sessions Section ─────────────────────────────────

export function SessionsSection() {
  const { client, clearSession } = useAuth();
  const { t } = useLocale();

  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [confirmSession, setConfirmSession] = useState<SessionInfo | null>(null);
  const [detailSession, setDetailSession] = useState<SessionInfo | null>(null);
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);
  const [revokingAll, setRevokingAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    client
      .listSessions()
      .then((data) => {
        if (!cancelled) {
          setSessions(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const handleRevoke = useCallback(
    async (session: SessionInfo) => {
      setRevokingId(session.id);
      try {
        await client.revokeSession(session.id);
        if (session.current) {
          clearSession();
          return;
        }
        setSessions((prev) => prev.filter((s) => s.id !== session.id));
      } finally {
        setRevokingId(null);
        setConfirmSession(null);
      }
    },
    [client, clearSession]
  );

  const handleRevokeAll = useCallback(async () => {
    setRevokingAll(true);
    try {
      await client.revokeAllSessions();
      clearSession();
    } finally {
      setRevokingAll(false);
      setConfirmRevokeAll(false);
    }
  }, [client, clearSession]);

  const otherSessionsCount = sessions.filter((s) => !s.current).length;

  function renderSessions() {
    if (loading) {
      return <SessionsSkeleton />;
    }
    if (sessions.length === 0) {
      return <p className="text-muted-foreground text-sm">{t('auth:sessions.noSessions')}</p>;
    }
    return (
      <div className="space-y-3">
        {sessions.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            revokingId={revokingId}
            onRevoke={() => setConfirmSession(session)}
            onDetails={() => setDetailSession(session)}
          />
        ))}
      </div>
    );
  }

  return (
    <>
      <Section>
        <SectionHeader>
          <SectionInfo>
            <SectionIcon>
              <Globe className="size-4" />
            </SectionIcon>
            <div>
              <SectionTitle>{t('auth:sessions.title')}</SectionTitle>
              <SectionDescription>{t('auth:sessions.description')}</SectionDescription>
            </div>
          </SectionInfo>
          {!loading && otherSessionsCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => setConfirmRevokeAll(true)}
            >
              <LogOut className="size-3.5" />
              {t('auth:sessions.revokeAll')}
            </Button>
          )}
        </SectionHeader>
        <SectionContent className="space-y-3">{renderSessions()}</SectionContent>
      </Section>

      {/* Detail dialog */}
      {detailSession && (
        <SessionDetailDialog
          session={detailSession}
          open
          onOpenChange={(open) => {
            if (!open) {
              setDetailSession(null);
            }
          }}
        />
      )}

      {/* Revoke confirmation */}
      <AlertDialog
        open={confirmSession !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmSession(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('auth:sessions.revokeConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmSession?.current
                ? t('auth:sessions.revokeCurrentConfirmDescription')
                : t('auth:sessions.revokeConfirmDescription', {
                    ip: confirmSession?.ip ?? 'localhost',
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmSession && handleRevoke(confirmSession)}
              disabled={revokingId !== null}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revokingId ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  {t('auth:sessions.revoking')}
                </>
              ) : (
                t('auth:sessions.revokeButton')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke all confirmation */}
      <AlertDialog open={confirmRevokeAll} onOpenChange={setConfirmRevokeAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('auth:sessions.revokeAllConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('auth:sessions.revokeAllConfirmDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevokeAll}
              disabled={revokingAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revokingAll ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  {t('auth:sessions.revokingAll')}
                </>
              ) : (
                t('auth:sessions.revokeAll')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
