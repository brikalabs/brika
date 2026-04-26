import { useAuth } from '@brika/auth/react';
import { BrikaLogo } from '@brika/clay/components/brika-logo';
import { Check } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export function CompleteStep() {
  const { t } = useTranslation('setup');
  const { client, refreshSession } = useAuth();

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        await client.completeSetup();
      } catch {
        // May fail if session expired — refreshSession handles redirect regardless
      }
      await refreshSession();
    }, 2000);
    return () => clearTimeout(timer);
  }, [client, refreshSession]);

  return (
    <div className="space-y-8 px-6 py-10 text-center">
      <div className="relative mx-auto flex size-20 items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-emerald-500/10" />
        <div className="relative flex size-12 items-center justify-center rounded-full bg-emerald-500/20">
          <Check className="size-7 text-emerald-600 dark:text-emerald-400" />
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold text-2xl tracking-tight">{t('complete.title')}</h2>
        <p className="text-muted-foreground text-sm leading-relaxed">{t('complete.description')}</p>
      </div>

      <div className="flex items-center justify-center gap-2">
        <div className="size-1.5 animate-pulse rounded-full bg-primary" />
        <div className="size-1.5 animate-pulse rounded-full bg-primary [animation-delay:150ms]" />
        <div className="size-1.5 animate-pulse rounded-full bg-primary [animation-delay:300ms]" />
      </div>

      <footer className="flex items-center justify-center gap-1.5 text-muted-foreground/50 text-xs">
        <BrikaLogo className="size-3" />
        <span>Brika</span>
      </footer>
    </div>
  );
}
