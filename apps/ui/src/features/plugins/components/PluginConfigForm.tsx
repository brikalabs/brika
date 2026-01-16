import type { PreferenceDefinition } from '@brika/shared';
import { Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { usePluginConfig, usePluginConfigMutation } from '../hooks';

interface Props {
  pluginUid: string;
  pluginName: string;
}

export function PluginConfigForm({ pluginUid, pluginName }: Props) {
  const { data, isLoading } = usePluginConfig(pluginUid);
  const mutation = usePluginConfigMutation(pluginUid);
  const { t, tp } = useLocale();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [isDirty, setIsDirty] = useState(false);

  // Reset form state when plugin data changes (e.g., after update)
  useEffect(() => {
    if (data) {
      setValues({});
      setIsDirty(false);
    }
  }, [data]);

  if (isLoading || !data) return null;
  if (data.schema.length === 0) return null;

  // Always merge server values with local changes
  const currentValues = { ...data.values, ...values };

  const handleChange = (name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setIsDirty(true);
  };

  const handleSave = () => {
    mutation.mutate(
      { ...data.values, ...values },
      {
        onSuccess: () => setIsDirty(false),
      }
    );
  };

  const handleReset = () => {
    setValues({});
    setIsDirty(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Settings className="size-5 text-primary" />
          {t('plugins:config.title')}
        </CardTitle>
        <CardDescription>{t('plugins:config.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.schema.map((pref) => (
          <PreferenceField
            key={pref.name}
            pref={pref}
            value={currentValues[pref.name]}
            onChange={(v) => handleChange(pref.name, v)}
            pluginName={pluginName}
            tp={tp}
          />
        ))}
        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave} disabled={!isDirty || mutation.isPending}>
            {mutation.isPending ? t('common:actions.saving') : t('common:actions.save')}
          </Button>
          {isDirty && (
            <Button variant="outline" onClick={handleReset}>
              {t('common:actions.reset')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface FieldProps {
  pref: PreferenceDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  pluginName: string;
  tp: (ns: string, key: string, fallback?: string) => string;
}

function PreferenceField({ pref, value, onChange, pluginName, tp }: FieldProps) {
  const label = tp(pluginName, `preferences.${pref.name}.title`, pref.name);
  const description = tp(pluginName, `preferences.${pref.name}.description`, '');

  switch (pref.type) {
    case 'text':
    case 'password':
      return (
        <div className="space-y-2">
          <Label>
            {label}
            {pref.required && <span className="ml-1 text-destructive">*</span>}
          </Label>
          <Input
            type={pref.type}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={pref.default}
          />
          {description && <p className="text-muted-foreground text-xs">{description}</p>}
        </div>
      );

    case 'number':
      return (
        <div className="space-y-2">
          <Label>
            {label}
            {pref.required && <span className="ml-1 text-destructive">*</span>}
          </Label>
          <Input
            type="number"
            value={(value as number) ?? pref.default ?? ''}
            onChange={(e) => onChange(e.target.valueAsNumber)}
            min={pref.min}
            max={pref.max}
            step={pref.step}
          />
          {description && <p className="text-muted-foreground text-xs">{description}</p>}
        </div>
      );

    case 'checkbox':
      return (
        <div className="flex items-center justify-between">
          <div>
            <Label>{label}</Label>
            {description && <p className="text-muted-foreground text-xs">{description}</p>}
          </div>
          <Switch
            checked={(value as boolean) ?? pref.default ?? false}
            onCheckedChange={onChange}
          />
        </div>
      );

    case 'dropdown':
      return (
        <div className="space-y-2">
          <Label>
            {label}
            {pref.required && <span className="ml-1 text-destructive">*</span>}
          </Label>
          <Select value={(value as string) ?? pref.default ?? ''} onValueChange={onChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pref.options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {tp(pluginName, `preferences.${pref.name}.options.${opt.value}`, opt.value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description && <p className="text-muted-foreground text-xs">{description}</p>}
        </div>
      );
  }
}
