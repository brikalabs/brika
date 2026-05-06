import { useAuth } from '@brika/auth/react';
import { Check } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Eyebrow } from './shared';

export function CompleteStep() {
  const { t } = useTranslation('setup');
  const { client, user, refreshSession } = useAuth();

  const firstName = user?.name?.trim().split(' ')[0] ?? '';
  const title = firstName ? t('complete.titleNamed', { name: firstName }) : t('complete.title');

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        await client.completeSetup();
      } catch {
        // May fail if session expired. refreshSession handles redirect regardless.
      }
      await refreshSession();
    }, 1800);
    return () => clearTimeout(timer);
  }, [client, refreshSession]);

  return (
    <div className="flex flex-col items-center gap-7 px-8 pt-12 pb-10 text-center">
      {/* Success badge with rings */}
      <div className="relative flex size-[72px] items-center justify-center">
        <div
          aria-hidden
          className="absolute inset-0 animate-ping rounded-full bg-emerald-500/20"
          style={{ animationDuration: '2.4s' }}
        />
        <div aria-hidden className="absolute inset-2 rounded-full bg-emerald-500/15" />
        <div className="relative flex size-12 items-center justify-center rounded-full bg-gradient-to-b from-emerald-400 to-emerald-600 shadow-emerald-500/30 shadow-lg ring-1 ring-white/10">
          <Check className="size-6 text-white" strokeWidth={2.5} />
        </div>
      </div>

      <div className="flex flex-col items-center gap-3">
        <Eyebrow>{t('complete.eyebrow')}</Eyebrow>
        <h1 className="font-semibold text-[28px] text-foreground leading-[1.1] tracking-tight">
          {title}
        </h1>
        <p className="max-w-[380px] text-[14px] text-muted-foreground leading-relaxed">
          {t('complete.subtitle')}
        </p>
      </div>

      {/* Loading dots */}
      <div className="flex items-center justify-center gap-1.5 pt-1">
        <span className="size-1.5 animate-pulse rounded-full bg-primary/80" />
        <span
          className="size-1.5 animate-pulse rounded-full bg-primary/80"
          style={{ animationDelay: '160ms' }}
        />
        <span
          className="size-1.5 animate-pulse rounded-full bg-primary/80"
          style={{ animationDelay: '320ms' }}
        />
      </div>
    </div>
  );
}
