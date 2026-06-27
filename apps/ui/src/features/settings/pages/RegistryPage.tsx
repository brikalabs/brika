import { Boxes, Plus, Route } from 'lucide-react';
import { useLocale } from '@/lib/use-locale';
import { AddRegistryForm, RegistryCatalogue, RegistryRouting } from '../components/registry';
import { PageHeader, SettingsSection } from './primitives';

export function RegistryPage() {
  const { t } = useLocale();
  return (
    <>
      <PageHeader
        eyebrow={t('settings:nav.groups.workspace')}
        title={t('settings:registry.title')}
        description={t('settings:registry.description')}
      />

      <div className="space-y-6">
        <SettingsSection
          icon={Boxes}
          title={t('settings:registry.catalogue.title')}
          description={t('settings:registry.catalogue.description')}
        >
          <RegistryCatalogue />
        </SettingsSection>

        <SettingsSection
          icon={Route}
          title={t('settings:registry.routing.title')}
          description={t('settings:registry.routing.description')}
        >
          <RegistryRouting />
        </SettingsSection>

        <SettingsSection
          icon={Plus}
          title={t('settings:registry.add.title')}
          description={t('settings:registry.add.description')}
        >
          <AddRegistryForm />
        </SettingsSection>
      </div>
    </>
  );
}
