import { Globe } from 'lucide-react';
import { useLocale } from '@/lib/use-locale';
import { RemoteAccessSection } from '../components/remote-access';
import { PageHeader, SettingsSection } from './primitives';

export function RemoteAccessPage() {
  const { t } = useLocale();
  return (
    <>
      <PageHeader
        eyebrow={t('settings:nav.groups.workspace')}
        title={t('settings:remoteAccess.title')}
        description={t('settings:remoteAccess.description')}
      />

      <SettingsSection
        icon={Globe}
        title={t('settings:remoteAccess.section.title')}
        description={t('settings:remoteAccess.section.description')}
      >
        <RemoteAccessSection />
      </SettingsSection>
    </>
  );
}
