import { buildLocale } from '../../../src/locale-builder';
import type { TemplateData } from '../../../src/render';

export default function template(data: TemplateData): string {
  return buildLocale(data, {
    enabledLabel: 'Enabled',
    enabledDescription: 'Enable processing',
    sparkDescription: (name) => `Event from ${name}`,
  });
}
