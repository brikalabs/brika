/**
 * Settings Page
 *
 * Application preferences including language selection.
 */

import { Loader2 } from 'lucide-react';
import { ThemeSelector } from '@/components/theme-selector';
import {
  Card,
  CardContent,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { useAvailableLocales } from './hooks';

// ─────────────────────────────────────────────────────────────────────────────
// Language Selector
// ─────────────────────────────────────────────────────────────────────────────

function LanguageSelector() {
  const { locale, changeLocale, getLanguageName, t } = useLocale();
  const { data: locales, isLoading } = useAvailableLocales();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        <span>{t('common:messages.loading')}</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <Label className="font-medium text-base">{t('settings:language.title')}</Label>
          <p className="text-muted-foreground text-sm">{t('settings:language.description')}</p>
        </div>
      </div>

      <Select value={locale} onValueChange={changeLocale}>
        <SelectTrigger className="w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {locales?.map((loc) => (
            <SelectItem key={loc} value={loc}>
              <span className="flex items-center gap-2">
                <span className="font-medium">{getLanguageName(loc)}</span>
                <span className="text-muted-foreground text-xs uppercase">({loc})</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings Page
// ─────────────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { t } = useLocale();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">{t('settings:title')}</h1>
        <p className="mt-1 text-muted-foreground">{t('settings:subtitle')}</p>
      </div>

      {/* Appearance */}
      <Card>
        <CardContent className="p-6">
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 font-semibold text-base">{t('settings:appearance.title')}</h3>
              <p className="mb-4 text-muted-foreground text-sm">
                {t('settings:appearance.description')}
              </p>
              <ThemeSelector />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Language */}
      <Card>
        <CardContent className="p-6">
          <LanguageSelector />
        </CardContent>
      </Card>
    </div>
  );
}
