import { dirs, files } from '../dsl';
import { definePreset } from './define';

export interface ReactFeaturePresetOptions {
  /** @default 'src/features' */
  featuresDir?: string;
  /** @default 100 */
  pageMaxLines?: number;
  /** @default 150 */
  componentMaxLines?: number;
  /** @default ['index.ts', 'hooks.ts'] */
  requiredFiles?: string[];
  /** @default [] */
  allowedCrossFeatures?: string[];
}

/** Creates a pattern that matches imports going up 2+ directories except for allowed paths */
function crossFeaturePattern(allowed: string[]): RegExp {
  // Matches: ../../ not followed by allowed folders
  // Example: ../../other-feature/file → blocked
  // Example: ../../index → allowed (if 'index' in allowed)
  const exceptions = ['index', ...allowed].join('|');
  return new RegExp(String.raw`\.\.[\\/]\.\.[\\/](?!(?:${exceptions})[\\/]|(?:${exceptions})$)`);
}

/**
 * Preset rules for React feature-based architecture
 *
 * @example
 * run(
 *   reactFeaturePreset({ pageMaxLines: 120 }),
 *   files('src/hooks/*.ts').should().beCamelCase(),
 * );
 */
export const reactFeaturePreset = definePreset<ReactFeaturePresetOptions>((options = {}) => {
  const {
    featuresDir = 'src/features',
    pageMaxLines = 100,
    componentMaxLines = 150,
    requiredFiles: required = ['index.ts', 'hooks.ts'],
    allowedCrossFeatures = [],
  } = options;

  return [
    // Page components size limit
    files(`${featuresDir}/**/*Page.tsx`)
      .should()
      .haveMaxLines(pageMaxLines)
      .because('Page components must be small'),

    // Component size and naming
    files(`${featuresDir}/*/components/*.tsx`)
      .should()
      .haveMaxLines(componentMaxLines)
      .and()
      .bePascalCase()
      .because('Components must be PascalCase'),

    // Hook exports naming
    files(`${featuresDir}/*/hooks.ts`)
      .should()
      .haveExportsMatching(/^use[A-Z]/, 'start with "use"')
      .because('Hooks must follow React naming'),

    // Feature structure
    dirs(`${featuresDir}/*/`)
      .should()
      .containFiles(...required)
      .because('Features need consistent structure'),

    // Cross-feature import boundaries
    files(`${featuresDir}/*/components/*.tsx`)
      .should()
      .notImportFrom(crossFeaturePattern(allowedCrossFeatures), 'other features')
      .because('Components should not import across features'),
  ];
});
