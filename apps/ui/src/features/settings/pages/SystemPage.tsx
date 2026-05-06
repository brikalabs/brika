import { Monitor } from 'lucide-react';
import { useLocale } from '@/lib/use-locale';
import { SystemInfo } from '../components';
import { PageHeader, SettingsSection } from './primitives';

export function SystemPage() {
  const { t } = useLocale();
  return (
    <>
      <PageHeader
        eyebrow={t('settings:nav.groups.workspace')}
        title={t('settings:system.title')}
        description={t('settings:system.description')}
      />
      <SettingsSection
        icon={Monitor}
        title={t('settings:system.title')}
        description={t('settings:system.description')}
      >
        <SystemInfo />
      </SettingsSection>
    </>
  );
}
