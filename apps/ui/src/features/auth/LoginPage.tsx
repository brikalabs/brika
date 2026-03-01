import { useAuth } from '@brika/auth/react';
import { Mail } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Label,
  PasswordInput,
} from '@/components/ui';
import { BrikaLogo } from '@/components/ui/brika-logo';

export function LoginPage() {
  const { client, refreshSession } = useAuth();
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await client.login(email, password);
      await refreshSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center bg-background p-4">
      <div className="flex flex-1 items-center" />
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-lg bg-primary">
            <BrikaLogo className="size-8 text-white" />
          </div>
          <CardTitle className="text-2xl">{t('title')}</CardTitle>
          <CardDescription>{t('subtitle')}</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
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
                placeholder={t('passwordPlaceholder')}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                showLabel={t('showPassword')}
                hideLabel={t('hidePassword')}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('signingIn') : t('signIn')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-1" />
      <footer className="flex items-center gap-2 pt-8 text-sm text-muted-foreground">
        <BrikaLogo className="size-4" />
        <span>&copy; {new Date().getFullYear()} Brika Labs</span>
      </footer>
    </div>
  );
}
