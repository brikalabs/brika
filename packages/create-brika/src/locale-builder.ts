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
    locale.blocks = {
      [String(data.id)]: {
        name: data.pascal,
        description: data.description,
      },
    };
    locale.fields = {
      enabled: {
        label: strings.enabledLabel,
        description: strings.enabledDescription,
      },
    };
  }
  if (data.bricks) {
    locale.bricks = {
      [String(data.id)]: {
        name: data.pascal,
        description: data.description,
      },
    };
  }
  if (data.sparks) {
    locale.sparks = {
      [String(data.id)]: {
        name: data.pascal,
        description: strings.sparkDescription(String(data.name)),
      },
    };
  }

  return `${JSON.stringify(locale, null, 2)}\n`;
}
