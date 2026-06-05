import { useAuth } from '@brika/auth/react';
import { Avatar, AvatarFallback, AvatarImage } from '@brika/clay';
import { AlertCircle, Camera, Loader2 } from 'lucide-react';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCapture } from '@/features/analytics/hooks';
import { StepBody, StepHeader, StepNav } from './shared';

export function AvatarStep() {
  const { t } = useTranslation('setup');
  const { client, user } = useAuth();
  const capture = useCapture();

  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
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
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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
          <button
            type="button"
            aria-label={t('avatar.hint')}
            className="group relative cursor-pointer overflow-hidden rounded-full ring-2 ring-border/60 transition-all hover:ring-primary/40 hover:ring-offset-2 hover:ring-offset-background focus-visible:outline-none focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Avatar className="text-3xl [--avatar-size:7rem]">
              <AvatarImage
                src={previewUrl ?? (user ? client.avatarUrl(user, { size: 256 }) : undefined)}
                alt={user?.name ?? 'Preview'}
              />
              <AvatarFallback className="bg-gradient-to-br from-foreground/[0.06] to-foreground/[0.02] text-3xl">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 backdrop-blur-[2px] transition-opacity group-hover:opacity-100 group-disabled:opacity-100">
              {uploading ? (
                <Loader2 className="size-6 animate-spin text-white" />
              ) : (
                <Camera className="size-6 text-white" />
              )}
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleUpload}
          />
          <p className="text-[11.5px] text-muted-foreground/80">{t('avatar.hint')}</p>
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
