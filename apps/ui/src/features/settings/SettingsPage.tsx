/**
 * Settings Page
 *
 * Application preferences including language selection.
 */

import { ThemeSelector } from '@/components/theme-selector';
import { Card, CardContent } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { LanguageSelector, LocationSettings, SystemInfo } from './components';

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
        <CardContent className="space-y-4 p-6">
          <div>
            <h3 className="font-semibold text-base">{t('settings:appearance.title')}</h3>
            <p className="text-muted-foreground text-sm">{t('settings:appearance.description')}</p>
          </div>
          <ThemeSelector />
        </CardContent>
      </Card>

      {/* Language */}
      <Card>
        <CardContent className="p-6">
          <LanguageSelector />
        </CardContent>
      </Card>

      {/* Hub Location */}
      <Card>
        <CardContent className="p-6">
          <LocationSettings />
        </CardContent>
      </Card>

      {/* System Information */}
      <Card>
        <CardContent className="p-6">
          <SystemInfo />
        </CardContent>
      </Card>
    </div>
  );
}
