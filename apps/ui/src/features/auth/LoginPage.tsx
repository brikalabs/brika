import { useAuth } from '@brika/auth/react';
import {
  Button,
  Card,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Label,
  PasswordInput,
} from '@brika/clay';
import { BrikaLogo } from '@brika/clay/components/brika-logo';
import { AlertCircle, ArrowRight, Loader2, Mail } from 'lucide-react';
import { type SyntheticEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCapture } from '@/features/analytics/hooks';
import { AmbientCanvas } from './AmbientCanvas';

export function LoginPage() {
  const { client, refreshSession } = useAuth();
  const { t } = useTranslation('auth');
  const capture = useCapture();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    capture('auth.login_submitted');

    try {
      await client.login(email, password);
      await refreshSession();
      capture('auth.login_succeeded');
    } catch (_err) {
      setError(t('loginFailed'));
      capture('auth.login_failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AmbientCanvas>
      <div className="relative w-full max-w-105">
        <Card className="fade-in-50 slide-in-from-bottom-1 animate-in overflow-hidden border-border/60 bg-card/80 shadow-2xl shadow-black/20 backdrop-blur-xl duration-500 ease-out">
          <div className="flex flex-col items-center gap-6 px-8 pt-10 pb-2 text-center">
            {/* Logo with halo */}
            <div className="relative">
              <div aria-hidden className="absolute inset-0 rounded-2xl bg-primary/30 blur-xl" />
              <div className="relative flex size-14 items-center justify-center rounded-xl bg-linear-to-b from-primary to-primary/80 shadow-lg shadow-primary/30 ring-1 ring-white/10">
                <BrikaLogo className="size-7 text-white" />
              </div>
            </div>

            <div className="flex flex-col items-center gap-2">
              <span className="font-mono text-[10px] text-muted-foreground/70 uppercase tracking-[0.18em]">
                {t('signIn')}
              </span>
              <h1 className="font-semibold text-[26px] text-foreground leading-[1.1] tracking-tight">
                {t('title')}
              </h1>
              <p className="max-w-[320px] text-[13.5px] text-muted-foreground leading-relaxed">
                {t('subtitle')}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 px-8 pt-6 pb-8">
            {error && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
                <AlertCircle className="size-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">{t('email')}</Label>
              <InputGroup>
                <InputGroupAddon>
                  <Mail />
                </InputGroupAddon>
                <InputGroupInput
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder={t('emailPlaceholder')}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  autoFocus
                />
              </InputGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t('passwordLabel')}</Label>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                placeholder={t('passwordPlaceholder')}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                showLabel={t('showPassword')}
                hideLabel={t('hidePassword')}
              />
            </div>

            <Button type="submit" size="lg" className="w-full gap-2" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t('signingIn')}
                </>
              ) : (
                <>
                  {t('signIn')}
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </form>
        </Card>

        <footer className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/50">
          <BrikaLogo className="size-3" />
          <span>Brika · {new Date().getFullYear()}</span>
        </footer>
      </div>
    </AmbientCanvas>
  );
}
