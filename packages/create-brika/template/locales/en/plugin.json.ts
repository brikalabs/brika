import type { TemplateData } from '../../../src/render';
import { buildLocale } from '../../../src/locale-builder';

export default function template(data: TemplateData): string {
  return buildLocale(data, {
    enabledLabel: 'Enabled',
    enabledDescription: 'Enable processing',
    sparkDescription: (name) => `Event from ${name}`,
  });
}
