import type { TemplateData } from '../../../src/render';

export default function template(data: TemplateData): string {
  const locale: Record<string, unknown> = {
    name: data.pascal,
    description: data.description,
  };

  if (data.blocks) {
    locale.blocks = { [data.id as string]: { name: data.pascal, description: data.description } };
    locale.fields = { enabled: { label: 'Enabled', description: 'Enable processing' } };
  }
  if (data.bricks) {
    locale.bricks = { [data.id as string]: { name: data.pascal, description: data.description } };
  }
  if (data.sparks) {
    locale.sparks = { [data.id as string]: { name: data.pascal, description: `Event from ${data.name}` } };
  }

  return JSON.stringify(locale, null, 2) + '\n';
}
