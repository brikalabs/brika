import { buildLocale } from '../../../src/locale-builder';
import type { TemplateData } from '../../../src/render';

export default function template(data: TemplateData): string {
  return buildLocale(data, {
    enabledLabel: 'Activé',
    enabledDescription: 'Activer le traitement',
    sparkDescription: () => data.description,
  });
}
