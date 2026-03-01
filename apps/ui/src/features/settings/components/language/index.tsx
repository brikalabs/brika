import { Languages } from 'lucide-react';
import { useDataView } from '@/components/DataView';
import {
  SectionContent,
  SectionDescription,
  SectionHeader,
  SectionIcon,
  SectionInfo,
  SectionTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { useAvailableLocales } from './hooks';
import { LanguageSelectorSkeleton } from './skeleton';

export function LanguageSelector() {
  const { locale, changeLocale, getLanguageName, t } = useLocale();
  const { data: locales, isLoading } = useAvailableLocales();

  const View = useDataView({
    data: locales,
    isLoading,
  });

  return (
    <View.Root>
      <View.Skeleton>
        <LanguageSelectorSkeleton />
      </View.Skeleton>

      <View.Content>
        {(locales) => (
          <>
            <SectionHeader>
              <SectionInfo>
                <SectionIcon>
                  <Languages className="size-4" />
                </SectionIcon>
                <div>
                  <SectionTitle>{t('settings:language.title')}</SectionTitle>
                  <SectionDescription>{t('settings:language.description')}</SectionDescription>
                </div>
              </SectionInfo>
            </SectionHeader>

            <SectionContent>
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
            </SectionContent>
          </>
        )}
      </View.Content>
    </View.Root>
  );
}
