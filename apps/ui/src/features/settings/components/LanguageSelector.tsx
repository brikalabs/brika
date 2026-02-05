/**
 * Language Selector Component
 *
 * Dropdown to select the application language.
 */

import { useDataView } from '@/components/DataView';
import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { useAvailableLocales } from '../hooks';
import { LanguageSelectorSkeleton } from './SystemInfoSkeleton';

export function LanguageSelector() {
  const { locale, changeLocale, getLanguageName, t } = useLocale();
  const { data: locales, isLoading } = useAvailableLocales();

  const View = useDataView({ data: locales, isLoading });

  return (
    <View.Root>
      <View.Skeleton>
        <LanguageSelectorSkeleton />
      </View.Skeleton>

      <View.Content>
        {(locales) => (
          <div className="space-y-3">
            <div>
              <Label className="font-medium text-base">{t('settings:language.title')}</Label>
              <p className="text-muted-foreground text-sm">{t('settings:language.description')}</p>
            </div>

            <Select value={locale} onValueChange={changeLocale}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {locales.map((loc) => (
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
        )}
      </View.Content>
    </View.Root>
  );
}
