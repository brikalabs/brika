import { Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { useLocale } from '@/lib/use-locale';
import { usePluginConfig, usePluginConfigMutation } from '../hooks';
import { PreferenceField } from './PreferenceField';

interface Props {
  pluginUid: string;
  pluginName: string;
}

export function PluginConfigForm({ pluginUid, pluginName }: Readonly<Props>) {
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
  }, [
    data,
  ]);

  if (isLoading || !data) {
    return null;
  }
  if (data.schema.length === 0) {
    return null;
  }

  // Always merge server values with local changes
  const currentValues = {
    ...data.values,
    ...values,
  };

  const handleChange = (name: string, value: unknown) => {
    setValues((prev) => ({
      ...prev,
      [name]: value,
    }));
    setIsDirty(true);
  };

  const handleSave = () => {
    mutation.mutate(
      {
        ...data.values,
        ...values,
      },
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
            pluginUid={pluginUid}
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
