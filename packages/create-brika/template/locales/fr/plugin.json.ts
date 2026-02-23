import type { TemplateData } from '../../../src/render';
import { buildLocale } from '../../../src/locale-builder';

export default function template(data: TemplateData): string {
  return buildLocale(data, {
    enabledLabel: 'Activé',
    enabledDescription: 'Activer le traitement',
    sparkDescription: () => data.description,
  });
}
