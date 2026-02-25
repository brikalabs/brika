/**
 * Settings Page
 *
 * Application preferences including language selection.
 */

import { Palette } from 'lucide-react';
import { ThemeSelector } from '@/components/theme-selector';
import {
  Section,
  SectionContent,
  SectionDescription,
  SectionHeader,
  SectionIcon,
  SectionInfo,
  SectionTitle,
} from '@/components/ui';
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
      <Section id="appearance" className="scroll-mt-4">
        <SectionHeader>
          <SectionInfo>
            <SectionIcon>
              <Palette className="size-4" />
            </SectionIcon>
            <div>
              <SectionTitle>{t('settings:appearance.title')}</SectionTitle>
              <SectionDescription>{t('settings:appearance.description')}</SectionDescription>
            </div>
          </SectionInfo>
        </SectionHeader>
        <SectionContent>
          <ThemeSelector />
        </SectionContent>
      </Section>

      {/* Language */}
      <Section id="language" className="scroll-mt-4">
        <LanguageSelector />
      </Section>

      {/* Hub Location */}
      <Section id="location" className="scroll-mt-4">
        <LocationSettings />
      </Section>

      {/* Updates */}
      <Section id="updates" className="scroll-mt-4">
        <UpdateSection />
      </Section>

      {/* Hub Control */}
      <Section id="hub-control" className="scroll-mt-4">
        <HubControlSection />
      </Section>

      {/* System Information */}
      <Section id="system" className="scroll-mt-4">
        <SystemInfo />
      </Section>
    </div>
  );
}
