import { Input, Label } from '@/components/ui';

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
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="package">Package Name</Label>
        <Input
          id="package"
          value={packageName}
          onChange={(e) => onPackageNameChange(e.target.value)}
          placeholder="@brika/plugin-timer or workspace:/path/to/plugin"
          className="font-mono text-sm"
          disabled={disabled}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="version">Version (optional)</Label>
        <Input
          id="version"
          value={version}
          onChange={(e) => onVersionChange(e.target.value)}
          placeholder="^1.0.0 or latest"
          className="font-mono text-sm"
          disabled={disabled}
        />
      </div>
    </>
  );
}
