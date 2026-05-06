import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAvailableLocales } from '@/features/settings/components/language/hooks';
import { useLocale } from '@/lib/use-locale';
import { StepBody, StepHeader, StepNav } from './shared';

export function LanguageStep() {
  const { t } = useTranslation('setup');
  const { locale, changeLocale, getLanguageName } = useLocale();
  const { data: locales } = useAvailableLocales();

  return (
    <>
      <StepHeader
        eyebrow={t('language.eyebrow')}
        title={t('language.title')}
        subtitle={t('language.subtitle')}
      />

      <StepBody>
        {locales && (
          <div className="flex flex-col gap-1">
            {locales.map((loc) => {
              const isActive = loc === locale;
              return (
                <button
                  key={loc}
                  type="button"
                  onClick={() => changeLocale(loc)}
                  className={`group flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all duration-200 ${
                    isActive
                      ? 'border-primary/40 bg-primary/[0.06] shadow-primary/10 shadow-sm'
                      : 'border-transparent hover:border-border/60 hover:bg-foreground/[0.025]'
                  }`}
                >
                  <span className="flex-1">
                    <span className="block font-medium text-[14px] capitalize">
                      {getLanguageName(loc)}
                    </span>
                    <span className="block font-mono text-[10px] text-muted-foreground/70 uppercase tracking-wider">
                      {loc}
                    </span>
                  </span>
                  <span
                    className={`flex size-5 items-center justify-center rounded-full transition-all ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-foreground/5 text-transparent group-hover:bg-foreground/10'
                    }`}
                  >
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <StepNav back="/setup/welcome" next="/setup/account" />
      </StepBody>
    </>
  );
}
