import { AlertCircle, Check, KeyRound, Loader2 } from 'lucide-react';
import {
  Button,
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
import { PasswordInput } from '@/components/ui/password-input';
import { useLocale } from '@/lib/use-locale';
import { PasswordStrength } from './PasswordStrength';
import { usePasswordForm } from './usePasswordForm';

export function PasswordSection() {
  const { t } = useLocale();
  const form = usePasswordForm();

  return (
    <Section>
      <SectionHeader>
        <SectionInfo>
          <SectionIcon>
            <KeyRound className="size-4" />
          </SectionIcon>
          <div>
            <SectionTitle>{t('auth:password.title')}</SectionTitle>
            <SectionDescription>{t('auth:password.description')}</SectionDescription>
          </div>
        </SectionInfo>
      </SectionHeader>
      <SectionContent>
        <form onSubmit={form.handleSubmit} className="space-y-4">
          {/* Current password */}
          <div className="space-y-2">
            <Label htmlFor="current-password">{t('auth:password.currentPassword')}</Label>
            <PasswordInput
              ref={form.currentRef}
              id="current-password"
              value={form.currentPassword}
              onChange={(e) => {
                form.setCurrentPassword(e.target.value);
                form.clearError();
              }}
              aria-invalid={form.errorField === 'current' || undefined}
              showLabel={t('auth:showPassword')}
              hideLabel={t('auth:hidePassword')}
              autoComplete="current-password"
            />
            {form.errorField === 'current' && form.error && (
              <p className="flex items-center gap-1.5 text-destructive text-xs">
                <AlertCircle className="size-3 shrink-0" />
                {form.error}
              </p>
            )}
          </div>

          <Separator />

          {/* New password + strength */}
          <div className="space-y-2">
            <Label htmlFor="new-password">{t('auth:password.newPassword')}</Label>
            <PasswordInput
              ref={form.newRef}
              id="new-password"
              value={form.newPassword}
              onChange={(e) => {
                form.setNewPassword(e.target.value);
                form.clearError();
              }}
              aria-invalid={form.errorField === 'new' || undefined}
              showLabel={t('auth:showPassword')}
              hideLabel={t('auth:hidePassword')}
              autoComplete="new-password"
            />
            {form.errorField === 'new' && form.error && (
              <p className="flex items-center gap-1.5 text-destructive text-xs">
                <AlertCircle className="size-3 shrink-0" />
                {form.error}
              </p>
            )}
            <PasswordStrength password={form.newPassword} />
          </div>

          {/* Confirm password */}
          <div className="space-y-2">
            <Label htmlFor="confirm-password">{t('auth:password.confirmPassword')}</Label>
            <PasswordInput
              id="confirm-password"
              value={form.confirmPassword}
              onChange={(e) => {
                form.setConfirmPassword(e.target.value);
                form.clearError();
              }}
              showLabel={t('auth:showPassword')}
              hideLabel={t('auth:hidePassword')}
              autoComplete="new-password"
            />
            {form.mismatch && (
              <p className="flex items-center gap-1.5 text-destructive text-xs">
                <AlertCircle className="size-3 shrink-0" />
                {t('auth:password.mismatch')}
              </p>
            )}
          </div>

          <Separator />

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={!form.canSubmit} size="sm">
              {form.saving ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  {t('auth:password.changing')}
                </>
              ) : (
                t('auth:password.change')
              )}
            </Button>
            {form.saved && (
              <span className="flex items-center gap-1.5 text-emerald-600 text-sm dark:text-emerald-400">
                <Check className="size-3.5" />
                {t('auth:password.changed')}
              </span>
            )}
          </div>
        </form>
      </SectionContent>
    </Section>
  );
}
