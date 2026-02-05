import { defineConfig, files } from '@brika/arch';
import { reactFeaturePreset } from '@brika/arch/presets';

export default defineConfig([
  reactFeaturePreset({
    pageMaxLines: 200,
    componentMaxLines: 150,
    requiredFiles: ['index.ts'],
    allowedCrossFeatures: ['plugins', 'workflows'],
  }),

  // Hook files must export use* functions
  files('src/features/*/*hooks*.ts')
    .should()
    .haveExportsMatching(/^use[A-Z]/, 'start with "use"')
    .because('Hook files must export React hooks'),
]);
