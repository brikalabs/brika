import { useAuth } from '@brika/auth/react';
import { Camera, Check, Loader2, Trash2, UserPen } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Card,
  Input,
  Label,
  Section,
  SectionContent,
  SectionDescription,
  SectionHeader,
  SectionIcon,
  SectionInfo,
  SectionTitle,
  Separator,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { PasswordSection } from './password';
import { SessionsSection } from './SessionsSection';

export function ProfilePage() {
  const { user, client, refreshSession } = useAuth();
  const { t, formatDate } = useLocale();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);

  if (!user) {
    return null;
  }

  const isDirty = name.trim() !== user.name;
  const initials = user.name
    .split(' ')
    .map((part: string) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const handleSave = async () => {
    if (!isDirty) {
      return;
    }
    setSaving(true);
    try {
      await client.updateProfile({
        name: name.trim(),
      });
      await refreshSession();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setUploading(true);
    try {
      await client.uploadAvatar(file);
      await refreshSession();
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleAvatarRemove = async () => {
    setUploading(true);
    try {
      await client.removeAvatar();
      await refreshSession();
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Hero */}
      <Card className="overflow-hidden">
        <div className="h-36 bg-linear-to-br from-primary/20 via-primary/5 to-muted/30" />

        <div className="-mt-16 flex flex-wrap items-end gap-5 px-6 pb-6">
          {/* Avatar */}
          <button
            type="button"
            className="group/avatar-btn corner-squircle relative shrink-0 cursor-pointer overflow-hidden rounded-full ring-4 ring-card focus-visible:outline-none focus-visible:ring-ring"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Avatar className="size-32 text-3xl">
              <AvatarImage
                src={client.avatarUrl(user, {
                  size: 256,
                })}
                alt={user.name}
              />
              <AvatarFallback className="text-3xl">{initials}</AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover/avatar-btn:opacity-100 group-disabled/avatar-btn:opacity-100">
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
            onChange={handleAvatarUpload}
          />

          {/* Info */}
          <div className="min-w-0 flex-1 pb-0.5">
            <h2 className="truncate font-semibold text-xl tracking-tight">{user.name}</h2>
            <p className="truncate text-muted-foreground text-sm">{user.email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="capitalize">
                {user.role}
              </Badge>
              <span className="text-muted-foreground text-xs">
                {t('auth:memberSince')}{' '}
                {user.createdAt ? formatDate(new Date(user.createdAt)) : '\u2014'}
              </span>
            </div>
          </div>

          {/* Avatar actions */}
          <div className="flex items-center gap-2 pb-0.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {t('auth:changeAvatar')}
            </Button>
            {user.avatarHash && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={handleAvatarRemove}
                disabled={uploading}
              >
                <Trash2 className="size-3.5" />
                {t('auth:removeAvatar')}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Edit personal info */}
      <Section>
        <SectionHeader>
          <SectionInfo>
            <SectionIcon>
              <UserPen className="size-4" />
            </SectionIcon>
            <div>
              <SectionTitle>{t('auth:personalInfo')}</SectionTitle>
              <SectionDescription>{t('auth:personalInfoDesc')}</SectionDescription>
            </div>
          </SectionInfo>
        </SectionHeader>
        <SectionContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="profile-name">{t('auth:name')}</Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setSaved(false);
                }}
                placeholder={user.name}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('auth:emailLabel')}</Label>
              <Input value={user.email} readOnly tabIndex={-1} className="text-muted-foreground" />
            </div>
          </div>
          <Separator />
          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={!isDirty || saving} size="sm">
              {saving ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  {t('auth:saving')}
                </>
              ) : (
                t('auth:save')
              )}
            </Button>
            {saved && (
              <span className="flex items-center gap-1.5 text-emerald-600 text-sm dark:text-emerald-400">
                <Check className="size-3.5" />
                {t('auth:saved')}
              </span>
            )}
          </div>
        </SectionContent>
      </Section>

      <PasswordSection />

      <SessionsSection />
    </div>
  );
}
