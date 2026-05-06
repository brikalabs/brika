import { Button } from '@brika/clay';
import { BrikaLogo } from '@brika/clay/components/brika-logo';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Eyebrow } from './shared';

export function WelcomeStep() {
  const { t } = useTranslation('setup');
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center gap-7 px-8 pt-12 pb-10 text-center">
      {/* Logo with halo */}
      <div className="relative">
        <div aria-hidden className="absolute inset-0 rounded-3xl bg-primary/30 blur-2xl" />
        <div className="relative flex size-[72px] items-center justify-center rounded-2xl bg-gradient-to-b from-primary to-primary/80 shadow-lg shadow-primary/30 ring-1 ring-white/10">
          <BrikaLogo className="size-9 text-white" />
        </div>
      </div>

      <div className="flex flex-col items-center gap-3">
        <Eyebrow>{t('welcome.eyebrow')}</Eyebrow>
        <h1 className="font-semibold text-[28px] text-foreground leading-[1.1] tracking-tight">
          {t('welcome.title')}
        </h1>
        <p className="max-w-[400px] text-[14px] text-muted-foreground leading-relaxed">
          {t('welcome.subtitle')}
        </p>
      </div>

      <div className="flex flex-col items-center gap-4 pt-2">
        <Button
          onClick={() => navigate({ to: '/setup/language' })}
          size="lg"
          className="min-w-[200px] gap-2"
        >
          {t('welcome.getStarted')}
          <ArrowRight className="size-4" />
        </Button>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
          <Clock className="size-3" />
          {t('welcome.duration')}
        </span>
      </div>
    </div>
  );
}
