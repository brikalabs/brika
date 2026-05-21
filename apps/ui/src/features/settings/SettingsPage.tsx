/**
 * Settings Page
 *
 * Application preferences including language selection.
 */

import { Scope } from '@brika/auth';
import { useCanAccess } from '@brika/auth/react';
import { Palette } from 'lucide-react';
import { ThemeSelector } from '@/components/theme-selector';
import {
  PageHeader,
  PageHeaderDescription,
  PageHeaderInfo,
  PageHeaderTitle,
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
  TimezoneSettings,
  UpdateSection,
} from './components';

export function SettingsPage() {
  const { t } = useLocale();
  const isAdmin = useCanAccess(Scope.ADMIN_ALL);

  return (
    <div className="space-y-6">
      <PageHeader>
        <PageHeaderInfo>
          <PageHeaderTitle>{t('settings:title')}</PageHeaderTitle>
          <PageHeaderDescription>{t('settings:subtitle')}</PageHeaderDescription>
        </PageHeaderInfo>
      </PageHeader>

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

      {/* Admin-only sections */}
      {isAdmin && (
        <>
          {/* Timezone */}
          <Section id="timezone" className="scroll-mt-4">
            <TimezoneSettings />
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
        </>
      )}
    </div>
  );
}
