/**
 * Settings Page
 *
 * Application preferences including language selection.
 */

import { Palette } from 'lucide-react';
import { ThemeSelector } from '@/components/theme-selector';
import { Avatar, AvatarFallback, Card, CardContent } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import {
  HubControlSection,
  LanguageSelector,
  LocationSettings,
  SystemInfo,
  UpdateSection,
} from './components';

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
      <Card id="appearance" className="scroll-mt-4">
        <CardContent className="space-y-4 p-6">
          <div className="flex items-start gap-3">
            <Avatar size="lg">
              <AvatarFallback>
                <Palette className="size-4" />
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-semibold text-base">{t('settings:appearance.title')}</h3>
              <p className="text-muted-foreground text-sm">
                {t('settings:appearance.description')}
              </p>
            </div>
          </div>
          <ThemeSelector />
        </CardContent>
      </Card>

      {/* Language */}
      <Card id="language" className="scroll-mt-4">
        <CardContent className="p-6">
          <LanguageSelector />
        </CardContent>
      </Card>

      {/* Hub Location */}
      <Card id="location" className="scroll-mt-4">
        <CardContent className="p-6">
          <LocationSettings />
        </CardContent>
      </Card>

      {/* Updates */}
      <Card id="updates" className="scroll-mt-4">
        <CardContent className="p-6">
          <UpdateSection />
        </CardContent>
      </Card>

      {/* Hub Control */}
      <Card id="hub-control" className="scroll-mt-4">
        <CardContent className="p-6">
          <HubControlSection />
        </CardContent>
      </Card>

      {/* System Information */}
      <Card id="system" className="scroll-mt-4">
        <CardContent className="p-6">
          <SystemInfo />
        </CardContent>
      </Card>
    </div>
  );
}
