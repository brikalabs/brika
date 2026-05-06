import { Check, Languages } from 'lucide-react';
import { useLocale } from '@/lib/use-locale';
import { useAvailableLocales } from '../components/language/hooks';
import { PageHeader, SettingsSection } from './primitives';

export function LanguagePage() {
  const { t, locale, changeLocale, getLanguageName } = useLocale();
  const { data: locales } = useAvailableLocales();

  return (
    <>
      <PageHeader
        eyebrow={t('settings:nav.groups.preferences')}
        title={t('settings:language.title')}
        description={t('settings:language.description')}
      />

      <SettingsSection
        icon={Languages}
        title={t('settings:language.title')}
        description={t('settings:language.description')}
      >
        {locales && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {locales.map((loc) => {
              const isActive = loc === locale;
              return (
                <button
                  key={loc}
                  type="button"
                  onClick={() => changeLocale(loc)}
                  className={`group flex items-center gap-3 rounded-lg border px-3.5 py-3 text-left transition-all duration-200 ${
                    isActive
                      ? 'border-primary/40 bg-primary/[0.06] shadow-primary/10 shadow-sm'
                      : 'border-border/60 bg-card/40 hover:border-border hover:bg-card/80'
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-[14px] capitalize">
                      {getLanguageName(loc)}
                    </span>
                    <span className="block font-mono text-[10px] text-muted-foreground/70 uppercase tracking-wider">
                      {loc}
                    </span>
                  </span>
                  <span
                    className={`flex size-5 shrink-0 items-center justify-center rounded-full transition-all ${
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
      </SettingsSection>
    </>
  );
}
