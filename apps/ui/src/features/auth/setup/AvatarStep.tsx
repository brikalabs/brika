import { useAuth } from '@brika/auth/react';
import { AlertCircle, Camera, Loader2, UserCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui';
import { StepBody, StepHeader, StepNav } from './shared';

export function AvatarStep() {
  const { t } = useTranslation('setup');
  const { client, user } = useAuth();

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

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setError(null);
    setPreviewUrl(URL.createObjectURL(file));
    setUploading(true);

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
        icon={UserCircle}
        title={t('avatar.title')}
        description={t('avatar.description')}
      />

      <StepBody>
        <div className="flex flex-col items-center gap-3 py-2">
          <button
            type="button"
            aria-label={t('avatar.hint')}
            className="group relative cursor-pointer overflow-hidden rounded-full ring-4 ring-border transition-shadow hover:ring-primary/30 focus-visible:outline-none focus-visible:ring-primary/50"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Avatar className="size-32 text-4xl">
              <AvatarImage
                src={previewUrl ?? (user ? client.avatarUrl(user, { size: 256 }) : undefined)}
                alt={user?.name ?? 'Preview'}
              />
              <AvatarFallback className="text-4xl">{initials}</AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 group-disabled:opacity-100">
              {uploading ? (
                <Loader2 className="size-7 animate-spin text-white" />
              ) : (
                <Camera className="size-7 text-white" />
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
          <p className="text-muted-foreground text-xs">{t('avatar.hint')}</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </div>
        )}

        <StepNav back="/setup/account" next="/setup/location" showSkip={!previewUrl} />
      </StepBody>
    </>
  );
}
