import { Button } from '@brika/clay';
import { BrikaLogo } from '@brika/clay/components/brika-logo';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function WelcomeStep() {
  const { t } = useTranslation('setup');
  const navigate = useNavigate();

  return (
    <div className="space-y-8 px-6 py-10 text-center">
      <div className="mx-auto flex size-20 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/25">
        <BrikaLogo className="size-12 text-white" />
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold text-2xl tracking-tight">{t('welcome.title')}</h2>
        <p className="mx-auto max-w-xs text-muted-foreground text-sm leading-relaxed">
          {t('welcome.description')}
        </p>
      </div>

      <Button
        onClick={() => navigate({ to: '/setup/language' })}
        size="lg"
        className="w-full gap-2"
      >
        {t('welcome.getStarted')}
        <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}
