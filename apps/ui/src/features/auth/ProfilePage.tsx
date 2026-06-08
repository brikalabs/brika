import { useAuth } from '@brika/auth/react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Dropzone,
  FileUpload,
  FileUploadTrigger,
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
} from '@brika/clay';
import {
  CalendarDays,
  Camera,
  Check,
  Copy,
  Loader2,
  ShieldCheck,
  Trash2,
  UserPen,
} from 'lucide-react';
import { useState } from 'react';
import { useCapture } from '@/features/analytics/hooks';
import { useLocale } from '@/lib/use-locale';
import { PasswordSection } from './password';
import { SessionsSection } from './SessionsSection';

export function ProfilePage() {
  const { user, client, refreshSession } = useAuth();
  const { t, formatDate } = useLocale();
  const capture = useCapture();

  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);

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
  const avatarUrl = client.avatarUrl(user, { size: 256 });

  const handleSave = async () => {
    if (!isDirty) {
      return;
    }
    setSaving(true);
    capture('auth.profile_name_saved');
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

  const handleAvatarFiles = async (files: File[]) => {
    const file = files[0];
    if (!file) {
      return;
    }
    setUploading(true);
    capture('auth.avatar_uploaded');
    try {
      await client.uploadAvatar(file);
      await refreshSession();
    } finally {
      setUploading(false);
    }
  };

  const handleAvatarRemove = async () => {
    setUploading(true);
    capture('auth.avatar_removed');
    try {
      await client.removeAvatar();
      await refreshSession();
    } finally {
      setUploading(false);
    }
  };

  const handleCopyEmail = async () => {
    await navigator.clipboard.writeText(user.email);
    capture('auth.email_copied');
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Page heading */}
      <header className="fade-in-0 slide-in-from-bottom-2 animate-in space-y-1 fill-mode-both duration-500">
        <h1 className="font-semibold text-2xl tracking-tight">{t('auth:profile')}</h1>
        <p className="text-muted-foreground text-sm">{t('auth:profileSubtitle')}</p>
      </header>

      {/* Identity header */}
      <Card className="fade-in-0 slide-in-from-bottom-3 animate-in fill-mode-both delay-75 duration-500">
        <div className="flex flex-col items-center gap-5 p-6 sm:flex-row sm:items-center sm:text-left">
          {/*
            Avatar drop zone: the Dropzone itself is the upload trigger.
            Clicking opens the native file picker; dragging an image onto
            it uploads it directly. The overlay (camera icon / spinner)
            appears on hover via the CSS group pattern.
          */}
          <Dropzone
            accept="image/*"
            disabled={uploading}
            onDrop={handleAvatarFiles}
            aria-label={t('auth:changeAvatar')}
            style={{ width: '5rem', height: '5rem' }}
            className="corner-squircle group/avatar relative shrink-0 overflow-hidden rounded-3xl border-0 p-0 shadow-sm outline-none ring-1 ring-border transition-transform duration-200 hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Avatar className="size-full text-2xl [--avatar-radius:0px]">
              <AvatarImage src={avatarUrl} alt={user.name} />
              <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 backdrop-blur-[1px] transition-opacity group-hover/avatar:opacity-100 group-disabled/avatar:opacity-100">
              {uploading ? (
                <Loader2 className="size-5 animate-spin text-white" />
              ) : (
                <Camera className="size-5 text-white" />
              )}
            </div>
          </Dropzone>

          {/* Identity */}
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h2 className="truncate font-semibold text-xl tracking-tight">{user.name}</h2>

            {/* Email - click to copy */}
            <button
              type="button"
              onClick={handleCopyEmail}
              className="group/copy mt-0.5 inline-flex max-w-full items-center gap-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
            >
              <span className="truncate">{user.email}</span>
              {copied ? (
                <Check className="size-3.5 shrink-0 text-emerald-500" />
              ) : (
                <Copy className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover/copy:opacity-100" />
              )}
            </button>

            <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 sm:justify-start">
              <Badge variant="secondary" className="gap-1 capitalize">
                <ShieldCheck className="size-3" />
                {user.role}
              </Badge>
              <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
                <CalendarDays className="size-3.5" />
                {t('auth:memberSince')}
                {' · '}
                {user.createdAt ? formatDate(new Date(user.createdAt)) : null}
              </span>
            </div>
          </div>

          {/* Avatar actions: dropdown with Change / Remove */}
          <div className="flex shrink-0 items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={uploading}>
                  {uploading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Camera className="size-3.5" />
                  )}
                  {t('auth:changeAvatar')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {/*
                  FileUpload provides the context that wires FileUploadTrigger
                  to a hidden native input. The trigger renders as the menu
                  item so clicking it both selects a file AND satisfies the
                  Radix item's onSelect (closing the menu).
                */}
                <FileUpload
                  accept="image/*"
                  disabled={uploading}
                  onFilesSelected={handleAvatarFiles}
                >
                  <FileUploadTrigger asChild>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <Camera className="size-4" />
                      {t('auth:changeAvatar')}
                    </DropdownMenuItem>
                  </FileUploadTrigger>
                </FileUpload>
                {user.avatarHash && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={handleAvatarRemove}
                      disabled={uploading}
                    >
                      <Trash2 className="size-4" />
                      {t('auth:removeAvatar')}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </Card>

      {/* Settings */}
      <div className="fade-in-0 slide-in-from-bottom-3 min-w-0 animate-in space-y-8 fill-mode-both delay-150 duration-500">
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
                <Input
                  value={user.email}
                  readOnly
                  tabIndex={-1}
                  className="text-muted-foreground"
                />
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
    </div>
  );
}
