import type { PreferenceDefinition } from '@brika/shared';
import { ExternalLink } from 'lucide-react';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@/components/ui';

interface PreferenceFieldProps {
  pref: PreferenceDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  pluginUid: string;
  pluginName: string;
  tp: (ns: string, key: string, fallback?: string) => string;
}

export function PreferenceField({
  pref,
  value,
  onChange,
  pluginUid,
  pluginName,
  tp,
}: Readonly<PreferenceFieldProps>) {
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
            value={typeof value === 'string' ? value : ''}
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
            value={typeof value === 'number' ? value : pref.default ?? ''}
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
            checked={typeof value === 'boolean' ? value : pref.default ?? false}
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
          <Select value={typeof value === 'string' ? value : pref.default ?? ''} onValueChange={onChange}>
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

    case 'link': {
      let href: string;
      if (pref.url.startsWith('/api/')) {
        href = pref.url; // Absolute hub path — use as-is
      } else if (pref.url.startsWith('/')) {
        href = `/api/plugins/${encodeURIComponent(pluginUid)}/routes${pref.url}`; // Relative plugin route
      } else {
        href = pref.url; // External URL
      }
      return (
        <div className="space-y-2">
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => window.open(href, '_blank', 'noopener')}
          >
            <ExternalLink className="mr-2 size-4" />
            {label}
          </Button>
          {description && <p className="text-muted-foreground text-xs">{description}</p>}
        </div>
      );
    }
  }
}
