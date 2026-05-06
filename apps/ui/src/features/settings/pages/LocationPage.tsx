import { MapPin } from 'lucide-react';
import { useLocale } from '@/lib/use-locale';
import { LocationSettings } from '../components';
import { PageHeader, SettingsSection } from './primitives';

export function LocationPage() {
  const { t } = useLocale();
  return (
    <>
      <PageHeader
        eyebrow={t('settings:nav.groups.workspace')}
        title={t('settings:location.title')}
        description={t('settings:location.description')}
      />
      <SettingsSection
        icon={MapPin}
        title={t('settings:location.title')}
        description={t('settings:location.description')}
      >
        <LocationSettings />
      </SettingsSection>
    </>
  );
}
