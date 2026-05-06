import { Download, Terminal } from 'lucide-react';
import { useLocale } from '@/lib/use-locale';
import { HubControlSection, UpdateSection } from '../components';
import { PageHeader, SettingsSection } from './primitives';

export function HubPage() {
  const { t } = useLocale();
  return (
    <>
      <PageHeader
        eyebrow={t('settings:nav.groups.workspace')}
        title={t('settings:hub.title')}
        description={t('settings:hub.description')}
      />

      <div className="space-y-4">
        <SettingsSection
          icon={Download}
          title={t('settings:update.title')}
          description={t('settings:update.description')}
        >
          <UpdateSection />
        </SettingsSection>
        <SettingsSection
          icon={Terminal}
          title={t('settings:hubControl.title')}
          description={t('settings:hubControl.description')}
        >
          <HubControlSection />
        </SettingsSection>
      </div>
    </>
  );
}
