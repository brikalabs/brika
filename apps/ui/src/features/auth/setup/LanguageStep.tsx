import { Check, Globe } from 'lucide-react';
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
        icon={Globe}
        title={t('language.title')}
        description={t('language.description')}
      />

      <StepBody>
        {locales && (
          <div className="space-y-1.5">
            {locales.map((loc) => {
              const isActive = loc === locale;
              return (
                <button
                  key={loc}
                  type="button"
                  onClick={() => changeLocale(loc)}
                  className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all ${
                    isActive
                      ? 'border-primary/50 bg-primary/5 shadow-sm'
                      : 'border-transparent hover:bg-muted/50'
                  }`}
                >
                  <span className="flex-1">
                    <span className="font-medium capitalize">{getLanguageName(loc)}</span>
                    <span className="ml-2 text-muted-foreground text-xs uppercase">({loc})</span>
                  </span>
                  {isActive && <Check className="size-4 text-primary" />}
                </button>
              );
            })}
          </div>
        )}

        <StepNav next="/setup/account" />
      </StepBody>
    </>
  );
}
