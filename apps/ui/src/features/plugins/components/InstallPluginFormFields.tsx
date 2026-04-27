import { Input, Label } from '@brika/clay';
import { useLocale } from '@/lib/use-locale';

interface InstallPluginFormFieldsProps {
  packageName: string;
  version: string;
  onPackageNameChange: (value: string) => void;
  onVersionChange: (value: string) => void;
  disabled: boolean;
}

export function InstallPluginFormFields({
  packageName,
  version,
  onPackageNameChange,
  onVersionChange,
  disabled,
}: Readonly<InstallPluginFormFieldsProps>) {
  const { t } = useLocale();

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="package">{t('plugins:install.packageName')}</Label>
        <Input
          id="package"
          value={packageName}
          onChange={(e) => onPackageNameChange(e.target.value)}
          placeholder={t('plugins:install.packageNamePlaceholder')}
          className="font-mono text-sm"
          disabled={disabled}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="version">{t('plugins:install.versionOptional')}</Label>
        <Input
          id="version"
          value={version}
          onChange={(e) => onVersionChange(e.target.value)}
          placeholder={t('plugins:install.versionPlaceholder')}
          className="font-mono text-sm"
          disabled={disabled}
        />
      </div>
    </>
  );
}
