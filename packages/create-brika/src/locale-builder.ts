import type { TemplateData } from './render';

export interface LocaleStrings {
  enabledLabel: string;
  enabledDescription: string;
  sparkDescription: (name: string) => string;
}

export function buildLocale(data: TemplateData, strings: LocaleStrings): string {
  const locale: Record<string, unknown> = {
    name: data.pascal,
    description: data.description,
  };

  if (data.blocks) {
    locale.blocks = { [data.id as string]: { name: data.pascal, description: data.description } };
    locale.fields = { enabled: { label: strings.enabledLabel, description: strings.enabledDescription } };
  }
  if (data.bricks) {
    locale.bricks = { [data.id as string]: { name: data.pascal, description: data.description } };
  }
  if (data.sparks) {
    locale.sparks = { [data.id as string]: { name: data.pascal, description: strings.sparkDescription(data.name) } };
  }

  return JSON.stringify(locale, null, 2) + '\n';
}
