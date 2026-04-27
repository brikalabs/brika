/**
 * SessionsSection — lists active auth sessions and lets the user revoke
 * any individual session or all of them at once. The row, detail
 * dialog, OS icons, and User-Agent parsing live in `./sessions/`.
 */

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
  Button,
  Section,
  SectionContent,
  SectionDescription,
  SectionHeader,
  SectionIcon,
  SectionInfo,
  SectionTitle,
  Skeleton,
} from '@brika/clay';
import { Globe, Loader2, LogOut } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '@/lib/use-locale';
import { SessionDetailDialog } from './sessions/SessionDetailDialog';
import { SessionRow } from './sessions/SessionRow';
import type { SessionInfo } from './sessions/user-agent';

function SessionsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={`skeleton-${i}`} className="flex items-center gap-4 rounded-lg border p-4">
          <Skeleton className="size-10 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      ))}
    </div>
  );
}

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
