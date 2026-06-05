import { useAuth } from '@brika/auth/react';
import {
  Button,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Label,
  PasswordInput,
  Separator,
} from '@brika/clay';
import { useNavigate } from '@tanstack/react-router';
import { AlertCircle, ArrowRight, Check, Loader2, Mail, ShieldCheck, User } from 'lucide-react';
import { type SyntheticEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCapture } from '@/features/analytics/hooks';
import { PasswordStrength } from '../password/PasswordStrength';
import { StepBody, StepHeader, StepNav } from './shared';

export function AccountStep() {
  const { user, hasAdmin } = useAuth();

  if (user) {
    return <AccountEdit />;
  }
  if (hasAdmin) {
    return <AccountSignIn />;
  }
  return <AccountForm />;
}

// ─── Already created — editable fields ──────────────────────────────────────

function AccountEdit() {
  const { client, user, updateSession } = useAuth();
  const { t } = useTranslation('setup');
  const capture = useCapture();

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
    capture('auth.setup_account_saved', { name: nameDirty, password: passwordDirty });

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
      <StepHeader
        eyebrow={t('account.eyebrow')}
        title={t('account.editTitle')}
        subtitle={t('account.editSubtitle')}
      />

      <StepBody>
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

        <StepNav back="/setup/language" next="/setup/avatar" />
      </StepBody>
    </>
  );
}

// ─── Sign-in form (admin already exists, e.g. created via CLI) ──────────────

function AccountSignIn() {
  const { client, refreshSession } = useAuth();
  const { t } = useTranslation('setup');
  const navigate = useNavigate();
  const capture = useCapture();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit = email.length > 0 && password.length > 0 && !loading;

  const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) {
      return;
    }

    setError(null);
    setLoading(true);
    capture('auth.setup_login_submitted');

    try {
      await client.login(email, password);
      await refreshSession();
      capture('auth.setup_login_succeeded');
      navigate({ to: '/setup/avatar' });
    } catch {
      setError(t('account.signInFailed'));
      capture('auth.setup_login_failed');
      setLoading(false);
    }
  };

  return (
    <>
      <StepHeader
        eyebrow={t('account.eyebrow')}
        title={t('account.signInTitle')}
        subtitle={t('account.signInSubtitle')}
      />

      <StepBody>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
              <AlertCircle className="size-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="setup-signin-email">{t('account.email')}</Label>
            <InputGroup>
              <InputGroupAddon>
                <Mail />
              </InputGroupAddon>
              <InputGroupInput
                id="setup-signin-email"
                type="email"
                autoComplete="email"
                placeholder={t('account.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </InputGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="setup-signin-password">{t('account.password')}</Label>
            <PasswordInput
              id="setup-signin-password"
              autoComplete="current-password"
              placeholder={t('account.passwordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={() => {
                capture('auth.setup_step_back', { to: '/setup/language' });
                navigate({ to: '/setup/language' });
              }}
            >
              {t('nav.back')}
            </Button>
            <Button
              type="submit"
              size="lg"
              className="ml-auto min-w-[180px] gap-2"
              disabled={!canSubmit}
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t('account.signingIn')}
                </>
              ) : (
                <>
                  {t('account.signIn')}
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </div>
        </form>
      </StepBody>
    </>
  );
}

// ─── Creation form ──────────────────────────────────────────────────────────

function AccountForm() {
  const { client, updateSession } = useAuth();
  const { t } = useTranslation('setup');
  const navigate = useNavigate();
  const capture = useCapture();

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

  const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) {
      return;
    }

    setError(null);
    setLoading(true);
    capture('auth.setup_account_create_submitted');

    try {
      const session = await client.setup({ email, name, password });
      updateSession(session);
      capture('auth.setup_account_create_succeeded');
      navigate({ to: '/setup/avatar' });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.failed'));
      capture('auth.setup_account_create_failed');
      setLoading(false);
    }
  };

  return (
    <>
      <StepHeader
        eyebrow={t('account.eyebrow')}
        title={t('account.title')}
        subtitle={t('account.subtitle')}
      />

      <StepBody>
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

          <div className="flex items-center gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={() => {
                capture('auth.setup_step_back', { to: '/setup/language' });
                navigate({ to: '/setup/language' });
              }}
            >
              {t('nav.back')}
            </Button>
            <Button
              type="submit"
              size="lg"
              className="ml-auto min-w-[180px] gap-2"
              disabled={!canSubmit}
            >
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
      </StepBody>
    </>
  );
}
