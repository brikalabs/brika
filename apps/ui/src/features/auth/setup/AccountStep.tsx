import { useAuth } from '@brika/auth/react';
import { useNavigate } from '@tanstack/react-router';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Mail,
  ShieldCheck,
  User,
} from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Label,
  PasswordInput,
  Separator,
} from '@/components/ui';
import { BrikaLogo } from '@/components/ui/brika-logo';
import { PasswordStrength } from '../password/PasswordStrength';

export function AccountStep() {
  const { user } = useAuth();

  if (user) {
    return <AccountEdit />;
  }
  return <AccountForm />;
}

// ─── Already created — editable fields ──────────────────────────────────────

function AccountEdit() {
  const { client, user, updateSession } = useAuth();
  const { t } = useTranslation('setup');
  const navigate = useNavigate();

  const [name, setName] = useState(user?.name ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const nameDirty = name.trim() !== (user?.name ?? '');
  const passwordDirty = currentPassword.length > 0 && newPassword.length > 0;
  const isDirty = nameDirty || passwordDirty;

  const handleSave = async () => {
    if (!isDirty) {
      return;
    }
    setSaving(true);
    setFeedback(null);

    try {
      if (nameDirty) {
        const session = await client.updateProfile({ name: name.trim() });
        updateSession(session);
      }
      if (passwordDirty) {
        await client.changePassword(currentPassword, newPassword);
        setCurrentPassword('');
        setNewPassword('');
      }
      setFeedback({ type: 'success', message: t('account.saved') });
      setTimeout(() => setFeedback(null), 2500);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : t('errors.failed'),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <CardHeader className="items-center text-center">
        <div className="mb-2 flex size-12 items-center justify-center rounded-lg bg-primary">
          <BrikaLogo className="size-8 text-white" />
        </div>
        <CardTitle>{t('account.editTitle')}</CardTitle>
        <CardDescription>{t('account.editDescription')}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {feedback && (
          <div
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
              feedback.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : 'bg-destructive/10 text-destructive'
            }`}
          >
            {feedback.type === 'success' ? (
              <Check className="size-4 shrink-0" />
            ) : (
              <AlertCircle className="size-4 shrink-0" />
            )}
            {feedback.message}
          </div>
        )}

        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="edit-name">{t('account.name')}</Label>
          <InputGroup>
            <InputGroupAddon>
              <User />
            </InputGroupAddon>
            <InputGroupInput
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </InputGroup>
        </div>

        {/* Email (read-only) */}
        <div className="space-y-2">
          <Label>{t('account.email')}</Label>
          <InputGroup>
            <InputGroupAddon>
              <Mail />
            </InputGroupAddon>
            <Input
              value={user?.email ?? ''}
              readOnly
              tabIndex={-1}
              className="text-muted-foreground"
            />
          </InputGroup>
        </div>

        <Separator />

        {/* Password change */}
        <div className="space-y-2">
          <Label htmlFor="edit-current-pw">{t('account.currentPassword')}</Label>
          <PasswordInput
            id="edit-current-pw"
            autoComplete="current-password"
            placeholder={t('account.currentPasswordPlaceholder')}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-new-pw">{t('account.newPassword')}</Label>
          <PasswordInput
            id="edit-new-pw"
            autoComplete="new-password"
            placeholder={t('account.newPasswordPlaceholder')}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          {newPassword && <PasswordStrength password={newPassword} />}
        </div>

        {/* Save + Nav */}
        {isDirty && (
          <Button
            onClick={handleSave}
            disabled={saving}
            size="sm"
            variant="secondary"
            className="w-full gap-2"
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            {t('account.saveChanges')}
          </Button>
        )}

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => navigate({ to: '/setup/language' })}
          >
            <ArrowLeft className="size-4" />
            {t('nav.back')}
          </Button>
          <Button className="flex-1 gap-2" onClick={() => navigate({ to: '/setup/avatar' })}>
            {t('nav.continue')}
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </CardContent>
    </>
  );
}

// ─── Creation form ──────────────────────────────────────────────────────────

function AccountForm() {
  const { client, updateSession } = useAuth();
  const { t } = useTranslation('setup');
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const canSubmit =
    name.length >= 2 &&
    email.length > 0 &&
    password.length > 0 &&
    confirmPassword.length > 0 &&
    !mismatch &&
    !loading;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) {
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const session = await client.setup({ email, name, password });
      updateSession(session);
      navigate({ to: '/setup/avatar' });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.failed'));
      setLoading(false);
    }
  };

  return (
    <>
      <CardHeader className="items-center text-center">
        <div className="mb-2 flex size-12 items-center justify-center rounded-lg bg-primary">
          <BrikaLogo className="size-8 text-white" />
        </div>
        <CardTitle>{t('account.title')}</CardTitle>
        <CardDescription>{t('account.description')}</CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
              <AlertCircle className="size-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="setup-name">{t('account.name')}</Label>
            <InputGroup>
              <InputGroupAddon>
                <User />
              </InputGroupAddon>
              <InputGroupInput
                id="setup-name"
                type="text"
                autoComplete="name"
                placeholder={t('account.namePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </InputGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="setup-email">{t('account.email')}</Label>
            <InputGroup>
              <InputGroupAddon>
                <Mail />
              </InputGroupAddon>
              <InputGroupInput
                id="setup-email"
                type="email"
                autoComplete="email"
                placeholder={t('account.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </InputGroup>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="setup-password">{t('account.password')}</Label>
            <PasswordInput
              id="setup-password"
              autoComplete="new-password"
              placeholder={t('account.passwordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <PasswordStrength password={password} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="setup-confirm">{t('account.confirmPassword')}</Label>
            <PasswordInput
              id="setup-confirm"
              autoComplete="new-password"
              placeholder={t('account.confirmPlaceholder')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            {mismatch && (
              <p className="flex items-center gap-1.5 text-destructive text-xs">
                <AlertCircle className="size-3 shrink-0" />
                {t('account.mismatch')}
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => navigate({ to: '/setup/language' })}
            >
              <ArrowLeft className="size-4" />
              {t('nav.back')}
            </Button>
            <Button type="submit" className="flex-1 gap-2" disabled={!canSubmit}>
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t('account.creating')}
                </>
              ) : (
                <>
                  <ShieldCheck className="size-4" />
                  {t('account.create')}
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </>
  );
}
