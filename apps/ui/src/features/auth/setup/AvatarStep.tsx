import { useAuth } from '@brika/auth/react';
import { Avatar, AvatarFallback, AvatarImage, Dropzone } from '@brika/clay';
import { AlertCircle, Camera, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCapture } from '@/features/analytics/hooks';
import { StepBody, StepHeader, StepNav } from './shared';

export function AvatarStep() {
  const { t } = useTranslation('setup');
  const { client, user } = useAuth();
  const capture = useCapture();

  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Revoke object URL on unmount or when replaced
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const initials = user
    ? user.name
        .split(' ')
        .map((p: string) => p[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  const handleDrop = async (files: File[]) => {
    const file = files[0];
    if (!file) {
      return;
    }

    setError(null);
    setPreviewUrl(URL.createObjectURL(file));
    setUploading(true);
    capture('auth.setup_avatar_uploaded');

    try {
      await client.uploadAvatar(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('avatar.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <StepHeader
        eyebrow={t('avatar.eyebrow')}
        title={t('avatar.title')}
        subtitle={t('avatar.subtitle')}
      />

      <StepBody>
        <div className="flex flex-col items-center gap-3 py-2">
          {/*
            The avatar itself is the uploader: clicking opens the file picker,
            dragging an image onto it uploads directly (Clay Dropzone is a
            <button>). Pinned to a fixed circle; a camera overlay fades in on hover.
          */}
          <Dropzone
            accept="image/*"
            disabled={uploading}
            onDrop={handleDrop}
            aria-label={t('avatar.hint')}
            style={{ width: '6.5rem', height: '6.5rem' }}
            className="group relative shrink-0 overflow-hidden rounded-full border-0 p-0 outline-none ring-1 ring-border/60 transition hover:ring-primary/40 focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <Avatar className="size-full text-3xl">
              <AvatarImage
                src={previewUrl ?? (user ? client.avatarUrl(user, { size: 256 }) : undefined)}
                alt={user?.name ?? 'Preview'}
              />
              <AvatarFallback className="text-3xl">{initials}</AvatarFallback>
            </Avatar>
            <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100 group-disabled:opacity-100">
              {uploading ? (
                <Loader2 className="size-6 animate-spin text-white" />
              ) : (
                <Camera className="size-6 text-white" />
              )}
            </span>
          </Dropzone>
          <p className="text-muted-foreground text-xs">{t('avatar.hint')}</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </div>
        )}

        <StepNav back="/setup/account" next="/setup/timezone" />
      </StepBody>
    </>
  );
}
